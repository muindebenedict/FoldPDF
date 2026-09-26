// PDF compression that runs entirely in the browser.
//
// Nearly all of a typical PDF's weight is images, so that is where the work
// goes. Text, vector graphics and fonts are never modified, which keeps text
// sharp and selectable. Steps:
//   1. Measure how large every image is actually drawn on its pages, by
//      walking the page content streams (including nested forms).
//   2. Downsample each image to the level's DPI at that size and re-encode it:
//      photos as JPEG, flat graphics (screenshots, diagrams) losslessly.
//      A new image only replaces the old one if it is smaller.
//   3. Merge identical streams, compress uncompressed ones, drop page
//      thumbnails and anything no longer referenced, then save with object
//      streams.
// The caller must still compare the result with the input; if nothing got
// smaller, the original file should be kept.

import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFRawStream,
  PDFRef,
  PDFStream,
  decodePDFRawStream,
} from "@cantoo/pdf-lib";

export type CompressLevel = "light" | "medium" | "strong";

// Tuned so image-heavy PDFs shrink by about 70% / 75% / 80%+, in line with
// other online compressors. Measured on a sample on 2026-09-26: 70%, 75%, 83%.
const LEVELS: Record<CompressLevel, { dpi: number; quality: number }> = {
  light: { dpi: 135, quality: 0.6 },
  medium: { dpi: 125, quality: 0.55 },
  strong: { dpi: 100, quality: 0.45 },
};

// Don't try to decode images larger than this many pixels; a phone browser
// can run out of memory.
const MAX_PIXELS = 40_000_000;

export interface CompressResult {
  bytes: Uint8Array;
  imagesTotal: number;
  imagesRecompressed: number;
  duplicatesMerged: number;
}

type Progress = (pct: number, msg: string) => void;
type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const N = (s: string) => PDFName.of(s);

function multiply(m: Matrix, c: Matrix): Matrix {
  return [
    m[0] * c[0] + m[1] * c[2],
    m[0] * c[1] + m[1] * c[3],
    m[2] * c[0] + m[3] * c[2],
    m[2] * c[1] + m[3] * c[3],
    m[4] * c[0] + m[5] * c[2] + c[4],
    m[4] * c[1] + m[5] * c[3] + c[5],
  ];
}

const yieldToBrowser = () => new Promise((r) => setTimeout(r, 0));

// ─── Content stream scanning ────────────────────────────────────────────────

const isWhite = (c: number) => c === 32 || c === 10 || c === 13 || c === 9 || c === 12 || c === 0;
const isDelim = (c: number) =>
  c === 40 || c === 41 || c === 60 || c === 62 || c === 91 || c === 93 || c === 123 || c === 125 || c === 47 || c === 37;

function decodeName(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) {
    if (b[i] === 35 && i + 2 < b.length) {
      s += String.fromCharCode(parseInt(String.fromCharCode(b[i + 1], b[i + 2]), 16));
      i += 2;
    } else s += String.fromCharCode(b[i]);
  }
  return s;
}

// Calls onDo for every "Do" (draw XObject) operator with the current
// transformation matrix. Only the operators that affect image placement are
// interpreted; everything else is skipped.
function scanContent(b: Uint8Array, start: Matrix, onDo: (name: string, ctm: Matrix) => void) {
  const saved: Matrix[] = [];
  let ctm = start;
  const nums: number[] = [];
  let name: string | null = null;
  let i = 0;
  const n = b.length;
  while (i < n) {
    const c = b[i];
    if (isWhite(c)) { i++; continue; }
    if (c === 37) { while (i < n && b[i] !== 10 && b[i] !== 13) i++; continue; }
    if (c === 40) {
      let depth = 1;
      i++;
      while (i < n && depth > 0) {
        if (b[i] === 92) { i += 2; continue; }
        if (b[i] === 40) depth++;
        else if (b[i] === 41) depth--;
        i++;
      }
      continue;
    }
    if (c === 60) {
      if (b[i + 1] === 60) { i += 2; continue; }
      while (i < n && b[i] !== 62) i++;
      i++;
      continue;
    }
    if (c === 62 || c === 91 || c === 93 || c === 123 || c === 125 || c === 41) { i++; continue; }
    if (c === 47) {
      let j = i + 1;
      while (j < n && !isWhite(b[j]) && !isDelim(b[j])) j++;
      name = decodeName(b.subarray(i + 1, j));
      i = j;
      continue;
    }
    let j = i;
    while (j < n && !isWhite(b[j]) && !isDelim(b[j])) j++;
    if (j === i) { i++; continue; }
    let tok = "";
    for (let k = i; k < j; k++) tok += String.fromCharCode(b[k]);
    i = j;
    const first = tok.charCodeAt(0);
    if ((first >= 48 && first <= 57) || first === 43 || first === 45 || first === 46) {
      const v = parseFloat(tok);
      if (!Number.isNaN(v)) { nums.push(v); continue; }
    }
    switch (tok) {
      case "q": saved.push(ctm); break;
      case "Q": ctm = saved.pop() || start; break;
      case "cm":
        if (nums.length >= 6) ctm = multiply(nums.slice(-6) as Matrix, ctm);
        break;
      case "Do":
        if (name) onDo(name, ctm);
        break;
      case "BI": {
        // Inline image: skip its binary data up to "EI".
        while (i < n - 1 && !(b[i] === 73 && b[i + 1] === 68 && isWhite(b[i - 1]))) i++;
        i += 3;
        while (i < n - 2 && !(isWhite(b[i - 1]) && b[i] === 69 && b[i + 1] === 73 && (i + 2 >= n || isWhite(b[i + 2])))) i++;
        i += 2;
        break;
      }
    }
    nums.length = 0;
    name = null;
  }
}

function streamBytes(s: PDFObject | undefined): Uint8Array | null {
  if (!(s instanceof PDFRawStream)) return null;
  try {
    return s.dict.has(N("Filter")) ? decodePDFRawStream(s).decode() : s.contents;
  } catch {
    return null;
  }
}

// Largest drawn width and height (in points) of every image, keyed by ref.
function measurePlacements(doc: PDFDocument): Map<string, { w: number; h: number }> {
  const ctx = doc.context;
  const sizes = new Map<string, { w: number; h: number }>();
  let budget = 150_000_000; // bytes of content to scan before giving up

  const visit = (content: Uint8Array, resources: PDFDict | undefined, start: Matrix, depth: number) => {
    budget -= content.length;
    if (budget < 0 || depth > 12) return;
    const xobjects = resources ? (resources.lookup(N("XObject")) as PDFDict | undefined) : undefined;
    scanContent(content, start, (name, ctm) => {
      if (!(xobjects instanceof PDFDict)) return;
      const ref = xobjects.get(N(name));
      if (!(ref instanceof PDFRef)) return;
      const obj = ctx.lookup(ref);
      if (!(obj instanceof PDFStream)) return;
      const subtype = obj.dict.get(N("Subtype"));
      if (subtype === N("Image")) {
        const w = Math.hypot(ctm[0], ctm[1]);
        const h = Math.hypot(ctm[2], ctm[3]);
        const prev = sizes.get(ref.toString());
        sizes.set(ref.toString(), { w: Math.max(w, prev?.w || 0), h: Math.max(h, prev?.h || 0) });
      } else if (subtype === N("Form")) {
        const mArr = obj.dict.lookup(N("Matrix"));
        let m: Matrix = IDENTITY;
        if (mArr instanceof PDFArray && mArr.size() === 6) {
          m = mArr.asArray().map((x) => (x instanceof PDFNumber ? x.asNumber() : 0)) as Matrix;
        }
        const formRes = (obj.dict.lookup(N("Resources")) as PDFDict | undefined) || resources;
        const bytes = streamBytes(obj);
        if (bytes) visit(bytes, formRes instanceof PDFDict ? formRes : resources, multiply(m, ctm), depth + 1);
      }
    });
  };

  for (const page of doc.getPages()) {
    const resources = page.node.Resources();
    const contents = page.node.Contents();
    const parts: PDFObject[] =
      contents instanceof PDFArray ? contents.asArray().map((x) => ctx.lookup(x)) : contents ? [contents] : [];
    // Content arrays are one stream split into pieces; join them so q/Q
    // nesting across pieces is tracked correctly.
    const chunks = parts.map(streamBytes).filter((x): x is Uint8Array => !!x);
    const total = chunks.reduce((s, c) => s + c.length + 1, 0);
    const joined = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      joined.set(c, off);
      off += c.length;
      joined[off++] = 10;
    }
    visit(joined, resources, IDENTITY, 0);
  }
  return sizes;
}

// ─── Image decoding and re-encoding ─────────────────────────────────────────

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

// Downscale in halving steps so large reductions stay smooth.
function resample(src: CanvasImageSource, sw: number, sh: number, tw: number, th: number): HTMLCanvasElement {
  let cur: CanvasImageSource = src;
  let cw = sw;
  let ch = sh;
  while (cw / 2 >= tw && ch / 2 >= th) {
    const nw = Math.max(tw, Math.round(cw / 2));
    const nh = Math.max(th, Math.round(ch / 2));
    const step = makeCanvas(nw, nh);
    const sctx = step.getContext("2d")!;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(cur, 0, 0, cw, ch, 0, 0, nw, nh);
    cur = step;
    cw = nw;
    ch = nh;
  }
  const out = makeCanvas(tw, th);
  const octx = out.getContext("2d")!;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(cur, 0, 0, cw, ch, 0, 0, tw, th);
  return out;
}

async function canvasToJpeg(c: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error("JPEG encoding failed"))), "image/jpeg", quality)
  );
  return new Uint8Array(await blob.arrayBuffer());
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate");
  const out = new Blob([data]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

// Reverses PNG row predictors (DecodeParms /Predictor >= 10).
function unpredictPng(data: Uint8Array, colors: number, columns: number): Uint8Array | null {
  const bpp = colors;
  const row = colors * columns;
  const rows = Math.floor(data.length / (row + 1));
  const out = new Uint8Array(rows * row);
  for (let r = 0; r < rows; r++) {
    const type = data[r * (row + 1)];
    const src = r * (row + 1) + 1;
    const dst = r * row;
    for (let x = 0; x < row; x++) {
      const raw = data[src + x];
      const left = x >= bpp ? out[dst + x - bpp] : 0;
      const up = r > 0 ? out[dst - row + x] : 0;
      const ul = r > 0 && x >= bpp ? out[dst - row + x - bpp] : 0;
      let v: number;
      switch (type) {
        case 0: v = raw; break;
        case 1: v = raw + left; break;
        case 2: v = raw + up; break;
        case 3: v = raw + ((left + up) >> 1); break;
        case 4: {
          const p = left + up - ul;
          const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - ul);
          v = raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : ul);
          break;
        }
        default: return null;
      }
      out[dst + x] = v & 255;
    }
  }
  return out;
}

// PNG "Up" predictor: each row stored as its difference from the row above,
// which deflates much better than raw pixels.
function predictUp(pixels: Uint8Array, rowBytes: number, rows: number): Uint8Array {
  const out = new Uint8Array(rows * (rowBytes + 1));
  for (let r = 0; r < rows; r++) {
    out[r * (rowBytes + 1)] = 2;
    for (let x = 0; x < rowBytes; x++) {
      const v = pixels[r * rowBytes + x];
      const up = r > 0 ? pixels[(r - 1) * rowBytes + x] : 0;
      out[r * (rowBytes + 1) + 1 + x] = (v - up) & 255;
    }
  }
  return out;
}

// How many color components the image's color space has, if it's one we can
// safely re-encode (grey or RGB). CMYK, indexed and spot colors are skipped.
function componentCount(doc: PDFDocument, cs: PDFObject | undefined): 1 | 3 | null {
  const obj = cs instanceof PDFRef ? doc.context.lookup(cs) : cs;
  if (obj instanceof PDFName) {
    const n = obj.decodeText();
    if (n === "DeviceRGB" || n === "CalRGB") return 3;
    if (n === "DeviceGray" || n === "CalGray") return 1;
    return null;
  }
  if (obj instanceof PDFArray && obj.size() >= 2) {
    const kind = obj.lookup(0);
    if (kind instanceof PDFName && kind.decodeText() === "ICCBased") {
      const s = obj.lookup(1);
      if (s instanceof PDFStream) {
        const nComp = s.dict.lookup(N("N"));
        const v = nComp instanceof PDFNumber ? nComp.asNumber() : 0;
        return v === 3 ? 3 : v === 1 ? 1 : null;
      }
    }
    if (kind instanceof PDFName && (kind.decodeText() === "CalRGB" || kind.decodeText() === "CalGray")) {
      return kind.decodeText() === "CalRGB" ? 3 : 1;
    }
  }
  return null;
}

// Keys copied from the old image dictionary to its replacement.
const KEEP_KEYS = ["SMask", "Intent", "OC", "Interpolate", "StructParent", "ID", "Name", "Alternates"];

function buildImageStream(
  doc: PDFDocument,
  old: PDFRawStream,
  contents: Uint8Array,
  entries: Record<string, any>
): PDFRawStream {
  const s = doc.context.stream(contents, { Type: "XObject", Subtype: "Image", ...entries });
  for (const k of KEEP_KEYS) {
    const v = old.dict.get(N(k));
    if (v) s.dict.set(N(k), v);
  }
  return s;
}

async function recompressImage(
  doc: PDFDocument,
  stream: PDFRawStream,
  drawn: { w: number; h: number },
  level: { dpi: number; quality: number }
): Promise<PDFRawStream | null> {
  const d = stream.dict;
  const num = (k: string) => {
    const v = d.lookup(N(k));
    return v instanceof PDFNumber ? v.asNumber() : undefined;
  };
  const width = num("Width");
  const height = num("Height");
  if (!width || !height || width * height > MAX_PIXELS) return null;
  if (d.lookup(N("ImageMask"))?.toString() === "true") return null;
  if (d.has(N("Decode")) || d.has(N("Mask"))) return null; // inverted or color-keyed: re-encoding could change colors
  if ((num("BitsPerComponent") ?? 8) !== 8) return null;

  const comps = componentCount(doc, d.lookup(N("ColorSpace")));
  if (!comps) return null;

  let filter = d.lookup(N("Filter"));
  if (filter instanceof PDFArray) filter = filter.size() === 1 ? filter.lookup(0) : undefined;
  const filterName = filter instanceof PDFName ? filter.decodeText() : filter === undefined && !d.has(N("Filter")) ? "none" : null;
  if (filterName !== "DCTDecode" && filterName !== "FlateDecode" && filterName !== "none") return null;

  // Target pixel size for this image at the level's DPI.
  const needW = Math.ceil((drawn.w / 72) * level.dpi);
  const needH = Math.ceil((drawn.h / 72) * level.dpi);
  let scale = Math.min(1, Math.max(needW / width, needH / height));
  if (scale > 0.9) scale = 1;
  const tw = Math.max(1, Math.round(width * scale));
  const th = Math.max(1, Math.round(height * scale));

  // Keep a colored ICC space when we stay in RGB; otherwise use DeviceRGB.
  const origCs = d.get(N("ColorSpace"));

  if (filterName === "DCTDecode") {
    const bmp = await createImageBitmap(new Blob([stream.contents], { type: "image/jpeg" }));
    const canvas = resample(bmp, bmp.width, bmp.height, tw, th);
    bmp.close();
    const jpeg = await canvasToJpeg(canvas, level.quality);
    if (jpeg.length >= stream.contents.length * 0.97) return null;
    return buildImageStream(doc, stream, jpeg, {
      Width: tw,
      Height: th,
      ColorSpace: comps === 3 ? origCs : "DeviceRGB",
      BitsPerComponent: 8,
      Filter: "DCTDecode",
    });
  }

  // Flate or uncompressed raw pixels.
  let raw = streamBytes(stream);
  if (!raw) return null;
  const parms = d.lookup(N("DecodeParms"));
  if (parms instanceof PDFDict) {
    const pred = parms.lookup(N("Predictor"));
    const p = pred instanceof PDFNumber ? pred.asNumber() : 1;
    if (p >= 10) {
      const cols = parms.lookup(N("Columns"));
      raw = unpredictPng(raw, comps, cols instanceof PDFNumber ? cols.asNumber() : width);
      if (!raw) return null;
    } else if (p !== 1) return null;
  }
  if (raw.length < width * height * comps) return null;

  const rgba = new Uint8ClampedArray(width * height * 4);
  const colors = new Set<number>();
  const sampleEvery = Math.max(1, Math.floor((width * height) / 40000));
  for (let p = 0, q = 0; p < width * height; p++, q += comps) {
    const r = raw[q];
    const g = comps === 3 ? raw[q + 1] : r;
    const b = comps === 3 ? raw[q + 2] : r;
    rgba[p * 4] = r;
    rgba[p * 4 + 1] = g;
    rgba[p * 4 + 2] = b;
    rgba[p * 4 + 3] = 255;
    if (p % sampleEvery === 0 && colors.size < 10000) colors.add((r << 16) | (g << 8) | b);
  }
  const src = makeCanvas(width, height);
  src.getContext("2d")!.putImageData(new ImageData(rgba, width, height), 0, 0);

  // Few distinct colors means a screenshot, chart or diagram: JPEG would blur
  // its edges, so it stays lossless and is only downsampled.
  const photographic = colors.size >= 6000;
  if (photographic) {
    const jpeg = await canvasToJpeg(resample(src, width, height, tw, th), level.quality);
    if (jpeg.length >= stream.contents.length * 0.97) return null;
    return buildImageStream(doc, stream, jpeg, {
      Width: tw,
      Height: th,
      ColorSpace: comps === 3 ? origCs : "DeviceRGB",
      BitsPerComponent: 8,
      Filter: "DCTDecode",
    });
  }

  if (scale === 1 && filterName === "FlateDecode") return null; // already lossless and at size
  const small = scale === 1 ? src : resample(src, width, height, tw, th);
  const px = small.getContext("2d")!.getImageData(0, 0, tw, th).data;
  const packed = new Uint8Array(tw * th * comps);
  for (let p = 0, q = 0; p < tw * th; p++, q += comps) {
    packed[q] = px[p * 4];
    if (comps === 3) {
      packed[q + 1] = px[p * 4 + 1];
      packed[q + 2] = px[p * 4 + 2];
    }
  }
  const flate = await deflate(predictUp(packed, tw * comps, th));
  if (flate.length >= stream.contents.length * 0.97) return null;
  return buildImageStream(doc, stream, flate, {
    Width: tw,
    Height: th,
    ColorSpace: origCs,
    BitsPerComponent: 8,
    Filter: "FlateDecode",
    DecodeParms: { Predictor: 15, Colors: comps, BitsPerComponent: 8, Columns: tw },
  });
}

// ─── Structure clean-up ─────────────────────────────────────────────────────

function forEachChild(obj: PDFObject, fn: (child: PDFObject, set: (v: PDFObject) => void) => void) {
  if (obj instanceof PDFDict) {
    for (const [k, v] of obj.entries()) fn(v, (nv) => obj.set(k, nv));
  } else if (obj instanceof PDFArray) {
    for (let i = 0; i < obj.size(); i++) fn(obj.get(i), (nv) => obj.set(i, nv));
  } else if (obj instanceof PDFStream) {
    forEachChild(obj.dict, fn);
  }
}

// FNV-1a over the stream bytes; collisions are confirmed with a full compare.
function hashBytes(b: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i++) {
    h ^= b[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Points every reference to a duplicate stream at one shared copy.
function mergeDuplicateStreams(doc: PDFDocument): number {
  const ctx = doc.context;
  const seen = new Map<string, { ref: PDFRef; s: PDFRawStream }[]>();
  const replace = new Map<string, PDFRef>();
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream) || obj.contents.length < 256) continue;
    const key = `${obj.contents.length}:${hashBytes(obj.contents)}:${obj.dict.toString()}`;
    const list = seen.get(key) || [];
    const match = list.find((e) => sameBytes(e.s.contents, obj.contents));
    if (match) replace.set(ref.toString(), match.ref);
    else list.push({ ref, s: obj });
    seen.set(key, list);
  }
  if (!replace.size) return 0;
  const rewrite = (o: PDFObject) =>
    forEachChild(o, (child, set) => {
      if (child instanceof PDFRef) {
        const to = replace.get(child.toString());
        if (to) set(to);
      } else rewrite(child);
    });
  for (const [, obj] of ctx.enumerateIndirectObjects()) rewrite(obj);
  return replace.size;
}

// Deletes every indirect object that can't be reached from the trailer.
function removeUnreachable(doc: PDFDocument) {
  const ctx = doc.context;
  const reached = new Set<string>();
  const queue: PDFObject[] = [];
  const push = (o: PDFObject | undefined) => o && queue.push(o);
  push(ctx.trailerInfo.Root as PDFObject);
  push(ctx.trailerInfo.Info as PDFObject);
  while (queue.length) {
    const o = queue.pop()!;
    if (o instanceof PDFRef) {
      const k = o.toString();
      if (reached.has(k)) continue;
      reached.add(k);
      push(ctx.lookup(o));
    } else forEachChild(o, (child) => push(child));
  }
  for (const [ref] of ctx.enumerateIndirectObjects()) {
    if (!reached.has(ref.toString())) ctx.delete(ref);
  }
}

// ─── Entry point ────────────────────────────────────────────────────────────

export async function compressPdf(
  input: ArrayBuffer,
  levelName: CompressLevel,
  onProgress: Progress,
  // Only for tuning the levels; the site always uses the named presets.
  override?: { dpi: number; quality: number }
): Promise<CompressResult> {
  const level = override || LEVELS[levelName];
  onProgress(5, "Reading your PDF...");
  const doc = await PDFDocument.load(input, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
  if (doc.isEncrypted) {
    throw new Error("PASSWORD_PROTECTED");
  }
  const ctx = doc.context;

  onProgress(12, "Measuring images on each page...");
  const placements = measurePlacements(doc);
  // Images we couldn't find on a page are assumed to fill the largest page.
  const pages = doc.getPages();
  const largest = pages.reduce(
    (m, p) => ({ w: Math.max(m.w, p.getWidth()), h: Math.max(m.h, p.getHeight()) }),
    { w: 612, h: 792 }
  );

  // Soft masks and stencil masks are part of another image; leave them alone.
  const maskRefs = new Set<string>();
  const images: [PDFRef, PDFRawStream][] = [];
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream) || obj.dict.get(N("Subtype")) !== N("Image")) continue;
    images.push([ref, obj]);
    for (const k of ["SMask", "Mask"]) {
      const m = obj.dict.get(N(k));
      if (m instanceof PDFRef) maskRefs.add(m.toString());
    }
  }

  let recompressed = 0;
  for (let i = 0; i < images.length; i++) {
    const [ref, img] = images[i];
    onProgress(15 + Math.round((i / Math.max(1, images.length)) * 70), `Optimizing image ${i + 1} of ${images.length}...`);
    if (maskRefs.has(ref.toString())) continue;
    try {
      const drawn = placements.get(ref.toString()) || largest;
      const replacement = await recompressImage(doc, img, drawn, level);
      if (replacement) {
        ctx.assign(ref, replacement);
        recompressed++;
      }
    } catch {
      // An image the browser can't decode is simply kept as it was.
    }
    if (i % 4 === 3) await yieldToBrowser();
  }

  onProgress(88, "Cleaning up the file structure...");
  // Page thumbnails are regenerated by every modern viewer.
  for (const p of pages) p.node.delete(N("Thumb"));
  if (levelName === "strong") {
    doc.catalog.delete(N("Metadata"));
    doc.catalog.delete(N("PieceInfo"));
    for (const p of pages) p.node.delete(N("PieceInfo"));
  }

  const merged = mergeDuplicateStreams(doc);

  // Compress streams that were stored without any compression.
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream) || obj.dict.has(N("Filter")) || obj.contents.length < 512) continue;
    const type = obj.dict.get(N("Type"));
    if (type === N("Metadata") || obj.dict.get(N("Subtype")) === N("Image")) continue;
    const flate = await deflate(obj.contents);
    if (flate.length >= obj.contents.length * 0.9) continue;
    const s = ctx.stream(flate, {});
    for (const [k, v] of obj.dict.entries()) {
      if (k !== N("Length") && k !== N("DecodeParms")) s.dict.set(k, v);
    }
    s.dict.set(N("Filter"), N("FlateDecode"));
    ctx.assign(ref, s);
  }

  removeUnreachable(doc);

  onProgress(94, "Saving your compressed PDF...");
  const bytes = await doc.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
  return { bytes, imagesTotal: images.length - maskRefs.size, imagesRecompressed: recompressed, duplicatesMerged: merged };
}
