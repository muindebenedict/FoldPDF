// PDF → Excel (.xlsx), entirely in the browser.
//
// Each page becomes a sheet. Tables drawn with ruling lines are rebuilt cell
// by cell from those lines (merged cells where a line is missing, borders and
// cell shading kept); text without lines is split into columns where the
// gaps between words line up from row to row. Numbers, percentages and
// negative amounts in brackets become real numbers, so they can be summed.

import { getPdfJs } from "../../components/tools/PdfScriptLoader";
import { mapFont } from "../pdf/pageModel";

type Progress = (pct: number, msg: string) => void;

interface Seg {
  text: string;
  x: number; // left, points
  x2: number; // right
  baseline: number; // from the page top
  size: number;
  family: string;
  bold: boolean;
  italic: boolean;
}

interface HLine {
  y: number;
  x1: number;
  x2: number;
}

interface VLine {
  x: number;
  y1: number;
  y2: number;
}

interface Fill {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

interface TableGrid {
  xs: number[]; // column boundaries
  ys: number[]; // row boundaries
  h: HLine[];
  v: VLine[];
}

// ─── Reading a page ─────────────────────────────────────────────────────────

interface Glyph {
  ch: string;
  x: number;
  x2: number;
  baseline: number;
  size: number;
  font: any;
  space: boolean;
}

function fontOf(page: any, name: string): any {
  try {
    return page.commonObjs.get(name);
  } catch {
    return null;
  }
}

type M6 = number[];
const mul = (a: M6, b: M6): M6 => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];

// Every character drawn on the page with its position, from the text
// operators (pdf.js text items join neighbouring cells into one string).
function textGlyphs(ops: any, O: any, page: any, view: number[], H: number): Glyph[] {
  const out: Glyph[] = [];
  let ctm: M6 = [1, 0, 0, 1, 0, 0];
  const stack: M6[] = [];
  let tm: M6 = [1, 0, 0, 1, 0, 0];
  let tlm: M6 = [1, 0, 0, 1, 0, 0];
  let font: any = null;
  let fontSize = 0;
  let charSpacing = 0;
  let wordSpacing = 0;
  let hScale = 1;
  let rise = 0;
  let leading = 0;
  const moveText = (tx: number, ty: number) => {
    tlm = mul([1, 0, 0, 1, tx, ty], tlm);
    tm = tlm.slice();
  };
  for (let k = 0; k < ops.fnArray.length; k++) {
    const fn = ops.fnArray[k];
    const a = ops.argsArray[k];
    switch (fn) {
      case O.save:
        stack.push(ctm.slice());
        break;
      case O.restore:
        ctm = stack.pop() || ctm;
        break;
      case O.transform:
        ctm = mul(a as M6, ctm);
        break;
      case O.beginText:
        tm = [1, 0, 0, 1, 0, 0];
        tlm = [1, 0, 0, 1, 0, 0];
        break;
      case O.setFont:
        font = fontOf(page, a[0]);
        fontSize = a[1];
        break;
      case O.setTextMatrix:
        tm = (Array.isArray(a[0]) ? a[0] : a).slice(0, 6);
        tlm = tm.slice();
        break;
      case O.moveText:
        moveText(a[0], a[1]);
        break;
      case O.setLeadingMoveText:
        leading = -a[1];
        moveText(a[0], a[1]);
        break;
      case O.nextLine:
        moveText(0, -leading);
        break;
      case O.setLeading:
        leading = a[0];
        break;
      case O.setCharSpacing:
        charSpacing = a[0];
        break;
      case O.setWordSpacing:
        wordSpacing = a[0];
        break;
      case O.setHScale:
        hScale = a[0] / 100;
        break;
      case O.setTextRise:
        rise = a[0];
        break;
      case O.showText:
      case O.showSpacedText: {
        const items = a[0];
        if (!font || !Array.isArray(items)) break;
        const fm = font.fontMatrix?.[0] ?? 0.001;
        const vertical = !!font.vertical;
        let tx = 0;
        for (const g of items) {
          if (typeof g === "number") {
            tx -= (g / 1000) * fontSize * hScale;
            continue;
          }
          if (!g) continue;
          const w = (g.width || 0) * fontSize * fm;
          const adv = (w + charSpacing + (g.isSpace ? wordSpacing : 0)) * hScale;
          if (!vertical) {
            const m = mul(tm, ctm);
            // Upright text only.
            if (Math.abs(m[1]) < 0.01 && Math.abs(m[2]) < 0.01 && m[0] > 0) {
              const x = m[0] * tx + m[4];
              const y = m[3] * rise + m[5];
              const size = fontSize * Math.abs(m[3]);
              const ch = g.unicode ?? "";
              if (ch) out.push({ ch, x: x - view[0], x2: x - view[0] + w * hScale * m[0], baseline: H - (y - view[1]), size, font, space: !!g.isSpace || ch === " " });
            }
          }
          tx += adv;
        }
        tm = mul([1, 0, 0, 1, tx, 0], tm);
        break;
      }
    }
  }
  return out;
}

// Characters into runs of text: a gap with no space character between
// letters (a new cell), or a very wide one, starts a new run.
function glyphSegments(glyphs: Glyph[]): Seg[] {
  const lines: Glyph[][] = [];
  for (const g of [...glyphs].sort((p, q) => p.baseline - q.baseline)) {
    const line = lines.find((l) => Math.abs(l[0].baseline - g.baseline) <= Math.min(l[0].size, g.size) * 0.3);
    if (line) line.push(g);
    else lines.push([g]);
  }
  const segs: Seg[] = [];
  for (const line of lines) {
    line.sort((p, q) => p.x - q.x);
    let cur: Seg | null = null;
    let inkEnd = 0;
    let spaced = false;
    for (const g of line) {
      if (g.space) {
        spaced = true;
        continue;
      }
      const gap = g.x - inkEnd;
      const em = Math.max(g.size, cur?.size ?? 0);
      const split = !cur || gap > (spaced ? 1.0 : 0.2) * em || gap < -em;
      if (split) {
        if (cur) segs.push(cur);
        const mapped = mapFont(g.font?.name || "", { bold: g.font?.bold, italic: g.font?.italic });
        cur = { text: g.ch, x: g.x, x2: g.x2, baseline: g.baseline, size: g.size, family: mapped.family, bold: mapped.bold, italic: mapped.italic };
      } else {
        cur!.text += (spaced || gap > 0.15 * em ? " " : "") + g.ch;
        cur!.x2 = Math.max(cur!.x2, g.x2);
        const mapped = mapFont(g.font?.name || "", { bold: g.font?.bold, italic: g.font?.italic });
        cur!.bold = cur!.bold && mapped.bold;
      }
      inkEnd = Math.max(inkEnd, g.x2);
      spaced = false;
    }
    if (cur) segs.push(cur);
  }
  return segs.map((sg) => ({ ...sg, text: sg.text.replace(/\s+/g, " ").trim() })).filter((sg) => sg.text);
}

async function readPage(page: any, pdfjs: any) {
  const view = page.view;
  const H = view[3] - view[1];
  const ops = await page.getOperatorList();
  const content = await page.getTextContent();
  const segs: Seg[] = [];
  const O = pdfjs.OPS;
  const glyphs = textGlyphs(ops, O, page, view, H);
  if (glyphs.length) segs.push(...glyphSegments(glyphs));
  else {
    // Fallback: pdf.js text items (positions of words inside an item are
    // estimated).
    for (const item of content.items as any[]) {
      if (!item.str || !item.str.trim()) continue;
      const [a, b, c, d, e, f] = item.transform;
      if (Math.abs(b) > 0.01 || Math.abs(c) > 0.01 || a <= 0) continue;
      const size = Math.hypot(c, d) || 10;
      const font = fontOf(page, item.fontName);
      const mapped = mapFont(font?.name || content.styles?.[item.fontName]?.fontFamily || "", { bold: font?.bold, italic: font?.italic });
      segs.push({ text: item.str.trim(), x: e - view[0], x2: e - view[0] + item.width, baseline: H - (f - view[1]), size, family: mapped.family, bold: mapped.bold, italic: mapped.italic });
    }
  }

  // Lines and filled boxes.
  const hs: HLine[] = [];
  const vs: VLine[] = [];
  const fills: Fill[] = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  let fillColor = "000000";
  const hex = (r: number, g: number, b: number) => [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
  const pt = (x: number, y: number) => [ctm[0] * x + ctm[2] * y + ctm[4] - view[0], H - (ctm[1] * x + ctm[3] * y + ctm[5] - view[1])];
  let pending: { rects: number[][]; segs: number[][] } | null = null;
  const flush = (paint: "fill" | "stroke" | "both") => {
    if (!pending) return;
    for (const [x1, y1, x2, y2] of pending.rects) {
      const w = x2 - x1;
      const h = y2 - y1;
      if (h <= 2.5 && w > 2) hs.push({ y: (y1 + y2) / 2, x1, x2 });
      else if (w <= 2.5 && h > 2) vs.push({ x: (x1 + x2) / 2, y1, y2 });
      else if (w > 2 && h > 2) {
        if (paint !== "fill") {
          hs.push({ y: y1, x1, x2 }, { y: y2, x1, x2 });
          vs.push({ x: x1, y1, y2 }, { x: x2, y1, y2 });
        }
        if (paint !== "stroke" && fillColor !== "FFFFFF") fills.push({ x1, y1, x2, y2, color: fillColor });
      }
    }
    if (paint !== "fill") {
      for (const [x1, y1, x2, y2] of pending.segs) {
        if (Math.abs(y1 - y2) < 1 && Math.abs(x2 - x1) > 2) hs.push({ y: (y1 + y2) / 2, x1: Math.min(x1, x2), x2: Math.max(x1, x2) });
        else if (Math.abs(x1 - x2) < 1 && Math.abs(y2 - y1) > 2) vs.push({ x: (x1 + x2) / 2, y1: Math.min(y1, y2), y2: Math.max(y1, y2) });
      }
    }
    pending = null;
  };
  for (let k = 0; k < ops.fnArray.length; k++) {
    const fn = ops.fnArray[k];
    const args = ops.argsArray[k];
    if (fn === O.save) stack.push(ctm.slice());
    else if (fn === O.restore) ctm = stack.pop() || ctm;
    else if (fn === O.transform) {
      const [a1, b1, c1, d1, e1, f1] = args;
      const [A, B, C, D, E, F] = ctm;
      ctm = [A * a1 + C * b1, B * a1 + D * b1, A * c1 + C * d1, B * c1 + D * d1, A * e1 + C * f1 + E, B * e1 + D * f1 + F];
    } else if (fn === O.setFillRGBColor) fillColor = typeof args[0] === "string" ? args[0].replace("#", "").toUpperCase() : hex(args[0], args[1], args[2]);
    else if (fn === O.setFillGray) fillColor = hex(args[0] * 255, args[0] * 255, args[0] * 255);
    else if (fn === O.constructPath) {
      const [opList, coords] = args;
      pending = pending || { rects: [], segs: [] };
      let ci = 0;
      let cur: number[] | null = null;
      for (const op of opList) {
        if (op === O.rectangle) {
          const [x, y, w, h] = coords.slice(ci, ci + 4);
          ci += 4;
          const [X1, Y1] = pt(x, y);
          const [X2, Y2] = pt(x + w, y + h);
          pending.rects.push([Math.min(X1, X2), Math.min(Y1, Y2), Math.max(X1, X2), Math.max(Y1, Y2)]);
        } else if (op === O.moveTo) {
          cur = pt(coords[ci], coords[ci + 1]);
          ci += 2;
        } else if (op === O.lineTo) {
          const p2 = pt(coords[ci], coords[ci + 1]);
          ci += 2;
          if (cur) pending.segs.push([cur[0], cur[1], p2[0], p2[1]]);
          cur = p2;
        } else if (op === O.curveTo) ci += 6;
        else if (op === O.curveTo2 || op === O.curveTo3) ci += 4;
      }
    } else if (fn === O.fill || fn === O.eoFill) flush("fill");
    else if (fn === O.stroke || fn === O.closeStroke) flush("stroke");
    else if (fn === O.fillStroke || fn === O.eoFillStroke || fn === O.closeFillStroke || fn === O.closeEOFillStroke) flush("both");
    else if (fn === O.endPath) pending = null;
  }
  return { segs, hs, vs, fills, width: view[2] - view[0], height: H };
}

// ─── Tables from ruling lines ───────────────────────────────────────────────

function cluster(values: number[], tol: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[][] = [];
  for (const v of sorted) {
    const last = out[out.length - 1];
    if (last && v - last[last.length - 1] <= tol) last.push(v);
    else out.push([v]);
  }
  return out.map((g) => g.reduce((s, v) => s + v, 0) / g.length);
}

// Joins pieces of one line (Word draws a border row by row).
function mergeH(hs: HLine[]): HLine[] {
  const out: HLine[] = [];
  for (const h of [...hs].sort((a, b) => a.y - b.y || a.x1 - b.x1)) {
    const last = out.find((o) => Math.abs(o.y - h.y) <= 1 && h.x1 <= o.x2 + 1.5 && h.x2 >= o.x1 - 1.5);
    if (last) {
      last.x1 = Math.min(last.x1, h.x1);
      last.x2 = Math.max(last.x2, h.x2);
    } else out.push({ ...h });
  }
  return out;
}

function mergeV(vs: VLine[]): VLine[] {
  const out: VLine[] = [];
  for (const v of [...vs].sort((a, b) => a.x - b.x || a.y1 - b.y1)) {
    const last = out.find((o) => Math.abs(o.x - v.x) <= 1 && v.y1 <= o.y2 + 1.5 && v.y2 >= o.y1 - 1.5);
    if (last) {
      last.y1 = Math.min(last.y1, v.y1);
      last.y2 = Math.max(last.y2, v.y2);
    } else out.push({ ...v });
  }
  return out;
}

function findGrids(hs: HLine[], vs: VLine[]): TableGrid[] {
  const tol = 1.5;
  const H = mergeH(hs).filter((h) => h.x2 - h.x1 >= 6);
  const V = mergeV(vs).filter((v) => v.y2 - v.y1 >= 6);
  // Union-find over lines that touch.
  const parent = new Map<object, object>();
  const find = (a: object): object => {
    let p = parent.get(a) ?? a;
    if (p !== a) {
      p = find(p);
      parent.set(a, p);
    }
    return p;
  };
  const join = (a: object, b: object) => parent.set(find(a), find(b));
  for (const h of H) parent.set(h, h);
  for (const v of V) parent.set(v, v);
  for (const h of H) for (const v of V) if (v.x >= h.x1 - tol && v.x <= h.x2 + tol && h.y >= v.y1 - tol && h.y <= v.y2 + tol) join(h, v);
  const groups = new Map<object, { h: HLine[]; v: VLine[] }>();
  for (const h of H) {
    const r = find(h);
    if (!groups.has(r)) groups.set(r, { h: [], v: [] });
    groups.get(r)!.h.push(h);
  }
  for (const v of V) {
    const r = find(v);
    if (!groups.has(r)) groups.set(r, { h: [], v: [] });
    groups.get(r)!.v.push(v);
  }
  const grids: TableGrid[] = [];
  for (const g of groups.values()) {
    const xs = cluster(g.v.map((v) => v.x), 2);
    const ys = cluster(g.h.map((h) => h.y), 2);
    if (xs.length >= 2 && ys.length >= 2) grids.push({ xs, ys, h: g.h, v: g.v });
  }
  // A table ruled only by horizontal lines (common in reports): use the
  // lines as row boundaries and find the columns from the text.
  return grids;
}

// Is there a ruling line along x from y1 to y2 (checked at the middle)?
const hasV = (g: TableGrid, x: number, y: number) => g.v.some((v) => Math.abs(v.x - x) <= 2 && y >= v.y1 - 1 && y <= v.y2 + 1);
const hasH = (g: TableGrid, y: number, x: number) => g.h.some((h) => Math.abs(h.y - y) <= 2 && x >= h.x1 - 1 && x <= h.x2 + 1);

// ─── Columns from text alignment ────────────────────────────────────────────

// Column boundaries for rows of text: x positions no text crosses in most
// rows that have several pieces of text.
function textColumns(rows: Seg[][], pageWidth: number): number[] {
  const multi = rows.filter((r) => r.length >= 2);
  if (multi.length < 2) return [];
  const bins = Math.ceil(pageWidth);
  const cover = new Array(bins + 1).fill(0);
  for (const r of multi) {
    const seen = new Uint8Array(bins + 1);
    for (const s of r) for (let x = Math.max(0, Math.round(s.x)); x < Math.min(bins, Math.round(s.x2)); x++) seen[x] = 1;
    for (let x = 0; x <= bins; x++) cover[x] += seen[x];
  }
  const minX = Math.floor(Math.min(...multi.flat().map((s) => s.x)));
  const maxX = Math.ceil(Math.max(...multi.flat().map((s) => s.x2)));
  const limit = Math.max(0, Math.floor(multi.length * 0.1));
  const bounds: number[] = [];
  let start = -1;
  for (let x = minX; x <= maxX; x++) {
    const free = cover[x] <= limit;
    if (free && start < 0) start = x;
    if ((!free || x === maxX) && start >= 0) {
      if (x - start >= 2) bounds.push((start + x) / 2);
      start = -1;
    }
  }
  return bounds;
}

// ─── Values ─────────────────────────────────────────────────────────────────

function parseValue(text: string): { value: string | number; fmt?: string } {
  const t = text.trim();
  const neg = /^\(.*\)$/.test(t);
  let s = neg ? t.slice(1, -1) : t;
  const pct = s.endsWith("%");
  if (pct) s = s.slice(0, -1);
  // A currency symbol or code in front (KES 950.50, $12, Ksh 1,000).
  const cur = /^(?:[$€£¥₦]|(?:KES|USD|EUR|GBP|UGX|TZS|RWF|ZAR|NGN|GHS|ETB|INR|JPY|CNY|CAD|AUD|CHF|AED|SAR|EGP)\b|K[Ss]hs?\b)\.?\s?/.exec(s);
  const currency = cur ? cur[0] : "";
  if (currency) s = s.slice(currency.length).trim();
  // Leading zeros (phone numbers, codes) stay as text.
  if (/^0\d/.test(s)) return { value: t };
  const plain = /^[-−]?\d+(\.\d+)?$/.test(s);
  const grouped = /^[-−]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s);
  if (!plain && !grouped) return { value: t };
  let n = Number(s.replace(/,/g, "").replace("−", "-"));
  if (!Number.isFinite(n) || s.replace(/\D/g, "").length > 15) return { value: t };
  if (neg) n = -n;
  const decimals = (s.split(".")[1] || "").length;
  const dec = decimals ? "." + "0".repeat(decimals) : "";
  if (pct) return { value: Number((n / 100).toPrecision(12)), fmt: `0${dec}%` };
  const base = grouped ? `#,##0${dec}` : decimals ? `0${dec}` : "0";
  const prefix = currency ? `"${currency.replace(/"/g, "")}"` : "";
  if (neg || currency) return { value: n, fmt: `${prefix}${base};${prefix}(${base})` };
  return { value: n, fmt: grouped || decimals ? base : undefined };
}

// ─── Workbook ───────────────────────────────────────────────────────────────

interface OutCell {
  text: string;
  seg: Seg;
  wrap: boolean;
}

export async function pdfToXlsx(bytes: ArrayBuffer, onProgress: Progress): Promise<{ blob: Blob; pages: number; tables: number; empty: number }> {
  onProgress(3, "Opening your PDF...");
  const pdfjs = await getPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
  const ExcelJS: any = (await import("exceljs")).default ?? (await import("exceljs"));
  const wb = new ExcelJS.Workbook();
  wb.creator = "FoldPDF";
  let tables = 0;
  let empty = 0;

  for (let p = 1; p <= doc.numPages; p++) {
    onProgress(5 + Math.round(((p - 1) / doc.numPages) * 88), `Reading page ${p} of ${doc.numPages}...`);
    const page = await doc.getPage(p);
    const { segs, hs, vs, fills, width } = await readPage(page, pdfjs);
    const ws = wb.addWorksheet(`Page ${p}`, { views: [{ showGridLines: true }] });
    if (!segs.length) {
      empty++;
      continue;
    }

    // Tables from ruling lines claim the text inside them.
    const grids = findGrids(hs, vs).filter((g) => segs.some((s) => inGrid(g, s)));
    tables += grids.length;
    const loose = segs.filter((s) => !grids.some((g) => inGrid(g, s)));

    // Rows of loose text, by baseline.
    const rows: Seg[][] = [];
    for (const s of loose) {
      const row = rows.find((r) => Math.abs(r[0].baseline - s.baseline) <= Math.min(r[0].size, s.size) * 0.35);
      if (row) row.push(s);
      else rows.push([s]);
    }
    rows.forEach((r) => r.sort((a, b) => a.x - b.x));

    // Page columns: the tables' own boundaries plus those found in the text.
    const textBounds = textColumns(rows, width);
    const left = Math.min(...segs.map((s) => s.x), ...grids.map((g) => g.xs[0]));
    const all = cluster([left, ...textBounds, ...grids.flatMap((g) => g.xs.slice(0, -1))], 3);
    const colOf = (x: number) => {
      let c = 0;
      for (let i = 0; i < all.length; i++) if (all[i] <= x + 2) c = i;
      return c;
    };

    // Elements in reading order: text rows and tables, by their top.
    type Elem = { top: number; row?: Seg[]; grid?: TableGrid };
    const elems: Elem[] = [
      ...rows.map((r) => ({ top: Math.min(...r.map((s) => s.baseline - s.size)), row: r })),
      ...grids.map((g) => ({ top: g.ys[0], grid: g })),
    ].sort((a, b) => a.top - b.top);

    let r = 1;
    const widths = new Array(all.length).fill(0);
    const put = (row: number, col: number, cell: OutCell, extra: (c: any) => void = () => {}) => {
      const c = ws.getRow(row).getCell(col + 1);
      const v = cell.wrap ? { value: cell.text } : parseValue(cell.text);
      c.value = v.value;
      if (v.fmt) c.numFmt = v.fmt;
      const size = Math.round(Math.max(6, Math.min(48, cell.seg.size)) * 2) / 2;
      c.font = { name: cell.seg.family || "Calibri", size, bold: cell.seg.bold || undefined, italic: cell.seg.italic || undefined };
      c.alignment = { vertical: "top", wrapText: cell.wrap || undefined };
      extra(c);
    };

    for (const e of elems) {
      if (e.row) {
        const byCol = new Map<number, Seg>();
        for (const s of e.row) {
          const col = colOf(s.x);
          const prev = byCol.get(col);
          byCol.set(col, prev ? { ...prev, text: prev.text + " " + s.text, x2: s.x2, bold: prev.bold && s.bold } : s);
        }
        for (const [col, s] of byCol) {
          put(r, col, { text: s.text, seg: s, wrap: false });
          // Only measure widths where text sits between known boundaries.
          const next = all[col + 1];
          if (next != null) widths[col] = Math.max(widths[col], Math.min(s.x2, next) - all[col]);
          else widths[col] = Math.max(widths[col], s.x2 - all[col]);
        }
        r++;
        continue;
      }
      const g = e.grid!;
      const nr = g.ys.length - 1;
      const nc = g.xs.length - 1;
      const inside = segs.filter((s) => inGrid(g, s));
      // Cells joined where the line between them is missing.
      const id = (i: number, j: number) => i * nc + j;
      const parent = Array.from({ length: nr * nc }, (_, k) => k);
      const find = (k: number): number => (parent[k] === k ? k : (parent[k] = find(parent[k])));
      for (let i = 0; i < nr; i++) {
        const ym = (g.ys[i] + g.ys[i + 1]) / 2;
        for (let j = 0; j < nc; j++) {
          const xm = (g.xs[j] + g.xs[j + 1]) / 2;
          if (j + 1 < nc && !hasV(g, g.xs[j + 1], ym)) parent[find(id(i, j + 1))] = find(id(i, j));
          if (i + 1 < nr && !hasH(g, g.ys[i + 1], xm)) parent[find(id(i + 1, j))] = find(id(i, j));
        }
      }
      const areas = new Map<number, { i1: number; j1: number; i2: number; j2: number; n: number }>();
      for (let i = 0; i < nr; i++)
        for (let j = 0; j < nc; j++) {
          const k = find(id(i, j));
          const a = areas.get(k);
          if (!a) areas.set(k, { i1: i, j1: j, i2: i, j2: j, n: 1 });
          else {
            a.i1 = Math.min(a.i1, i);
            a.j1 = Math.min(a.j1, j);
            a.i2 = Math.max(a.i2, i);
            a.j2 = Math.max(a.j2, j);
            a.n++;
          }
        }
      const gcol = g.xs.map((x) => colOf(x));
      const thin = { style: "thin", color: { argb: "FF000000" } };
      for (const a of areas.values()) {
        const rect = a.n === (a.i2 - a.i1 + 1) * (a.j2 - a.j1 + 1) ? a : { ...a, i2: a.i1, j2: a.j1 };
        const x1 = g.xs[rect.j1];
        const x2 = g.xs[rect.j2 + 1];
        const y1 = g.ys[rect.i1];
        const y2 = g.ys[rect.i2 + 1];
        const mine = inside.filter((s) => {
          const cx = (s.x + s.x2) / 2;
          const cy = s.baseline - s.size * 0.3;
          return cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2;
        });
        mine.sort((p1, p2) => (Math.abs(p1.baseline - p2.baseline) > p1.size * 0.3 ? p1.baseline - p2.baseline : p1.x - p2.x));
        let text = "";
        let lastB = -1e9;
        for (const s of mine) {
          if (text) text += Math.abs(s.baseline - lastB) > s.size * 0.3 ? "\n" : " ";
          text += s.text;
          lastB = s.baseline;
        }
        const row1 = r + rect.i1;
        const row2 = r + rect.i2;
        const col1 = gcol[rect.j1];
        const col2 = Math.max(col1, gcol[rect.j2 + 1] - 1);
        const fill = fills.find((f) => f.x1 <= x1 + 2 && f.x2 >= x2 - 2 && f.y1 <= y1 + 2 && f.y2 >= y2 - 2);
        const seg = mine[0] || { text: "", x: x1, x2, baseline: y2, size: 11, family: "Calibri", bold: false, italic: false };
        put(row1, col1, { text, seg, wrap: text.includes("\n") }, (c) => {
          c.border = { top: thin, left: thin, bottom: thin, right: thin };
          if (fill) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + fill.color } };
        });
        // Borders on every cell of a merged area, so the outline shows.
        for (let rr = row1; rr <= row2; rr++)
          for (let cc = col1; cc <= col2; cc++) {
            const c = ws.getRow(rr).getCell(cc + 1);
            c.border = { top: thin, left: thin, bottom: thin, right: thin };
            if (fill) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + fill.color } };
          }
        if (row2 > row1 || col2 > col1) {
          try {
            ws.mergeCells(row1, col1 + 1, row2, col2 + 1);
          } catch {
            // overlapping merge: leave the cells separate
          }
        }
        // Column widths from the table's own columns.
        if (col1 === col2) widths[col1] = Math.max(widths[col1], x2 - x1);
      }
      r += nr;
    }

    // Column widths (points → Excel's character units for Calibri 11).
    for (let c = 0; c < all.length; c++) {
      const pts = Math.max(widths[c], c + 1 < all.length ? Math.min(all[c + 1] - all[c], 400) : widths[c]);
      ws.getColumn(c + 1).width = Math.max(2, Math.min(100, Math.round((((pts * 96) / 72 - 5) / 7) * 100) / 100 + 1));
    }
  }

  onProgress(95, "Saving your spreadsheet...");
  const buf = await wb.xlsx.writeBuffer();
  return { blob: new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), pages: doc.numPages, tables, empty };
}

function inGrid(g: TableGrid, s: Seg): boolean {
  const cx = (s.x + s.x2) / 2;
  const cy = s.baseline - s.size * 0.3;
  return cx >= g.xs[0] - 1 && cx <= g.xs[g.xs.length - 1] + 1 && cy >= g.ys[0] - 1 && cy <= g.ys[g.ys.length - 1] + 1;
}
