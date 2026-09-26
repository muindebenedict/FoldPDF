// PowerPoint (.pptx) → PDF, entirely in the browser.
//
// A small slide renderer: it reads the slide, its layout, master and theme,
// and draws backgrounds, shapes, pictures, tables and text straight into a
// PDF with pdf-lib. Text is real (selectable) text, set in fonts with the same
// character widths as the Office fonts (Carlito for Calibri, Liberation for
// Arial/Times/Courier...), so lines break where PowerPoint breaks them.
//
// Not covered: charts, embedded video/audio, EMF/WMF clip art, 3-D effects,
// shadows and vertical text. Those are skipped rather than drawn wrongly.

import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  StandardFonts,
  concatTransformationMatrix,
  degrees,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setCharacterSpacing,
  setCharacterSqueeze,
  clip,
  endPath,
  moveTo,
  lineTo,
  closePath,
  appendBezierCurve,
} from "@cantoo/pdf-lib";
import { getFontkit, getJSZip } from "../../components/tools/PdfScriptLoader";
import { metricFontBytes } from "../fonts/metricFonts";
import { isMetafile, metafileToPng } from "../image/metafile";

type Progress = (pct: number, msg: string) => void;

const EMU = 12700; // EMU per point
const pt = (emu: string | number | null | undefined, dflt = 0) => (emu == null || emu === "" ? dflt : Number(emu) / EMU);

// ─── XML helpers ────────────────────────────────────────────────────────────

type El = Element;
const kids = (el: El | null | undefined, name: string): El[] =>
  el ? Array.from(el.children).filter((c) => c.localName === name) : [];
const kid = (el: El | null | undefined, name: string): El | null =>
  el ? Array.from(el.children).find((c) => c.localName === name) || null : null;
const path = (el: El | null | undefined, ...names: string[]): El | null => {
  let cur: El | null = el || null;
  for (const n of names) cur = kid(cur, n);
  return cur;
};
const attr = (el: El | null | undefined, name: string): string | null => (el ? el.getAttribute(name) : null);
const num = (el: El | null | undefined, name: string, dflt: number): number => {
  const v = attr(el, name);
  return v == null || v === "" ? dflt : Number(v);
};

class Package {
  private cache = new Map<string, Promise<Document | null>>();
  constructor(public zip: any) {}

  async xml(p: string): Promise<Document | null> {
    if (!this.cache.has(p)) {
      this.cache.set(
        p,
        (async () => {
          const f = this.zip.file(p);
          if (!f) return null;
          return new DOMParser().parseFromString(await f.async("string"), "application/xml");
        })()
      );
    }
    return this.cache.get(p)!;
  }

  async rels(p: string): Promise<Map<string, { target: string; type: string }>> {
    const dir = p.substring(0, p.lastIndexOf("/"));
    const file = p.substring(p.lastIndexOf("/") + 1);
    const doc = await this.xml(`${dir}/_rels/${file}.rels`);
    const map = new Map<string, { target: string; type: string }>();
    if (!doc) return map;
    for (const r of Array.from(doc.getElementsByTagName("Relationship"))) {
      const target = r.getAttribute("Target") || "";
      const mode = r.getAttribute("TargetMode");
      map.set(r.getAttribute("Id") || "", {
        target: mode === "External" ? target : resolvePath(dir, target),
        type: (r.getAttribute("Type") || "").split("/").pop() || "",
      });
    }
    return map;
  }

  async bytes(p: string): Promise<Uint8Array | null> {
    const f = this.zip.file(p);
    return f ? f.async("uint8array") : null;
  }
}

function resolvePath(dir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = dir.split("/").filter(Boolean);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

// ─── Colours ────────────────────────────────────────────────────────────────

interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

const PRESET_COLORS: Record<string, string> = {
  black: "000000", white: "FFFFFF", red: "FF0000", green: "008000", blue: "0000FF", yellow: "FFFF00",
  gray: "808080", grey: "808080", darkGray: "A9A9A9", lightGray: "D3D3D3", orange: "FFA500", purple: "800080",
  navy: "000080", maroon: "800000", teal: "008080", silver: "C0C0C0", cyan: "00FFFF", magenta: "FF00FF",
};

function hexToColor(hex: string): Color {
  const h = hex.replace("#", "").padStart(6, "0");
  return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255, a: 1 };
}

function toHsl(c: Color) {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === c.r ? (c.g - c.b) / d + (c.g < c.b ? 6 : 0) : max === c.g ? (c.b - c.r) / d + 2 : (c.r - c.g) / d + 4;
    h /= 6;
  }
  return { h, s, l };
}

function fromHsl(h: number, s: number, l: number, a: number): Color {
  if (s === 0) return { r: l, g: l, b: l, a };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: f(h + 1 / 3), g: f(h), b: f(h - 1 / 3), a };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// ─── Theme and slide context ────────────────────────────────────────────────

interface Theme {
  colors: Record<string, string>;
  major: string;
  minor: string;
  fillStyles: El[];
  lineStyles: El[];
  bgFillStyles: El[];
}

interface Ctx {
  pkg: Package;
  theme: Theme;
  clrMap: Record<string, string>;
  slideNumber: number;
  // Placeholder colour for style references (phClr).
  phClr?: Color;
}

async function readTheme(pkg: Package, themePath: string): Promise<Theme> {
  const doc = await pkg.xml(themePath);
  const te = doc?.documentElement;
  const elements = path(te, "themeElements");
  const colors: Record<string, string> = {};
  for (const c of Array.from(path(elements, "clrScheme")?.children || [])) {
    const v = kid(c, "srgbClr");
    const sys = kid(c, "sysClr");
    colors[c.localName] = attr(v, "val") || attr(sys, "lastClr") || "000000";
  }
  const fonts = path(elements, "fontScheme");
  const fmt = path(elements, "fmtScheme");
  return {
    colors,
    major: attr(path(fonts, "majorFont", "latin"), "typeface") || "Calibri Light",
    minor: attr(path(fonts, "minorFont", "latin"), "typeface") || "Calibri",
    fillStyles: Array.from(path(fmt, "fillStyleLst")?.children || []),
    lineStyles: Array.from(path(fmt, "lnStyleLst")?.children || []),
    bgFillStyles: Array.from(path(fmt, "bgFillStyleLst")?.children || []),
  };
}

// Resolves any DrawingML colour element (or the first colour inside `el`).
function color(el: El | null, ctx: Ctx): Color | null {
  if (!el) return null;
  const COLOR_TAGS = ["srgbClr", "schemeClr", "sysClr", "prstClr", "scrgbClr", "hslClr"];
  const c = COLOR_TAGS.includes(el.localName) ? el : Array.from(el.children).find((x) => COLOR_TAGS.includes(x.localName));
  if (!c) return null;
  let base: Color;
  switch (c.localName) {
    case "srgbClr":
      base = hexToColor(attr(c, "val") || "000000");
      break;
    case "sysClr":
      base = hexToColor(attr(c, "lastClr") || (attr(c, "val") === "window" ? "FFFFFF" : "000000"));
      break;
    case "prstClr":
      base = hexToColor(PRESET_COLORS[attr(c, "val") || ""] || "000000");
      break;
    case "scrgbClr":
      base = { r: num(c, "r", 0) / 100000, g: num(c, "g", 0) / 100000, b: num(c, "b", 0) / 100000, a: 1 };
      break;
    case "hslClr":
      base = fromHsl(num(c, "hue", 0) / 21600000, num(c, "sat", 0) / 100000, num(c, "lum", 0) / 100000, 1);
      break;
    default: {
      let key = attr(c, "val") || "tx1";
      if (key === "phClr") {
        base = ctx.phClr ? { ...ctx.phClr } : hexToColor("000000");
        break;
      }
      key = ctx.clrMap[key] || key;
      base = hexToColor(ctx.theme.colors[key] || "000000");
    }
  }
  // Colour modifiers, applied in document order.
  let { h, s, l } = toHsl(base);
  let out = base;
  let hslDirty = false;
  for (const m of Array.from(c.children)) {
    const v = num(m, "val", 100000) / 100000;
    switch (m.localName) {
      case "alpha":
        out = { ...out, a: v };
        break;
      case "lumMod":
        l *= v;
        hslDirty = true;
        break;
      case "lumOff":
        l += v;
        hslDirty = true;
        break;
      case "satMod":
        s *= v;
        hslDirty = true;
        break;
      case "tint":
        if (hslDirty) out = fromHsl(h, clamp01(s), clamp01(l), out.a), (hslDirty = false);
        out = { r: 1 - (1 - out.r) * v, g: 1 - (1 - out.g) * v, b: 1 - (1 - out.b) * v, a: out.a };
        ({ h, s, l } = toHsl(out));
        break;
      case "shade":
        if (hslDirty) out = fromHsl(h, clamp01(s), clamp01(l), out.a), (hslDirty = false);
        out = { r: out.r * v, g: out.g * v, b: out.b * v, a: out.a };
        ({ h, s, l } = toHsl(out));
        break;
    }
  }
  if (hslDirty) out = fromHsl(h, clamp01(s), clamp01(l), out.a);
  return out;
}

const pdfColor = (c: Color) => rgb(clamp01(c.r), clamp01(c.g), clamp01(c.b));

// ─── Geometry ───────────────────────────────────────────────────────────────

// Affine matrix [a b c d e f]: x' = a x + c y + e, y' = b x + d y + f
type M = [number, number, number, number, number, number];
const I: M = [1, 0, 0, 1, 0, 0];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4],
  m[4] * n[1] + m[5] * n[3] + n[5],
];
const apply = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

interface Xfrm {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number; // degrees clockwise
  flipH: boolean;
  flipV: boolean;
}

function readXfrm(el: El | null): Xfrm | null {
  if (!el) return null;
  const off = kid(el, "off");
  const ext = kid(el, "ext");
  if (!off || !ext) return null;
  return {
    x: pt(attr(off, "x")),
    y: pt(attr(off, "y")),
    w: pt(attr(ext, "cx")),
    h: pt(attr(ext, "cy")),
    rot: num(el, "rot", 0) / 60000,
    flipH: attr(el, "flipH") === "1",
    flipV: attr(el, "flipV") === "1",
  };
}

// Matrix from a shape's local box (0..w, 0..h, y down) to its parent space.
function shapeMatrix(x: Xfrm): M {
  const cx = x.w / 2;
  const cy = x.h / 2;
  let m: M = [1, 0, 0, 1, -cx, -cy];
  if (x.flipH) m = mul(m, [-1, 0, 0, 1, 0, 0]);
  if (x.flipV) m = mul(m, [1, 0, 0, -1, 0, 0]);
  if (x.rot) {
    const r = (x.rot * Math.PI) / 180;
    m = mul(m, [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]);
  }
  return mul(m, [1, 0, 0, 1, x.x + cx, x.y + cy]);
}

// A path in local coordinates: M/L/C/Z commands.
type Cmd = ["M", number, number] | ["L", number, number] | ["C", number, number, number, number, number, number] | ["Z"];

function ellipseCmds(cx: number, cy: number, rx: number, ry: number): Cmd[] {
  const k = 0.5522847498;
  return [
    ["M", cx + rx, cy],
    ["C", cx + rx, cy + ry * k, cx + rx * k, cy + ry, cx, cy + ry],
    ["C", cx - rx * k, cy + ry, cx - rx, cy + ry * k, cx - rx, cy],
    ["C", cx - rx, cy - ry * k, cx - rx * k, cy - ry, cx, cy - ry],
    ["C", cx + rx * k, cy - ry, cx + rx, cy - ry * k, cx + rx, cy],
    ["Z"],
  ];
}

// Appends an elliptical arc (DrawingML arcTo) as cubic Béziers.
function arcCmds(cur: [number, number], wR: number, hR: number, stAng: number, swAng: number): { cmds: Cmd[]; end: [number, number] } {
  const st = (stAng * Math.PI) / 180;
  const sw = (swAng * Math.PI) / 180;
  const cx = cur[0] - wR * Math.cos(st);
  const cy = cur[1] - hR * Math.sin(st);
  const segs = Math.max(1, Math.ceil(Math.abs(sw) / (Math.PI / 2)));
  const d = sw / segs;
  const cmds: Cmd[] = [];
  let a = st;
  for (let i = 0; i < segs; i++) {
    const k = (4 / 3) * Math.tan(d / 4);
    const x1 = cx + wR * (Math.cos(a) - k * Math.sin(a));
    const y1 = cy + hR * (Math.sin(a) + k * Math.cos(a));
    const a2 = a + d;
    const x2 = cx + wR * (Math.cos(a2) + k * Math.sin(a2));
    const y2 = cy + hR * (Math.sin(a2) - k * Math.cos(a2));
    cmds.push(["C", x1, y1, x2, y2, cx + wR * Math.cos(a2), cy + hR * Math.sin(a2)]);
    a = a2;
  }
  return { cmds, end: [cx + wR * Math.cos(st + sw), cy + hR * Math.sin(st + sw)] };
}

function adjValues(prstGeom: El | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const gd of kids(path(prstGeom, "avLst"), "gd")) {
    const m = (attr(gd, "fmla") || "").match(/val\s+(-?\d+)/);
    if (m) out[attr(gd, "name") || ""] = Number(m[1]);
  }
  return out;
}

const poly = (...pts: [number, number][]): Cmd[] => [["M", ...pts[0]], ...pts.slice(1).map((p) => ["L", ...p] as Cmd), ["Z"]];

// Outline of a preset shape in its local box. Unknown presets fall back to
// a rectangle only when the shape has a visible fill or line.
function presetCmds(prst: string, w: number, h: number, adj: Record<string, number>): Cmd[] | null {
  const ss = Math.min(w, h);
  const a = (name: string, dflt: number) => (adj[name] ?? dflt) / 100000;
  switch (prst) {
    case "rect":
    case "flowChartProcess":
    case "flowChartAlternateProcess":
      if (prst === "flowChartAlternateProcess") return presetCmds("roundRect", w, h, { adj: 16667 });
      return poly([0, 0], [w, 0], [w, h], [0, h]);
    case "roundRect": {
      const r = ss * a("adj", 16667);
      const k = 0.5522847498 * r;
      return [
        ["M", r, 0], ["L", w - r, 0], ["C", w - r + k, 0, w, r - k, w, r], ["L", w, h - r],
        ["C", w, h - r + k, w - r + k, h, w - r, h], ["L", r, h], ["C", r - k, h, 0, h - r + k, 0, h - r],
        ["L", 0, r], ["C", 0, r - k, r - k, 0, r, 0], ["Z"],
      ];
    }
    case "flowChartTerminator":
      return presetCmds("roundRect", w, h, { adj: 50000 });
    case "ellipse":
    case "flowChartConnector":
      return ellipseCmds(w / 2, h / 2, w / 2, h / 2);
    case "line":
    case "straightConnector1":
    case "bentConnector1":
      return [["M", 0, 0], ["L", w, h]];
    case "triangle": {
      const x = w * a("adj", 50000);
      return poly([x, 0], [w, h], [0, h]);
    }
    case "rtTriangle":
      return poly([0, 0], [w, h], [0, h]);
    case "diamond":
    case "flowChartDecision":
      return poly([w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]);
    case "parallelogram": {
      const x = ss * a("adj", 25000);
      return poly([x, 0], [w, 0], [w - x, h], [0, h]);
    }
    case "trapezoid": {
      const x = ss * a("adj", 25000);
      return poly([x, 0], [w - x, 0], [w, h], [0, h]);
    }
    case "pentagon":
    case "homePlate": {
      if (prst === "homePlate") {
        const x = w - ss * a("adj", 50000);
        return poly([0, 0], [x, 0], [w, h / 2], [x, h], [0, h]);
      }
      return poly([w / 2, 0], [w, h * 0.38], [w * 0.81, h], [w * 0.19, h], [0, h * 0.38]);
    }
    case "chevron": {
      const x = ss * a("adj", 50000);
      return poly([0, 0], [w - x, 0], [w, h / 2], [w - x, h], [0, h], [x, h / 2]);
    }
    case "hexagon": {
      const x = ss * a("adj", 25000);
      return poly([x, 0], [w - x, 0], [w, h / 2], [w - x, h], [x, h], [0, h / 2]);
    }
    case "octagon": {
      const x = ss * a("adj", 29289);
      return poly([x, 0], [w - x, 0], [w, x], [w, h - x], [w - x, h], [x, h], [0, h - x], [0, x]);
    }
    case "plus": {
      const x = ss * a("adj", 25000);
      return poly([x, 0], [w - x, 0], [w - x, x], [w, x], [w, h - x], [w - x, h - x], [w - x, h], [x, h], [x, h - x], [0, h - x], [0, x], [x, x]);
    }
    case "rightArrow": {
      const sh = h * a("adj1", 50000);
      const hd = ss * a("adj2", 50000);
      return poly([0, (h - sh) / 2], [w - hd, (h - sh) / 2], [w - hd, 0], [w, h / 2], [w - hd, h], [w - hd, (h + sh) / 2], [0, (h + sh) / 2]);
    }
    case "leftArrow": {
      const sh = h * a("adj1", 50000);
      const hd = ss * a("adj2", 50000);
      return poly([w, (h - sh) / 2], [hd, (h - sh) / 2], [hd, 0], [0, h / 2], [hd, h], [hd, (h + sh) / 2], [w, (h + sh) / 2]);
    }
    case "downArrow": {
      const sw = w * a("adj1", 50000);
      const hd = ss * a("adj2", 50000);
      return poly([(w - sw) / 2, 0], [(w + sw) / 2, 0], [(w + sw) / 2, h - hd], [w, h - hd], [w / 2, h], [0, h - hd], [(w - sw) / 2, h - hd]);
    }
    case "upArrow": {
      const sw = w * a("adj1", 50000);
      const hd = ss * a("adj2", 50000);
      return poly([(w - sw) / 2, h], [(w + sw) / 2, h], [(w + sw) / 2, hd], [w, hd], [w / 2, 0], [0, hd], [(w - sw) / 2, hd]);
    }
    case "star5": {
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 0.5 : 0.19;
        const ang = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push([w / 2 + r * w * Math.cos(ang) * 1.0, h * 0.53 + r * h * Math.sin(ang) * 1.05]);
      }
      return poly(...pts);
    }
    case "snip1Rect": {
      const x = ss * a("adj", 16667);
      return poly([0, 0], [w - x, 0], [w, x], [w, h], [0, h]);
    }
    case "round2SameRect": {
      const r = ss * a("adj1", 16667);
      const k = 0.5522847498 * r;
      return [
        ["M", r, 0], ["L", w - r, 0], ["C", w - r + k, 0, w, r - k, w, r], ["L", w, h], ["L", 0, h], ["L", 0, r],
        ["C", 0, r - k, r - k, 0, r, 0], ["Z"],
      ];
    }
    case "textNoShape":
      return null;
    default:
      return undefined as any;
  }
}

// Custom geometry (a:custGeom) with numeric points.
function custCmds(geom: El, w: number, h: number): Cmd[] {
  const cmds: Cmd[] = [];
  for (const p of kids(path(geom, "pathLst"), "path")) {
    const pw = num(p, "w", 0) || w;
    const ph = num(p, "h", 0) || h;
    const sx = pw ? w / pw : 1;
    const sy = ph ? h / ph : 1;
    const P = (e: El | null): [number, number] => [num(e, "x", 0) * sx, num(e, "y", 0) * sy];
    let cur: [number, number] = [0, 0];
    for (const c of Array.from(p.children)) {
      const pts = kids(c, "pt");
      switch (c.localName) {
        case "moveTo":
          cur = P(pts[0]);
          cmds.push(["M", ...cur]);
          break;
        case "lnTo":
          cur = P(pts[0]);
          cmds.push(["L", ...cur]);
          break;
        case "cubicBezTo": {
          const [a, b, d] = pts.map(P);
          cmds.push(["C", ...a, ...b, ...d]);
          cur = d;
          break;
        }
        case "quadBezTo": {
          const [q, d] = pts.map(P);
          cmds.push(["C", cur[0] + (2 / 3) * (q[0] - cur[0]), cur[1] + (2 / 3) * (q[1] - cur[1]), d[0] + (2 / 3) * (q[0] - d[0]), d[1] + (2 / 3) * (q[1] - d[1]), ...d]);
          cur = d;
          break;
        }
        case "arcTo": {
          const r = arcCmds(cur, num(c, "wR", 0) * sx, num(c, "hR", 0) * sy, num(c, "stAng", 0) / 60000, num(c, "swAng", 0) / 60000);
          cmds.push(...r.cmds);
          cur = r.end;
          break;
        }
        case "close":
          cmds.push(["Z"]);
          break;
      }
    }
  }
  return cmds;
}

function toSvg(cmds: Cmd[], m: M): string {
  return cmds
    .map((c) => {
      if (c[0] === "Z") return "Z";
      const out: string[] = [c[0]];
      for (let i = 1; i < c.length; i += 2) {
        const [x, y] = apply(m, c[i] as number, c[i + 1] as number);
        out.push(`${x.toFixed(3)} ${y.toFixed(3)}`);
      }
      return out.join(" ");
    })
    .join(" ");
}

// ─── Fonts ──────────────────────────────────────────────────────────────────

const SERIF = /times|serif|garamond|georgia|cambria|book|palatino|century schoolbook|constantia|baskerville|caslon|didot|bodoni|rockwell/i;
const MONO = /courier|consolas|mono|lucida console|menlo/i;

class Fonts {
  private cache = new Map<string, Promise<PDFFont>>();
  constructor(private doc: PDFDocument) {}

  // Maps an Office font to the metric-compatible open font used to draw it.
  private target(family: string): string {
    const f = family.toLowerCase();
    if (/^calibri/.test(f) || f === "aptos" || f === "carlito") return "Calibri";
    if (/^cambria/.test(f)) return "Cambria";
    if (/^arial|helvetica|liberation sans|segoe|tahoma|verdana|trebuchet|gill sans|franklin|century gothic|open sans|roboto|lato/.test(f)) return "Arial";
    if (MONO.test(f)) return "Courier New";
    if (SERIF.test(f)) return "Times New Roman";
    return "Arial";
  }

  get(family: string, bold: boolean, italic: boolean): Promise<PDFFont> {
    const t = this.target(family);
    // Heavy families ("Arial Black") have no open twin; bold is the closest.
    if (/black|heavy|extrabold|ultra/i.test(family)) bold = true;
    const key = `${t}|${bold}|${italic}`;
    if (!this.cache.has(key)) {
      this.cache.set(
        key,
        (async () => {
          try {
            const bytes = await metricFontBytes(t, bold, italic);
            if (bytes) return await this.doc.embedFont(bytes, { subset: true });
          } catch {
            // fall through to a standard font
          }
          const std = bold && italic ? StandardFonts.HelveticaBoldOblique : bold ? StandardFonts.HelveticaBold : italic ? StandardFonts.HelveticaOblique : StandardFonts.Helvetica;
          return this.doc.embedFont(std);
        })()
      );
    }
    return this.cache.get(key)!;
  }
}

// ─── Text properties and inheritance ────────────────────────────────────────

interface RunProps {
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: Color | null;
  font: string;
  baseline: number; // superscript/subscript, percent
  caps: boolean;
  spacing: number; // points
}

interface ParaProps {
  align: string;
  marL: number;
  indent: number;
  lnSpcPct: number | null;
  lnSpcPts: number | null;
  spcBef: { pct?: number; pts?: number };
  spcAft: { pct?: number; pts?: number };
  bullet: { kind: "none" | "char" | "num"; char?: string; font?: string; color?: Color | null; sizePct?: number; scheme?: string; startAt?: number };
  run: RunProps;
}

function defaultPara(): ParaProps {
  return {
    align: "l",
    marL: 0,
    indent: 0,
    lnSpcPct: 1,
    lnSpcPts: null,
    spcBef: { pts: 0 },
    spcAft: { pts: 0 },
    bullet: { kind: "none" },
    run: { size: 18, bold: false, italic: false, underline: false, strike: false, color: null, font: "+mn-lt", baseline: 0, caps: false, spacing: 0 },
  };
}

function applyRun(rp: El | null, base: RunProps, ctx: Ctx): RunProps {
  if (!rp) return base;
  const r = { ...base };
  const sz = attr(rp, "sz");
  if (sz) r.size = Number(sz) / 100;
  const b = attr(rp, "b");
  if (b != null) r.bold = b === "1" || b === "true";
  const i = attr(rp, "i");
  if (i != null) r.italic = i === "1" || i === "true";
  const u = attr(rp, "u");
  if (u != null) r.underline = u !== "none";
  const st = attr(rp, "strike");
  if (st != null) r.strike = st !== "noStrike";
  const bl = attr(rp, "baseline");
  if (bl != null) r.baseline = Number(bl) / 1000;
  const cap = attr(rp, "cap");
  if (cap != null) r.caps = cap === "all";
  const spc = attr(rp, "spc");
  if (spc != null) r.spacing = Number(spc) / 100;
  const fill = kid(rp, "solidFill");
  if (fill) r.color = color(fill, ctx);
  else if (kid(rp, "noFill")) r.color = { r: 0, g: 0, b: 0, a: 0 };
  const latin = attr(kid(rp, "latin"), "typeface");
  if (latin) r.font = latin;
  return r;
}

function applyPara(pp: El | null, base: ParaProps, ctx: Ctx): ParaProps {
  if (!pp) return base;
  const p: ParaProps = { ...base, bullet: { ...base.bullet }, run: base.run };
  const algn = attr(pp, "algn");
  if (algn) p.align = algn;
  if (attr(pp, "marL") != null) p.marL = pt(attr(pp, "marL"));
  if (attr(pp, "indent") != null) p.indent = pt(attr(pp, "indent"));
  const ln = kid(pp, "lnSpc");
  if (ln) {
    const pct = kid(ln, "spcPct");
    const pts = kid(ln, "spcPts");
    if (pct) (p.lnSpcPct = num(pct, "val", 100000) / 100000), (p.lnSpcPts = null);
    if (pts) (p.lnSpcPts = num(pts, "val", 0) / 100), (p.lnSpcPct = null);
  }
  for (const [tag, key] of [["spcBef", "spcBef"], ["spcAft", "spcAft"]] as const) {
    const e = kid(pp, tag);
    if (!e) continue;
    const pct = kid(e, "spcPct");
    const pts = kid(e, "spcPts");
    p[key] = pct ? { pct: num(pct, "val", 0) / 100000 } : pts ? { pts: num(pts, "val", 0) / 100 } : p[key];
  }
  if (kid(pp, "buNone")) p.bullet = { kind: "none" };
  const buChar = kid(pp, "buChar");
  if (buChar) p.bullet = { ...p.bullet, kind: "char", char: attr(buChar, "char") || "•" };
  const buNum = kid(pp, "buAutoNum");
  if (buNum) p.bullet = { ...p.bullet, kind: "num", scheme: attr(buNum, "type") || "arabicPeriod", startAt: num(buNum, "startAt", 1) };
  const buFont = attr(kid(pp, "buFont"), "typeface");
  if (buFont) p.bullet.font = buFont;
  const buClr = kid(pp, "buClr");
  if (buClr) p.bullet.color = color(buClr, ctx);
  const buSz = kid(pp, "buSzPct");
  if (buSz) p.bullet.sizePct = num(buSz, "val", 100000) / 100000;
  p.run = applyRun(kid(pp, "defRPr"), p.run, ctx);
  return p;
}

// A list style (lstStyle / txStyles entry) applied at a paragraph level.
function applyLevel(list: El | null, lvl: number, base: ParaProps, ctx: Ctx): ParaProps {
  if (!list) return base;
  let p = base;
  const dflt = kid(list, "defPPr");
  if (dflt) p = applyPara(dflt, p, ctx);
  return applyPara(kid(list, `lvl${lvl + 1}pPr`), p, ctx);
}

// Bullets set in symbol fonts use ordinary letters that the font draws as
// shapes (Wingdings "l" is a filled circle). Map the common ones to Unicode.
// Keys are the character in the file; some decks store the symbol-font
// private-use form (U+F000 + code) instead of the plain letter.
const WINGDINGS: Record<string, string> = {
  l: "●", n: "■", q: "❑", u: "◆", v: "❖", w: "⬥", o: "□", p: "◻", "§": "▪", "¨": "□", "Ø": "➢", "ü": "✓", "ð": "➔", "à": "➔", "Ÿ": "•",
  "": "●", "": "■", "": "▪", "": "➢", "": "✓", "": "❖", "": "❑",
};
const SYMBOL: Record<string, string> = { "·": "•", "": "•", "Ø": "➢", o: "○", "§": "■" };
function symbolBullet(ch: string, font?: string): string {
  const f = (font || "").toLowerCase();
  if (f.startsWith("wingdings")) return WINGDINGS[ch] || "•";
  if (f === "symbol") return SYMBOL[ch] || "•";
  return ch;
}

function numberLabel(scheme: string, n: number): string {
  const roman = (v: number) => {
    const map: [number, string][] = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
    let s = "";
    for (const [k, r] of map) while (v >= k) (s += r), (v -= k);
    return s;
  };
  const alpha = (v: number) => {
    let s = "";
    while (v > 0) {
      v--;
      s = String.fromCharCode(97 + (v % 26)) + s;
      v = Math.floor(v / 26);
    }
    return s;
  };
  let core = String(n);
  if (/^alphaLc/.test(scheme)) core = alpha(n);
  else if (/^alphaUc/.test(scheme)) core = alpha(n).toUpperCase();
  else if (/^romanLc/.test(scheme)) core = roman(n);
  else if (/^romanUc/.test(scheme)) core = roman(n).toUpperCase();
  if (/ParenBoth$/.test(scheme)) return `(${core})`;
  if (/ParenR$/.test(scheme)) return `${core})`;
  if (/Period$/.test(scheme)) return `${core}.`;
  if (/Minus$/.test(scheme)) return `${core} -`;
  return `${core}.`;
}

// ─── Text layout ────────────────────────────────────────────────────────────

interface Piece {
  text: string;
  font: PDFFont;
  props: RunProps;
  width: number;
}

interface LaidLine {
  pieces: Piece[];
  width: number;
  ascent: number;
  descent: number;
  height: number; // baseline-to-baseline distance to the next line
  x: number; // left edge of text, relative to the text box
  spaceBefore: number;
  justify: boolean;
}

// Line height PowerPoint uses for "single" spacing, as a multiple of the font
// size (ascent + descent + line gap of the font).
const LINE_FACTOR = 1.2;

// Distance from a line's top to its baseline, as a multiple of the font size,
// for proportional spacing multiples (measured in PowerPoint 16; the same for
// Calibri, Arial, Times New Roman, Cambria and Arial Black).
const ASCENT_POINTS: [number, number][] = [[0.8, 0.722], [0.9, 0.82], [1.0, 0.938], [1.5, 1.354]];
function ascentRatio(m: number): number {
  const pts = ASCENT_POINTS;
  let i = 0;
  while (i < pts.length - 2 && m > pts[i + 1][0]) i++;
  const [[x0, y0], [x1, y1]] = [pts[i], pts[i + 1]];
  return y0 + ((m - x0) * (y1 - y0)) / (x1 - x0);
}

// Arial Black has no open twin; it is drawn as Liberation Sans Bold stretched
// to its width (1.15×, measured against PowerPoint's own output).
function hscale(family: string): number {
  return /^arial black$/i.test(family.trim()) ? 1.15 : 1;
}

function measure(font: PDFFont, text: string, props: RunProps): number {
  try {
    return font.widthOfTextAtSize(text, props.size) * hscale(props.font) + props.spacing * text.length;
  } catch {
    return props.size * 0.5 * text.length;
  }
}

// ─── Renderer ───────────────────────────────────────────────────────────────

interface Placeholder {
  type: string;
  idx: string | null;
  sp: El;
}

interface Level {
  path: string;
  doc: Document;
  root: El; // p:sld / p:sldLayout / p:sldMaster
  rels: Map<string, { target: string; type: string }>;
  placeholders: Placeholder[];
}

function placeholdersOf(root: El): Placeholder[] {
  const out: Placeholder[] = [];
  const walk = (tree: El | null) => {
    for (const c of Array.from(tree?.children || [])) {
      if (c.localName === "grpSp") walk(c);
      const ph = c.querySelector("nvPr > ph") || Array.from(c.getElementsByTagName("*")).find((e) => e.localName === "ph") || null;
      if (ph && (c.localName === "sp" || c.localName === "pic" || c.localName === "graphicFrame")) {
        out.push({ type: attr(ph, "type") || "body", idx: attr(ph, "idx"), sp: c });
      }
    }
  };
  walk(path(root, "cSld", "spTree"));
  return out;
}

function phInfo(sp: El): { type: string; idx: string | null } | null {
  const nv = Array.from(sp.children).find((c) => c.localName.startsWith("nv"));
  const ph = path(nv, "nvPr", "ph");
  return ph ? { type: attr(ph, "type") || "body", idx: attr(ph, "idx") } : null;
}

function findPh(level: Level | null, ph: { type: string; idx: string | null }): El | null {
  if (!level) return null;
  const norm = (t: string) => (t === "ctrTitle" ? "title" : t === "subTitle" || t === "obj" ? "body" : t);
  if (ph.idx != null) {
    const byIdx = level.placeholders.find((p) => p.idx === ph.idx);
    if (byIdx) return byIdx.sp;
  }
  return (
    level.placeholders.find((p) => p.type === ph.type)?.sp ||
    level.placeholders.find((p) => norm(p.type) === norm(ph.type))?.sp ||
    null
  );
}

class SlideRenderer {
  private images = new Map<string, Promise<PDFImage | null>>();
  skipped = new Set<string>();

  constructor(
    private pdf: PDFDocument,
    private fonts: Fonts,
    private pkg: Package,
    private presentation: Document,
    private width: number,
    private height: number
  ) {}

  private async level(p: string): Promise<Level> {
    const doc = (await this.pkg.xml(p))!;
    const root = doc.documentElement;
    return { path: p, doc, root, rels: await this.pkg.rels(p), placeholders: placeholdersOf(root) };
  }

  // `drawn` is the picture's size on the slide in points; metafiles are
  // rasterised for it at about 200 DPI.
  private async image(partPath: string, drawn?: { w: number; h: number }): Promise<PDFImage | null> {
    const ext = partPath.split(".").pop()!.toLowerCase();
    const key = isMetafile(ext) && drawn ? `${partPath}@${Math.round(drawn.w)}x${Math.round(drawn.h)}` : partPath;
    if (!this.images.has(key)) {
      this.images.set(
        key,
        (async () => {
          const bytes = await this.pkg.bytes(partPath);
          if (!bytes) return null;
          try {
            if (ext === "png") return await this.pdf.embedPng(bytes);
            if (ext === "jpg" || ext === "jpeg") return await this.pdf.embedJpg(bytes);
            if (isMetafile(ext)) {
              const size = drawn || { w: 400, h: 300 };
              const png = await metafileToPng(bytes, ext, (size.w * 200) / 72, (size.h * 200) / 72);
              return await this.pdf.embedPng(png);
            }
            if (ext === "tif" || ext === "tiff") {
              this.skipped.add("TIFF picture");
              return null;
            }
            // GIF, BMP, WebP, SVG: let the browser decode, then store as PNG.
            const type = ext === "svg" ? "image/svg+xml" : `image/${ext}`;
            const url = URL.createObjectURL(new Blob([bytes], { type }));
            try {
              const img = new Image();
              await new Promise<void>((res, rej) => ((img.onload = () => res()), (img.onerror = () => rej(new Error("img"))), (img.src = url)));
              const c = document.createElement("canvas");
              const scale = ext === "svg" ? 3 : 1;
              c.width = Math.max(1, (img.naturalWidth || 300) * scale);
              c.height = Math.max(1, (img.naturalHeight || 150) * scale);
              c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
              const png = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/png"));
              return await this.pdf.embedPng(new Uint8Array(await png.arrayBuffer()));
            } finally {
              URL.revokeObjectURL(url);
            }
          } catch {
            this.skipped.add("unreadable picture");
            return null;
          }
        })()
      );
    }
    return this.images.get(key)!;
  }

  async render(slidePath: string, slideNumber: number): Promise<void> {
    const slide = await this.level(slidePath);
    const layoutPath = [...slide.rels.values()].find((r) => r.type === "slideLayout")?.target;
    const layout = layoutPath ? await this.level(layoutPath) : null;
    const masterPath = layout ? [...layout.rels.values()].find((r) => r.type === "slideMaster")?.target : undefined;
    const master = masterPath ? await this.level(masterPath) : null;
    const themePath = master ? [...master.rels.values()].find((r) => r.type === "theme")?.target : undefined;
    const theme = themePath ? await readTheme(this.pkg, themePath) : { colors: {}, major: "Calibri Light", minor: "Calibri", fillStyles: [], lineStyles: [], bgFillStyles: [] };

    const clrMap: Record<string, string> = {};
    const mapEl = master ? kid(master.root, "clrMap") : null;
    for (const a of Array.from(mapEl?.attributes || [])) clrMap[a.name] = a.value;
    for (const lvl of [layout, slide]) {
      const ovr = lvl ? path(lvl.root, "clrMapOvr", "overrideClrMapping") : null;
      for (const a of Array.from(ovr?.attributes || [])) clrMap[a.name] = a.value;
    }
    const ctx: Ctx = { pkg: this.pkg, theme, clrMap, slideNumber };

    const page = this.pdf.addPage([this.width, this.height]);
    await this.background(page, [slide, layout, master], ctx);

    // Master and layout artwork (non-placeholder shapes), unless hidden.
    const showMaster = attr(slide.root, "showMasterSp") !== "0";
    const layoutShowsMaster = !layout || attr(layout.root, "showMasterSp") !== "0";
    const chain = { slide, layout, master };
    if (showMaster && master && layoutShowsMaster) await this.tree(page, path(master.root, "cSld", "spTree"), I, ctx, master, chain, true);
    if (showMaster && layout) await this.tree(page, path(layout.root, "cSld", "spTree"), I, ctx, layout, chain, true);
    await this.tree(page, path(slide.root, "cSld", "spTree"), I, ctx, slide, chain, false);
  }

  private async background(page: PDFPage, levels: (Level | null)[], ctx: Ctx) {
    for (const lvl of levels) {
      const bg = lvl ? path(lvl.root, "cSld", "bg") : null;
      if (!bg) continue;
      const bgPr = kid(bg, "bgPr");
      const bgRef = kid(bg, "bgRef");
      let fillEl: El | null = null;
      let fctx = ctx;
      if (bgPr) fillEl = bgPr;
      else if (bgRef) {
        const idx = num(bgRef, "idx", 0);
        fctx = { ...ctx, phClr: color(bgRef, ctx) || undefined };
        fillEl = idx >= 1001 ? ctx.theme.bgFillStyles[idx - 1001] || null : ctx.theme.fillStyles[idx - 1] || null;
        if (fillEl && !["solidFill", "gradFill", "blipFill", "pattFill", "noFill"].includes(fillEl.localName)) fillEl = null;
        else if (fillEl) {
          const wrap = document.implementation.createDocument(null, "wrap", null).documentElement;
          wrap.appendChild(fillEl.cloneNode(true));
          fillEl = wrap;
        }
      }
      if (fillEl) {
        await this.fillRect(page, fillEl, 0, 0, this.width, this.height, fctx, lvl!);
        return;
      }
    }
    // No background anywhere: PowerPoint shows the theme's light colour.
    const bg1 = ctx.theme.colors[ctx.clrMap.bg1 || "lt1"] || "FFFFFF";
    page.drawRectangle({ x: 0, y: 0, width: this.width, height: this.height, color: pdfColor(hexToColor(bg1)) });
  }

  // Fills an axis-aligned rectangle (slide background or table cell).
  private async fillRect(page: PDFPage, owner: El, x: number, y: number, w: number, h: number, ctx: Ctx, lvl: Level) {
    const solid = kid(owner, "solidFill");
    const grad = kid(owner, "gradFill");
    const blip = kid(owner, "blipFill");
    if (solid) {
      const c = color(solid, ctx);
      if (c) page.drawRectangle({ x, y: this.height - y - h, width: w, height: h, color: pdfColor(c), opacity: c.a });
    } else if (grad) {
      const img = await this.gradientImage(grad, w, h, ctx);
      if (img) page.drawImage(img, { x, y: this.height - y - h, width: w, height: h });
    } else if (blip) {
      const rid = attr(kid(blip, "blip"), "r:embed");
      const target = rid ? lvl.rels.get(rid)?.target : undefined;
      const img = target ? await this.image(target, { w, h }) : null;
      if (img) page.drawImage(img, { x, y: this.height - y - h, width: w, height: h });
    } else if (kid(owner, "pattFill")) {
      const c = color(path(owner, "pattFill", "bgClr"), ctx);
      if (c) page.drawRectangle({ x, y: this.height - y - h, width: w, height: h, color: pdfColor(c) });
    }
  }

  // Linear/radial gradients are drawn as a small image; pdf-lib has no
  // native gradient support and a 512px bitmap is indistinguishable here.
  private async gradientImage(grad: El, w: number, h: number, ctx: Ctx): Promise<PDFImage | null> {
    const stops = kids(kid(grad, "gsLst"), "gs")
      .map((gs) => ({ pos: num(gs, "pos", 0) / 100000, c: color(gs, ctx) }))
      .filter((s): s is { pos: number; c: Color } => !!s.c)
      .sort((a, b) => a.pos - b.pos);
    if (!stops.length) return null;
    const cw = Math.max(2, Math.min(512, Math.round(w)));
    const ch = Math.max(2, Math.round((cw * h) / Math.max(w, 1)));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const g = canvas.getContext("2d")!;
    let gradient: CanvasGradient;
    const lin = kid(grad, "lin");
    if (kid(grad, "path")) {
      gradient = g.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, Math.hypot(cw, ch) / 2);
    } else {
      const ang = ((lin ? num(lin, "ang", 0) : 0) / 60000) * (Math.PI / 180);
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      const half = (Math.abs(dx * cw) + Math.abs(dy * ch)) / 2;
      gradient = g.createLinearGradient(cw / 2 - dx * half, ch / 2 - dy * half, cw / 2 + dx * half, ch / 2 + dy * half);
    }
    for (const s of stops) {
      gradient.addColorStop(clamp01(s.pos), `rgba(${Math.round(s.c.r * 255)},${Math.round(s.c.g * 255)},${Math.round(s.c.b * 255)},${s.c.a})`);
    }
    g.fillStyle = gradient;
    g.fillRect(0, 0, cw, ch);
    const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/png"));
    return this.pdf.embedPng(new Uint8Array(await blob.arrayBuffer()));
  }

  private async tree(
    page: PDFPage,
    tree: El | null,
    parent: M,
    ctx: Ctx,
    owner: Level,
    chain: { slide: Level; layout: Level | null; master: Level | null },
    skipPlaceholders: boolean
  ) {
    for (const el of Array.from(tree?.children || [])) {
      const name = el.localName;
      if (name === "AlternateContent") {
        const choice = kid(el, "Fallback") || kid(el, "Choice");
        if (choice) await this.tree(page, choice, parent, ctx, owner, chain, skipPlaceholders);
        continue;
      }
      if (skipPlaceholders && phInfo(el)) continue;
      try {
        if (name === "sp" || name === "cxnSp") await this.shape(page, el, parent, ctx, owner, chain);
        else if (name === "pic") await this.picture(page, el, parent, ctx, owner, chain);
        else if (name === "grpSp") await this.group(page, el, parent, ctx, owner, chain, skipPlaceholders);
        else if (name === "graphicFrame") await this.frame(page, el, parent, ctx, owner, chain);
      } catch {
        this.skipped.add("an element that couldn't be read");
      }
    }
  }

  private async group(page: PDFPage, el: El, parent: M, ctx: Ctx, owner: Level, chain: any, skip: boolean) {
    const xf = path(el, "grpSpPr", "xfrm");
    const x = readXfrm(xf);
    let m = parent;
    if (x) {
      const chOff = kid(xf, "chOff");
      const chExt = kid(xf, "chExt");
      const cx = pt(attr(chOff, "x"));
      const cy = pt(attr(chOff, "y"));
      const cw = pt(attr(chExt, "cx")) || x.w;
      const chh = pt(attr(chExt, "cy")) || x.h;
      const sx = cw ? x.w / cw : 1;
      const sy = chh ? x.h / chh : 1;
      // child space → group box → parent
      const toBox: M = [sx, 0, 0, sy, -cx * sx, -cy * sy];
      m = mul(mul(toBox, shapeMatrix({ ...x, x: 0, y: 0 })), [1, 0, 0, 1, x.x, x.y]);
      m = mul(m, parent);
    }
    await this.tree(page, el, m, ctx, owner, chain, skip);
  }

  // Resolves a shape's transform, looking up placeholder positions from the
  // layout and master when the slide doesn't give one.
  private shapeXfrm(el: El, spPrName: string, chain: any): Xfrm | null {
    const own = readXfrm(path(el, spPrName, "xfrm"));
    if (own) return own;
    const ph = phInfo(el);
    if (!ph) return null;
    for (const lvl of [chain.layout, chain.master]) {
      const src = findPh(lvl, ph);
      const x = src ? readXfrm(path(src, "spPr", "xfrm")) : null;
      if (x) return x;
    }
    return null;
  }

  private async shape(page: PDFPage, el: El, parent: M, ctx: Ctx, owner: Level, chain: any) {
    const spPr = kid(el, "spPr");
    const x = this.shapeXfrm(el, "spPr", chain);
    if (!x) return;
    const m = mul(shapeMatrix(x), parent);
    const style = kid(el, "style");

    // Geometry
    const prstGeom = kid(spPr, "prstGeom");
    const custGeom = kid(spPr, "custGeom");
    let cmds: Cmd[] | null | undefined = null;
    if (custGeom) cmds = custCmds(custGeom, x.w, x.h);
    else if (prstGeom) {
      cmds = presetCmds(attr(prstGeom, "prst") || "rect", x.w, x.h, adjValues(prstGeom));
      if (cmds === undefined) {
        this.skipped.add(`shape "${attr(prstGeom, "prst")}" (drawn as a rectangle)`);
        cmds = presetCmds("rect", x.w, x.h, {});
      }
    } else if (el.localName === "sp") {
      cmds = presetCmds("rect", x.w, x.h, {});
    }

    // Fill and outline, with theme style references as the fallback.
    let fill: Color | null = null;
    let gradFill: El | null = null;
    let blipFill: El | null = null;
    if (kid(spPr, "noFill")) fill = null;
    else if (kid(spPr, "solidFill")) fill = color(kid(spPr, "solidFill"), ctx);
    else if (kid(spPr, "gradFill")) gradFill = kid(spPr, "gradFill");
    else if (kid(spPr, "blipFill")) blipFill = kid(spPr, "blipFill");
    else if (style) {
      const ref = kid(style, "fillRef");
      const idx = num(ref, "idx", 0);
      const tpl = idx > 0 ? ctx.theme.fillStyles[idx - 1] : null;
      const sctx = { ...ctx, phClr: color(ref, ctx) || undefined };
      if (tpl?.localName === "solidFill") fill = color(tpl, sctx);
      else if (tpl?.localName === "gradFill") fill = color(kid(kid(tpl, "gsLst"), "gs"), sctx);
    }

    const ln = kid(spPr, "ln");
    let line: { c: Color; w: number; dash?: number[] } | null = null;
    const lnRef = style ? kid(style, "lnRef") : null;
    const lnTpl = lnRef && num(lnRef, "idx", 0) > 0 ? ctx.theme.lineStyles[num(lnRef, "idx", 0) - 1] : null;
    if (!kid(ln, "noFill")) {
      let c: Color | null = null;
      if (kid(ln, "solidFill")) c = color(kid(ln, "solidFill"), ctx);
      else if (lnTpl && !kid(lnTpl, "noFill")) c = color(kid(lnTpl, "solidFill"), { ...ctx, phClr: color(lnRef, ctx) || undefined });
      const w = attr(ln, "w") != null ? pt(attr(ln, "w")) : lnTpl ? pt(attr(lnTpl, "w"), 0.75) : 0.75;
      if (c) {
        const dash = attr(kid(ln, "prstDash"), "val");
        const pattern = dash && dash !== "solid" ? (dash.includes("dot") && !dash.includes("Dash") ? [w, w * 2] : [w * 4, w * 3]) : undefined;
        line = { c, w: Math.max(w, 0.25), dash: pattern };
      }
    }

    if (cmds && cmds.length) {
      const d = toSvg(cmds, m);
      const closed = cmds.some((c) => c[0] === "Z");
      if (gradFill && closed) {
        // Gradient shapes: approximate with the middle colour.
        const stops = kids(kid(gradFill, "gsLst"), "gs").map((g) => color(g, ctx)).filter(Boolean) as Color[];
        if (stops.length) {
          const mid = stops[Math.floor(stops.length / 2)];
          fill = mid;
        }
      }
      if (blipFill && closed) {
        await this.drawClippedImage(page, blipFill, owner, m, x, cmds);
      }
      if ((fill && fill.a > 0 && closed) || line) {
        page.drawSvgPath(d, {
          x: 0,
          y: this.height,
          color: fill && closed && fill.a > 0 ? pdfColor(fill) : undefined,
          opacity: fill ? fill.a : undefined,
          borderColor: line ? pdfColor(line.c) : undefined,
          borderWidth: line ? line.w : undefined,
          borderOpacity: line ? line.c.a : undefined,
          borderDashArray: line?.dash,
        });
      }
    }

    const txBody = kid(el, "txBody");
    if (txBody) {
      const fontRef = style ? kid(style, "fontRef") : null;
      const textColor = fontRef ? color(fontRef, ctx) : null;
      await this.text(page, txBody, x, parent, ctx, el, chain, textColor);
    }
  }

  private async drawClippedImage(page: PDFPage, blipFill: El, owner: Level, m: M, x: Xfrm, clipCmds?: Cmd[]) {
    const rid = attr(kid(blipFill, "blip"), "r:embed");
    const target = rid ? owner.rels.get(rid)?.target : undefined;
    if (!target) return;
    const img = await this.image(target, { w: x.w, h: x.h });
    if (!img) return;
    // srcRect crops (in 1/1000 %) the picture before it's stretched to the box.
    const src = kid(blipFill, "srcRect");
    const l = num(src, "l", 0) / 100000;
    const t = num(src, "t", 0) / 100000;
    const r = num(src, "r", 0) / 100000;
    const b = num(src, "b", 0) / 100000;
    const visW = 1 - l - r || 1;
    const visH = 1 - t - b || 1;
    // Full picture box in shape-local coordinates (y down).
    const fx = (-l / visW) * x.w;
    const fy = (-t / visH) * x.h;
    const fw = x.w / visW;
    const fh = x.h / visH;
    // local (y down) → page (y up)
    const toPage: M = mul(m, [1, 0, 0, -1, 0, this.height]);
    page.pushOperators(pushGraphicsState());
    // Clip to the shape outline (or its box).
    const clipPath = clipCmds && clipCmds.length ? clipCmds : presetCmds("rect", x.w, x.h, {})!;
    const ops: any[] = [];
    for (const c of clipPath) {
      if (c[0] === "M") ops.push(moveTo(...apply(toPage, c[1], c[2])));
      else if (c[0] === "L") ops.push(lineTo(...apply(toPage, c[1], c[2])));
      else if (c[0] === "C") {
        const p1 = apply(toPage, c[1], c[2]);
        const p2 = apply(toPage, c[3], c[4]);
        const p3 = apply(toPage, c[5], c[6]);
        ops.push(appendBezierCurve(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]));
      } else ops.push(closePath());
    }
    page.pushOperators(...ops, clip(), endPath());
    // Map the unit square onto the full picture box: image bottom-left is the
    // box's bottom-left corner (local y = fy + fh).
    const [ox, oy] = apply(toPage, fx, fy + fh);
    const [ax, ay] = apply(toPage, fx + fw, fy + fh);
    const [bx, by] = apply(toPage, fx, fy);
    page.pushOperators(concatTransformationMatrix(ax - ox, ay - oy, bx - ox, by - oy, ox, oy));
    page.drawImage(img, { x: 0, y: 0, width: 1, height: 1 });
    page.pushOperators(popGraphicsState());
  }

  private async picture(page: PDFPage, el: El, parent: M, ctx: Ctx, owner: Level, chain: any) {
    const x = this.shapeXfrm(el, "spPr", chain);
    if (!x) return;
    const m = mul(shapeMatrix(x), parent);
    const blipFill = kid(el, "blipFill");
    if (!blipFill) return;
    const prst = attr(path(el, "spPr", "prstGeom"), "prst");
    const clipCmds = prst && prst !== "rect" ? presetCmds(prst, x.w, x.h, adjValues(path(el, "spPr", "prstGeom"))) || undefined : undefined;
    await this.drawClippedImage(page, blipFill, owner, m, x, clipCmds);
    const ln = path(el, "spPr", "ln");
    const lc = ln && !kid(ln, "noFill") ? color(kid(ln, "solidFill"), ctx) : null;
    if (lc) {
      page.drawSvgPath(toSvg(clipCmds || presetCmds("rect", x.w, x.h, {})!, m), {
        x: 0,
        y: this.height,
        borderColor: pdfColor(lc),
        borderWidth: pt(attr(ln, "w"), 0.75) || 0.75,
      });
    }
  }

  private async frame(page: PDFPage, el: El, parent: M, ctx: Ctx, owner: Level, chain: any) {
    const x = readXfrm(kid(el, "xfrm"));
    const data = path(el, "graphic", "graphicData");
    const uri = attr(data, "uri") || "";
    if (!x || !data) return;
    if (uri.endsWith("/table")) {
      await this.table(page, kid(data, "tbl")!, x, parent, ctx, owner);
    } else if (uri.endsWith("/diagram")) {
      // SmartArt: PowerPoint caches the drawn result as ordinary shapes.
      const rel = [...owner.rels.values()].find((r) => r.type === "diagramDrawing");
      const doc = rel ? await this.pkg.xml(rel.target) : null;
      const tree = doc ? Array.from(doc.getElementsByTagName("*")).find((e) => e.localName === "spTree") || null : null;
      if (tree) {
        const drawingLevel: Level = { ...owner, rels: await this.pkg.rels(rel!.target) };
        const m = mul([1, 0, 0, 1, x.x, x.y], parent);
        await this.tree(page, tree, m, ctx, drawingLevel, chain, false);
      } else this.skipped.add("SmartArt graphic");
    } else if (uri.endsWith("/ole")) {
      // Embedded objects (Visio, SmartDraw, equations...) carry a preview
      // picture, which is what PowerPoint shows and prints.
      const pic = Array.from(data.getElementsByTagName("*")).find((e) => e.localName === "pic");
      const blipFill = pic ? kid(pic, "blipFill") : null;
      if (blipFill) await this.drawClippedImage(page, blipFill, owner, mul(shapeMatrix(x), parent), x);
      else this.skipped.add("embedded object");
    } else if (uri.endsWith("/chart")) {
      this.skipped.add("chart");
    } else {
      this.skipped.add("embedded object");
    }
  }

  private async table(page: PDFPage, tbl: El, x: Xfrm, parent: M, ctx: Ctx, owner: Level) {
    const cols = kids(kid(tbl, "tblGrid"), "gridCol").map((c) => pt(attr(c, "w")));
    const rows = kids(tbl, "tr");
    const tblPr = kid(tbl, "tblPr");
    const firstRow = attr(tblPr, "firstRow") === "1";
    const bandRow = attr(tblPr, "bandRow") === "1";
    const accent = hexToColor(ctx.theme.colors.accent1 || "4472C4");
    let yy = 0;
    for (let ri = 0; ri < rows.length; ri++) {
      const tr = rows[ri];
      const cells = kids(tr, "tc");
      // Row height grows to fit its text.
      let rowH = pt(attr(tr, "h"));
      const layouts: { ci: number; cx: number; cw: number; body: El | null; tcPr: El | null }[] = [];
      let cx = 0;
      for (let ci = 0; ci < cells.length && ci < cols.length; ci++) {
        const tc = cells[ci];
        const span = num(tc, "gridSpan", 1);
        const cw = cols.slice(ci, ci + span).reduce((s, v) => s + v, 0);
        if (attr(tc, "hMerge") !== "1" && attr(tc, "vMerge") !== "1") layouts.push({ ci, cx, cw, body: kid(tc, "txBody"), tcPr: kid(tc, "tcPr") });
        cx += cols[ci];
      }
      const isHeader = firstRow && ri === 0;
      // Default table style (Medium Style 2, Accent 1): coloured header,
      // light banded rows, white borders.
      const defaultFill = isHeader ? accent : bandRow && (ri - (firstRow ? 1 : 0)) % 2 === 0 ? { r: 1 - (1 - accent.r) * 0.2, g: 1 - (1 - accent.g) * 0.2, b: 1 - (1 - accent.b) * 0.2, a: 1 } : { r: 1 - (1 - accent.r) * 0.1, g: 1 - (1 - accent.g) * 0.1, b: 1 - (1 - accent.b) * 0.1, a: 1 };
      const hasStyle = !!kid(tblPr, "tableStyleId");
      for (const cell of layouts) {
        const needed = cell.body ? await this.textHeight(cell.body, cell.cw - 14.4, ctx, isHeader) : 0;
        rowH = Math.max(rowH, needed + 7.2);
      }
      for (const cell of layouts) {
        const cellX: Xfrm = { x: x.x + cell.cx, y: x.y + yy, w: cell.cw, h: rowH, rot: 0, flipH: false, flipV: false };
        const m = mul(shapeMatrix(cellX), parent);
        let fillC: Color | null = hasStyle ? defaultFill : null;
        if (cell.tcPr && kid(cell.tcPr, "solidFill")) fillC = color(kid(cell.tcPr, "solidFill"), ctx);
        if (cell.tcPr && kid(cell.tcPr, "noFill")) fillC = null;
        const rect = presetCmds("rect", cell.cw, rowH, {})!;
        if (fillC) page.drawSvgPath(toSvg(rect, m), { x: 0, y: this.height, color: pdfColor(fillC), opacity: fillC.a });
        for (const side of ["lnL", "lnR", "lnT", "lnB"]) {
          const lnEl = kid(cell.tcPr, side);
          const lc = lnEl && !kid(lnEl, "noFill") ? color(kid(lnEl, "solidFill"), ctx) : hasStyle ? { r: 1, g: 1, b: 1, a: 1 } : null;
          if (!lc) continue;
          const w = lnEl ? pt(attr(lnEl, "w"), 1) || 1 : 1;
          const seg: Cmd[] =
            side === "lnL" ? [["M", 0, 0], ["L", 0, rowH]] : side === "lnR" ? [["M", cell.cw, 0], ["L", cell.cw, rowH]] : side === "lnT" ? [["M", 0, 0], ["L", cell.cw, 0]] : [["M", 0, rowH], ["L", cell.cw, rowH]];
          page.drawSvgPath(toSvg(seg, m), { x: 0, y: this.height, borderColor: pdfColor(lc), borderWidth: w });
        }
        if (cell.body) {
          const textColor = isHeader && hasStyle ? { r: 1, g: 1, b: 1, a: 1 } : null;
          const bodyX: Xfrm = { ...cellX };
          await this.text(page, cell.body, bodyX, parent, ctx, null, null, textColor, {
            l: pt(attr(cell.tcPr, "marL"), 7.2),
            r: pt(attr(cell.tcPr, "marR"), 7.2),
            t: pt(attr(cell.tcPr, "marT"), 3.6),
            b: pt(attr(cell.tcPr, "marB"), 3.6),
            anchor: attr(cell.tcPr, "anchor") || "t",
            bold: isHeader && hasStyle,
          });
        }
      }
      yy += rowH;
    }
  }

  private async textHeight(body: El, width: number, ctx: Ctx, bold: boolean): Promise<number> {
    const lines = await this.layout(body, width, ctx, null, null, bold ? { bold: true } : undefined);
    return lines.reduce((s, l) => s + l.spaceBefore + l.height, 0);
  }

  // Paragraph properties for a text body, following the inheritance chain.
  private paraBase(el: El | null, chain: any, ctx: Ctx, lvl: number): ParaProps {
    let p = defaultPara();
    p.run = { ...p.run, font: "+mn-lt" };
    const pres = this.presentation.documentElement;
    p = applyLevel(kid(pres, "defaultTextStyle"), lvl, p, ctx);
    const ph = el ? phInfo(el) : null;
    if (chain && chain.master) {
      const styles = kid(chain.master.root, "txStyles");
      const kind = !ph ? "otherStyle" : ph.type === "title" || ph.type === "ctrTitle" ? "titleStyle" : ["body", "subTitle", "obj"].includes(ph.type) ? "bodyStyle" : "otherStyle";
      if (ph) p = applyLevel(kid(styles, kind), lvl, p, ctx);
    }
    if (ph && chain) {
      for (const lvlDoc of [chain.master, chain.layout]) {
        const src = findPh(lvlDoc, ph);
        if (src) p = applyLevel(path(src, "txBody", "lstStyle"), lvl, p, ctx);
      }
    }
    if (el) p = applyLevel(path(el, "txBody", "lstStyle"), lvl, p, ctx);
    return p;
  }

  private bodyPr(el: El | null, body: El, chain: any): El[] {
    // Own bodyPr first, then the placeholder's in the layout and master.
    const list = [kid(body, "bodyPr")].filter(Boolean) as El[];
    const ph = el ? phInfo(el) : null;
    if (ph && chain) {
      for (const lvl of [chain.layout, chain.master]) {
        const src = findPh(lvl, ph);
        const b = src ? path(src, "txBody", "bodyPr") : null;
        if (b) list.push(b);
      }
    }
    return list;
  }

  private async layout(
    body: El,
    width: number,
    ctx: Ctx,
    el: El | null,
    chain: any,
    over?: { bold?: boolean; color?: Color | null; fontScale?: number; lnReduction?: number; wrap?: boolean }
  ): Promise<LaidLine[]> {
    const lines: LaidLine[] = [];
    const counters: number[] = [];
    const fontScale = over?.fontScale ?? 1;
    const lnReduction = over?.lnReduction ?? 0;
    for (const p of kids(body, "p")) {
      const pPr = kid(p, "pPr");
      const lvl = num(pPr, "lvl", 0);
      let props = this.paraBase(el, chain, ctx, lvl);
      props = applyPara(pPr, props, ctx);
      const resolveFont = (f: string) => (f === "+mj-lt" ? ctx.theme.major : f === "+mn-lt" ? ctx.theme.minor : f);

      // Runs
      const runs: { text: string; props: RunProps }[] = [];
      for (const r of Array.from(p.children)) {
        if (r.localName === "r" || r.localName === "fld") {
          let rp = applyRun(kid(r, "rPr"), props.run, ctx);
          if (over?.bold) rp = { ...rp, bold: true };
          let text = kid(r, "t")?.textContent || "";
          if (r.localName === "fld" && attr(r, "type") === "slidenum") text = String(ctx.slideNumber);
          if (rp.caps) text = text.toUpperCase();
          runs.push({ text, props: rp });
        } else if (r.localName === "br") {
          runs.push({ text: "\n", props: applyRun(kid(r, "rPr"), props.run, ctx) });
        }
      }
      const endProps = applyRun(kid(p, "endParaRPr"), props.run, ctx);
      const baseSize = (runs.find((r) => r.text.trim())?.props.size ?? endProps.size) * fontScale;

      // Bullet / numbering label
      let label = "";
      let labelProps: RunProps | null = null;
      const hasText = runs.some((r) => r.text.trim());
      while (counters.length <= lvl) counters.push(0);
      counters.length = lvl + 1;
      if (props.bullet.kind === "num" && hasText) {
        counters[lvl] = (counters[lvl] || (props.bullet.startAt ?? 1) - 1) + 1;
        label = numberLabel(props.bullet.scheme || "arabicPeriod", counters[lvl]);
      } else if (props.bullet.kind !== "num") counters[lvl] = 0;
      if (props.bullet.kind === "char" && hasText) label = symbolBullet(props.bullet.char || "•", props.bullet.font);
      if (label) {
        const first = runs.find((r) => r.text.trim())!.props;
        labelProps = {
          ...first,
          // Symbol-font bullets were mapped to Unicode above, so they're drawn
          // in the text font.
          font:
            props.bullet.font && !/^\+/.test(props.bullet.font) && !/^(wingdings|symbol|webdings)/i.test(props.bullet.font)
              ? props.bullet.font
              : first.font,
          size: first.size * (props.bullet.sizePct ?? 1),
          color: props.bullet.color ?? first.color,
          underline: false,
          strike: false,
        };
      }

      // Break into lines.
      const wrap = over?.wrap !== false;
      type Tok = { text: string; props: RunProps; width: number; font: PDFFont; newline?: boolean };
      const toks: Tok[] = [];
      for (const r of runs) {
        const rp = { ...r.props, size: r.props.size * fontScale, font: resolveFont(r.props.font) };
        const font = await this.fonts.get(rp.font, rp.bold, rp.italic);
        if (r.text === "\n") {
          toks.push({ text: "", props: rp, width: 0, font, newline: true });
          continue;
        }
        // Words, spaces, and a break opportunity after each hyphen
        // ("management-|oriented"), as PowerPoint wraps.
        const parts = r.text.split(/(\s+)/).flatMap((w) => (/\s/.test(w) ? [w] : w.split(/(?<=-)(?=[^-])/)));
        for (const part of parts) {
          if (!part) continue;
          toks.push({ text: part, props: rp, width: measure(font, part, rp), font });
        }
      }

      // Where the first line's text starts. With a bullet or number, the label
      // hangs at marL + indent and the text starts at marL (or just after a
      // label too wide for the hanging space).
      let labelFont: PDFFont | null = null;
      let labelText = "";
      let firstX = props.marL + props.indent;
      if (label && labelProps) {
        labelFont = await this.fonts.get(resolveFont(labelProps.font), labelProps.bold, labelProps.italic);
        labelText = await this.safeText(labelFont, label);
        const labelEnd = props.marL + props.indent + measure(labelFont, labelText, { ...labelProps, size: labelProps.size * fontScale });
        firstX = labelEnd <= props.marL + 0.5 ? props.marL : labelEnd + baseSize * 0.3;
      }

      const pctLine = props.lnSpcPct != null ? Math.max(0.1, props.lnSpcPct - lnReduction) : null;
      const mkLine = (pieces: Piece[], first: boolean, last: boolean): LaidLine => {
        const sizes = pieces.length ? pieces.map((pc) => pc.props.size) : [baseSize];
        const maxSize = Math.max(...sizes, 1);
        // Exact spacing is rounded to whole points by PowerPoint, and the
        // baseline then sits at 0.75 of that line height (measured).
        const exact = props.lnSpcPts != null ? Math.max(1, Math.round(props.lnSpcPts)) : null;
        // Proportional spacing: the first baseline is 0.937 × size at single
        // spacing and moves with the multiple (measured, same for all fonts).
        const mult = pctLine ?? 1;
        const ascent = exact != null ? exact * 0.75 : maxSize * ascentRatio(mult);
        const height = exact ?? maxSize * LINE_FACTOR * (pctLine ?? 1);
        // Percentage spacing is in lines (1.2 × the font size).
        const spcBef = first ? (props.spcBef.pts ?? (props.spcBef.pct ?? 0) * maxSize * LINE_FACTOR) : 0;
        return {
          pieces,
          width: pieces.reduce((s, pc) => s + pc.width, 0),
          ascent,
          descent: exact != null ? exact * 0.25 : maxSize * 0.25,
          height,
          x: first ? firstX : props.marL,
          spaceBefore: spcBef,
          justify: props.align === "just" && !last,
        };
      };

      const paraLines: Piece[][] = [];
      let cur: Piece[] = [];
      let curW = 0;
      const limit = () => width - (paraLines.length === 0 ? firstX : props.marL);
      for (const t of toks) {
        if (t.newline) {
          paraLines.push(cur);
          cur = [];
          curW = 0;
          continue;
        }
        const isSpace = !t.text.trim();
        if (wrap && !isSpace && curW + t.width > limit() && cur.some((pc) => pc.text.trim())) {
          // Drop trailing spaces from the line being closed.
          while (cur.length && !cur[cur.length - 1].text.trim()) cur.pop();
          paraLines.push(cur);
          cur = [];
          curW = 0;
        }
        if (isSpace && !cur.length && paraLines.length) continue; // no leading spaces on wrapped lines
        // A single word wider than the box is broken by characters.
        if (wrap && !isSpace && t.width > limit() && !cur.length) {
          let chunk = "";
          for (const ch of t.text) {
            const w = measure(t.font, chunk + ch, t.props);
            if (w > limit() && chunk) {
              paraLines.push([{ text: chunk, font: t.font, props: t.props, width: measure(t.font, chunk, t.props) }]);
              chunk = ch;
            } else chunk += ch;
          }
          cur = [{ text: chunk, font: t.font, props: t.props, width: measure(t.font, chunk, t.props) }];
          curW = cur[0].width;
          continue;
        }
        cur.push({ text: t.text, font: t.font, props: t.props, width: t.width });
        curW += t.width;
      }
      while (cur.length && !cur[cur.length - 1].text.trim()) cur.pop();
      paraLines.push(cur);

      const laid = paraLines.map((pcs, i) => mkLine(pcs, i === 0, i === paraLines.length - 1));
      if (labelFont && labelProps && laid.length) {
        (laid[0] as any).label = { text: labelText, font: labelFont, props: { ...labelProps, size: labelProps.size * fontScale }, x: props.marL + props.indent };
      }
      for (const l of laid) (l as any).align = props.align;
      const spcAft = props.spcAft.pts ?? (props.spcAft.pct ?? 0) * baseSize * LINE_FACTOR;
      if (laid.length) (laid[laid.length - 1] as any).spaceAfter = spcAft;
      lines.push(...laid);
    }
    return lines;
  }

  private async safeText(font: PDFFont, text: string): Promise<string> {
    try {
      font.encodeText(text);
      return text;
    } catch {
      return "•";
    }
  }

  private async text(
    page: PDFPage,
    body: El,
    x: Xfrm,
    parent: M,
    ctx: Ctx,
    el: El | null,
    chain: any,
    defaultColor: Color | null,
    cell?: { l: number; r: number; t: number; b: number; anchor: string; bold: boolean }
  ) {
    // Body properties: insets, anchoring, autofit, wrapping.
    const bodyPrs = cell ? [kid(body, "bodyPr")].filter(Boolean) as El[] : this.bodyPr(el, body, chain);
    const bp = (name: string) => {
      for (const b of bodyPrs) if (attr(b, name) != null) return attr(b, name);
      return null;
    };
    const bpKid = (name: string) => {
      for (const b of bodyPrs) if (kid(b, name)) return kid(b, name);
      return null;
    };
    if ((bp("vert") || "horz") !== "horz") this.skipped.add("vertical text");
    const lIns = cell ? cell.l : pt(bp("lIns"), 7.2);
    const rIns = cell ? cell.r : pt(bp("rIns"), 7.2);
    const tIns = cell ? cell.t : pt(bp("tIns"), 3.6);
    const bIns = cell ? cell.b : pt(bp("bIns"), 3.6);
    const anchor = cell ? cell.anchor : bp("anchor") || "t";
    const wrap = bp("wrap") !== "none";
    const auto = kid(kid(body, "bodyPr"), "normAutofit");
    const fontScale = auto ? num(auto, "fontScale", 100000) / 100000 : 1;
    const lnReduction = auto ? num(auto, "lnSpcReduction", 0) / 100000 : 0;
    void bpKid;

    const width = Math.max(1, x.w - lIns - rIns);
    const lines = await this.layout(body, width, ctx, el, chain, { bold: cell?.bold, fontScale, lnReduction, wrap });
    if (!lines.some((l) => l.pieces.some((p) => p.text.trim()))) return;

    // Vertical placement (measured in PowerPoint): the text block is the sum
    // of its line heights plus paragraph spacing, with no space before the
    // first paragraph; the first baseline sits `ascent` below the block top.
    let total = 0;
    lines.forEach((l, i) => {
      total += l.height + (i ? l.spaceBefore : 0);
      if ((l as any).spaceAfter && i < lines.length - 1) total += (l as any).spaceAfter;
    });
    const boxH = x.h - tIns - bIns;
    let y = tIns + (anchor === "ctr" ? (boxH - total) / 2 : anchor === "b" ? boxH - total : 0);

    const m = mul(shapeMatrix(x), parent);
    const rot = Math.atan2(m[1], m[0]);
    let baseline = 0;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      // Each step goes from the previous line's baseline down past its
      // descent, the paragraph spacing, and this line's ascent. For lines of
      // one size that is exactly the line height.
      if (i === 0) baseline = y + l.ascent;
      else {
        const prev = lines[i - 1];
        baseline += prev.height - prev.ascent + ((prev as any).spaceAfter || 0) + l.spaceBefore + l.ascent;
      }
      const align = (l as any).align as string;
      const free = width - l.x - l.width;
      let lx = lIns + l.x + (align === "ctr" ? free / 2 : align === "r" ? free : 0);
      const spaces = l.pieces.filter((p) => !p.text.trim()).length;
      const extraPerSpace = l.justify && spaces ? free / spaces : 0;

      const label = (l as any).label;
      if (label) await this.drawRun(page, m, rot, label.text, label.font, label.props, lIns + label.x, baseline, defaultColor, ctx);

      for (const pc of l.pieces) {
        if (pc.text.trim()) await this.drawRun(page, m, rot, pc.text, pc.font, pc.props, lx, baseline, defaultColor, ctx);
        lx += pc.width + (!pc.text.trim() ? extraPerSpace : 0);
      }
    }
  }

  private async drawRun(page: PDFPage, m: M, rot: number, text: string, font: PDFFont, props: RunProps, lx: number, baseline: number, defaultColor: Color | null, ctx: Ctx) {
    const c = props.color ?? defaultColor ?? hexToColor(ctx.theme.colors[ctx.clrMap.tx1 || "dk1"] || "000000");
    if (c.a === 0) return;
    const size = props.size * (props.baseline ? 0.7 : 1);
    const by = baseline - (props.baseline * props.size) / 100;
    const [px, py] = apply(m, lx, by);
    let safe = text;
    try {
      font.encodeText(text);
    } catch {
      // Characters missing from the font are replaced so the rest still draws.
      safe = Array.from(text).map((ch) => {
        try {
          font.encodeText(ch);
          return ch;
        } catch {
          return "?";
        }
      }).join("");
    }
    // Character spacing and horizontal stretch are text-state settings, so
    // they're set in a saved graphics state around this one run.
    const stretch = hscale(props.font);
    const textState = props.spacing || stretch !== 1;
    if (textState) {
      page.pushOperators(pushGraphicsState());
      if (props.spacing) page.pushOperators(setCharacterSpacing(props.spacing));
      if (stretch !== 1) page.pushOperators(setCharacterSqueeze(stretch * 100));
    }
    page.drawText(safe, {
      x: px,
      y: this.height - py,
      size,
      font,
      color: pdfColor(c),
      opacity: c.a,
      rotate: rot ? degrees((-rot * 180) / Math.PI) : undefined,
    });
    if (textState) page.pushOperators(popGraphicsState());
    if (props.underline || props.strike) {
      const w = measure(font, safe, props);
      const thick = Math.max(0.5, size / 18);
      for (const [on, dy] of [[props.underline, size * 0.12], [props.strike, -size * 0.28]] as const) {
        if (!on) continue;
        const d = toSvg([["M", lx, by + dy], ["L", lx + w, by + dy]], m);
        page.drawSvgPath(d, { x: 0, y: this.height, borderColor: pdfColor(c), borderWidth: thick });
      }
    }
  }
}

export async function pptxToPdf(bytes: ArrayBuffer, onProgress: Progress): Promise<{ pdf: Uint8Array; slides: number; hidden: number; skipped: string[] }> {
  onProgress(5, "Opening your presentation...");
  const JSZip = await getJSZip();
  const zip = await JSZip.loadAsync(bytes);
  const pkg = new Package(zip);
  const presentation = await pkg.xml("ppt/presentation.xml");
  if (!presentation) throw new Error("NOT_PPTX");
  const pres = presentation.documentElement;
  const sldSz = kid(pres, "sldSz");
  const width = pt(attr(sldSz, "cx"), 720) || 720;
  const height = pt(attr(sldSz, "cy"), 405) || 405;
  const rels = await pkg.rels("ppt/presentation.xml");
  const slidePaths = kids(kid(pres, "sldIdLst"), "sldId")
    .map((s) => rels.get(attr(s, "r:id") || "")?.target)
    .filter((p): p is string => !!p);

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(await getFontkit());
  pdf.setTitle(" ");
  pdf.setCreator("FoldPDF");
  pdf.setProducer("FoldPDF");
  const renderer = new SlideRenderer(pdf, new Fonts(pdf), pkg, presentation, width, height);

  let shown = 0;
  let hidden = 0;
  for (let i = 0; i < slidePaths.length; i++) {
    onProgress(10 + Math.round((i / slidePaths.length) * 82), `Drawing slide ${i + 1} of ${slidePaths.length}...`);
    const doc = await pkg.xml(slidePaths[i]);
    // Hidden slides are left out, as PowerPoint does when saving as PDF.
    if (attr(doc?.documentElement, "show") === "0") {
      hidden++;
      continue;
    }
    await renderer.render(slidePaths[i], i + 1);
    shown++;
  }
  if (!shown) throw new Error("NO_SLIDES");
  onProgress(95, "Saving your PDF...");
  const out = await pdf.save({ useObjectStreams: true });
  return { pdf: out, slides: shown, hidden, skipped: [...renderer.skipped] };
}
