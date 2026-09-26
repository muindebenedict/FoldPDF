// Word (.docx) → PDF, entirely in the browser.
//
// A compact Word layout engine: it reads styles, numbering, sections, headers
// and footers, breaks lines with fonts that have Word's character widths,
// paginates with Word's rules (widow/orphan control, keep with next, page
// breaks, table rows that split across pages) and draws real, selectable
// text with pdf-lib.
//
// Line model, measured against Word 16 (compatibility modes 14 and 15):
//   - single spacing = the font's ascent + descent + line gap; the baseline
//     sits `ascent` below the line top; "multiple" spacing adds the extra
//     height below the text; exact spacing puts the baseline at 0.8 × height;
//   - the gap between paragraphs is the larger of the first one's space after
//     and the second one's space before.
// Page, border, table, list and justification rules are noted where they are
// applied; each was measured on test documents exported by Word.
//
// Not covered: text boxes and shapes, footnote text, multiple columns,
// equations, charts and text wrapping around floating pictures. They are
// listed in the result so the tool can say so.

import {
  PDFDocument,
  PDFImage,
  PDFPage,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setCharacterSpacing,
  setCharacterSqueeze,
} from "@cantoo/pdf-lib";
import { getFontkit, getJSZip } from "../../components/tools/PdfScriptLoader";
import { attr, descendants, kid, kids, num, Package, path, symbolChar, type El, type Rel } from "../office/ooxml";
import { encodable, PdfFontSet, type ResolvedFont } from "../fonts/pdfFonts";
import { isMetafile, metafileToPng } from "../image/metafile";

type Progress = (pct: number, msg: string) => void;

const twip = (v: number) => v / 20;
const EMU = 12700;

// ─── Properties ─────────────────────────────────────────────────────────────

interface RPr {
  font: string;
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: string | null;
  highlight: string | null;
  shade: string | null;
  vertAlign: string | null;
  caps: boolean;
  smallCaps: boolean;
  spacing: number;
  hidden: boolean;
}

interface Border {
  width: number;
  color: string;
  space: number;
}

interface TabStop {
  pos: number;
  kind: string; // left | right | center | decimal | clear | bar
  leader: string | null;
}

interface PPr {
  jc: string;
  left: number;
  right: number;
  firstLine: number; // negative = hanging
  before: number;
  after: number;
  beforeAuto: boolean;
  afterAuto: boolean;
  line: number;
  lineRule: string;
  contextual: boolean;
  keepNext: boolean;
  keepLines: boolean;
  widow: boolean;
  pageBreakBefore: boolean;
  numId: string | null;
  ilvl: number;
  tabs: TabStop[];
  shade: string | null;
  borders: Partial<Record<"top" | "bottom" | "left" | "right" | "between", Border>>;
  styleId: string | null;
}

const HIGHLIGHT: Record<string, string> = {
  yellow: "FFFF00", green: "00FF00", cyan: "00FFFF", magenta: "FF00FF", blue: "0000FF", red: "FF0000", darkBlue: "000080",
  darkCyan: "008080", darkGreen: "008000", darkMagenta: "800080", darkRed: "800000", darkYellow: "808000", darkGray: "808080",
  lightGray: "C0C0C0", black: "000000", white: "FFFFFF",
};

const on = (el: El | null): boolean | null => {
  if (!el) return null;
  const v = attr(el, "w:val");
  return !(v === "0" || v === "false" || v === "off" || v === "none");
};

interface Theme {
  major: string;
  minor: string;
  colors: Record<string, string>;
}

function themeColor(theme: Theme, name: string, shade?: string | null, tint?: string | null): string | null {
  const map: Record<string, string> = {
    text1: "dk1", text2: "dk2", background1: "lt1", background2: "lt2", dark1: "dk1", dark2: "dk2", light1: "lt1", light2: "lt2",
    hyperlink: "hlink", followedHyperlink: "folHlink",
  };
  const hex = theme.colors[map[name] || name];
  if (!hex) return null;
  let r = parseInt(hex.slice(0, 2), 16);
  let g = parseInt(hex.slice(2, 4), 16);
  let b = parseInt(hex.slice(4, 6), 16);
  if (shade) {
    const f = parseInt(shade, 16) / 255;
    r *= f; g *= f; b *= f;
  }
  if (tint) {
    const f = parseInt(tint, 16) / 255;
    r = 255 - (255 - r) * f; g = 255 - (255 - g) * f; b = 255 - (255 - b) * f;
  }
  return [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

function applyRPr(el: El | null, base: RPr, theme: Theme): RPr {
  if (!el) return base;
  const r = { ...base };
  const fonts = kid(el, "rFonts");
  if (fonts) {
    const f = attr(fonts, "w:ascii") || attr(fonts, "w:hAnsi");
    const th = attr(fonts, "w:asciiTheme") || attr(fonts, "w:hAnsiTheme");
    if (f) r.font = f;
    else if (th) r.font = /major/i.test(th) ? theme.major : theme.minor;
  }
  const sz = kid(el, "sz");
  if (sz) r.size = num(sz, "w:val", r.size * 2) / 2;
  const toggles: [keyof RPr, string][] = [["bold", "b"], ["italic", "i"], ["strike", "strike"], ["caps", "caps"], ["smallCaps", "smallCaps"], ["hidden", "vanish"]];
  for (const [key, tag] of toggles) {
    const v = on(kid(el, tag));
    if (v != null) (r as any)[key] = v;
  }
  const u = kid(el, "u");
  if (u) r.underline = attr(u, "w:val") !== "none";
  const color = kid(el, "color");
  if (color) {
    const tc = attr(color, "w:themeColor");
    const val = attr(color, "w:val");
    r.color = tc ? themeColor(theme, tc, attr(color, "w:themeShade"), attr(color, "w:themeTint")) || val : val === "auto" ? null : val;
  }
  const hl = kid(el, "highlight");
  if (hl) r.highlight = HIGHLIGHT[attr(hl, "w:val") || ""] || null;
  const shd = kid(el, "shd");
  if (shd) {
    const fill = attr(shd, "w:fill");
    r.shade = fill && fill !== "auto" ? fill : attr(shd, "w:themeFill") ? themeColor(theme, attr(shd, "w:themeFill")!, attr(shd, "w:themeFillShade"), attr(shd, "w:themeFillTint")) : null;
  }
  const va = kid(el, "vertAlign");
  if (va) r.vertAlign = attr(va, "w:val") === "baseline" ? null : attr(va, "w:val");
  const sp = kid(el, "spacing");
  if (sp) r.spacing = twip(num(sp, "w:val", 0));
  return r;
}

function readBorder(el: El | null): Border | undefined {
  if (!el) return undefined;
  const val = attr(el, "w:val");
  if (!val || val === "nil" || val === "none") return undefined;
  const color = attr(el, "w:color");
  return {
    width: Math.max(0.25, num(el, "w:sz", 4) / 8) * (val === "double" ? 1.5 : 1),
    color: color && color !== "auto" ? color : "000000",
    space: num(el, "w:space", 0),
  };
}

function applyPPr(el: El | null, base: PPr, theme: Theme): PPr {
  if (!el) return base;
  const p: PPr = { ...base, tabs: base.tabs, borders: base.borders };
  const jc = kid(el, "jc");
  if (jc) p.jc = attr(jc, "w:val") || "left";
  const ind = kid(el, "ind");
  if (ind) {
    const left = attr(ind, "w:left") ?? attr(ind, "w:start");
    const right = attr(ind, "w:right") ?? attr(ind, "w:end");
    if (left != null) p.left = twip(Number(left));
    if (right != null) p.right = twip(Number(right));
    if (attr(ind, "w:hanging") != null) p.firstLine = -twip(num(ind, "w:hanging", 0));
    else if (attr(ind, "w:firstLine") != null) p.firstLine = twip(num(ind, "w:firstLine", 0));
  }
  const sp = kid(el, "spacing");
  if (sp) {
    if (attr(sp, "w:before") != null) p.before = twip(num(sp, "w:before", 0));
    if (attr(sp, "w:after") != null) p.after = twip(num(sp, "w:after", 0));
    const onAttr = (v: string | null) => v === "1" || v === "true" || v === "on";
    if (attr(sp, "w:beforeAutospacing") != null) p.beforeAuto = onAttr(attr(sp, "w:beforeAutospacing"));
    if (attr(sp, "w:afterAutospacing") != null) p.afterAuto = onAttr(attr(sp, "w:afterAutospacing"));
    if (attr(sp, "w:line") != null) {
      p.line = num(sp, "w:line", 240);
      p.lineRule = attr(sp, "w:lineRule") || "auto";
    }
  }
  for (const [key, tag] of [["contextual", "contextualSpacing"], ["keepNext", "keepNext"], ["keepLines", "keepLines"], ["widow", "widowControl"], ["pageBreakBefore", "pageBreakBefore"]] as const) {
    const v = on(kid(el, tag));
    if (v != null) (p as any)[key] = v;
  }
  const numPr = kid(el, "numPr");
  if (numPr) {
    const id = attr(kid(numPr, "numId"), "w:val");
    if (id != null) p.numId = id;
    const lvl = attr(kid(numPr, "ilvl"), "w:val");
    if (lvl != null) p.ilvl = Number(lvl);
  }
  const tabs = kid(el, "tabs");
  if (tabs) {
    let list = [...p.tabs];
    for (const t of kids(tabs, "tab")) {
      const pos = twip(num(t, "w:pos", 0));
      const kind = attr(t, "w:val") || "left";
      list = list.filter((x) => Math.abs(x.pos - pos) > 0.5);
      if (kind !== "clear") list.push({ pos, kind: kind === "start" ? "left" : kind === "end" ? "right" : kind, leader: attr(t, "w:leader") });
    }
    p.tabs = list.sort((a, b) => a.pos - b.pos);
  }
  const shd = kid(el, "shd");
  if (shd) {
    const fill = attr(shd, "w:fill");
    p.shade = fill && fill !== "auto" ? fill : attr(shd, "w:themeFill") ? themeColor(theme, attr(shd, "w:themeFill")!, attr(shd, "w:themeFillShade"), attr(shd, "w:themeFillTint")) : null;
  }
  const bdr = kid(el, "pBdr");
  if (bdr) {
    p.borders = { ...p.borders };
    for (const side of ["top", "bottom", "left", "right", "between"] as const) {
      const b = kid(bdr, side);
      if (b) p.borders[side] = readBorder(b);
    }
  }
  const style = attr(kid(el, "pStyle"), "w:val");
  if (style) p.styleId = style;
  return p;
}

// ─── Styles and numbering ───────────────────────────────────────────────────

interface Style {
  id: string;
  type: string;
  basedOn: string | null;
  el: El;
}

class Styles {
  map = new Map<string, Style>();
  defaultPara: string | null = null;
  defaultTable: string | null = null;
  docRPr: El | null = null;
  docPPr: El | null = null;

  constructor(doc: Document | null) {
    const root = doc?.documentElement;
    this.docRPr = path(root, "docDefaults", "rPrDefault", "rPr");
    this.docPPr = path(root, "docDefaults", "pPrDefault", "pPr");
    for (const s of kids(root, "style")) {
      const id = attr(s, "w:styleId") || "";
      const type = attr(s, "w:type") || "paragraph";
      this.map.set(id, { id, type, basedOn: attr(kid(s, "basedOn"), "w:val"), el: s });
      if (attr(s, "w:default") === "1" && type === "paragraph") this.defaultPara = id;
      if (attr(s, "w:default") === "1" && type === "table") this.defaultTable = id;
    }
  }

  // The style and its ancestors, root first.
  chain(id: string | null): Style[] {
    const out: Style[] = [];
    const seen = new Set<string>();
    let cur = id ? this.map.get(id) : undefined;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      out.unshift(cur);
      cur = cur.basedOn ? this.map.get(cur.basedOn) : undefined;
    }
    return out;
  }
}

interface NumLevel {
  fmt: string;
  text: string;
  start: number;
  pPr: El | null;
  rPr: El | null;
  suff: string;
}

class Numbering {
  private abstract = new Map<string, NumLevel[]>();
  private nums = new Map<string, { abs: string; starts: Map<number, number>; levels: Map<number, NumLevel> }>();
  private counters = new Map<string, number[]>();

  constructor(doc: Document | null) {
    const root = doc?.documentElement;
    for (const a of kids(root, "abstractNum")) {
      const levels: NumLevel[] = [];
      for (const l of kids(a, "lvl")) {
        levels[num(l, "w:ilvl", 0)] = this.level(l);
      }
      this.abstract.set(attr(a, "w:abstractNumId") || "", levels);
    }
    for (const n of kids(root, "num")) {
      const starts = new Map<number, number>();
      const levels = new Map<number, NumLevel>();
      for (const o of kids(n, "lvlOverride")) {
        const ilvl = num(o, "w:ilvl", 0);
        const so = kid(o, "startOverride");
        if (so) starts.set(ilvl, num(so, "w:val", 1));
        const lvl = kid(o, "lvl");
        if (lvl) levels.set(ilvl, this.level(lvl));
      }
      this.nums.set(attr(n, "w:numId") || "", { abs: attr(kid(n, "abstractNumId"), "w:val") || "", starts, levels });
    }
  }

  private level(l: El): NumLevel {
    return {
      fmt: attr(kid(l, "numFmt"), "w:val") || "decimal",
      text: attr(kid(l, "lvlText"), "w:val") ?? "%1.",
      start: num(kid(l, "start"), "w:val", 1),
      pPr: kid(l, "pPr"),
      rPr: kid(l, "rPr"),
      suff: attr(kid(l, "suff"), "w:val") || "tab",
    };
  }

  get(numId: string, ilvl: number): NumLevel | null {
    const n = this.nums.get(numId);
    if (!n || numId === "0") return null;
    return n.levels.get(ilvl) || this.abstract.get(n.abs)?.[ilvl] || null;
  }

  // Advances the counter for a list paragraph and returns its label.
  next(numId: string, ilvl: number): string | null {
    const n = this.nums.get(numId);
    const lvl = this.get(numId, ilvl);
    if (!n || !lvl) return null;
    const counts = this.counters.get(numId) || [];
    for (let i = 0; i <= ilvl; i++) {
      if (counts[i] == null) counts[i] = (n.starts.get(i) ?? this.get(numId, i)?.start ?? 1) - 1;
    }
    counts[ilvl]++;
    counts.length = ilvl + 1;
    this.counters.set(numId, counts);
    if (lvl.fmt === "bullet") return lvl.text;
    if (lvl.fmt === "none") return "";
    return lvl.text.replace(/%(\d)/g, (_, d) => {
      const i = Number(d) - 1;
      const f = this.get(numId, i)?.fmt || "decimal";
      return formatNumber(counts[i] ?? 1, f);
    });
  }
}

function formatNumber(n: number, fmt: string): string {
  const roman = (v: number) => {
    const map: [number, string][] = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
    let s = "";
    for (const [k, r] of map) while (v >= k) (s += r), (v -= k);
    return s;
  };
  const letters = (v: number) => {
    const ch = String.fromCharCode(97 + ((v - 1) % 26));
    return ch.repeat(Math.floor((v - 1) / 26) + 1);
  };
  switch (fmt) {
    case "lowerRoman": return roman(n);
    case "upperRoman": return roman(n).toUpperCase();
    case "lowerLetter": return letters(n);
    case "upperLetter": return letters(n).toUpperCase();
    case "decimalZero": return n < 10 ? `0${n}` : String(n);
    default: return String(n);
  }
}

// ─── Layout model ───────────────────────────────────────────────────────────

// One positioned thing on a line.
interface Atom {
  kind: "text" | "space" | "tab" | "image" | "break" | "page";
  text: string;
  rpr: RPr;
  rf: ResolvedFont | null;
  width: number;
  size: number; // effective font size (after super/subscript)
  image?: { img: PDFImage | null; w: number; h: number };
  field?: string; // PAGE / NUMPAGES
  x?: number; // set when laid out
  leader?: string | null;
}

interface Line {
  atoms: Atom[];
  height: number;
  ascent: number; // line top to baseline
  width: number;
  left: number; // x of the line's start, relative to the content box
  justify: boolean;
  breakBefore?: boolean; // a page break precedes this line
  label?: { text: string; rpr: RPr; rf: ResolvedFont; x: number; ascent: number; suff: string | null };
}

interface ParaBlock {
  kind: "para";
  ppr: PPr;
  lines: Line[];
  before: number;
  after: number;
  hardBreakAfter: boolean; // paragraph ends with a page break
  anchored: { img: PDFImage | null; x: number; y: number; w: number; h: number; relV: string; relH: string }[];
  // Borders this paragraph draws, once grouped with its neighbours.
  bTop?: Border;
  bBottom?: Border; // the group's bottom border, or the "between" border
}

interface Cell {
  blocks: Block[];
  width: number; // outer width
  span: number;
  vMerge: "restart" | "continue" | null;
  shade: string | null;
  borders: Partial<Record<"top" | "bottom" | "left" | "right", Border>>;
  mar: { l: number; r: number; t: number; b: number };
  inset: number; // text offset from the cell's left edge beyond the margin
  vAlign: string;
  height: number; // content height, filled in by layout
}

interface Row {
  cells: Cell[];
  minHeight: number;
  exactHeight: boolean;
  header: boolean;
  cantSplit: boolean;
  borderTop: number; // width of the border above the row, part of its height
  height: number;
}

interface TableBlock {
  kind: "table";
  rows: Row[];
  x: number;
  width: number;
  borderBottom: number; // width of the border below the last row
}

type Block = ParaBlock | TableBlock;

interface Section {
  width: number;
  height: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
  headerDist: number;
  footerDist: number;
  headers: Record<string, string>; // type → part path
  footers: Record<string, string>;
  titlePg: boolean;
  blocks: El[];
  startsOnNewPage: boolean;
}

// ─── Engine ─────────────────────────────────────────────────────────────────

interface Ctx {
  part: string; // part path, for image relationships
  rels: Map<string, Rel>;
}

class Engine {
  notes = new Set<string>();
  private images = new Map<string, Promise<PDFImage | null>>();
  defaultTab = 36;
  compatMode = 15;

  constructor(
    private pkg: Package,
    private pdf: PDFDocument,
    private fonts: PdfFontSet,
    private styles: Styles,
    private numbering: Numbering,
    private theme: Theme
  ) {}

  // ── Property resolution ──

  baseRPr(): RPr {
    const r: RPr = {
      font: this.theme.minor || "Calibri", size: 10, bold: false, italic: false, underline: false, strike: false,
      color: null, highlight: null, shade: null, vertAlign: null, caps: false, smallCaps: false, spacing: 0, hidden: false,
    };
    return applyRPr(this.styles.docRPr, r, this.theme);
  }

  basePPr(): PPr {
    const p: PPr = {
      jc: "left", left: 0, right: 0, firstLine: 0, before: 0, after: 0, beforeAuto: false, afterAuto: false, line: 240, lineRule: "auto",
      contextual: false, keepNext: false, keepLines: false, widow: true, pageBreakBefore: false, numId: null, ilvl: 0, tabs: [], shade: null,
      borders: {}, styleId: null,
    };
    return applyPPr(this.styles.docPPr, p, this.theme);
  }

  paraProps(pPr: El | null, tableStyle: string | null): { ppr: PPr; rpr: RPr; numLevel: NumLevel | null } {
    let ppr = this.basePPr();
    let rpr = this.baseRPr();
    for (const s of this.styles.chain(tableStyle)) {
      ppr = applyPPr(kid(s.el, "pPr"), ppr, this.theme);
      rpr = applyRPr(kid(s.el, "rPr"), rpr, this.theme);
    }
    const styleId = attr(kid(pPr, "pStyle"), "w:val") || this.styles.defaultPara;
    for (const s of this.styles.chain(styleId)) {
      ppr = applyPPr(kid(s.el, "pPr"), ppr, this.theme);
      rpr = applyRPr(kid(s.el, "rPr"), rpr, this.theme);
    }
    // Numbering comes from the style or the paragraph; its indents sit
    // between the style's and the paragraph's own.
    const direct = applyPPr(pPr, ppr, this.theme);
    let numLevel: NumLevel | null = null;
    if (direct.numId) {
      numLevel = this.numbering.get(direct.numId, direct.ilvl);
      if (numLevel?.pPr) ppr = applyPPr(numLevel.pPr, ppr, this.theme);
    }
    ppr = applyPPr(pPr, ppr, this.theme);
    ppr.numId = direct.numId;
    ppr.ilvl = direct.ilvl;
    ppr.styleId = styleId;
    // The paragraph mark's run properties style the paragraph's default text.
    return { ppr, rpr, numLevel };
  }

  runProps(rPr: El | null, base: RPr): RPr {
    let r = base;
    const cs = attr(kid(rPr, "rStyle"), "w:val");
    for (const s of this.styles.chain(cs)) r = applyRPr(kid(s.el, "rPr"), r, this.theme);
    return applyRPr(rPr, r, this.theme);
  }

  // ── Pictures ──

  async image(ctx: Ctx, rid: string | null, w: number, h: number): Promise<PDFImage | null> {
    if (!rid) return null;
    const rel = ctx.rels.get(rid);
    if (!rel || rel.external) return null;
    const ext = rel.target.split(".").pop()!.toLowerCase();
    const key = isMetafile(ext) ? `${rel.target}@${Math.round(w)}x${Math.round(h)}` : rel.target;
    if (!this.images.has(key)) {
      this.images.set(
        key,
        (async () => {
          const bytes = await this.pkg.bytes(rel.target);
          if (!bytes) return null;
          try {
            if (ext === "png") return await this.pdf.embedPng(bytes);
            if (ext === "jpg" || ext === "jpeg") return await this.pdf.embedJpg(bytes);
            if (isMetafile(ext)) return await this.pdf.embedPng(await metafileToPng(bytes, ext, (w * 200) / 72, (h * 200) / 72));
            const url = URL.createObjectURL(new Blob([bytes], { type: ext === "svg" ? "image/svg+xml" : `image/${ext}` }));
            try {
              const img = new Image();
              await new Promise<void>((res, rej) => ((img.onload = () => res()), (img.onerror = () => rej(new Error("img"))), (img.src = url)));
              const c = document.createElement("canvas");
              c.width = Math.max(1, Math.round(img.naturalWidth || (w * 200) / 72));
              c.height = Math.max(1, Math.round(img.naturalHeight || (h * 200) / 72));
              c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
              const png = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/png"));
              return await this.pdf.embedPng(new Uint8Array(await png.arrayBuffer()));
            } finally {
              URL.revokeObjectURL(url);
            }
          } catch {
            this.notes.add("a picture that couldn't be read");
            return null;
          }
        })()
      );
    }
    return this.images.get(key)!;
  }

  // ── Paragraph → atoms ──

  private async textAtoms(text: string, rpr: RPr, out: Atom[]) {
    if (rpr.hidden || !text) return;
    let t = rpr.caps ? text.toUpperCase() : text;
    const size = rpr.vertAlign ? rpr.size * 0.65 : rpr.size;
    const rf = await this.fonts.get(rpr.font, rpr.bold, rpr.italic);
    if (rpr.smallCaps) t = t.toUpperCase();
    const effSize = rpr.smallCaps ? size * 0.8 : size;
    // Words, spaces and a break chance after hyphens, as Word wraps.
    const parts = t.split(/( +)/).flatMap((w) => (w.startsWith(" ") ? [w] : w.split(/(?<=-)(?=[^-])/)));
    for (const part of parts) {
      if (!part) continue;
      const isSpace = part.startsWith(" ");
      const w = this.fonts.width(rf, part, effSize) + rpr.spacing * part.length;
      out.push({ kind: isSpace ? "space" : "text", text: part, rpr, rf, width: w, size: effSize });
    }
  }

  private async runAtoms(r: El, base: RPr, ctx: Ctx, out: Atom[], field?: string) {
    const rpr = this.runProps(kid(r, "rPr"), base);
    for (const c of Array.from(r.children)) {
      switch (c.localName) {
        case "t":
          if (field) {
            const rf = await this.fonts.get(rpr.font, rpr.bold, rpr.italic);
            out.push({ kind: "text", text: "99", rpr, rf, width: this.fonts.width(rf, "99", rpr.size), size: rpr.size, field });
          }
          else await this.textAtoms(c.textContent || "", rpr, out);
          break;
        case "tab":
          out.push({ kind: "tab", text: "", rpr, rf: null, width: 0, size: rpr.size });
          break;
        case "br": {
          const type = attr(c, "w:type");
          out.push({ kind: type === "page" || type === "column" ? "page" : "break", text: "", rpr, rf: null, width: 0, size: rpr.size });
          break;
        }
        case "cr":
          out.push({ kind: "break", text: "", rpr, rf: null, width: 0, size: rpr.size });
          break;
        case "noBreakHyphen":
          await this.textAtoms("-", rpr, out);
          break;
        case "sym": {
          const code = attr(c, "w:char") || "";
          const ch = symbolChar(String.fromCharCode(parseInt(code, 16)), attr(c, "w:font"));
          await this.textAtoms(ch, rpr, out);
          break;
        }
        case "drawing":
          await this.drawingAtom(c, rpr, ctx, out);
          break;
        case "pict":
        case "object": {
          const imgData = descendants(c, "imagedata")[0];
          const shape = descendants(c, "shape")[0];
          const style = attr(shape, "style") || "";
          const w = parseCssPt(style, "width");
          const h = parseCssPt(style, "height");
          if (imgData && w && h) {
            const img = await this.image(ctx, attr(imgData, "r:id"), w, h);
            out.push({ kind: "image", text: "", rpr, rf: null, width: w, size: rpr.size, image: { img, w, h } });
          } else if (descendants(c, "textbox").length) this.notes.add("text boxes");
          break;
        }
      }
    }
  }

  private async drawingAtom(d: El, rpr: RPr, ctx: Ctx, out: Atom[]) {
    const inline = kid(d, "inline");
    const anchor = kid(d, "anchor");
    const holder = inline || anchor;
    if (!holder) return;
    const ext = kid(holder, "extent");
    const w = num(ext, "cx", 0) / EMU;
    const h = num(ext, "cy", 0) / EMU;
    const blip = descendants(holder, "blip")[0];
    if (!blip) {
      if (descendants(holder, "txbx").length || descendants(holder, "wsp").length) this.notes.add("text boxes and shapes");
      else if (descendants(holder, "chart").length) this.notes.add("charts");
      return;
    }
    const img = await this.image(ctx, attr(blip, "r:embed"), w, h);
    if (inline) {
      out.push({ kind: "image", text: "", rpr, rf: null, width: w, size: rpr.size, image: { img, w, h } });
    } else {
      // Floating picture: placed where the document says, without wrapping.
      const ph = kid(anchor, "positionH");
      const pv = kid(anchor, "positionV");
      const offX = kid(ph, "posOffset") ? Number(kid(ph, "posOffset")!.textContent) / EMU : 0;
      const offY = kid(pv, "posOffset") ? Number(kid(pv, "posOffset")!.textContent) / EMU : 0;
      out.push({
        kind: "image",
        text: "",
        rpr,
        rf: null,
        width: 0,
        size: 0,
        image: { img, w, h },
        field: `ANCHOR|${attr(ph, "relativeFrom") || "column"}|${attr(pv, "relativeFrom") || "paragraph"}|${offX}|${offY}|${attr(kid(ph, "align"), "") || kid(ph, "align")?.textContent || ""}`,
      });
    }
  }

  async paragraphAtoms(p: El, rpr: RPr, ctx: Ctx): Promise<Atom[]> {
    const out: Atom[] = [];
    let field: string | null = null; // instruction of the field being read
    let inResult = false;
    let emitted = false;
    const walk = async (el: El) => {
      for (const c of Array.from(el.children)) {
        switch (c.localName) {
          case "r": {
            const fc = kid(c, "fldChar");
            if (fc) {
              const type = attr(fc, "w:fldCharType");
              if (type === "begin") (field = ""), (inResult = false), (emitted = false);
              else if (type === "separate") inResult = true;
              else if (type === "end") (field = null), (inResult = false);
              break;
            }
            const instr = kid(c, "instrText");
            if (instr && field != null && !inResult) {
              field += instr.textContent || "";
              break;
            }
            if (field != null && inResult) {
              const code = field.trim().split(/\s+/)[0]?.toUpperCase();
              if (code === "PAGE" || code === "NUMPAGES" || code === "SECTIONPAGES") {
                if (!emitted) await this.runAtoms(c, rpr, ctx, out, code === "SECTIONPAGES" ? "NUMPAGES" : code);
                emitted = true;
                break;
              }
            }
            await this.runAtoms(c, rpr, ctx, out);
            break;
          }
          case "fldSimple": {
            const code = (attr(c, "w:instr") || "").trim().split(/\s+/)[0]?.toUpperCase();
            if (code === "PAGE" || code === "NUMPAGES") {
              const r = kids(c, "r")[0];
              const rp = this.runProps(kid(r, "rPr"), rpr);
              const rf = await this.fonts.get(rp.font, rp.bold, rp.italic);
              out.push({ kind: "text", text: "99", rpr: rp, rf, width: this.fonts.width(rf, "99", rp.size), size: rp.size, field: code });
            } else await walk(c);
            break;
          }
          case "hyperlink":
          case "smartTag":
          case "ins":
          case "customXml":
          case "sdt":
          case "sdtContent":
          case "dir":
          case "bdo":
            await walk(c);
            break;
          case "oMath":
          case "oMathPara":
            this.notes.add("equations");
            break;
        }
      }
    };
    await walk(p);
    return out;
  }

  // ── Line breaking ──

  // Height of one line of text at this paragraph's spacing.
  // Height of a line and where its baseline sits (measured against Word):
  // - text lines are the tallest ascent plus the deepest descent;
  // - a list label or picture can raise the line, and adds no depth below
  //   the baseline (a line holding only pictures has none);
  // - "multiple" spacing adds (multiple - 1) text lines of room below.
  private lineBox(ppr: PPr, atoms: Atom[], fallback: RPr, fallbackRf: ResolvedFont, labelAscent = 0): { height: number; ascent: number } {
    let fontAsc = 0;
    let fontDesc = 0;
    let imgH = 0;
    let hasText = false;
    const consider = (size: number, rf: ResolvedFont) => {
      fontAsc = Math.max(fontAsc, rf.metrics.ascent * size);
      fontDesc = Math.max(fontDesc, rf.metrics.descent * size);
    };
    for (const a of atoms) {
      if (a.kind === "image" && a.image && !a.field) imgH = Math.max(imgH, a.image.h);
      else if (a.rf) {
        consider(a.rpr.size, a.rf);
        if (a.kind === "text" && a.text.trim()) hasText = true;
      }
    }
    if (!fontAsc) consider(fallback.size, fallbackRf);
    if (ppr.lineRule === "exact") {
      const L = twip(ppr.line);
      return { height: L, ascent: L * 0.8 };
    }
    const asc = Math.max(fontAsc, imgH, labelAscent);
    const desc = !hasText && imgH > fontAsc ? 0 : fontDesc;
    const natural = asc + desc;
    if (ppr.lineRule === "atLeast") {
      const L = twip(ppr.line);
      return L > natural ? { height: L, ascent: L - desc } : { height: natural, ascent: asc };
    }
    // The extra of "multiple" spacing goes below the text.
    const mult = ppr.line / 240;
    return { height: natural + (mult - 1) * (fontAsc + fontDesc), ascent: asc };
  }

  async layoutParagraph(p: El, width: number, ctx: Ctx, tableStyle: string | null): Promise<ParaBlock> {
    const pPr = kid(p, "pPr");
    const { ppr, rpr: paraRpr, numLevel } = this.paraProps(pPr, tableStyle);
    const markRpr = this.runProps(kid(pPr, "rPr"), paraRpr);
    const atoms = await this.paragraphAtoms(p, paraRpr, ctx);
    const markRf = await this.fonts.get(markRpr.font, markRpr.bold, markRpr.italic);

    // List label
    let label: Line["label"] | undefined;
    if (ppr.numId && numLevel) {
      const text = this.numbering.next(ppr.numId, ppr.ilvl);
      if (text != null && text !== "") {
        let lrpr = applyRPr(numLevel.rPr, { ...markRpr, underline: false, strike: false, highlight: null, shade: null }, this.theme);
        const symbolFont = /^(symbol|wingdings|webdings)/i.test(lrpr.font);
        const shown = Array.from(text).map((ch) => (symbolFont || ch.charCodeAt(0) >= 0xf000 ? symbolChar(ch, lrpr.font) : ch)).join("");
        // The line makes room for the label's own font, even when it's drawn
        // with another one.
        const ascent = (await this.fonts.get(lrpr.font, lrpr.bold, lrpr.italic)).metrics.ascent * lrpr.size;
        if (symbolFont) lrpr = { ...lrpr, font: paraRpr.font };
        const lrf = await this.fonts.get(lrpr.font, lrpr.bold, lrpr.italic);
        label = { text: shown, rpr: lrpr, rf: lrf, x: ppr.left + ppr.firstLine, ascent, suff: numLevel.suff ?? null };
      }
    }

    const lines: Line[] = [];
    let hardBreakAfter = false;
    const anchored: ParaBlock["anchored"] = [];

    let cur: Atom[] = [];
    let curW = 0;
    let first = true;
    let startX = ppr.left + ppr.firstLine;

    // Text after a list label starts at the hanging indent or the next tab.
    if (label) {
      const lw = this.fonts.width(label.rf, label.text, label.rpr.size);
      const end = label.x + lw;
      if (label.suff === "space") startX = end + this.fonts.width(label.rf, " ", label.rpr.size);
      else if (label.suff === "nothing") startX = end;
      else startX = end <= ppr.left - 0.5 && ppr.firstLine < 0 ? ppr.left : this.nextTab(end, ppr, width).pos;
    }

    let pendingBreak = false;
    const flush = (justifyAllowed: boolean) => {
      while (cur.length && cur[cur.length - 1].kind === "space") cur.pop();
      const content = cur.some((x) => x.kind !== "space");
      const breakBefore = pendingBreak && content;
      if (breakBefore) pendingBreak = false;
      const box = this.lineBox(ppr, cur, markRpr, markRf, first && label ? label.ascent : 0);
      lines.push({ atoms: cur, height: box.height, ascent: box.ascent, width: curW, left: first ? startX : ppr.left, justify: justifyAllowed && ppr.jc === "both", label: first ? label : undefined, breakBefore });
      cur = [];
      curW = 0;
      first = false;
    };

    for (const a of atoms) {
      if (a.kind === "image" && a.field?.startsWith("ANCHOR")) {
        const [, relH, relV, ox, oy] = a.field.split("|");
        anchored.push({ img: a.image!.img, x: Number(ox), y: Number(oy), w: a.image!.w, h: a.image!.h, relH, relV });
        continue;
      }
      if (a.kind === "break") {
        flush(false);
        continue;
      }
      // A page break moves the rest of the paragraph to the next page.
      if (a.kind === "page") {
        if (cur.some((x) => x.kind !== "space")) flush(false);
        else cur = [];
        pendingBreak = true;
        continue;
      }
      const lineStart = first ? startX : ppr.left;
      if (a.kind === "tab") {
        const x = lineStart + curW;
        const stop = this.nextTab(x, ppr, width);
        let w = Math.max(0, stop.pos - x);
        // Right/centre tabs: the following text ends at / centres on the stop.
        if (stop.kind === "right" || stop.kind === "center" || stop.kind === "decimal") {
          const idx = atoms.indexOf(a);
          let segW = 0;
          for (let k = idx + 1; k < atoms.length && atoms[k].kind !== "tab" && atoms[k].kind !== "break"; k++) segW += atoms[k].width;
          w = Math.max(0, stop.pos - x - (stop.kind === "center" ? segW / 2 : segW));
        }
        a.width = w;
        a.leader = stop.leader;
        cur.push(a);
        curW += w;
        continue;
      }
      // In justified paragraphs Word 2013 and later squeeze the spaces to fit
      // one more word: by at most a quarter of their width, and less for a
      // short word (measured against Word). Older layouts never squeeze.
      const justified = ppr.jc === "both" || ppr.jc === "distribute";
      const squeeze =
        justified && this.compatMode >= 15 && a.kind === "text"
          ? Math.min(0.25 * cur.reduce((s, x) => s + (x.kind === "space" ? x.width : 0), 0), 0.34 * a.width + 0.10875 * a.size)
          : 0;
      if (a.kind !== "space" && curW + a.width - squeeze > width - ppr.right - lineStart + 0.01 && cur.some((x) => x.kind === "text" || x.kind === "image")) {
        flush(true);
      }
      if (a.kind === "space" && !cur.length && !first) continue;
      cur.push(a);
      curW += a.width;
    }
    if (cur.length || !lines.length) flush(false);
    // A break at the very end (the mark stays with it) ends the page.
    if (pendingBreak) hardBreakAfter = true;

    return { kind: "para", ppr, lines, before: ppr.before, after: ppr.after, hardBreakAfter, anchored };
  }

  private nextTab(x: number, ppr: PPr, width: number): TabStop {
    const custom = ppr.tabs.find((t) => t.pos > x + 0.1 && t.kind !== "bar");
    if (custom) return custom;
    // The hanging indent acts as a tab stop.
    if (ppr.firstLine < 0 && ppr.left > x + 0.1) return { pos: ppr.left, kind: "left", leader: null };
    const step = this.defaultTab || 36;
    const pos = Math.floor(x / step + 1e-6) * step + step;
    return { pos: Math.min(pos, Math.max(width, pos)), kind: "left", leader: null };
  }

  // ── Tables ──

  async layoutTable(tbl: El, width: number, ctx: Ctx): Promise<TableBlock> {
    const tblPr = kid(tbl, "tblPr");
    const styleId = attr(kid(tblPr, "tblStyle"), "w:val") || this.styles.defaultTable;
    const styleChain = this.styles.chain(styleId);
    const styleTblPr = styleChain.map((s) => kid(s.el, "tblPr")).filter(Boolean) as El[];
    const pick = (name: string) => {
      const own = kid(tblPr, name);
      if (own) return own;
      for (let i = styleTblPr.length - 1; i >= 0; i--) {
        const e = kid(styleTblPr[i], name);
        if (e) return e;
      }
      return null;
    };
    const tblBorders = pick("tblBorders");
    const cellMar = pick("tblCellMar");
    const mar = {
      l: twip(num(kid(cellMar, "left") || kid(cellMar, "start"), "w:w", 108)),
      r: twip(num(kid(cellMar, "right") || kid(cellMar, "end"), "w:w", 108)),
      t: twip(num(kid(cellMar, "top"), "w:w", 0)),
      b: twip(num(kid(cellMar, "bottom"), "w:w", 0)),
    };
    const border = (name: string) => readBorder(kid(tblBorders, name));
    const tb = { top: border("top"), bottom: border("bottom"), left: border("left") || border("start"), right: border("right") || border("end"), insideH: border("insideH"), insideV: border("insideV") };

    // Conditional formatting from the table style (header row, banding).
    const look = kid(tblPr, "tblLook");
    const lookFlag = (name: string, bit: number) => {
      const v = attr(look, `w:${name}`);
      if (v != null) return v === "1";
      const hex = attr(look, "w:val");
      return hex ? (parseInt(hex, 16) & bit) !== 0 : name === "firstRow" || name === "noVBand";
    };
    const cond = (type: string) => {
      for (let i = styleChain.length - 1; i >= 0; i--) {
        const c = kids(styleChain[i].el, "tblStylePr").find((e) => attr(e, "w:type") === type);
        if (c) return c;
      }
      return null;
    };

    const grid = kids(kid(tbl, "tblGrid"), "gridCol").map((g) => twip(num(g, "w:w", 0)));
    const rowsEl = kids(tbl, "tr");
    const rows: Row[] = [];
    const tableWidth = grid.reduce((s, v) => s + v, 0) || width;
    const jc = attr(pick("jc"), "w:val");
    const ind = twip(num(pick("tblInd"), "w:w", 0));
    const x = jc === "center" ? (width - tableWidth) / 2 : jc === "right" || jc === "end" ? width - tableWidth : ind;

    for (let ri = 0; ri < rowsEl.length; ri++) {
      const tr = rowsEl[ri];
      const trPr = kid(tr, "trPr");
      const trH = kid(trPr, "trHeight");
      const isHeader = !!kid(trPr, "tblHeader") && on(kid(trPr, "tblHeader")) !== false;
      const firstRow = ri === 0 && lookFlag("firstRow", 0x20);
      const lastRow = ri === rowsEl.length - 1 && lookFlag("lastRow", 0x40);
      const band = lookFlag("noHBand", 0x200) ? null : (ri - (lookFlag("firstRow", 0x20) ? 1 : 0)) % 2 === 0 ? "band1Horz" : "band2Horz";
      const condRow = firstRow ? cond("firstRow") : lastRow ? cond("lastRow") : band ? cond(band) : null;
      const cells: Cell[] = [];
      let col = 0;
      const tcs = kids(tr, "tc");
      for (let ci = 0; ci < tcs.length; ci++) {
        const tc = tcs[ci];
        const tcPr = kid(tc, "tcPr");
        const span = num(kid(tcPr, "gridSpan"), "w:val", 1);
        const cw = grid.slice(col, col + span).reduce((s, v) => s + v, 0) || twip(num(kid(tcPr, "tcW"), "w:w", 0)) || width / tcs.length;
        const vm = kid(tcPr, "vMerge");
        const vMerge = vm ? (attr(vm, "w:val") === "restart" ? "restart" : "continue") : null;
        const firstCol = col === 0 && lookFlag("firstColumn", 0x80) ? cond("firstCol") : null;
        const condEl = firstCol || condRow;
        const condTcPr = kid(condEl, "tcPr");
        const shdEl = kid(tcPr, "shd") || kid(condTcPr, "shd");
        const fill = attr(shdEl, "w:fill");
        let shade = fill && fill !== "auto" ? fill : attr(shdEl, "w:themeFill") ? themeColor(this.theme, attr(shdEl, "w:themeFill")!, attr(shdEl, "w:themeFillShade"), attr(shdEl, "w:themeFillTint")) : null;
        if (!shdEl) shade = null;
        const cb = kid(tcPr, "tcBorders") || kid(condTcPr, "tcBorders");
        const cmar = kid(tcPr, "tcMar");
        const isLastCol = col + span >= grid.length;
        const borders = {
          top: kid(cb, "top") ? readBorder(kid(cb, "top")) : ri === 0 ? tb.top : tb.insideH,
          bottom: kid(cb, "bottom") ? readBorder(kid(cb, "bottom")) : ri === rowsEl.length - 1 ? tb.bottom : tb.insideH,
          left: kid(cb, "left") || kid(cb, "start") ? readBorder(kid(cb, "left") || kid(cb, "start")) : col === 0 ? tb.left : tb.insideV,
          right: kid(cb, "right") || kid(cb, "end") ? readBorder(kid(cb, "right") || kid(cb, "end")) : isLastCol ? tb.right : tb.insideV,
        };
        // Since Word 2013 the text also clears half of the left border.
        const inset = this.compatMode >= 15 ? (borders.left?.width || 0) / 2 : 0;
        const cellMarEl = cmar;
        const cm = {
          l: kid(cellMarEl, "left") || kid(cellMarEl, "start") ? twip(num(kid(cellMarEl, "left") || kid(cellMarEl, "start"), "w:w", 0)) : mar.l,
          r: kid(cellMarEl, "right") || kid(cellMarEl, "end") ? twip(num(kid(cellMarEl, "right") || kid(cellMarEl, "end"), "w:w", 0)) : mar.r,
          t: kid(cellMarEl, "top") ? twip(num(kid(cellMarEl, "top"), "w:w", 0)) : mar.t,
          b: kid(cellMarEl, "bottom") ? twip(num(kid(cellMarEl, "bottom"), "w:w", 0)) : mar.b,
        };
        // Cell content, with the table style's (conditional) run formatting.
        const blocks: Block[] = [];
        if (vMerge !== "continue") {
          for (const child of Array.from(tc.children)) {
            if (child.localName === "p") {
              const pb = await this.layoutParagraph(child, cw - cm.l - cm.r - inset, ctx, styleId);
              const condR = kid(condEl, "rPr");
              if (condR) for (const l of pb.lines) for (const a of l.atoms) if (a.kind === "text" || a.kind === "space") {
                const merged = applyRPr(condR, a.rpr, this.theme);
                // Direct run formatting still wins over the table style.
                a.rpr = { ...merged, color: a.rpr.color ?? merged.color, bold: a.rpr.bold || merged.bold };
                if (a.rpr.bold !== (a.rf?.bold ?? false)) {
                  a.rf = await this.fonts.get(a.rpr.font, a.rpr.bold, a.rpr.italic);
                  a.width = this.fonts.width(a.rf, a.text, a.size) + a.rpr.spacing * a.text.length;
                }
              }
              blocks.push(pb);
            } else if (child.localName === "tbl") blocks.push(await this.layoutTable(child, cw - cm.l - cm.r - inset, ctx));
          }
        }
        groupBorders(blocks);
        cells.push({ blocks, width: cw, span, vMerge, shade, borders, mar: cm, inset, vAlign: attr(kid(tcPr, "vAlign"), "w:val") || "top", height: 0 });
        col += span;
      }
      const hRule = attr(trH, "w:hRule");
      rows.push({
        cells,
        minHeight: twip(num(trH, "w:val", 0)),
        exactHeight: hRule === "exact",
        header: isHeader,
        cantSplit: !!kid(trPr, "cantSplit") && on(kid(trPr, "cantSplit")) !== false,
        borderTop: Math.max(0, ...cells.map((c) => c.borders.top?.width || 0)),
        height: 0,
      });
    }
    // Row heights: tallest cell content, at least the row's own height.
    for (const row of rows) {
      let h = 0;
      for (const c of row.cells) {
        c.height = blocksHeight(c.blocks) + c.mar.t + c.mar.b;
        if (c.vMerge !== "continue") h = Math.max(h, c.height);
      }
      // The border above a row is part of the row's height.
      row.height = row.exactHeight ? row.minHeight : Math.max(row.minHeight, row.borderTop + h);
    }
    const lastRow = rows[rows.length - 1];
    const borderBottom = lastRow ? Math.max(0, ...lastRow.cells.map((c) => c.borders.bottom?.width || 0)) : 0;
    // Before Word 2013, the text in the first column lines up with the page
    // margin, so the table's left edge sits one (table-wide) cell margin to
    // the left.
    const outdent = jc || this.compatMode >= 15 || !cellMar ? 0 : mar.l;
    return { kind: "table", rows, x: x - outdent, width: tableWidth, borderBottom };
  }
}

function parseCssPt(style: string, prop: string): number {
  const m = style.match(new RegExp(`${prop}\\s*:\\s*([\\d.]+)(pt|in|px|cm|mm)?`, "i"));
  if (!m) return 0;
  const v = Number(m[1]);
  switch ((m[2] || "pt").toLowerCase()) {
    case "in": return v * 72;
    case "px": return v * 0.75;
    case "cm": return (v * 72) / 2.54;
    case "mm": return (v * 72) / 25.4;
    default: return v;
  }
}

// A top border sits above the text, a bottom one below it; each adds its
// width and distance from the text to the paragraph's height.
const padTop = (b: ParaBlock) => (b.bTop ? b.bTop.space + b.bTop.width : 0);
const padBottom = (b: ParaBlock) => (b.bBottom ? b.bBottom.space + b.bBottom.width : 0);

function paraHeight(b: ParaBlock): number {
  return padTop(b) + b.lines.reduce((s, l) => s + l.height, 0) + padBottom(b);
}

// Word joins neighbouring paragraphs with the same borders and indents into
// one bordered box: the top border above the first, the bottom border below
// the last, and the "between" border between them.
function groupBorders(blocks: Block[]) {
  const same = (x?: Border, y?: Border) => (!x && !y) || (!!x && !!y && x.width === y.width && x.color === y.color && x.space === y.space);
  const joined = (a: Block | undefined, b: Block | undefined) =>
    a?.kind === "para" &&
    b?.kind === "para" &&
    a.ppr.left === b.ppr.left &&
    a.ppr.right === b.ppr.right &&
    (["top", "bottom", "left", "right", "between"] as const).every((s) => same(a.ppr.borders[s], b.ppr.borders[s]));
  blocks.forEach((b, i) => {
    if (b.kind !== "para") return;
    const bd = b.ppr.borders;
    const first = !joined(blocks[i - 1], b);
    const last = !joined(b, blocks[i + 1]);
    b.bTop = first ? bd.top : undefined;
    b.bBottom = last ? bd.bottom : bd.between;
  });
}

// How far a paragraph's top and bottom borders reach past its indents.
function borderReach(side?: Border): number {
  return (side ? side.space + side.width : 0) + 1.44;
}

// Splits cell content so the first part is at most `room` tall.
function splitBlocks(blocks: Block[], room: number): [Block[], Block[]] {
  const a: Block[] = [];
  const b: Block[] = [];
  let y = 0;
  let prevAfter = 0;
  let overflow = false;
  blocks.forEach((blk, i) => {
    if (overflow) return void b.push(blk);
    if (blk.kind === "para") {
      let h = y + (i === 0 ? blk.before : Math.max(prevAfter, blk.before)) + padTop(blk);
      let fit = 0;
      while (fit < blk.lines.length && h + blk.lines[fit].height <= room + 0.01) h += blk.lines[fit++].height;
      // In a cell the paragraph's space after must fit on the page too.
      if (fit === blk.lines.length && h + padBottom(blk) + blk.after > room + 0.01) fit--;
      // Widow/orphan control applies inside cells too.
      if (fit < blk.lines.length && blk.ppr.widow && blk.lines.length >= 2) {
        if (blk.lines.length - fit === 1) fit--;
        if (fit === 1) fit = 0;
      }
      if (fit === blk.lines.length) {
        a.push(blk);
        y = h + padBottom(blk);
        prevAfter = blk.after;
        return;
      }
      if (fit > 0) a.push({ ...blk, lines: blk.lines.slice(0, fit), after: 0, bBottom: undefined });
      b.push({ ...blk, lines: blk.lines.slice(fit), before: 0, bTop: fit > 0 ? undefined : blk.bTop });
      overflow = true;
    } else {
      const h = blk.rows.reduce((sum, r) => sum + r.height, 0) + blk.borderBottom;
      if (y + prevAfter + h <= room) {
        a.push(blk);
        y += prevAfter + h;
        prevAfter = 0;
      } else {
        b.push(blk);
        overflow = true;
      }
    }
  });
  return [a, b];
}

// Splits a table row at a page break; null when not even one line fits.
function splitRow(row: Row, avail: number): [Row, Row] | null {
  const first: Cell[] = [];
  const rest: Cell[] = [];
  let any = false;
  let firstH = 0;
  let restH = 0;
  for (const c of row.cells) {
    if (c.vMerge === "continue") {
      first.push({ ...c });
      rest.push({ ...c });
      continue;
    }
    const [a, b] = splitBlocks(c.blocks, avail - row.borderTop - c.mar.t - c.mar.b);
    // Word moves the whole row rather than start a cell on the next page.
    if (!a.length && b.length) return null;
    if (a.length) any = true;
    const fa = { ...c, blocks: a, height: blocksHeight(a) + c.mar.t + c.mar.b };
    const fb = { ...c, blocks: b, height: blocksHeight(b) + c.mar.t + c.mar.b };
    first.push(fa);
    rest.push(fb);
    firstH = Math.max(firstH, fa.height);
    restH = Math.max(restH, fb.height);
  }
  if (!any) return null;
  return [
    { ...row, cells: first, height: Math.min(avail, row.borderTop + firstH), header: false },
    { ...row, cells: rest, height: row.borderTop + restH, header: false, minHeight: 0 },
  ];
}

function blocksHeight(blocks: Block[]): number {
  let h = 0;
  let prevAfter = 0;
  blocks.forEach((b, i) => {
    if (b.kind === "para") {
      h += (i === 0 ? b.before : Math.max(prevAfter, b.before)) + paraHeight(b);
      prevAfter = b.after;
    } else {
      h += prevAfter + b.rows.reduce((s, r) => s + r.height, 0) + b.borderBottom;
      prevAfter = 0;
    }
  });
  // The last paragraph's space after counts too (Word keeps it in cells).
  return h + prevAfter;
}

// ─── Painting ───────────────────────────────────────────────────────────────

const hexRgb = (hex: string) => rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);

class Painter {
  constructor(private fonts: PdfFontSet, public page: PDFPage, public pageNumber: number, public pageCount: number) {}

  private get H() {
    return this.page.getHeight();
  }

  rect(x: number, y: number, w: number, h: number, hex: string) {
    this.page.drawRectangle({ x, y: this.H - y - h, width: w, height: h, color: hexRgb(hex) });
  }

  hline(x1: number, x2: number, y: number, b: Border) {
    this.page.drawLine({ start: { x: x1, y: this.H - y }, end: { x: x2, y: this.H - y }, thickness: b.width, color: hexRgb(b.color) });
  }

  vline(x: number, y1: number, y2: number, b: Border) {
    this.page.drawLine({ start: { x, y: this.H - y1 }, end: { x, y: this.H - y2 }, thickness: b.width, color: hexRgb(b.color) });
  }

  // Draws one laid-out line whose top is at `top`, content box starting at `ox`.
  line(line: Line, ox: number, top: number, contentWidth: number, ppr: PPr) {
    const baseline = top + line.ascent;
    let x = ox + line.left;
    const free = contentWidth - ppr.right - line.left - line.width;
    if (ppr.jc === "center") x += free / 2;
    else if (ppr.jc === "right" || ppr.jc === "end") x += free;
    const spaces = line.atoms.filter((a) => a.kind === "space").length;
    // Justified lines stretch (or, when Word squeezed a word in, shrink) their spaces.
    const extra = spaces && (line.justify ? free !== 0 : free < 0) ? free / spaces : 0;

    if (line.label) {
      const l = line.label;
      this.text(encodable(l.rf.font, l.text), l.rf, l.rpr, l.rpr.size, ox + l.x, baseline, 0);
    }
    for (const a of line.atoms) {
      const w = a.width + (a.kind === "space" ? extra : 0);
      if (a.kind === "text") {
        let text = a.text;
        if (a.field === "PAGE") text = String(this.pageNumber);
        else if (a.field === "NUMPAGES") text = String(this.pageCount);
        const shift = a.rpr.vertAlign === "superscript" ? -a.rpr.size * 0.33 : a.rpr.vertAlign === "subscript" ? a.rpr.size * 0.14 : 0;
        if (a.rpr.highlight || a.rpr.shade) this.rect(x, baseline - a.size * 0.95, w, a.size * 1.2, (a.rpr.highlight || a.rpr.shade)!);
        this.text(encodable(a.rf!.font, text), a.rf!, a.rpr, a.size, x, baseline + shift, a.rpr.spacing);
        if (a.rpr.underline) this.hline(x, x + w, baseline + a.size * 0.12, { width: Math.max(0.5, a.size / 18), color: a.rpr.color || "000000", space: 0 });
        if (a.rpr.strike) this.hline(x, x + w, baseline - a.size * 0.28, { width: Math.max(0.5, a.size / 18), color: a.rpr.color || "000000", space: 0 });
      } else if (a.kind === "space") {
        if (a.rpr.highlight || a.rpr.shade) this.rect(x, baseline - a.size * 0.95, w, a.size * 1.2, (a.rpr.highlight || a.rpr.shade)!);
        if (a.rpr.underline) this.hline(x, x + w, baseline + a.size * 0.12, { width: Math.max(0.5, a.size / 18), color: a.rpr.color || "000000", space: 0 });
      } else if (a.kind === "tab" && a.leader && a.leader !== "none" && w > 6) {
        const ch = a.leader === "dot" ? "." : a.leader === "hyphen" ? "-" : a.leader === "underscore" ? "_" : ".";
        const rf = a.rf;
        if (rf) {
          const cw = this.fonts.width(rf, ch, a.size) || 3;
          const n = Math.floor((w - 4) / cw);
          if (n > 0) this.text(ch.repeat(n), rf, a.rpr, a.size, x + w - n * cw - 2, baseline, 0);
        }
      } else if (a.kind === "image" && a.image?.img) {
        this.page.drawImage(a.image.img, { x, y: this.H - baseline, width: a.image.w, height: a.image.h });
      }
      x += w;
    }
  }

  text(text: string, rf: ResolvedFont, rpr: RPr, size: number, x: number, baseline: number, spacing: number) {
    if (!text) return;
    const stretch = this.fonts.stretch(rf, text, size);
    const state = spacing || stretch !== 100;
    if (state) {
      this.page.pushOperators(pushGraphicsState());
      if (spacing) this.page.pushOperators(setCharacterSpacing(spacing));
      if (stretch !== 100) this.page.pushOperators(setCharacterSqueeze(stretch));
    }
    this.page.drawText(text, { x, y: this.H - baseline, size, font: rf.font, color: hexRgb(rpr.color || "000000") });
    if (state) this.page.pushOperators(popGraphicsState());
  }
}

// ─── Pagination ─────────────────────────────────────────────────────────────

type Op = (p: Painter) => void;

interface PageOut {
  section: Section;
  ops: Op[];
}

class Paginator {
  pages: PageOut[] = [];
  private y = 0;
  private prevAfter = 0;
  private prevStyle: string | null = null;
  private prevContextual = false;
  private atTop = true;
  private sec!: Section;

  constructor(private engine: Engine) {}

  private get page(): PageOut {
    return this.pages[this.pages.length - 1];
  }
  private get bottom() {
    return this.sec.height - this.sec.bottom;
  }
  private get contentWidth() {
    return this.sec.width - this.sec.left - this.sec.right;
  }

  private forcedTop = true;

  newPage(forced = false) {
    this.pages.push({ section: this.sec, ops: [] });
    this.y = this.sec.top;
    this.prevAfter = 0;
    this.atTop = true;
    this.forcedTop = forced;
  }

  startSection(sec: Section) {
    const first = !this.sec;
    this.sec = sec;
    if (first || sec.startsOnNewPage || !this.pages.length) this.newPage(true);
    else this.page.section = sec;
  }

  // Space before a paragraph: the larger of the previous paragraph's space
  // after and this one's space before; nothing at the top of a page after a
  // natural break; none between same-style paragraphs with contextual spacing.
  private gapBefore(b: ParaBlock, forced: boolean): number {
    const sameStyle = b.ppr.styleId && b.ppr.styleId === this.prevStyle;
    let before = b.before;
    let prevAfter = this.prevAfter;
    if (sameStyle && b.ppr.contextual) before = 0;
    if (sameStyle && this.prevContextual) prevAfter = 0;
    if (this.atTop) return forced || this.forcedTop || this.pages.length === 1 ? before : 0;
    return Math.max(prevAfter, before);
  }

  // Height that must fit on this page for a paragraph kept with the next
  // one: the whole chain of "keep with next" paragraphs, plus the start of
  // the block that ends it.
  private keepChain(b: ParaBlock, following: Block[]): number {
    const opening = (x: Block) =>
      x.kind === "table" ? (x.rows[0]?.height ?? 0) : x.ppr.keepLines || x.lines.length <= 1 ? paraHeight(x) : padTop(x) + x.lines[0].height + (x.ppr.widow ? x.lines[1].height : 0);
    let need = paraHeight(b);
    let prev = b;
    for (const nb of following) {
      if (nb.kind === "table") return need + prev.after + opening(nb);
      const same = !!nb.ppr.styleId && nb.ppr.styleId === prev.ppr.styleId;
      need += Math.max(same && prev.ppr.contextual ? 0 : prev.after, same && nb.ppr.contextual ? 0 : nb.before);
      if (!nb.ppr.keepNext) return need + opening(nb);
      need += paraHeight(nb);
      prev = nb;
    }
    return need;
  }

  placePara(b: ParaBlock, following: Block[], forced = false) {
    // Word 2013 and later drop the space before at the top of a page even
    // with "page break before"; older layouts keep it.
    if (b.ppr.pageBreakBefore && !this.atTop) {
      this.newPage();
      forced = this.engine.compatMode < 15;
    }
    if (b.lines[0]?.breakBefore && !this.atTop) this.newPage();
    let gap = this.gapBefore(b, forced);
    const total = paraHeight(b);
    // Keep with next: this paragraph goes to the next page unless it fits
    // here together with what it's kept with.
    const needed = b.ppr.keepNext && following.length ? this.keepChain(b, following) : b.ppr.keepLines || b.lines.length <= 1 ? total : Math.min(total, padTop(b) + b.lines[0].height * 2);
    if (!this.atTop && this.y + gap + needed > this.bottom && needed <= this.bottom - this.sec.top) {
      this.newPage();
      gap = this.gapBefore(b, false);
    }
    this.y += gap;
    const ox = this.sec.left;
    const width = this.contentWidth;

    // Paragraph shading and borders span the whole paragraph (per page part).
    const lines = b.lines;
    let i = 0;
    while (i < lines.length) {
      // How many lines fit on this page?
      // Lines up to the next page break in the paragraph.
      let end = i + 1;
      while (end < lines.length && !lines[end].breakBefore) end++;
      let fit = 0;
      const pre = i === 0 ? padTop(b) : 0;
      let h = pre;
      while (i + fit < end && this.y + h + lines[i + fit].height <= this.bottom + 0.01) {
        h += lines[i + fit].height;
        fit++;
      }
      if (fit < end - i) {
        // Widow/orphan control: never leave one line alone.
        if (b.ppr.widow && end - i >= 2) {
          if (end - i - fit === 1 && fit > 1) fit--;
          if (fit === 1 && i === 0) fit = 0;
        }
        if (fit === 0 && this.atTop) fit = 1; // a line taller than the page
      }
      if (fit === 0) {
        this.newPage();
        continue;
      }
      const chunk = lines.slice(i, i + fit);
      const last = i + fit === lines.length;
      this.y = this.decorate(b, ox, width, this.y, chunk, i === 0, last);
      this.atTop = false;
      i += fit;
      if (i < lines.length) this.newPage();
    }
    // Floating pictures anchored in this paragraph.
    for (const a of b.anchored) {
      if (!a.img) continue;
      const img = a.img;
      const baseX = a.relH === "page" ? 0 : a.relH === "margin" || a.relH === "column" ? this.sec.left : this.sec.left;
      const paraTop = this.y - paraHeight(b);
      const baseY = a.relV === "page" ? 0 : a.relV === "margin" ? this.sec.top : paraTop;
      const X = baseX + a.x;
      const Y = baseY + a.y;
      this.page.ops.push((p) => p.page.drawImage(img, { x: X, y: p.page.getHeight() - Y - a.h, width: a.w, height: a.h }));
    }
    this.prevAfter = b.after;
    this.prevStyle = b.ppr.styleId;
    this.prevContextual = b.ppr.contextual;
    if (b.hardBreakAfter) this.newPage();
  }

  placeTable(t: TableBlock) {
    this.y += this.atTop ? 0 : this.prevAfter;
    const headers = t.rows.filter((r, i) => r.header && t.rows.slice(0, i).every((x) => x.header));
    const rows = [...t.rows];
    const x0 = this.sec.left + t.x;
    let ri = 0;
    while (ri < rows.length) {
      const row = rows[ri];
      const avail = this.bottom - this.y;
      if (row.height > avail + 0.01) {
        // Word lets a row break across pages unless told not to: the lines
        // that fit stay here and the rest continue on the next page.
        const split = !row.cantSplit && !row.exactHeight ? splitRow(row, avail) : null;
        if (split) {
          this.drawRow(t, split[0], x0);
          rows[ri] = split[1];
          this.newPage();
          for (const hr of headers) if (hr !== row) this.drawRow(t, hr, x0);
          continue;
        }
        if (!this.atTop) {
          this.newPage();
          if (ri > 0) for (const hr of headers) this.drawRow(t, hr, x0);
          continue;
        }
      }
      this.drawRow(t, row, x0);
      ri++;
    }
    this.y += t.borderBottom;
    this.prevAfter = 0;
    this.prevStyle = null;
    this.atTop = false;
  }

  private drawRow(t: TableBlock, row: Row, x0: number) {
    const top = this.y;
    let x = x0;
    const rowIndex = t.rows.indexOf(row);
    for (const cell of row.cells) {
      const cx = x;
      // A vertically merged cell's content and fill span its merged rows.
      let h = row.height;
      if (cell.vMerge === "restart" && rowIndex >= 0) {
        const colIdx = row.cells.indexOf(cell);
        for (let k = rowIndex + 1; k < t.rows.length; k++) {
          const below = t.rows[k].cells[colIdx];
          if (below?.vMerge === "continue") h += t.rows[k].height;
          else break;
        }
      }
      if (cell.shade && cell.vMerge !== "continue") {
        const shade = cell.shade;
        this.page.ops.push((p) => p.rect(cx, top, cell.width, h, shade));
      }
      const bd = cell.borders;
      if (bd.top && cell.vMerge !== "continue") this.page.ops.push((p) => p.hline(cx, cx + cell.width, top + bd.top!.width / 2, bd.top!));
      if (bd.bottom) this.page.ops.push((p) => p.hline(cx, cx + cell.width, top + row.height + bd.bottom!.width / 2, bd.bottom!));
      if (bd.left) this.page.ops.push((p) => p.vline(cx, top, top + row.height, bd.left!));
      if (bd.right) this.page.ops.push((p) => p.vline(cx + cell.width, top, top + row.height, bd.right!));
      if (cell.vMerge !== "continue") {
        const contentH = blocksHeight(cell.blocks);
        const inner = top + row.borderTop + cell.mar.t;
        const room = h - row.borderTop - cell.mar.t - cell.mar.b;
        let cy = inner;
        if (cell.vAlign === "center") cy = inner + (room - contentH) / 2;
        else if (cell.vAlign === "bottom") cy = inner + room - contentH;
        this.drawBlocksAt(cell.blocks, cx + cell.mar.l + cell.inset, cy, cell.width - cell.mar.l - cell.mar.r - cell.inset);
      }
      x += cell.width;
    }
    this.y += row.height;
    this.atTop = false;
  }

  // Draw operations for blocks at a fixed place (headers and footers).
  staticOps(sec: Section, blocks: Block[], ox: number, oy: number, width: number): Op[] {
    const saved = { pages: this.pages, y: this.y, sec: this.sec, atTop: this.atTop };
    this.sec = sec;
    this.pages = [{ section: sec, ops: [] }];
    this.drawBlocksAt(blocks, ox, oy, width);
    const ops = this.pages[0].ops;
    this.pages = saved.pages;
    this.y = saved.y;
    this.sec = saved.sec;
    this.atTop = saved.atTop;
    return ops;
  }

  // Draws some lines of a paragraph with its shading and borders, starting at
  // `top`; returns where the next content starts.
  private decorate(b: ParaBlock, ox: number, width: number, top: number, lines: Line[], first: boolean, last: boolean): number {
    const ppr = b.ppr;
    const bd = ppr.borders;
    const x1 = ox + ppr.left;
    const x2 = ox + width - ppr.right;
    const bTop = first ? b.bTop : undefined;
    const bBottom = last ? b.bBottom : undefined;
    const textTop = top + (bTop ? bTop.space + bTop.width : 0);
    const textBottom = textTop + lines.reduce((s, l) => s + l.height, 0);
    const ops = this.page.ops;
    if (ppr.shade) {
      const shade = ppr.shade;
      ops.push((p) => p.rect(x1, textTop, x2 - x1, textBottom - textTop, shade));
    }
    const left = x1 - borderReach(bd.left);
    const right = x2 + borderReach(bd.right);
    if (bTop) ops.push((p) => p.hline(left, right, top + bTop.width / 2, bTop));
    const boxBottom = bBottom ? textBottom + bBottom.space : textBottom;
    if (bBottom) ops.push((p) => p.hline(left, right, boxBottom + bBottom.width / 2, bBottom));
    const vTop = bTop ? top + bTop.width : textTop;
    if (bd.left) {
      const s = bd.left;
      ops.push((p) => p.vline(left + s.width / 2, vTop, boxBottom, s));
    }
    if (bd.right) {
      const s = bd.right;
      ops.push((p) => p.vline(right - s.width / 2, vTop, boxBottom, s));
    }
    let y = textTop;
    for (const line of lines) {
      const lt = y;
      ops.push((p) => p.line(line, ox, lt, width, ppr));
      y += line.height;
    }
    return bBottom ? boxBottom + bBottom.width : textBottom;
  }

  // Draws blocks inside a table cell (no pagination inside cells).
  private drawBlocksAt(blocks: Block[], ox: number, oy: number, width: number) {
    let y = oy;
    let prevAfter = 0;
    blocks.forEach((b, i) => {
      if (b.kind === "para") {
        y += i === 0 ? b.before : Math.max(prevAfter, b.before);
        y = this.decorate(b, ox, width, y, b.lines, true, true);
        prevAfter = b.after;
      } else {
        const saveY = this.y;
        this.y = y + prevAfter;
        for (const row of b.rows) this.drawRow(b, row, ox + b.x);
        y = this.y;
        this.y = saveY;
        prevAfter = 0;
      }
    });
  }
}

// ─── Document ───────────────────────────────────────────────────────────────

async function readTheme(pkg: Package, docRels: Map<string, Rel>): Promise<Theme> {
  const rel = [...docRels.values()].find((r) => r.type === "theme");
  const doc = rel ? await pkg.xml(rel.target) : null;
  const el = doc?.documentElement;
  const colors: Record<string, string> = {};
  const scheme = descendants(el, "clrScheme")[0];
  for (const c of Array.from(scheme?.children || [])) {
    colors[c.localName] = attr(kid(c, "srgbClr"), "val") || attr(kid(c, "sysClr"), "lastClr") || "000000";
  }
  const font = (which: string) => attr(kid(descendants(el, which)[0], "latin"), "typeface");
  return { major: font("majorFont") || "Calibri Light", minor: font("minorFont") || "Calibri", colors };
}

function readSection(sectPr: El | null, rels: Map<string, Rel>, blocks: El[], startsOnNewPage: boolean): Section {
  const pgSz = kid(sectPr, "pgSz");
  const pgMar = kid(sectPr, "pgMar");
  let width = twip(num(pgSz, "w:w", 12240));
  let height = twip(num(pgSz, "w:h", 15840));
  if (attr(pgSz, "w:orient") === "landscape" && width < height) [width, height] = [height, width];
  const headers: Record<string, string> = {};
  const footers: Record<string, string> = {};
  for (const r of kids(sectPr, "headerReference")) {
    const t = rels.get(attr(r, "r:id") || "")?.target;
    if (t) headers[attr(r, "w:type") || "default"] = t;
  }
  for (const r of kids(sectPr, "footerReference")) {
    const t = rels.get(attr(r, "r:id") || "")?.target;
    if (t) footers[attr(r, "w:type") || "default"] = t;
  }
  return {
    width,
    height,
    top: Math.abs(twip(num(pgMar, "w:top", 1440))),
    bottom: Math.abs(twip(num(pgMar, "w:bottom", 1440))),
    left: twip(num(pgMar, "w:left", 1440)) + twip(num(pgMar, "w:gutter", 0)),
    right: twip(num(pgMar, "w:right", 1440)),
    headerDist: twip(num(pgMar, "w:header", 720)),
    footerDist: twip(num(pgMar, "w:footer", 720)),
    headers,
    footers,
    titlePg: !!kid(sectPr, "titlePg") && on(kid(sectPr, "titlePg")) !== false,
    blocks,
    startsOnNewPage,
  };
}

export async function docxToPdf(bytes: ArrayBuffer, onProgress: Progress): Promise<{ pdf: Uint8Array; pages: number; notes: string[] }> {
  onProgress(5, "Opening your document...");
  const JSZip = await getJSZip();
  const zip = await JSZip.loadAsync(bytes);
  const pkg = new Package(zip);
  const ct = await pkg.xml("[Content_Types].xml");
  const main = ct
    ? Array.from(ct.getElementsByTagName("Override")).find((o) => /wordprocessingml\.document\.main|macroEnabled\.main|template\.main/.test(o.getAttribute("ContentType") || ""))?.getAttribute("PartName")?.replace(/^\//, "")
    : null;
  const docPath = main || "word/document.xml";
  const document = await pkg.xml(docPath);
  if (!document) throw new Error("NOT_DOCX");
  const docRels = await pkg.rels(docPath);
  const byType = (t: string) => [...docRels.values()].find((r) => r.type === t)?.target;
  const styles = new Styles(byType("styles") ? await pkg.xml(byType("styles")!) : null);
  const numbering = new Numbering(byType("numbering") ? await pkg.xml(byType("numbering")!) : null);
  const settings = byType("settings") ? await pkg.xml(byType("settings")!) : null;
  const theme = await readTheme(pkg, docRels);

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(await getFontkit());
  pdf.setCreator("FoldPDF");
  pdf.setProducer("FoldPDF");
  const fonts = new PdfFontSet(pdf);
  const engine = new Engine(pkg, pdf, fonts, styles, numbering, theme);
  engine.defaultTab = twip(num(kid(settings?.documentElement, "defaultTabStop"), "w:val", 720)) || 36;
  const compat = descendants(settings?.documentElement, "compatSetting").find((c) => attr(c, "w:name") === "compatibilityMode");
  engine.compatMode = compat ? num(compat, "w:val", 15) : 12;
  const evenOdd = !!kid(settings?.documentElement, "evenAndOddHeaders");

  // Split the body into sections (a paragraph's sectPr ends a section).
  const body = kid(document.documentElement, "body");
  const sections: Section[] = [];
  let pending: El[] = [];
  const flatten = (el: El): El[] => (el.localName === "sdt" ? Array.from(kid(el, "sdtContent")?.children || []).flatMap(flatten) : [el]);
  for (const child of Array.from(body?.children || []).flatMap(flatten)) {
    if (child.localName === "sectPr") continue;
    pending.push(child);
    const sp = child.localName === "p" ? path(child, "pPr", "sectPr") : null;
    if (sp) {
      sections.push(readSection(sp, docRels, pending, attr(kid(sp, "type"), "w:val") !== "continuous"));
      pending = [];
    }
  }
  const lastSp = kid(body, "sectPr");
  sections.push(readSection(lastSp, docRels, pending, attr(kid(lastSp, "type"), "w:val") !== "continuous"));
  sections[0].startsOnNewPage = true;

  const ctx: Ctx = { part: docPath, rels: docRels };
  const pager = new Paginator(engine);
  let done = 0;
  const totalBlocks = sections.reduce((s, x) => s + x.blocks.length, 0) || 1;
  for (const sec of sections) {
    pager.startSection(sec);
    const width = sec.width - sec.left - sec.right;
    const laid: Block[] = [];
    for (const el of sec.blocks) {
      if (el.localName === "p") laid.push(await engine.layoutParagraph(el, width, ctx, null));
      else if (el.localName === "tbl") laid.push(await engine.layoutTable(el, width, ctx));
      done++;
      if (done % 20 === 0) onProgress(10 + Math.round((done / totalBlocks) * 60), "Laying out your document...");
    }
    groupBorders(laid);
    for (let i = 0; i < laid.length; i++) {
      const b = laid[i];
      if (b.kind === "para") pager.placePara(b, laid.slice(i + 1, i + 30));
      else pager.placeTable(b);
    }
  }

  // Paint, now that the page count is known (for "Page X of Y").
  const pageCount = pager.pages.length;
  const hfCache = new Map<string, { doc: Document; rels: Map<string, Rel> }>();
  for (let i = 0; i < pageCount; i++) {
    onProgress(72 + Math.round((i / pageCount) * 22), `Drawing page ${i + 1} of ${pageCount}...`);
    const out = pager.pages[i];
    const sec = out.section;
    const page = pdf.addPage([sec.width, sec.height]);
    const painter = new Painter(fonts, page, i + 1, pageCount);
    const firstOfSection = i === 0 || pager.pages[i - 1].section !== sec;
    const kind = firstOfSection && sec.titlePg ? "first" : evenOdd && (i + 1) % 2 === 0 ? "even" : "default";
    for (const [map, isHeader] of [[sec.headers, true], [sec.footers, false]] as const) {
      const partPath = map[kind] ?? (kind === "first" && sec.titlePg ? undefined : map.default);
      if (!partPath) continue;
      if (!hfCache.has(partPath)) {
        const d = await pkg.xml(partPath);
        if (d) hfCache.set(partPath, { doc: d, rels: await pkg.rels(partPath) });
      }
      const hf = hfCache.get(partPath);
      if (!hf) continue;
      const width = sec.width - sec.left - sec.right;
      const hctx: Ctx = { part: partPath, rels: hf.rels };
      const blocks: Block[] = [];
      for (const el of Array.from(hf.doc.documentElement.children)) {
        if (el.localName === "p") blocks.push(await engine.layoutParagraph(el, width, hctx, null));
        else if (el.localName === "tbl") blocks.push(await engine.layoutTable(el, width, hctx));
      }
      groupBorders(blocks);
      const h = blocksHeight(blocks);
      const top = isHeader ? sec.headerDist : sec.height - sec.footerDist - h;
      for (const op of pager.staticOps(sec, blocks, sec.left, top, width)) op(painter);
    }
    for (const op of out.ops) op(painter);
  }

  onProgress(96, "Saving your PDF...");
  const pdfBytes = await pdf.save({ useObjectStreams: true });
  return { pdf: pdfBytes, pages: pageCount, notes: [...engine.notes] };
}
