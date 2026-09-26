// Excel (.xlsx) → PDF, entirely in the browser.
//
// Reads the workbook's cells, styles, theme, merges and page setup, and lays
// the sheets out the way Excel prints them. Measured against Excel's own PDF
// export:
//   - column widths print at the default font's digit width at 600 dpi:
//     px = round((256·w + ⌊128/M⌋) / 256 · M), M = that digit width;
//   - rows print at their saved height; rows without one are sized from their
//     fonts as Excel does on screen (standard 96 dpi), wrapped text line by
//     line; heights and font sizes snap to 1/600 inch;
//   - text sits about 2 pt inside the cell; borders are 0.96 / 1.92 / 2.88 pt
//     (thin / medium / thick), centred on the gridline;
//   - pages break by whole rows and columns, down then over, with the print
//     area, print titles, scaling / fit to page, centring, gridlines, manual
//     breaks and headers / footers applied.
// Not covered: charts, shapes, conditional formatting and sparklines. They
// are listed in the result so the tool can say so.

import {
  clip,
  endPath,
  PDFDocument,
  PDFImage,
  PDFPage,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  setCharacterSqueeze,
  degrees,
} from "@cantoo/pdf-lib";
import { getFontkit, getJSZip, getXLSX } from "../../components/tools/PdfScriptLoader";
import { attr, descendants, kid, kids, num, Package, type El, type Rel } from "../office/ooxml";
import { encodable, PdfFontSet, type ResolvedFont } from "../fonts/pdfFonts";

type Progress = (pct: number, msg: string) => void;

const PX = 72 / 600; // one printer pixel, in points
const snap = (pt: number) => Math.round(pt / PX) * PX;
const EMU = 12700;

// ─── Styles ─────────────────────────────────────────────────────────────────

interface Font {
  name: string;
  size: number;
  bold: boolean;
  italic: boolean;
  underline: string | null; // single | double | singleAccounting | doubleAccounting
  strike: boolean;
  color: string | null;
  vertAlign: string | null;
}

interface Side {
  style: string;
  color: string;
}

interface Borders {
  left?: Side;
  right?: Side;
  top?: Side;
  bottom?: Side;
}

interface Align {
  h: string; // general | left | center | right | fill | justify | centerContinuous | distributed
  v: string; // bottom | top | center | justify | distributed
  wrap: boolean;
  indent: number;
  rotation: number;
  shrink: boolean;
}

interface Xf {
  numFmt: string;
  font: Font;
  fill: string | null;
  border: Borders;
  align: Align;
}

interface Theme {
  colors: string[]; // indexed as Excel's theme="n"
  minor: string;
  major: string;
}

const INDEXED = [
  "000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF",
  "000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF",
  "800000", "008000", "000080", "808000", "800080", "008080", "C0C0C0", "808080",
  "9999FF", "993366", "FFFFCC", "CCFFFF", "660066", "FF8080", "0066CC", "CCCCFF",
  "000080", "FF00FF", "FFFF00", "00FFFF", "800080", "800000", "008080", "0000FF",
  "00CCFF", "CCFFFF", "CCFFCC", "FFFF99", "99CCFF", "FF99CC", "CC99FF", "FFCC99",
  "3366FF", "33CCCC", "99CC00", "FFCC00", "FF9900", "FF6600", "666699", "969696",
  "003366", "339966", "003300", "333300", "993300", "993366", "333399", "333333",
];

function applyTint(hex: string, tint: number): string {
  if (!tint) return hex;
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let R = l;
  let G = l;
  let B = l;
  if (s) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    R = hue(p, q, h + 1 / 3);
    G = hue(p, q, h);
    B = hue(p, q, h - 1 / 3);
  }
  const x = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0");
  return (x(R) + x(G) + x(B)).toUpperCase();
}

class Styles {
  xfs: Xf[] = [];
  fonts: Font[] = [];
  normal: Font;
  private numFmts = new Map<number, string>();

  constructor(doc: Document | null, private theme: Theme, private indexed: string[]) {
    const root = doc?.documentElement;
    for (const f of kids(kid(root, "numFmts"), "numFmt")) this.numFmts.set(num(f, "numFmtId", 0), attr(f, "formatCode") || "General");
    this.fonts = kids(kid(root, "fonts"), "font").map((f) => this.font(f));
    if (!this.fonts.length) this.fonts.push({ name: theme.minor, size: 11, bold: false, italic: false, underline: null, strike: false, color: null, vertAlign: null });
    const fills = kids(kid(root, "fills"), "fill").map((f) => this.fill(f));
    const borders = kids(kid(root, "borders"), "border").map((b) => this.borders(b));
    const styleXfs = kids(kid(root, "cellStyleXfs"), "xf");
    this.normal = this.fonts[num(styleXfs[0], "fontId", 0)] || this.fonts[0];
    for (const x of kids(kid(root, "cellXfs"), "xf")) {
      const al = kid(x, "alignment");
      const id = num(x, "numFmtId", 0);
      this.xfs.push({
        numFmt: this.numFmts.get(id) ?? String(id),
        font: this.fonts[num(x, "fontId", 0)] || this.fonts[0],
        fill: fills[num(x, "fillId", 0)] ?? null,
        border: borders[num(x, "borderId", 0)] || {},
        align: {
          h: attr(al, "horizontal") || "general",
          v: attr(al, "vertical") || "bottom",
          wrap: attr(al, "wrapText") === "1" || attr(al, "wrapText") === "true",
          indent: num(al, "indent", 0),
          rotation: num(al, "textRotation", 0),
          shrink: attr(al, "shrinkToFit") === "1" || attr(al, "shrinkToFit") === "true",
        },
      });
    }
    if (!this.xfs.length) this.xfs.push({ numFmt: "0", font: this.fonts[0], fill: null, border: {}, align: { h: "general", v: "bottom", wrap: false, indent: 0, rotation: 0, shrink: false } });
  }

  color(el: El | null, auto: string | null): string | null {
    if (!el) return auto;
    if (attr(el, "auto") === "1") return auto;
    const rgbv = attr(el, "rgb");
    const tint = Number(attr(el, "tint") || 0);
    let hex: string | null = null;
    if (rgbv) hex = rgbv.length === 8 ? rgbv.slice(2) : rgbv.slice(-6);
    else if (attr(el, "theme") != null) hex = this.theme.colors[num(el, "theme", 0)] ?? null;
    else if (attr(el, "indexed") != null) {
      const i = num(el, "indexed", 0);
      if (i === 64 || i === 65) return auto;
      hex = this.indexed[i] ?? null;
    }
    return hex ? applyTint(hex.toUpperCase(), tint) : auto;
  }

  private font(f: El): Font {
    const val = (n: string) => attr(kid(f, n), "val");
    const flag = (n: string) => !!kid(f, n) && val(n) !== "0" && val(n) !== "false";
    const scheme = val("scheme");
    let name = val("name") || this.theme.minor;
    if (scheme === "minor") name = this.theme.minor || name;
    else if (scheme === "major") name = this.theme.major || name;
    return {
      name,
      size: Number(val("sz") || 11),
      bold: flag("b"),
      italic: flag("i"),
      underline: kid(f, "u") ? val("u") || "single" : null,
      strike: flag("strike"),
      color: this.color(kid(f, "color"), null),
      vertAlign: val("vertAlign"),
    };
  }

  private fill(f: El): string | null {
    const p = kid(f, "patternFill");
    if (p) {
      const type = attr(p, "patternType") || (kid(p, "fgColor") ? "solid" : "none");
      if (type === "none") return null;
      const fg = this.color(kid(p, "fgColor"), "000000");
      if (type === "solid") return fg;
      // Patterns print as a mix of the two colours; approximate with a blend.
      const bg = this.color(kid(p, "bgColor"), "FFFFFF") || "FFFFFF";
      const share = /gray125/.test(type) ? 0.125 : /gray0625/.test(type) ? 0.0625 : /light/.test(type) ? 0.25 : /dark/.test(type) ? 0.5 : 0.5;
      return mix(fg || "000000", bg, share);
    }
    const g = kid(f, "gradientFill");
    if (g) return this.color(kid(descendants(g, "stop")[0], "color"), null);
    return null;
  }

  private borders(b: El): Borders {
    const side = (n: string): Side | undefined => {
      const e = kid(b, n) || (n === "left" ? kid(b, "start") : n === "right" ? kid(b, "end") : null);
      const style = attr(e, "style");
      if (!e || !style || style === "none") return undefined;
      return { style, color: this.color(kid(e, "color"), "000000") || "000000" };
    };
    return { left: side("left"), right: side("right"), top: side("top"), bottom: side("bottom") };
  }
}

function mix(a: string, b: string, share: number): string {
  const c = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  let out = "";
  for (const i of [0, 2, 4]) out += Math.round(c(a, i) * share + c(b, i) * (1 - share)).toString(16).padStart(2, "0");
  return out.toUpperCase();
}

// ─── Sheet model ────────────────────────────────────────────────────────────

interface Run {
  text: string;
  font: Font;
}

interface Cell {
  xf: Xf;
  kind: "n" | "s" | "b" | "e" | "blank";
  value: number | string | boolean | null;
  runs?: Run[];
  formulaOnly?: boolean;
}

interface Merge {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

interface Picture {
  img: Uint8Array;
  png: boolean;
  from: { c: number; cOff: number; r: number; rOff: number };
  to?: { c: number; cOff: number; r: number; rOff: number };
  ext?: { cx: number; cy: number };
}

interface HeaderFooter {
  header: string | null;
  footer: string | null;
  firstHeader: string | null;
  firstFooter: string | null;
  differentFirst: boolean;
  scaleWithDoc: boolean;
}

interface SheetModel {
  name: string;
  rows: Map<number, Map<number, Cell>>;
  rowInfo: Map<number, { ht: number | null; hidden: boolean; xf: Xf | null }>;
  colWidth: (c: number) => number; // points, as printed (0 when hidden)
  colChars: (c: number) => number; // width as saved, in digit widths
  colXf: (c: number) => Xf | null;
  merges: Merge[];
  pictures: Picture[];
  page: {
    width: number;
    height: number;
    margins: { l: number; r: number; t: number; b: number; header: number; footer: number };
    scale: number;
    fitToPage: boolean;
    fitW: number;
    fitH: number;
    overThenDown: boolean;
    firstPageNumber: number | null;
    centerH: boolean;
    centerV: boolean;
    gridLines: boolean;
    rowBreaks: Set<number>;
    colBreaks: Set<number>;
  };
  printArea: Merge | null;
  titleRows: [number, number] | null;
  titleCols: [number, number] | null;
  hf: HeaderFooter;
  defaultRowHeight: number | null; // points, when the sheet fixes it
  charts: number;
}

// Paper sizes (points) by Excel's paperSize code.
const PAPER: Record<number, [number, number]> = {
  1: [612, 792], 2: [612, 792], 3: [792, 1224], 4: [1224, 792], 5: [612, 1008], 6: [396, 612], 7: [522, 756],
  8: [841.89, 1190.55], 9: [595.28, 841.89], 10: [595.28, 841.89], 11: [419.53, 595.28], 12: [728.5, 1031.8],
  13: [515.9, 728.5], 14: [612, 936], 15: [609.4, 779.5], 16: [720, 1008], 17: [792, 1224], 18: [612, 792],
  19: [279, 639], 20: [297, 684], 21: [324, 747], 22: [342, 792], 23: [360, 828], 24: [1224, 1584], 25: [1584, 2448],
  26: [2448, 3168], 27: [311.8, 623.6], 28: [459.2, 649.1], 29: [918.4, 1298.3], 30: [649.1, 918.4], 31: [323.1, 459.2],
  32: [323.1, 649.1], 33: [708.7, 1000.6], 34: [498.9, 708.7], 35: [498.9, 354.3], 36: [311.8, 651.97], 37: [279, 540],
  38: [261, 468], 39: [1071, 792], 40: [612, 864], 41: [612, 936], 70: [297.64, 419.53],
};

const cellRef = (ref: string): { r: number; c: number } | null => {
  const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(ref.trim().toUpperCase());
  if (!m) return null;
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: Number(m[2]), c };
};

function rangeRef(ref: string): Merge | null {
  const [a, b] = ref.split(":");
  const p = cellRef(a);
  if (!p) {
    // Whole rows ($1:$3) or whole columns ($A:$C).
    const rows = /^\$?(\d+):\$?(\d+)$/.exec(ref);
    if (rows) return { r1: Number(rows[1]), r2: Number(rows[2]), c1: 1, c2: 16384 };
    const cols = /^\$?([A-Z]+):\$?([A-Z]+)$/i.exec(ref);
    if (cols) {
      const c1 = cellRef(cols[1] + "1")!.c;
      const c2 = cellRef(cols[2] + "1")!.c;
      return { r1: 1, r2: 1048576, c1, c2 };
    }
    return null;
  }
  const q = b ? cellRef(b) : p;
  if (!q) return null;
  return { r1: Math.min(p.r, q.r), c1: Math.min(p.c, q.c), r2: Math.max(p.r, q.r), c2: Math.max(p.c, q.c) };
}

// Strips the sheet name from a defined-name reference ('My Sheet'!$A$1:$B$2).
const localRef = (ref: string) => ref.replace(/^(?:'[^']*(?:''[^']*)*'|[^!]*)!/, "");

// ─── Fonts and measuring ────────────────────────────────────────────────────

class Metrics {
  private cache = new Map<string, Promise<ResolvedFont>>();
  constructor(public fonts: PdfFontSet) {}

  get(f: Font): Promise<ResolvedFont> {
    const key = `${f.name}|${f.bold}|${f.italic}`;
    if (!this.cache.has(key)) this.cache.set(key, this.fonts.get(f.name, f.bold, f.italic));
    return this.cache.get(key)!;
  }

  width(rf: ResolvedFont, text: string, size: number): number {
    return this.fonts.width(rf, text, size);
  }
}

// Row height Excel gives one line of a font, at a screen resolution:
// the font's height in whole pixels plus two.
function lineHeight(rf: ResolvedFont, size: number, dpi: number): number {
  const em = Math.round((size * dpi) / 72);
  const px = Math.round((rf.metrics.ascent + rf.metrics.descent) * em) + 2;
  return (px * 72) / dpi;
}

// ─── Reading ────────────────────────────────────────────────────────────────

async function readTheme(pkg: Package, rels: Map<string, Rel>): Promise<Theme> {
  const rel = [...rels.values()].find((r) => r.type === "theme");
  const doc = rel ? await pkg.xml(rel.target) : null;
  const scheme = descendants(doc?.documentElement, "clrScheme")[0];
  const get = (n: string) => {
    const e = kid(scheme, n);
    return attr(kid(e, "srgbClr"), "val") || attr(kid(e, "sysClr"), "lastClr") || null;
  };
  const colors = [get("lt1") || "FFFFFF", get("dk1") || "000000", get("lt2") || "E7E6E6", get("dk2") || "44546A"];
  for (const n of ["accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"]) colors.push(get(n) || "000000");
  const font = (which: string) => attr(kid(descendants(doc?.documentElement, which)[0], "latin"), "typeface");
  return { colors: colors.map((c) => c.toUpperCase()), minor: font("minorFont") || "Calibri", major: font("majorFont") || "Calibri Light" };
}

function sharedStrings(doc: Document | null, styles: Styles): { text: string; runs?: Run[] }[] {
  if (!doc) return [];
  return kids(doc.documentElement, "si").map((si) => richText(si, styles));
}

function richText(el: El, styles: Styles): { text: string; runs?: Run[] } {
  const rs = kids(el, "r");
  if (!rs.length) return { text: kids(el, "t").map((t) => t.textContent || "").join("") };
  const runs: Run[] = [];
  for (const r of rs) {
    const rpr = kid(r, "rPr");
    const text = kids(r, "t").map((t) => t.textContent || "").join("");
    if (!rpr) {
      runs.push({ text, font: null as unknown as Font });
      continue;
    }
    const val = (n: string) => attr(kid(rpr, n), "val");
    const flag = (n: string) => !!kid(rpr, n) && val(n) !== "0" && val(n) !== "false";
    runs.push({
      text,
      font: {
        name: val("rFont") || val("name") || "",
        size: Number(val("sz") || 0),
        bold: flag("b"),
        italic: flag("i"),
        underline: kid(rpr, "u") ? val("u") || "single" : null,
        strike: flag("strike"),
        color: styles.color(kid(rpr, "color"), null),
        vertAlign: val("vertAlign"),
      },
    });
  }
  return { text: runs.map((r) => r.text).join(""), runs };
}

// Fills in run properties missing from rich text with the cell's font.
function resolveRuns(runs: Run[] | undefined, base: Font): Run[] | undefined {
  if (!runs) return undefined;
  return runs.map((r) => ({ text: r.text, font: r.font ? { ...base, ...stripEmpty(r.font) } : base }));
}

function stripEmpty(f: Font): Partial<Font> {
  const out: Partial<Font> = {};
  if (f.name) out.name = f.name;
  if (f.size) out.size = f.size;
  out.bold = f.bold;
  out.italic = f.italic;
  out.underline = f.underline;
  out.strike = f.strike;
  if (f.color) out.color = f.color;
  if (f.vertAlign) out.vertAlign = f.vertAlign;
  return out;
}

async function readSheet(
  pkg: Package,
  part: string,
  name: string,
  styles: Styles,
  shared: { text: string; runs?: Run[] }[],
  colPoints: (w: number) => number,
  defaultWidthChars: number,
  names: { printArea: string | null; titles: string | null },
  date1904: boolean
): Promise<SheetModel | null> {
  const doc = await pkg.xml(part);
  const root = doc?.documentElement;
  if (!root) return null;
  const rels = await pkg.rels(part);

  // Columns
  const fmtPr = kid(root, "sheetFormatPr");
  const defW = attr(fmtPr, "defaultColWidth") != null ? num(fmtPr, "defaultColWidth", defaultWidthChars) : defaultWidthChars;
  const colDefs: { min: number; max: number; w: number; hidden: boolean; xf: Xf | null }[] = [];
  for (const c of kids(kid(root, "cols"), "col")) {
    colDefs.push({
      min: num(c, "min", 1),
      max: num(c, "max", 1),
      w: attr(c, "width") != null ? num(c, "width", defW) : defW,
      hidden: attr(c, "hidden") === "1" || attr(c, "hidden") === "true",
      xf: attr(c, "style") != null ? styles.xfs[num(c, "style", 0)] || null : null,
    });
  }
  const colCache = new Map<number, number>();
  const colWidth = (c: number) => {
    let v = colCache.get(c);
    if (v == null) {
      const d = colDefs.find((x) => c >= x.min && c <= x.max);
      v = d?.hidden ? 0 : colPoints(d ? d.w : defW);
      colCache.set(c, v);
    }
    return v;
  };
  const colXf = (c: number) => colDefs.find((x) => c >= x.min && c <= x.max)?.xf ?? null;
  const colChars = (c: number) => {
    const d = colDefs.find((x) => c >= x.min && c <= x.max);
    return d?.hidden ? 0 : d ? d.w : defW;
  };

  // Cells
  const rows = new Map<number, Map<number, Cell>>();
  const rowInfo = new Map<number, { ht: number | null; hidden: boolean; xf: Xf | null }>();
  let lastRow = 0;
  for (const row of kids(kid(root, "sheetData"), "row")) {
    const r = attr(row, "r") != null ? num(row, "r", lastRow + 1) : lastRow + 1;
    lastRow = r;
    rowInfo.set(r, {
      ht: attr(row, "ht") != null ? num(row, "ht", 15) : null,
      hidden: attr(row, "hidden") === "1" || attr(row, "hidden") === "true",
      xf: attr(row, "customFormat") === "1" && attr(row, "s") != null ? styles.xfs[num(row, "s", 0)] || null : null,
    });
    const cells = new Map<number, Cell>();
    let lastCol = 0;
    for (const c of kids(row, "c")) {
      const ref = attr(c, "r");
      const col = ref ? cellRef(ref)?.c ?? lastCol + 1 : lastCol + 1;
      lastCol = col;
      const xf = styles.xfs[num(c, "s", 0)] || styles.xfs[0];
      const t = attr(c, "t") || "n";
      const v = kid(c, "v")?.textContent ?? null;
      const cell: Cell = { xf, kind: "blank", value: null };
      if (t === "s" && v != null) {
        const s = shared[Number(v)];
        cell.kind = "s";
        cell.value = s?.text ?? "";
        cell.runs = resolveRuns(s?.runs, xf.font);
      } else if (t === "inlineStr") {
        const s = richText(kid(c, "is")!, styles);
        cell.kind = "s";
        cell.value = s.text;
        cell.runs = resolveRuns(s.runs, xf.font);
      } else if (t === "str") {
        cell.kind = "s";
        cell.value = v ?? "";
      } else if (t === "b") {
        cell.kind = "b";
        cell.value = v === "1" || v === "true";
      } else if (t === "e") {
        cell.kind = "e";
        cell.value = v ?? "#N/A";
      } else if (t === "d" && v) {
        cell.kind = "n";
        cell.value = isoToSerial(v, date1904);
      } else if (v != null && v !== "") {
        cell.kind = "n";
        cell.value = Number(v);
      } else if (kid(c, "f")) {
        cell.formulaOnly = true;
      }
      cells.set(col, cell);
    }
    rows.set(r, cells);
  }

  const merges: Merge[] = [];
  for (const m of kids(kid(root, "mergeCells"), "mergeCell")) {
    const rr = rangeRef(attr(m, "ref") || "");
    if (rr) merges.push(rr);
  }

  // Page setup
  const ps = kid(root, "pageSetup");
  const pm = kid(root, "pageMargins");
  const po = kid(root, "printOptions");
  const paper = PAPER[num(ps, "paperSize", 1)] || PAPER[1];
  const landscape = attr(ps, "orientation") === "landscape";
  const inch = (n: string, d: number) => num(pm, n, d) * 72;
  const fitToPage = attr(kid(kid(root, "sheetPr"), "pageSetUpPr"), "fitToPage") === "1" || attr(kid(kid(root, "sheetPr"), "pageSetUpPr"), "fitToPage") === "true";
  const breaks = (n: string) => new Set(kids(kid(root, n), "brk").map((b) => num(b, "id", 0)));
  const hfEl = kid(root, "headerFooter");
  const text = (n: string) => kid(hfEl, n)?.textContent ?? null;

  // Pictures and charts
  const pictures: Picture[] = [];
  let charts = 0;
  for (const d of kids(root, "drawing")) {
    const rel = rels.get(attr(d, "r:id") || "");
    if (!rel) continue;
    const ddoc = await pkg.xml(rel.target);
    const drels = await pkg.rels(rel.target);
    for (const anchor of Array.from(ddoc?.documentElement.children || [])) {
      const pic = kid(anchor, "pic");
      if (descendants(anchor, "chart").length) charts++;
      if (!pic) continue;
      const embed = attr(descendants(pic, "blip")[0], "r:embed");
      const irel = embed ? drels.get(embed) : null;
      if (!irel || irel.external) continue;
      const bytes = await pkg.bytes(irel.target);
      if (!bytes) continue;
      const png = bytes[0] === 0x89 && bytes[1] === 0x50;
      const jpg = bytes[0] === 0xff && bytes[1] === 0xd8;
      if (!png && !jpg) continue;
      const pos = (e: El | null) =>
        e ? { c: num(kid(e, "col"), "", 0) || Number(kid(e, "col")?.textContent || 0), cOff: Number(kid(e, "colOff")?.textContent || 0), r: Number(kid(e, "row")?.textContent || 0), rOff: Number(kid(e, "rowOff")?.textContent || 0) } : null;
      const from = pos(kid(anchor, "from"));
      if (!from) continue;
      const to = pos(kid(anchor, "to")) || undefined;
      const ext = kid(anchor, "ext") || descendants(kid(pic, "spPr"), "ext")[0];
      pictures.push({ img: bytes, png, from, to, ext: ext ? { cx: num(ext, "cx", 0), cy: num(ext, "cy", 0) } : undefined });
    }
  }

  let titleRows: [number, number] | null = null;
  let titleCols: [number, number] | null = null;
  if (names.titles) {
    for (const part of names.titles.split(",")) {
      const rr = rangeRef(localRef(part));
      if (!rr) continue;
      if (rr.c1 === 1 && rr.c2 === 16384) titleRows = [rr.r1, rr.r2];
      else if (rr.r1 === 1 && rr.r2 === 1048576) titleCols = [rr.c1, rr.c2];
    }
  }
  const pa = names.printArea ? rangeRef(localRef(names.printArea.split(",")[0])) : null;

  return {
    name,
    rows,
    rowInfo,
    colWidth,
    colChars,
    colXf,
    merges,
    pictures,
    page: {
      width: landscape ? paper[1] : paper[0],
      height: landscape ? paper[0] : paper[1],
      margins: { l: inch("left", 0.7), r: inch("right", 0.7), t: inch("top", 0.75), b: inch("bottom", 0.75), header: inch("header", 0.3), footer: inch("footer", 0.3) },
      scale: Math.max(10, Math.min(400, num(ps, "scale", 100))),
      fitToPage,
      fitW: num(ps, "fitToWidth", 1),
      fitH: num(ps, "fitToHeight", 1),
      overThenDown: attr(ps, "pageOrder") === "overThenDown",
      firstPageNumber: attr(ps, "useFirstPageNumber") === "1" || attr(ps, "useFirstPageNumber") === "true" ? num(ps, "firstPageNumber", 1) : null,
      centerH: attr(po, "horizontalCentered") === "1" || attr(po, "horizontalCentered") === "true",
      centerV: attr(po, "verticalCentered") === "1" || attr(po, "verticalCentered") === "true",
      gridLines: attr(po, "gridLines") === "1" || attr(po, "gridLines") === "true",
      rowBreaks: breaks("rowBreaks"),
      colBreaks: breaks("colBreaks"),
    },
    printArea: pa,
    titleRows,
    titleCols,
    hf: {
      header: text("oddHeader"),
      footer: text("oddFooter"),
      firstHeader: text("firstHeader"),
      firstFooter: text("firstFooter"),
      differentFirst: attr(hfEl, "differentFirst") === "1" || attr(hfEl, "differentFirst") === "true",
      scaleWithDoc: attr(hfEl, "scaleWithDoc") !== "0" && attr(hfEl, "scaleWithDoc") !== "false",
    },
    defaultRowHeight: attr(fmtPr, "customHeight") === "1" ? num(fmtPr, "defaultRowHeight", 15) : null,
    charts,
  };
}

function isoToSerial(iso: string, date1904: boolean): number {
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00Z" : iso.endsWith("Z") ? iso : iso + "Z");
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  return (d.getTime() - epoch) / 86400000;
}

// ─── Number formats ─────────────────────────────────────────────────────────

let SSF: any = null;

function formatValue(cell: Cell, date1904: boolean): string {
  if (cell.kind === "b") return cell.value ? "TRUE" : "FALSE";
  if (cell.kind === "e") return String(cell.value);
  if (cell.kind === "s") {
    const fmt = cell.xf.numFmt;
    // A text section ("@" or a fourth section) can wrap the text.
    if (fmt && fmt !== "0" && fmt !== "General" && fmt !== "49" && /@/.test(fmt) && SSF) {
      try {
        return SSF.format(fmt, String(cell.value));
      } catch {
        return String(cell.value);
      }
    }
    return String(cell.value ?? "");
  }
  if (cell.kind !== "n" || typeof cell.value !== "number") return "";
  const fmt = /^\d+$/.test(cell.xf.numFmt) ? Number(cell.xf.numFmt) : cell.xf.numFmt;
  if (!SSF) return String(cell.value);
  try {
    return SSF.format(fmt, cell.value, { date1904 });
  } catch {
    return String(cell.value);
  }
}

// Colour named in the number format's section for this value ([Red] etc.).
const FMT_COLORS: Record<string, string> = { black: "000000", white: "FFFFFF", red: "FF0000", green: "00FF00", blue: "0000FF", yellow: "FFFF00", magenta: "FF00FF", cyan: "00FFFF" };
function sectionColor(fmt: string, value: number): string | null {
  if (!fmt || /^\d+$/.test(fmt) || !fmt.includes("[")) return null;
  const sections: string[] = [];
  let cur = "";
  let quoted = false;
  let bracket = false;
  for (const ch of fmt) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === "[") bracket = true;
    else if (!quoted && ch === "]") bracket = false;
    if (ch === ";" && !quoted && !bracket) {
      sections.push(cur);
      cur = "";
    } else cur += ch;
  }
  sections.push(cur);
  const sec = value > 0 || sections.length === 1 ? sections[0] : value < 0 ? sections[1] ?? sections[0] : sections[2] ?? sections[0];
  const m = /\[(black|white|red|green|blue|yellow|magenta|cyan|color\s*(\d+))\]/i.exec(sec || "");
  if (!m) return null;
  if (m[2]) return INDEXED[Number(m[2]) + 7] ?? null;
  return FMT_COLORS[m[1].toLowerCase()] ?? null;
}

// "General" numbers shrink to fit their column, as Excel does, before
// giving up and showing ####.
function fitGeneral(value: number, fits: (s: string) => boolean): string | null {
  const abs = Math.abs(value);
  for (let digits = 10; digits >= 1; digits--) {
    let s: string;
    if (abs !== 0 && (abs >= 1e11 || abs < 1e-9)) s = value.toExponential(Math.max(0, digits - 1)).replace(/\.?0+e/, "E").replace("e", "E").replace(/E\+?(-?)(\d)$/, "E$10$2").replace(/E\+/, "E+");
    else s = String(Number(value.toPrecision(digits)));
    if (/E/.test(s) && !/E[+-]/.test(s)) s = s.replace("E", "E+");
    if (fits(s)) return s;
  }
  return null;
}

// ─── Layout and painting ────────────────────────────────────────────────────

const BORDER_W: Record<string, number> = {
  hair: 0.24, thin: 0.96, dotted: 0.96, dashed: 0.96, dashDot: 0.96, dashDotDot: 0.96,
  medium: 1.92, mediumDashed: 1.92, mediumDashDot: 1.92, mediumDashDotDot: 1.92, slantDashDot: 1.92,
  thick: 2.88, double: 2.88, grid: 0.48,
};
const DASH: Record<string, number[]> = {
  dotted: [0.96, 0.96], dashed: [2.88, 1.92], dashDot: [5.76, 1.92, 0.96, 1.92], dashDotDot: [5.76, 1.92, 0.96, 1.92, 0.96, 1.92],
  mediumDashed: [5.76, 1.92], mediumDashDot: [5.76, 1.92, 1.92, 1.92], mediumDashDotDot: [5.76, 1.92, 1.92, 1.92, 1.92, 1.92], slantDashDot: [5.76, 1.92],
  hair: [0.48, 0.48],
};

const hexRgb = (hex: string) => rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);

interface Block {
  rows: number[];
  cols: number[];
}

interface Ctx {
  sheet: SheetModel;
  metrics: Metrics;
  rowH: Map<number, number>;
  date1904: boolean;
  dpi: number;
  images: Map<Picture, Promise<PDFImage | null>>;
  doc: PDFDocument;
  normal: Font;
  digitEm: number; // widest digit of the default font, per unit of size
}

// Where text sits in its cell (points): measured against Excel's export.
const pad = (size: number) => 1.92 + Math.max(0, size - 11) * 0.135;
const PAD_R = 2.3;

class SheetPainter {
  constructor(
    private ctx: Ctx,
    private page: PDFPage,
    private s: number, // scale
    private ox: number, // page x of the block's left edge
    private oy: number, // page y (from top) of the block's top edge
    private colX: Map<number, number>, // sheet x of each column's left edge, within the block
    private rowY: Map<number, number>
  ) {}

  private X(x: number) {
    return this.ox + x * this.s;
  }
  private Y(y: number) {
    return this.page.getHeight() - (this.oy + y * this.s);
  }

  fillRect(x: number, y: number, w: number, h: number, color: string) {
    this.page.drawRectangle({ x: this.X(x), y: this.Y(y + h), width: w * this.s, height: h * this.s, color: hexRgb(color) });
  }

  line(x1: number, y1: number, x2: number, y2: number, side: Side) {
    const w = BORDER_W[side.style] ?? 0.96;
    const color = hexRgb(side.color);
    const s = this.s;
    if (side.style === "double") {
      // Two thin lines with a gap of the same width.
      const t = 0.96;
      const off = (w - t) / 2;
      const vertical = x1 === x2;
      for (const d of [-off, off]) {
        this.page.drawLine({
          start: { x: this.X(x1 + (vertical ? d : 0)), y: this.Y(y1 + (vertical ? 0 : d)) },
          end: { x: this.X(x2 + (vertical ? d : 0)), y: this.Y(y2 + (vertical ? 0 : d)) },
          thickness: t * s,
          color,
        });
      }
      return;
    }
    this.page.drawLine({
      start: { x: this.X(x1), y: this.Y(y1) },
      end: { x: this.X(x2), y: this.Y(y2) },
      thickness: w * s,
      color,
      dashArray: DASH[side.style]?.map((d) => d * s),
    });
  }

  async text(runs: Run[], x: number, baseline: number, rotation = 0) {
    let cx = x;
    for (const run of runs) {
      if (!run.text) continue;
      const f = run.font;
      const rf = await this.ctx.metrics.get(f);
      const size = snap(f.size * (f.vertAlign ? 0.67 : 1));
      const shift = f.vertAlign === "superscript" ? -f.size * 0.33 : f.vertAlign === "subscript" ? f.size * 0.12 : 0;
      const text = encodable(rf.font, run.text);
      const w = this.ctx.metrics.width(rf, run.text, size);
      const stretch = this.ctx.metrics.fonts.stretch(rf, run.text, size);
      const color = hexRgb(f.color || "000000");
      if (stretch !== 100) {
        this.page.pushOperators(pushGraphicsState(), setCharacterSqueeze(stretch));
      }
      this.page.drawText(text, {
        x: this.X(cx),
        y: this.Y(baseline + shift),
        size: size * this.s,
        font: rf.font,
        color,
        rotate: rotation ? degrees(rotation) : undefined,
      });
      if (stretch !== 100) this.page.pushOperators(popGraphicsState());
      if (!rotation && f.underline) {
        const t = Math.max(0.5, size / 16);
        const y = baseline + size * (f.underline.includes("Accounting") ? 0.22 : 0.12);
        this.page.drawLine({ start: { x: this.X(cx), y: this.Y(y) }, end: { x: this.X(cx + w), y: this.Y(y) }, thickness: t * this.s, color });
        if (f.underline.startsWith("double")) this.page.drawLine({ start: { x: this.X(cx), y: this.Y(y + t * 2) }, end: { x: this.X(cx + w), y: this.Y(y + t * 2) }, thickness: t * this.s, color });
      }
      if (!rotation && f.strike) {
        const y = baseline - size * 0.27;
        this.page.drawLine({ start: { x: this.X(cx), y: this.Y(y) }, end: { x: this.X(cx + w), y: this.Y(y) }, thickness: Math.max(0.5, size / 16) * this.s, color });
      }
      cx += w;
    }
  }

  clip(x: number, y: number, w: number, h: number) {
    this.page.pushOperators(pushGraphicsState(), rectangle(this.X(x), this.Y(y + h), w * this.s, h * this.s), clip(), endPath());
  }

  unclip() {
    this.page.pushOperators(popGraphicsState());
  }

  async image(p: PDFImage, x: number, y: number, w: number, h: number) {
    this.page.drawImage(p, { x: this.X(x), y: this.Y(y + h), width: w * this.s, height: h * this.s });
  }

  get colLeft() {
    return this.colX;
  }
  get rowTop() {
    return this.rowY;
  }
}

// A cell's text as runs, with the cell font filled in.
function cellRuns(cell: Cell, text: string): Run[] {
  if (cell.runs && cell.kind === "s" && text === cell.value) return cell.runs;
  return [{ text, font: cell.xf.font }];
}

// Splits runs into lines no wider than `width` (Excel breaks at spaces and
// hyphens, and inside a word that is wider than the cell).
async function wrapRuns(runs: Run[], width: number, m: Metrics, measure?: (rf: ResolvedFont, ch: string, size: number) => number): Promise<Run[][]> {
  const lines: Run[][] = [];
  // Work on characters with their fonts.
  type Ch = { ch: string; font: Font; w: number };
  const chars: Ch[] = [];
  for (const r of runs) {
    const rf = await m.get(r.font);
    for (const ch of Array.from(r.text)) chars.push({ ch, font: r.font, w: measure ? measure(rf, ch, r.font.size) : m.width(rf, ch, snap(r.font.size)) });
  }
  const toRuns = (cs: Ch[]): Run[] => {
    const out: Run[] = [];
    for (const c of cs) {
      const last = out[out.length - 1];
      if (last && last.font === c.font) last.text += c.ch;
      else out.push({ text: c.ch, font: c.font });
    }
    return out;
  };
  let i = 0;
  while (i < chars.length) {
    let w = 0;
    let j = i;
    let lastBreak = -1;
    while (j < chars.length && chars[j].ch !== "\n") {
      if (w + chars[j].w > width && chars[j].ch !== " ") break;
      w += chars[j].w;
      if (chars[j].ch === " " || chars[j].ch === "-") lastBreak = j;
      j++;
    }
    if (j < chars.length && chars[j].ch === "\n") {
      lines.push(toRuns(chars.slice(i, j)));
      i = j + 1;
      continue;
    }
    if (j >= chars.length) {
      lines.push(toRuns(chars.slice(i)));
      break;
    }
    let end = lastBreak >= i ? lastBreak + 1 : Math.max(j, i + 1);
    const line = chars.slice(i, end);
    while (line.length && line[line.length - 1].ch === " ") line.pop();
    lines.push(toRuns(line));
    i = end;
    while (i < chars.length && chars[i].ch === " ") i++;
  }
  return lines.length ? lines : [[]];
}

async function runsWidth(runs: Run[], m: Metrics): Promise<number> {
  let w = 0;
  for (const r of runs) w += m.width(await m.get(r.font), r.text, snap(r.font.size));
  return w;
}

async function runsBox(runs: Run[], m: Metrics, dpi: number): Promise<{ asc: number; desc: number; line: number }> {
  let asc = 0;
  let desc = 0;
  let line = 0;
  for (const r of runs.length ? runs : []) {
    const rf = await m.get(r.font);
    const size = snap(r.font.size);
    asc = Math.max(asc, rf.metrics.ascent * size);
    desc = Math.max(desc, rf.metrics.descent * size);
    line = Math.max(line, lineHeight(rf, r.font.size, dpi));
  }
  return { asc, desc, line };
}

// ─── Header and footer ──────────────────────────────────────────────────────

interface HfPart {
  runs: Run[];
}

function parseHf(src: string | null, base: Font, vars: Record<string, string>): { L: HfPart; C: HfPart; R: HfPart } {
  const out = { L: { runs: [] as Run[] }, C: { runs: [] as Run[] }, R: { runs: [] as Run[] } };
  if (!src) return out;
  let part: "L" | "C" | "R" = "C";
  let font: Font = { ...base };
  let buf = "";
  const flush = () => {
    if (buf) out[part].runs.push({ text: buf, font: { ...font } });
    buf = "";
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch !== "&") {
      buf += ch;
      continue;
    }
    const n = src[i + 1];
    if (n === undefined) break;
    if (n === "&") {
      buf += "&";
      i++;
    } else if (n === "L" || n === "C" || n === "R") {
      flush();
      part = n;
      font = { ...base };
      i++;
    } else if (n === '"') {
      flush();
      const end = src.indexOf('"', i + 2);
      const spec = src.slice(i + 2, end < 0 ? src.length : end);
      const [fname, style] = spec.split(",");
      if (fname && fname !== "-") font = { ...font, name: fname };
      if (style) font = { ...font, bold: /bold/i.test(style), italic: /italic|oblique/i.test(style) };
      i = end < 0 ? src.length : end;
    } else if (/\d/.test(n)) {
      flush();
      let j = i + 1;
      while (j < src.length && /\d/.test(src[j])) j++;
      font = { ...font, size: Number(src.slice(i + 1, j)) };
      i = j - 1;
    } else if (n === "B" || n === "I" || n === "U" || n === "S" || n === "E" || n === "X" || n === "Y") {
      flush();
      if (n === "B") font = { ...font, bold: !font.bold };
      if (n === "I") font = { ...font, italic: !font.italic };
      if (n === "U") font = { ...font, underline: font.underline ? null : "single" };
      if (n === "E") font = { ...font, underline: font.underline ? null : "double" };
      if (n === "S") font = { ...font, strike: !font.strike };
      i++;
    } else if (n === "K") {
      flush();
      const hex = src.slice(i + 2, i + 8);
      if (/^[0-9A-Fa-f]{6}$/.test(hex)) font = { ...font, color: hex.toUpperCase() };
      i += 7;
    } else {
      buf += vars[n] ?? "";
      i++;
    }
  }
  flush();
  return out;
}

// ─── Workbook ───────────────────────────────────────────────────────────────

export async function xlsxToPdf(
  bytes: ArrayBuffer,
  onProgress: Progress,
  opts: { screenDpi?: number; fileName?: string } = {}
): Promise<{ pdf: Uint8Array; pages: number; sheets: number; notes: string[] }> {
  const dpi = opts.screenDpi ?? 96;
  onProgress(5, "Opening your spreadsheet...");
  const JSZip = await getJSZip();
  let zip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error("NOT_XLSX");
  }
  const pkg = new Package(zip);
  const wbPath = "xl/workbook.xml";
  const wb = await pkg.xml(wbPath);
  if (!wb) throw new Error("NOT_XLSX");
  const wbRels = await pkg.rels(wbPath);
  const byType = (t: string) => [...wbRels.values()].find((r) => r.type === t)?.target;
  const theme = await readTheme(pkg, wbRels);
  const stylesDoc = byType("styles") ? await pkg.xml(byType("styles")!) : null;
  const indexed = [...INDEXED];
  descendants(stylesDoc?.documentElement, "rgbColor").forEach((c, i) => {
    const v = attr(c, "rgb");
    if (v) indexed[i] = v.slice(-6).toUpperCase();
  });
  const styles = new Styles(stylesDoc, theme, indexed);
  const shared = sharedStrings(byType("sharedStrings") ? await pkg.xml(byType("sharedStrings")!) : null, styles);
  const date1904 = ["1", "true"].includes(attr(kid(wb.documentElement, "workbookPr"), "date1904") || "");

  const XLSX = await getXLSX().catch(() => null);
  SSF = XLSX?.SSF ?? null;

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(await getFontkit());
  pdf.setCreator("FoldPDF");
  pdf.setProducer("FoldPDF");
  const fonts = new PdfFontSet(pdf);
  const metrics = new Metrics(fonts);
  const notes = new Set<string>();

  // Column widths print at the default font's digit width at 600 dpi.
  const normal = styles.normal;
  const nrf = await metrics.get(normal);
  let digitEm = 0;
  for (const d of "0123456789") digitEm = Math.max(digitEm, metrics.width(nrf, d, 1000) / 1000);
  const M = Math.max(1, Math.round(digitEm * Math.round((normal.size * 600) / 72)));
  const colPoints = (w: number) => Math.round(((256 * w + Math.floor(128 / M)) / 256) * M) * PX;
  const mdw96 = Math.max(1, Math.round(digitEm * Math.round((normal.size * 96) / 72)));
  const baseCols = 8;
  const defaultWidthChars = Math.floor(((baseCols * mdw96 + 5) / mdw96) * 256) / 256;
  const normalRow = lineHeight(nrf, normal.size, dpi);

  // Sheets to print: visible worksheets, in order.
  const definedNames = kids(kid(wb.documentElement, "definedNames"), "definedName");
  const sheetEls = kids(kid(wb.documentElement, "sheets"), "sheet");
  const models: SheetModel[] = [];
  for (let i = 0; i < sheetEls.length; i++) {
    const el = sheetEls[i];
    if (attr(el, "state") === "hidden" || attr(el, "state") === "veryHidden") continue;
    const rel = wbRels.get(attr(el, "r:id") || "");
    if (!rel) continue;
    if (rel.type === "chartsheet") {
      notes.add("chart sheets");
      continue;
    }
    const localName = (n: string) => definedNames.find((d) => attr(d, "name") === n && num(d, "localSheetId", -1) === i)?.textContent ?? null;
    onProgress(10 + Math.round((i / sheetEls.length) * 30), "Reading your sheets...");
    const model = await readSheet(pkg, rel.target, attr(el, "name") || `Sheet${i + 1}`, styles, shared, colPoints, defaultWidthChars, { printArea: localName("_xlnm.Print_Area"), titles: localName("_xlnm.Print_Titles") }, date1904);
    if (model) models.push(model);
  }

  // Lay out every sheet's pages first (for "Page X of Y"), then paint.
  interface PagePlan {
    sheet: SheetModel;
    ctx: Ctx;
    block: Block;
    scale: number;
    titleRows: number[];
    titleCols: number[];
    number: number;
  }
  const plans: PagePlan[] = [];
  for (const sheet of models) {
    const plan = await planSheet(sheet, { sheet, metrics, rowH: new Map(), date1904, dpi, images: new Map(), doc: pdf, normal, digitEm }, normalRow, notes);
    plans.push(...plan.map((p) => ({ ...p, sheet, number: 0 })));
  }
  if (!plans.length) throw new Error("EMPTY");
  let n = 0;
  let lastSheet: SheetModel | null = null;
  for (const p of plans) {
    if (p.sheet !== lastSheet && p.sheet.page.firstPageNumber != null) n = p.sheet.page.firstPageNumber - 1;
    lastSheet = p.sheet;
    p.number = ++n;
  }
  const total = plans.length;
  for (let i = 0; i < plans.length; i++) {
    onProgress(45 + Math.round((i / plans.length) * 50), `Drawing page ${i + 1} of ${total}...`);
    await paintPage(plans[i], total, pdf, opts.fileName || "", i === 0 || plans[i - 1].sheet !== plans[i].sheet);
  }

  onProgress(97, "Saving your PDF...");
  const out = await pdf.save({ useObjectStreams: true });
  return { pdf: out, pages: total, sheets: models.length, notes: [...notes] };
}

// Heights of the rows in a range, autofitting rows without a saved height.
async function rowHeights(sheet: SheetModel, ctx: Ctx, r1: number, r2: number, normalRow: number) {
  const merged = new Set<string>();
  for (const m of sheet.merges) if (m.r1 !== m.r2) for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) merged.add(`${r}:${c}`);
  const base = sheet.defaultRowHeight ?? normalRow;
  for (let r = r1; r <= r2; r++) {
    const info = sheet.rowInfo.get(r);
    if (info?.hidden) {
      ctx.rowH.set(r, 0);
      continue;
    }
    if (info?.ht != null) {
      ctx.rowH.set(r, snap(info.ht));
      continue;
    }
    let h = base;
    const cells = sheet.rows.get(r);
    if (cells) {
      for (const [c, cell] of cells) {
        if (merged.has(`${r}:${c}`)) continue;
        const text = formatValue(cell, ctx.date1904);
        const runs = cellRuns(cell, text || " ");
        const box = await runsBox(runs, ctx.metrics, ctx.dpi);
        if (cell.xf.align.wrap && text) {
          const lines = await wrapRuns(runs, Math.max(1, screenRoom(ctx, sheet.colChars(c))), ctx.metrics, screenMeasure(ctx));
          h = Math.max(h, lines.length * box.line);
        } else if (text) h = Math.max(h, box.line);
      }
    }
    ctx.rowH.set(r, snap(h));
  }
}

// Excel sizes rows as it shows them on screen, where text is drawn with
// hinted fonts: each character a whole number of pixels, usually rounded
// up. Wrapping for autofit is worked out that way, so a line that just fits
// on paper can take two lines on screen (and in Excel's printout).
function screenMeasure(ctx: Ctx) {
  return (rf: ResolvedFont, ch: string, size: number) => {
    const em = Math.round((size * ctx.dpi) / 72);
    return (Math.ceil((ctx.metrics.width(rf, ch, 1000) / 1000) * em - 0.05) * 72) / ctx.dpi;
  };
}

// Room for text in a column on screen: its pixel width less the cell margins.
function screenRoom(ctx: Ctx, chars: number): number {
  const em = Math.round((ctx.normal.size * ctx.dpi) / 72);
  const mdw = Math.max(1, Math.round(ctx.digitEm * em));
  const px = Math.floor(((256 * chars + Math.floor(128 / mdw)) / 256) * mdw);
  // The text needs a pixel to spare: one more than the printed cell margins.
  return ((px - Math.round((4.22 * ctx.dpi) / 72) - 1) * 72) / ctx.dpi;
}

function usedRange(sheet: SheetModel): Merge | null {
  let r1 = Infinity;
  let c1 = Infinity;
  let r2 = 0;
  let c2 = 0;
  const add = (r: number, c: number) => {
    r1 = Math.min(r1, r);
    c1 = Math.min(c1, c);
    r2 = Math.max(r2, r);
    c2 = Math.max(c2, c);
  };
  for (const [r, cells] of sheet.rows) {
    for (const [c, cell] of cells) {
      const shown = cell.kind !== "blank" || cell.xf.fill || cell.xf.border.left || cell.xf.border.right || cell.xf.border.top || cell.xf.border.bottom;
      if (shown) add(r, c);
    }
  }
  for (const m of sheet.merges) {
    add(m.r1, m.c1);
    add(m.r2, m.c2);
  }
  for (const p of sheet.pictures) {
    add(p.from.r + 1, p.from.c + 1);
    if (p.to) add(p.to.r + 1, p.to.c + 1);
  }
  if (!r2) return null;
  // Excel prints from A1 to the last used cell (measured: an empty first row
  // still prints).
  return { r1: 1, c1: 1, r2, c2 };
}

async function planSheet(sheet: SheetModel, ctx: Ctx, normalRow: number, notes: Set<string>) {
  if (sheet.charts) notes.add("charts");
  for (const [, cells] of sheet.rows) for (const [, c] of cells) if (c.formulaOnly) notes.add("formulas without saved results");
  const used = usedRange(sheet);
  // The print area if there is one (whole rows or columns end at the used
  // range), else the used range.
  let area = sheet.printArea;
  if (area) area = { ...area, r2: area.r2 > 1000000 ? Math.max(area.r1, used?.r2 ?? area.r1) : area.r2, c2: area.c2 > 16000 ? Math.max(area.c1, used?.c2 ?? area.c1) : area.c2 };
  else area = used;
  if (!area) return [];

  const titleRows: number[] = [];
  const titleCols: number[] = [];
  if (sheet.titleRows) for (let r = sheet.titleRows[0]; r <= sheet.titleRows[1]; r++) titleRows.push(r);
  if (sheet.titleCols) for (let c = sheet.titleCols[0]; c <= sheet.titleCols[1]; c++) titleCols.push(c);
  await rowHeights(sheet, ctx, Math.min(area.r1, sheet.titleRows?.[0] ?? area.r1), Math.max(area.r2, sheet.titleRows?.[1] ?? 0), normalRow);

  const rows: number[] = [];
  const cols: number[] = [];
  for (let r = area.r1; r <= area.r2; r++) if ((ctx.rowH.get(r) ?? 0) > 0) rows.push(r);
  for (let c = area.c1; c <= area.c2; c++) if (sheet.colWidth(c) > 0) cols.push(c);
  if (!rows.length || !cols.length) return [];

  const pg = sheet.page;
  const availW = pg.width - pg.margins.l - pg.margins.r;
  const availH = pg.height - pg.margins.t - pg.margins.b;
  const totalW = cols.reduce((s, c) => s + sheet.colWidth(c), 0);
  const totalH = rows.reduce((s, r) => s + (ctx.rowH.get(r) ?? 0), 0);
  let scale = pg.scale / 100;
  if (pg.fitToPage) {
    let f = 1;
    if (pg.fitW > 0) f = Math.min(f, (availW * pg.fitW) / (totalW + 1));
    if (pg.fitH > 0) f = Math.min(f, (availH * pg.fitH) / (totalH + 1));
    scale = Math.max(0.1, Math.floor(f * 100) / 100);
  }
  const titleW = titleCols.reduce((s, c) => s + sheet.colWidth(c), 0);
  const titleH = titleRows.reduce((s, r) => s + (ctx.rowH.get(r) ?? 0), 0);

  // Repeated title rows (columns) take room only on pages that don't
  // already start with them.
  const split = (items: number[], size: (i: number) => number, room: number, breaks: Set<number>, titles: number[] = [], titleSize = 0) => {
    const out: number[][] = [];
    let cur: number[] = [];
    let used = 0;
    const roomFor = (first: number) => room - (titles.length && first > titles[titles.length - 1] ? titleSize : 0);
    for (const it of items) {
      const sz = size(it);
      if (cur.length && used + sz > roomFor(cur[0]) + 0.01) {
        out.push(cur);
        cur = [];
        used = 0;
      }
      cur.push(it);
      used += sz;
      if (breaks.has(it)) {
        out.push(cur);
        cur = [];
        used = 0;
      }
    }
    if (cur.length) out.push(cur);
    return out;
  };
  const colPages = split(cols, (c) => sheet.colWidth(c), availW / scale, pg.colBreaks, titleCols, titleW);
  const rowPages = split(rows, (r) => ctx.rowH.get(r) ?? 0, availH / scale, pg.rowBreaks, titleRows, titleH);
  const blocks: Block[] = [];
  if (pg.overThenDown) for (const rp of rowPages) for (const cp of colPages) blocks.push({ rows: rp, cols: cp });
  else for (const cp of colPages) for (const rp of rowPages) blocks.push({ rows: rp, cols: cp });
  return blocks.map((block) => ({
    ctx,
    block,
    scale,
    titleRows: block.rows[0] > (titleRows[titleRows.length - 1] ?? 0) ? titleRows : [],
    titleCols: block.cols[0] > (titleCols[titleCols.length - 1] ?? 0) ? titleCols : [],
  }));
}

async function paintPage(
  plan: { sheet: SheetModel; ctx: Ctx; block: Block; scale: number; titleRows: number[]; titleCols: number[]; number: number },
  total: number,
  pdf: PDFDocument,
  fileName: string,
  firstOfSheet: boolean
) {
  const { sheet, ctx, scale: s } = plan;
  const pg = sheet.page;
  const page = pdf.addPage([pg.width, pg.height]);
  const rows = [...plan.titleRows, ...plan.block.rows];
  const cols = [...plan.titleCols, ...plan.block.cols];

  // Sheet coordinates of the rows and columns on this page.
  const colX = new Map<number, number>();
  const rowY = new Map<number, number>();
  let x = 0;
  for (const c of cols) {
    colX.set(c, x);
    x += sheet.colWidth(c);
  }
  let y = 0;
  for (const r of rows) {
    rowY.set(r, y);
    y += ctx.rowH.get(r) ?? 0;
  }
  const blockW = x;
  const blockH = y;
  const availW = pg.width - pg.margins.l - pg.margins.r;
  const availH = pg.height - pg.margins.t - pg.margins.b;
  const ox = pg.margins.l + 0.48 + (pg.centerH ? Math.max(0, (availW - blockW * s) / 2 - 0.78) : 0);
  const oy = pg.margins.t + 0.48 + (pg.centerV ? Math.max(0, (availH - blockH * s) / 2) : 0);
  const painter = new SheetPainter(ctx, page, s, ox, oy, colX, rowY);
  const colIndex = new Map(cols.map((c, i) => [c, i]));
  const rowSet = new Set(rows);
  const colSet = new Set(cols);

  const cellAt = (r: number, c: number): Cell | undefined => sheet.rows.get(r)?.get(c);
  const xfAt = (r: number, c: number): Xf | null => cellAt(r, c)?.xf ?? sheet.rowInfo.get(r)?.xf ?? sheet.colXf(c);
  const mergeAt = (r: number, c: number) => sheet.merges.find((m) => r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2);
  const spanX = (c1: number, c2: number) => {
    let x1 = Infinity;
    let x2 = -Infinity;
    for (let c = c1; c <= c2; c++) {
      if (!colX.has(c)) continue;
      x1 = Math.min(x1, colX.get(c)!);
      x2 = Math.max(x2, colX.get(c)! + sheet.colWidth(c));
    }
    return x1 === Infinity ? null : [x1, x2];
  };
  const spanY = (r1: number, r2: number) => {
    let y1 = Infinity;
    let y2 = -Infinity;
    for (let r = r1; r <= r2; r++) {
      if (!rowY.has(r)) continue;
      y1 = Math.min(y1, rowY.get(r)!);
      y2 = Math.max(y2, rowY.get(r)! + (ctx.rowH.get(r) ?? 0));
    }
    return y1 === Infinity ? null : [y1, y2];
  };

  // 1. Fills
  const drawnMerges = new Set<Merge>();
  for (const r of rows) {
    for (const c of cols) {
      const m = mergeAt(r, c);
      if (m) {
        if (drawnMerges.has(m)) continue;
        drawnMerges.add(m);
        const xf = xfAt(m.r1, m.c1);
        const sx = spanX(m.c1, m.c2);
        const sy = spanY(m.r1, m.r2);
        if (xf?.fill && sx && sy) painter.fillRect(sx[0], sy[0], sx[1] - sx[0], sy[1] - sy[0], xf.fill);
        continue;
      }
      const xf = xfAt(r, c);
      if (xf?.fill) painter.fillRect(colX.get(c)!, rowY.get(r)!, sheet.colWidth(c), ctx.rowH.get(r) ?? 0, xf.fill);
    }
  }

  // 2. Gridlines
  if (pg.gridLines) {
    const g: Side = { style: "grid", color: "000000" };
    for (const c of cols) painter.line(colX.get(c)!, 0, colX.get(c)!, blockH, g);
    painter.line(blockW, 0, blockW, blockH, g);
    for (const r of rows) painter.line(0, rowY.get(r)!, blockW, rowY.get(r)!, g);
    painter.line(0, blockH, blockW, blockH, g);
  }

  // 4. Text
  for (const r of rows) {
    const cells = sheet.rows.get(r);
    if (!cells) continue;
    for (const [c, cell] of cells) {
      if (!colSet.has(c)) continue;
      const m = mergeAt(r, c);
      if (m && (m.r1 !== r || m.c1 !== c)) continue;
      await drawCellText(painter, ctx, sheet, cell, r, c, m ?? null, cols, colX, rowY, colIndex, cellAt);
    }
  }
  // Merged areas whose top-left cell is on an earlier page still show their text.
  for (const m of sheet.merges) {
    if (drawnMerges.has(m) && !(rowSet.has(m.r1) && colSet.has(m.c1))) {
      const cell = cellAt(m.r1, m.c1);
      if (cell) await drawCellText(painter, ctx, sheet, cell, m.r1, m.c1, m, cols, colX, rowY, colIndex, cellAt);
    }
  }

  // 5. Borders (last, so fills don't cover them)
  const drawn = new Set<string>();
  for (const r of rows) {
    for (const c of cols) {
      const xf = xfAt(r, c);
      const b = xf?.border;
      if (!b) continue;
      const x1 = colX.get(c)!;
      const x2 = x1 + sheet.colWidth(c);
      const y1 = rowY.get(r)!;
      const y2 = y1 + (ctx.rowH.get(r) ?? 0);
      const m = mergeAt(r, c);
      const edge = (k: string, side: Side | undefined, a: [number, number, number, number]) => {
        if (!side || drawn.has(k)) return;
        drawn.add(k);
        painter.line(a[0], a[1], a[2], a[3], side);
      };
      // Inside a merged area only its outer edges are drawn.
      if (!m || c === m.c1) edge(`v${r}:${c}`, b.left, [x1, y1, x1, y2]);
      if (!m || c === m.c2) edge(`v${r}:${c + 1}`, b.right, [x2, y1, x2, y2]);
      if (!m || r === m.r1) edge(`h${r}:${c}`, b.top, [x1, y1, x2, y1]);
      if (!m || r === m.r2) edge(`h${r + 1}:${c}`, b.bottom, [x1, y2, x2, y2]);
    }
  }

  // 5b. Pictures, on top of the cells as in Excel
  for (const p of sheet.pictures) {
    const at = (a: { c: number; cOff: number; r: number; rOff: number }) => {
      const c = a.c + 1;
      const r = a.r + 1;
      // Offsets from the page's own columns; pictures outside the page are skipped.
      let px = 0;
      for (const cc of cols) if (cc < c) px += sheet.colWidth(cc);
      let py = 0;
      for (const rr of rows) if (rr < r) py += ctx.rowH.get(rr) ?? 0;
      return { x: px + a.cOff / EMU, y: py + a.rOff / EMU, inCols: colSet.has(c), inRows: rowSet.has(r) };
    };
    const a = at(p.from);
    if (!a.inCols || !a.inRows) continue;
    let w = (p.ext?.cx ?? 0) / EMU;
    let h = (p.ext?.cy ?? 0) / EMU;
    if (p.to) {
      const b = at(p.to);
      if (b.inCols && b.inRows) {
        w = b.x - a.x;
        h = b.y - a.y;
      }
    }
    if (w <= 0 || h <= 0) continue;
    if (!ctx.images.has(p)) ctx.images.set(p, (p.png ? pdf.embedPng(p.img) : pdf.embedJpg(p.img)).catch(() => null));
    const img = await ctx.images.get(p)!;
    if (img) await painter.image(img, a.x, a.y, w, h);
  }

  // 6. Header and footer
  const vars: Record<string, string> = {
    P: String(plan.number),
    N: String(total),
    A: sheet.name,
    F: fileName,
    Z: "",
    D: new Date().toLocaleDateString(),
    T: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    G: "",
  };
  const useFirst = sheet.hf.differentFirst && firstOfSheet;
  const hs = sheet.hf.scaleWithDoc ? s : 1;
  const base = { ...ctx.normal, color: null, underline: null, strike: false, vertAlign: null };
  const hfPainter = new SheetPainter(ctx, page, hs, 0, 0, colX, rowY);
  for (const [src, isHeader] of [
    [useFirst ? sheet.hf.firstHeader : sheet.hf.header, true],
    [useFirst ? sheet.hf.firstFooter : sheet.hf.footer, false],
  ] as const) {
    const parts = parseHf(src, base, vars);
    for (const key of ["L", "C", "R"] as const) {
      const runs = parts[key].runs.filter((r) => r.text);
      if (!runs.length) continue;
      // Lines split at line breaks inside a section.
      const lines: Run[][] = [[]];
      for (const run of runs) {
        const chunks = run.text.split("\n");
        chunks.forEach((t, i) => {
          if (i > 0) lines.push([]);
          if (t) lines[lines.length - 1].push({ text: t, font: run.font });
        });
      }
      const boxes = await Promise.all(lines.map((l) => runsBox(l.length ? l : [{ text: " ", font: base }], ctx.metrics, ctx.dpi)));
      // Measured: a header's first baseline is its ascent + 1 pt below the
      // header margin; a footer's last is its descent + 1.83 pt above the
      // footer margin; lines are one font row-height apart.
      const lineH = boxes.map((b) => b.line);
      const n = lines.length;
      for (let i = 0; i < n; i++) {
        const line = lines[i];
        const w = await runsWidth(line, ctx.metrics);
        const left = pg.margins.l / hs + 0.96;
        const right = (pg.width - pg.margins.r) / hs - 0.86;
        const lx = key === "L" ? left : key === "R" ? right - w : pg.width / hs / 2 - w / 2;
        const baseline = isHeader
          ? pg.margins.header / hs + boxes[0].asc + 1 + lineH.slice(0, i).reduce((a, b) => a + b, 0)
          : (pg.height - pg.margins.footer) / hs - boxes[n - 1].desc - 1.83 - lineH.slice(i + 1).reduce((a, b) => a + b, 0);
        await hfPainter.text(line, lx, baseline);
      }
    }
  }
}

async function drawCellText(
  painter: SheetPainter,
  ctx: Ctx,
  sheet: SheetModel,
  cell: Cell,
  r: number,
  c: number,
  m: Merge | null,
  cols: number[],
  colX: Map<number, number>,
  rowY: Map<number, number>,
  colIndex: Map<number, number>,
  cellAt: (r: number, c: number) => Cell | undefined
) {
  let text = formatValue(cell, ctx.date1904);
  if (!text) return;
  const xf = cell.xf;
  const al = xf.align;
  const font = xf.font;
  // Cell rectangle (merged areas span several cells).
  const c2 = m ? m.c2 : c;
  const r2 = m ? m.r2 : r;
  let x1 = Infinity;
  let x2 = -Infinity;
  for (let k = c; k <= c2; k++) {
    if (!colX.has(k)) continue;
    x1 = Math.min(x1, colX.get(k)!);
    x2 = Math.max(x2, colX.get(k)! + sheet.colWidth(k));
  }
  let y1 = Infinity;
  let y2 = -Infinity;
  for (let k = r; k <= r2; k++) {
    if (!rowY.has(k)) continue;
    y1 = Math.min(y1, rowY.get(k)!);
    y2 = Math.max(y2, rowY.get(k)! + (ctx.rowH.get(k) ?? 0));
  }
  if (x1 === Infinity || y1 === Infinity) return;

  const isNum = cell.kind === "n";
  let h = al.h;
  if (h === "general") h = isNum ? "right" : cell.kind === "b" || cell.kind === "e" ? "center" : "left";
  if (h === "fill" || h === "justify" || h === "distributed") h = h === "fill" ? "left" : "left";
  if (h === "centerContinuous") h = "center";
  const padL = pad(font.size);
  const indent = al.indent * 3 * ctx.metrics.width(await ctx.metrics.get(ctx.normal), " ", snap(ctx.normal.size));
  let runs = cellRuns(cell, text);
  const fmtColor = isNum && typeof cell.value === "number" ? sectionColor(xf.numFmt, cell.value) : null;
  if (fmtColor) runs = runs.map((rr) => ({ ...rr, font: { ...rr.font, color: fmtColor } }));
  let width = await runsWidth(runs, ctx.metrics);
  const room = x2 - x1 - padL - PAD_R - indent;

  // Numbers that don't fit: fewer digits for General, else ####.
  if (isNum && !al.wrap && width > room + 0.01) {
    const rf = await ctx.metrics.get(font);
    const size = snap(font.size);
    const fits = (t: string) => ctx.metrics.width(rf, t, size) <= room + 0.01;
    const general = xf.numFmt === "0" || xf.numFmt === "General";
    let shown = general && typeof cell.value === "number" ? fitGeneral(cell.value, fits) : null;
    if (!shown) {
      const hashW = ctx.metrics.width(rf, "#", size) || 1;
      shown = "#".repeat(Math.max(1, Math.floor(room / hashW)));
    }
    text = shown;
    runs = [{ text, font: fmtColor ? { ...font, color: fmtColor } : font }];
    width = await runsWidth(runs, ctx.metrics);
  }

  // Shrink to fit.
  if (al.shrink && !al.wrap && width > room && width > 0) {
    const k = room / width;
    runs = runs.map((rr) => ({ ...rr, font: { ...rr.font, size: rr.font.size * k } }));
    width = await runsWidth(runs, ctx.metrics);
  }

  let lines: Run[][] = [runs];
  if (al.wrap) lines = await wrapRuns(runs, Math.max(1, x2 - x1 - padL - PAD_R - indent), ctx.metrics);
  else if (text.includes("\n")) lines = [runs.map((rr) => ({ ...rr, text: rr.text.split("\n")[0] }))];

  const boxes = await Promise.all(lines.map((l) => runsBox(l.length ? l : [{ text: " ", font }], ctx.metrics, ctx.dpi)));
  const pitch = boxes.map((b) => b.line);
  const blockH = pitch.reduce((a, b) => a + b, 0);

  // Where text may spill: into empty neighbours in the same row (not for
  // wrapped, merged, or number cells).
  let clipX1 = x1;
  let clipX2 = x2;
  if (!al.wrap && !m && !isNum && width > room) {
    const idx = colIndex.get(c)!;
    const free = (k: number) => {
      const col = cols[k];
      const other = cellAt(r, col);
      return other == null || (other.kind === "blank" && !other.formulaOnly);
    };
    if (h === "left" || h === "center") for (let k = idx + 1; k < cols.length && free(k); k++) clipX2 = colX.get(cols[k])! + sheet.colWidth(cols[k]);
    if (h === "right" || h === "center") for (let k = idx - 1; k >= 0 && free(k); k--) clipX1 = colX.get(cols[k])!;
  }

  // Baselines (measured against Excel): top-aligned text sits its ascent plus
  // 0.53 pt below the row top, bottom-aligned its descent plus 0.87 pt above
  // the bottom, centred text (ascent - descent) / 2 below the middle; wrapped
  // lines are one font row-height apart.
  const v = al.v;
  const n = lines.length;
  const last = boxes[n - 1];
  const baselines: number[] = [];
  for (let i = 0; i < n; i++) {
    const before = pitch.slice(0, i).reduce((a, b) => a + b, 0);
    const after = pitch.slice(i + 1).reduce((a, b) => a + b, 0);
    if (v === "top" || v === "justify" || v === "distributed") baselines.push(y1 + boxes[0].asc + 0.53 + before);
    else if (v === "center") baselines.push((y1 + y2) / 2 - blockH / 2 + pitch[0] / 2 + (boxes[0].asc - boxes[0].desc) / 2 + before);
    else baselines.push(y2 - last.desc - 0.87 - after);
  }
  painter.clip(clipX1, y1, clipX2 - clipX1, y2 - y1);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lw = await runsWidth(line, ctx.metrics);
    let lx: number;
    if (h === "right") lx = x2 - PAD_R - lw - indent;
    else if (h === "center") lx = (x1 + x2) / 2 - lw / 2 + 0.3;
    else lx = x1 + padL + indent;
    const baseline = baselines[i];
    const rot = al.rotation;
    if (rot && rot !== 255) {
      // Turned text: 1-90 counter-clockwise, 91-180 clockwise. The run's
      // length now lies along the cell's height.
      const deg = rot <= 90 ? rot : -(rot - 90);
      const a = (Math.abs(deg) * Math.PI) / 180;
      const { asc, desc } = boxes[i];
      const across = asc * Math.sin(a) + desc * Math.sin(a);
      let ox = x1 + padL + (deg > 0 ? asc : desc) * Math.sin(a);
      if (h === "center") ox = (x1 + x2) / 2 - across / 2 + (deg > 0 ? asc : desc) * Math.sin(a);
      else if (h === "right") ox = x2 - PAD_R - (deg > 0 ? desc : asc) * Math.sin(a);
      const along = lw * Math.sin(a);
      let oy: number;
      if (deg > 0) {
        oy = v === "top" ? y1 + 0.53 + along : v === "center" ? (y1 + y2) / 2 + along / 2 : y2 - 0.87;
        oy -= (deg < 90 ? desc * Math.cos(a) : 0);
      } else {
        oy = v === "bottom" || v === "general" ? y2 - 0.87 - along : v === "center" ? (y1 + y2) / 2 - along / 2 : y1 + 0.53;
        oy += asc * Math.cos(a);
      }
      await painter.text(line, ox, oy, deg);
    } else if (rot === 255) {
      // Stacked letters.
      let yy = y1 + 0.5 + boxes[i].asc;
      for (const rr of line) {
        for (const ch of Array.from(rr.text)) {
          const cw = await runsWidth([{ text: ch, font: rr.font }], ctx.metrics);
          await painter.text([{ text: ch, font: rr.font }], (x1 + x2) / 2 - cw / 2, yy);
          yy += boxes[i].line;
        }
      }
    } else await painter.text(line, lx, baseline);
  }
  painter.unclip();
}
