// Open fonts with exactly the same character widths as common Office fonts
// (Carlito = Calibri, Caladea = Cambria, Liberation = Arial / Times New
// Roman / Courier New). Using them to measure or draw text makes line breaks
// and spacing land where Office puts them. Served from /fonts, loaded only
// when a converter needs a given style.

type Style = "Regular" | "Bold" | "Italic" | "BoldItalic";

const FILES: Record<string, { css: string; file: string; styles: Style[] }> = {
  calibri: { css: "FP Carlito", file: "Carlito", styles: ["Regular", "Bold", "Italic", "BoldItalic"] },
  cambria: { css: "FP Caladea", file: "Caladea", styles: ["Regular", "Bold", "Italic", "BoldItalic"] },
  arial: { css: "FP Liberation Sans", file: "LiberationSans", styles: ["Regular", "Bold", "Italic", "BoldItalic"] },
  "times new roman": { css: "FP Liberation Serif", file: "LiberationSerif", styles: ["Regular", "Bold", "Italic", "BoldItalic"] },
  "courier new": { css: "FP Liberation Mono", file: "LiberationMono", styles: ["Regular", "Bold"] },
};
FILES.helvetica = FILES.arial;
FILES.times = FILES["times new roman"];
FILES.courier = FILES["courier new"];
FILES.carlito = FILES.calibri;
FILES.caladea = FILES.cambria;

const styleOf = (bold: boolean, italic: boolean): Style =>
  bold && italic ? "BoldItalic" : bold ? "Bold" : italic ? "Italic" : "Regular";

const bytesCache = new Map<string, Promise<ArrayBuffer>>();
const faceCache = new Map<string, Promise<boolean>>();

function entryFor(family: string, bold: boolean, italic: boolean) {
  const e = FILES[family.trim().toLowerCase()];
  if (!e) return null;
  let style = styleOf(bold, italic);
  if (!e.styles.includes(style)) style = bold ? "Bold" : "Regular";
  return { ...e, style, url: `/fonts/${e.file}-${style}.ttf` };
}

export function hasMetricFont(family: string): boolean {
  return !!FILES[family.trim().toLowerCase()];
}

// Raw TTF bytes, for embedding into generated PDFs.
export function metricFontBytes(family: string, bold: boolean, italic: boolean): Promise<ArrayBuffer> | null {
  const e = entryFor(family, bold, italic);
  if (!e) return null;
  if (!bytesCache.has(e.url)) {
    bytesCache.set(
      e.url,
      fetch(e.url).then((r) => {
        if (!r.ok) throw new Error(`font ${e.url} ${r.status}`);
        return r.arrayBuffer();
      })
    );
  }
  return bytesCache.get(e.url)!;
}

// Registers the metric font as a CSS font face so canvas and HTML can use it.
// Returns the CSS family name, or null if there is no metric font.
export async function loadMetricFace(family: string, bold: boolean, italic: boolean): Promise<string | null> {
  const e = entryFor(family, bold, italic);
  if (!e) return null;
  const key = e.url;
  if (!faceCache.has(key)) {
    faceCache.set(
      key,
      (async () => {
        const data = await metricFontBytes(family, bold, italic)!;
        const face = new FontFace(e.css, data, {
          weight: e.style.startsWith("Bold") ? "700" : "400",
          style: e.style.endsWith("Italic") ? "italic" : "normal",
        });
        await face.load();
        document.fonts.add(face);
        return true;
      })().catch(() => false)
    );
  }
  return (await faceCache.get(key)) ? e.css : null;
}

// Whether a font is installed on this device (not substituted by the browser).
const installedCache = new Map<string, boolean>();
export function isInstalled(family: string): boolean {
  if (installedCache.has(family)) return installedCache.get(family)!;
  const ctx = document.createElement("canvas").getContext("2d")!;
  const probe = "mmmmmmmmmmlliWW@#1";
  let installed = false;
  for (const generic of ["monospace", "serif", "sans-serif"]) {
    ctx.font = `72px ${generic}`;
    const base = ctx.measureText(probe).width;
    ctx.font = `72px "${family}", ${generic}`;
    if (ctx.measureText(probe).width !== base) {
      installed = true;
      break;
    }
  }
  installedCache.set(family, installed);
  return installed;
}

let mctx: CanvasRenderingContext2D | null = null;

// Width in points of `text` in `family` at `size`, as Office would lay it out.
// Uses the metric-compatible font when there is one, otherwise the font
// installed on this device. Returns null when neither is available, because
// a substituted font's width would be misleading.
export async function measureText(text: string, family: string, size: number, bold: boolean, italic: boolean): Promise<number | null> {
  let css = await loadMetricFace(family, bold, italic);
  if (!css) {
    if (!isInstalled(family)) return null;
    css = family;
  }
  if (!mctx) mctx = document.createElement("canvas").getContext("2d");
  const weight = bold ? "700" : "400";
  const style = italic ? "italic" : "normal";
  mctx!.font = `${style} ${weight} 100px "${css}"`;
  return (mctx!.measureText(text).width * size) / 100;
}
