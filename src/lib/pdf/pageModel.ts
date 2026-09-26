// Reads a PDF page into a form that Word and PowerPoint files can rebuild
// with the same look:
//   - a "background": the page rendered with every upright text run removed,
//     so pictures, table borders, shapes, fills and underlines stay pixel-exact;
//   - the text itself as positioned runs (font, size, bold/italic, colour),
//     grouped into lines and blocks that can be placed back at the same spot.
// Rotated text, Type3 fonts and anything else that can't be retyped stays in
// the background, so nothing is lost or doubled.

import { getPdfJs } from "../../components/tools/PdfScriptLoader";
import { hasMetricFont, isInstalled, measureText } from "../fonts/metricFonts";

export interface TextRun {
  text: string;
  x: number; // left edge, points from the page's left
  baseline: number; // points from the page's top
  width: number; // advance width in the PDF, points
  size: number; // font size, points
  family: string; // font family name for Word/PowerPoint
  bold: boolean;
  italic: boolean;
  color: string; // RRGGBB
  // Set when the PDF's font isn't available and `family` is a stand-in; its
  // widths then differ from the PDF's, so spacing is adjusted per letter.
  substituted?: { original: string; kind: "sans" | "serif" | "mono" };
}

export interface Line {
  runs: TextRun[];
  x: number;
  baseline: number;
  width: number;
  size: number;
}

export interface Block {
  lines: Line[];
  x: number;
  width: number;
  // Distance between baselines; for a single line, a comfortable default.
  leading: number;
}

export interface BackgroundPiece {
  x: number; // points
  y: number; // points from top
  width: number;
  height: number;
  data: Uint8Array;
  type: "png" | "jpg";
}

export interface PageModel {
  width: number;
  height: number;
  blocks: Block[];
  background: BackgroundPiece[];
}

type Progress = (pct: number, msg: string) => void;

// ─── Fonts ──────────────────────────────────────────────────────────────────

const KNOWN_FAMILIES: Record<string, string> = {
  arial: "Arial",
  helvetica: "Arial",
  helveticaneue: "Arial",
  arialnarrow: "Arial Narrow",
  arialblack: "Arial Black",
  timesnewroman: "Times New Roman",
  times: "Times New Roman",
  timesroman: "Times New Roman",
  couriernew: "Courier New",
  courier: "Courier New",
  calibri: "Calibri",
  calibrilight: "Calibri Light",
  cambria: "Cambria",
  cambriamath: "Cambria Math",
  candara: "Candara",
  consolas: "Consolas",
  constantia: "Constantia",
  corbel: "Corbel",
  georgia: "Georgia",
  verdana: "Verdana",
  tahoma: "Tahoma",
  trebuchetms: "Trebuchet MS",
  segoeui: "Segoe UI",
  garamond: "Garamond",
  bookantiqua: "Book Antiqua",
  centurygothic: "Century Gothic",
  palatinolinotype: "Palatino Linotype",
  palatino: "Palatino Linotype",
  comicsansms: "Comic Sans MS",
  lucidaconsole: "Lucida Console",
  symbol: "Symbol",
  wingdings: "Wingdings",
  zapfdingbats: "Wingdings",
  aptos: "Aptos",
  opensans: "Open Sans",
  roboto: "Roboto",
  lato: "Lato",
  montserrat: "Montserrat",
  sourcesanspro: "Source Sans Pro",
  liberationsans: "Arial",
  liberationserif: "Times New Roman",
  liberationmono: "Courier New",
  dejavusans: "DejaVu Sans",
  carlito: "Calibri",
  caladea: "Cambria",
};

// Weights that Windows installs as their own family, e.g. "Segoe UI Semibold".
const VARIANT_WORDS = ["Light", "Semibold", "SemiBold", "Semilight", "Medium", "Black", "Condensed", "Narrow"];

export function mapFont(pdfName: string, flags: { bold?: boolean; italic?: boolean }) {
  let name = (pdfName || "").replace(/^[A-Z]{6}\+/, "");
  const parts = name.split(/[-,]/);
  let base = parts[0];
  let style = parts.slice(1).join(" ");
  // "Calibri Bold" style names without a separator.
  const spaced = base.match(/^(.*?)\s+(Bold|Italic|Oblique|BoldItalic)$/i);
  if (spaced) {
    base = spaced[1];
    style = `${spaced[2]} ${style}`;
  }
  base = base.replace(/(PSMT|PS|MT)$/, "");
  const styleLower = style.toLowerCase();
  const bold = !!flags.bold || /bold|black|heavy/.test(styleLower) || /bold/i.test(base);
  const italic = !!flags.italic || /italic|oblique/.test(styleLower) || /italic/i.test(base);
  base = base.replace(/(Bold|Italic|Oblique)+$/i, "");

  const key = base.toLowerCase().replace(/[^a-z]/g, "");
  let family = KNOWN_FAMILIES[key];
  if (!family) {
    // "BookmanOldStyle" → "Bookman Old Style", "IBMPlexSans" → "IBM Plex Sans"
    family =
      base
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
        .replace(/_/g, " ")
        .trim() || "Calibri";
  }
  const variant = VARIANT_WORDS.find((v) => new RegExp(v, "i").test(style));
  if (variant && !/bold/i.test(variant)) family = `${family} ${variant.replace(/^Semi(\w)/i, (_, c) => "Semi" + c.toLowerCase())}`;
  else if (variant && /semibold/i.test(variant)) family = `${family} Semibold`;
  return { family, bold: bold && !/semibold/i.test(style), italic };
}

// A font that is neither installed here nor has a metric twin would be
// replaced by Word/PowerPoint with something unpredictable, so it gets a
// common stand-in of the same kind (as Adobe does). Which stand-in is decided
// per document by resolveSubstitutes, from the text's real widths.
function substitution(family: string, generic?: string): TextRun["substituted"] {
  if (hasMetricFont(family) || isInstalled(family)) return undefined;
  const g = (generic || "").toLowerCase();
  const kind = /mono/.test(g) ? "mono" : /serif/.test(g) && !/sans/.test(g) ? "serif" : "sans";
  return { original: family, kind };
}

const CANDIDATES: Record<"sans" | "serif" | "mono", string[]> = {
  sans: ["Arial", "Calibri"],
  serif: ["Times New Roman", "Cambria"],
  mono: ["Courier New"],
};

// For each missing font, picks the stand-in whose widths come closest to the
// PDF's, so the per-letter spacing correction stays as small as possible.
export async function resolveSubstitutes(models: PageModel[]): Promise<void> {
  const groups = new Map<string, TextRun[]>();
  for (const m of models)
    for (const b of m.blocks)
      for (const l of b.lines)
        for (const r of l.runs) {
          if (!r.substituted) continue;
          const k = `${r.substituted.original}|${r.bold}|${r.italic}`;
          const list = groups.get(k) || [];
          if (list.length < 150) list.push(r);
          groups.set(k, list);
        }
  const choice = new Map<string, string>();
  for (const [k, runs] of groups) {
    const kind = runs[0].substituted!.kind;
    let best = CANDIDATES[kind][0];
    let bestErr = Infinity;
    for (const cand of CANDIDATES[kind]) {
      let err = 0;
      let chars = 0;
      for (const r of runs) {
        const w = await measureText(r.text, cand, r.size, r.bold, r.italic);
        if (w === null) continue;
        err += Math.abs(r.width - w);
        chars += r.text.length;
      }
      const perChar = chars ? err / chars : Infinity;
      if (perChar < bestErr) {
        bestErr = perChar;
        best = cand;
      }
    }
    choice.set(k, best);
  }
  for (const m of models)
    for (const b of m.blocks)
      for (const l of b.lines)
        for (const r of l.runs) {
          if (r.substituted) r.family = choice.get(`${r.substituted.original}|${r.bold}|${r.italic}`) || CANDIDATES[r.substituted.kind][0];
        }
}

// ─── Rendering ──────────────────────────────────────────────────────────────

// Renders the page twice: normally, and with upright text suppressed. pdf.js
// draws text with fillText/strokeText, including inside transparency groups
// on scratch canvases, so the prototype is patched for the second render.
async function renderPair(page: any, viewport: any): Promise<{ full: HTMLCanvasElement; bg: HTMLCanvasElement }> {
  const make = () => {
    const c = document.createElement("canvas");
    c.width = Math.ceil(viewport.width);
    c.height = Math.ceil(viewport.height);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    return c;
  };
  const full = make();
  // "print" rendering doesn't wait for animation frames, which browsers pause
  // in background tabs; the conversion keeps going if the user switches tabs.
  await page.render({ canvasContext: full.getContext("2d"), viewport, intent: "print" }).promise;

  const bg = make();
  const proto = CanvasRenderingContext2D.prototype;
  const origFill = proto.fillText;
  const origStroke = proto.strokeText;
  // Text is left in the background when it won't be retyped: rotated text,
  // and text whose baseline lies off the page (pdf.js leaves that out of the
  // page's text, yet part of it can still show at the edge).
  const retyped = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    const m = ctx.getTransform();
    if (Math.abs(m.b) >= 0.02 * Math.abs(m.a) || Math.abs(m.c) >= 0.02 * Math.abs(m.d)) return false;
    const px = m.a * x + m.c * y + m.e;
    const py = m.b * x + m.d * y + m.f;
    return px >= -1 && py >= -1 && px <= bg.width + 1 && py <= bg.height + 1;
  };
  proto.fillText = function (this: CanvasRenderingContext2D, ...args: any[]) {
    if (!retyped(this, args[1], args[2])) return (origFill as any).apply(this, args);
  } as any;
  proto.strokeText = function (this: CanvasRenderingContext2D, ...args: any[]) {
    if (!retyped(this, args[1], args[2])) return (origStroke as any).apply(this, args);
  } as any;
  try {
    await page.render({ canvasContext: bg.getContext("2d"), viewport, intent: "print" }).promise;
  } finally {
    proto.fillText = origFill;
    proto.strokeText = origStroke;
  }
  return { full, bg };
}

async function encode(c: HTMLCanvasElement, type: string, quality?: number): Promise<Uint8Array> {
  const b = await new Promise<Blob>((res, rej) => c.toBlob((x) => (x ? res(x) : rej(new Error("encode"))), type, quality));
  return new Uint8Array(await b.arrayBuffer());
}

// Splits the text-free render into horizontal bands that actually contain
// something, cropped to their content, so blank areas cost nothing.
async function backgroundPieces(bg: HTMLCanvasElement, scale: number): Promise<BackgroundPiece[]> {
  const w = bg.width;
  const h = bg.height;
  const data = bg.getContext("2d")!.getImageData(0, 0, w, h).data;
  const inkRow = new Uint8Array(h);
  const ink = (i: number) => data[i] < 248 || data[i + 1] < 248 || data[i + 2] < 248;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (ink(row + x * 4)) {
        inkRow[y] = 1;
        break;
      }
    }
  }
  const gap = Math.round(6 * scale); // merge bands closer than ~6pt
  const bands: [number, number][] = [];
  for (let y = 0; y < h; y++) {
    if (!inkRow[y]) continue;
    const last = bands[bands.length - 1];
    if (last && y - last[1] <= gap) last[1] = y;
    else bands.push([y, y]);
  }
  const pieces: BackgroundPiece[] = [];
  for (const [y0, y1] of bands) {
    let x0 = w;
    let x1 = -1;
    for (let y = y0; y <= y1; y++) {
      const row = y * w * 4;
      for (let x = 0; x < x0; x++) if (ink(row + x * 4)) { x0 = x; break; }
      for (let x = w - 1; x > x1; x--) if (ink(row + x * 4)) { x1 = x; break; }
    }
    if (x1 < x0) continue;
    const pad = 2;
    const cx0 = Math.max(0, x0 - pad);
    const cy0 = Math.max(0, y0 - pad);
    const cw = Math.min(w, x1 + pad + 1) - cx0;
    const ch = Math.min(h, y1 + pad + 1) - cy0;
    const crop = document.createElement("canvas");
    crop.width = cw;
    crop.height = ch;
    crop.getContext("2d")!.drawImage(bg, cx0, cy0, cw, ch, 0, 0, cw, ch);
    const png = await encode(crop, "image/png");
    // Photographs compress far better as JPEG; line art stays PNG so edges
    // don't blur.
    let bytes = png;
    let type: "png" | "jpg" = "png";
    if (png.length > 60_000) {
      const jpg = await encode(crop, "image/jpeg", 0.9);
      if (jpg.length * 3 < png.length) {
        bytes = jpg;
        type = "jpg";
      }
    }
    pieces.push({ x: cx0 / scale, y: cy0 / scale, width: cw / scale, height: ch / scale, data: bytes, type });
  }
  return pieces;
}

// ─── Text ───────────────────────────────────────────────────────────────────

function sampleColor(
  full: Uint8ClampedArray,
  bg: Uint8ClampedArray,
  w: number,
  h: number,
  box: [number, number, number, number]
): string | null {
  const [bx0, by0, bx1, by1] = box.map((v) => Math.round(v));
  const diffs: number[] = [];
  const idx: number[] = [];
  for (let y = Math.max(0, by0); y < Math.min(h, by1); y++) {
    for (let x = Math.max(0, bx0); x < Math.min(w, bx1); x++) {
      const i = (y * w + x) * 4;
      const d = Math.max(Math.abs(full[i] - bg[i]), Math.abs(full[i + 1] - bg[i + 1]), Math.abs(full[i + 2] - bg[i + 2]));
      if (d > 40) {
        diffs.push(d);
        idx.push(i);
      }
    }
  }
  if (diffs.length < 2) return null; // invisible (OCR layer) or text drawn in the background colour
  const cut = [...diffs].sort((a, b) => b - a)[Math.floor(diffs.length * 0.3)];
  let r = 0, g = 0, b = 0, n = 0;
  for (let k = 0; k < idx.length; k++) {
    if (diffs[k] < cut) continue;
    r += full[idx[k]];
    g += full[idx[k] + 1];
    b += full[idx[k] + 2];
    n++;
  }
  r = Math.round(r / n);
  g = Math.round(g / n);
  b = Math.round(b / n);
  // Anti-aliasing lightens thin dark text slightly; treat near-black as black.
  if (r < 70 && g < 70 && b < 70 && Math.max(r, g, b) - Math.min(r, g, b) < 20) return "000000";
  return [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

function buildLines(runs: TextRun[]): Line[] {
  runs.sort((a, b) => a.baseline - b.baseline || a.x - b.x);
  const rows: TextRun[][] = [];
  for (const r of runs) {
    const row = rows.find((l) => Math.abs(l[0].baseline - r.baseline) < Math.max(1, 0.2 * Math.min(l[0].size, r.size)));
    if (row) row.push(r);
    else rows.push([r]);
  }
  const lines: Line[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    let cur: TextRun[] = [];
    const flush = () => {
      if (!cur.length) return;
      const x = cur[0].x;
      const end = Math.max(...cur.map((r) => r.x + r.width));
      lines.push({ runs: cur, x, baseline: cur[0].baseline, width: end - x, size: Math.max(...cur.map((r) => r.size)) });
      cur = [];
    };
    for (const r of row) {
      const prev = cur[cur.length - 1];
      if (prev) {
        const gap = r.x - (prev.x + prev.width);
        // Same text drawn twice a hair apart is "fake bold": keep one, bold.
        if (gap < -0.5 * r.size && r.text === prev.text && Math.abs(r.x - prev.x) < 1.5) {
          prev.bold = true;
          continue;
        }
        // A wide gap is a column or table cell: start a separate line piece.
        if (gap > 1.2 * Math.max(prev.size, r.size)) flush();
        else if (gap > 0.12 * r.size && !prev.text.endsWith(" ") && !r.text.startsWith(" ")) {
          // Visible space between two pieces of the same line.
          prev.text += " ";
          prev.width = r.x - prev.x;
        } else if (gap > 0) {
          prev.width = r.x - prev.x;
        }
      }
      cur.push(r);
    }
    flush();
  }
  return lines;
}

function buildBlocks(lines: Line[]): Block[] {
  lines.sort((a, b) => a.baseline - b.baseline || a.x - b.x);
  const blocks: Block[] = [];
  for (const line of lines) {
    const fit = blocks.find((b) => {
      const last = b.lines[b.lines.length - 1];
      if (Math.abs(last.x - line.x) > 1.5) return false;
      if (Math.abs(last.size - line.size) > 0.15 * last.size) return false;
      const step = line.baseline - last.baseline;
      if (step <= 0) return false;
      if (b.lines.length === 1) return step >= 0.95 * last.size && step <= 2.2 * last.size;
      return Math.abs(step - b.leading) <= 0.08 * b.leading;
    });
    if (fit) {
      const last = fit.lines[fit.lines.length - 1];
      if (fit.lines.length === 1) fit.leading = line.baseline - last.baseline;
      fit.lines.push(line);
      fit.width = Math.max(fit.width, line.width);
    } else {
      blocks.push({ lines: [line], x: line.x, width: line.width, leading: Math.max(line.size * 1.2, 1) });
    }
  }
  return blocks;
}

export async function extractPageModels(bytes: ArrayBuffer, onProgress: Progress): Promise<PageModel[]> {
  const pdfjs = await getPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
  const models: PageModel[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      onProgress(5 + Math.round(((p - 1) / doc.numPages) * 80), `Reading page ${p} of ${doc.numPages}...`);
      const page = await doc.getPage(p);
      const vp1 = page.getViewport({ scale: 1 });
      // About 200 DPI for the background, capped for very large pages.
      const scale = Math.min(200 / 72, Math.sqrt(12_000_000 / (vp1.width * vp1.height)));
      const vp = page.getViewport({ scale });
      const { full, bg } = await renderPair(page, vp);
      const w = full.width;
      const h = full.height;
      const fullPx = full.getContext("2d")!.getImageData(0, 0, w, h).data;
      const bgPx = bg.getContext("2d")!.getImageData(0, 0, w, h).data;

      const content = await page.getTextContent();
      const runs: TextRun[] = [];
      for (const item of content.items as any[]) {
        if (!item.str || !item.str.trim()) continue;
        const t = pdfjs.Util.transform(vp1.transform, item.transform);
        const angle = Math.atan2(t[1], t[0]);
        if (Math.abs(angle) > 0.01) continue; // rotated text stays in the background
        const size = Math.hypot(t[2], t[3]);
        if (size < 1) continue;
        let font: any = null;
        try {
          font = page.commonObjs.get(item.fontName);
        } catch {
          font = null;
        }
        if (font?.isType3Font) continue; // drawn as shapes, already in the background
        const x = t[4];
        const baseline = t[5];
        const width = item.width;
        const color = sampleColor(fullPx, bgPx, w, h, [
          x * scale,
          (baseline - 0.85 * size) * scale,
          (x + width) * scale,
          (baseline + 0.25 * size) * scale,
        ]);
        if (!color) continue;
        const mapped = mapFont(font?.name || content.styles?.[item.fontName]?.fontFamily || "", {
          bold: font?.bold || font?.black,
          italic: font?.italic,
        });
        const substituted = substitution(mapped.family, font?.fallbackName || content.styles?.[item.fontName]?.fontFamily);
        runs.push({ text: item.str, x, baseline, width, size, family: mapped.family, bold: mapped.bold, italic: mapped.italic, color, substituted });
      }

      models.push({
        width: vp1.width,
        height: vp1.height,
        blocks: buildBlocks(buildLines(runs)),
        background: await backgroundPieces(bg, scale),
      });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  await resolveSubstitutes(models);
  return models;
}
