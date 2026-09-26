// Fonts for PDFs generated in the browser from Office documents.
//
// Office fonts can't be shipped, so each one is drawn with an open font:
// - Calibri, Cambria, Arial, Times New Roman and Courier New have open twins
//   with identical character widths (Carlito, Caladea, Liberation), so text
//   lays out exactly as in Office;
// - any other font is measured with the copy installed on this device when
//   there is one (so line breaks still match Office) and drawn with an open
//   font of the same kind, stretched to the same width.
// Line heights come from the real font's vertical metrics.

import { PDFDocument, PDFFont, StandardFonts } from "@cantoo/pdf-lib";
import { getFontkit } from "../../components/tools/PdfScriptLoader";
import { isInstalled, metricFontBytes } from "./metricFonts";

export interface VMetrics {
  single: number; // "single" line height, × font size
  ascent: number; // line top to baseline at single spacing, × font size
  descent: number;
}

// Vertical metrics of common Windows fonts (hhea ascender, descender and line
// gap over units per em). Word's single spacing is ascent + descent + gap.
const KNOWN: Record<string, VMetrics> = {
  cambria: { single: 1.1719, ascent: 0.9502, descent: 0.2217 },
  "cambria math": { single: 1.1719, ascent: 0.9502, descent: 0.2217 },
  georgia: { single: 1.1362, ascent: 0.917, descent: 0.2192 },
  verdana: { single: 1.2153, ascent: 1.0054, descent: 0.2099 },
  tahoma: { single: 1.207, ascent: 1.0005, descent: 0.2065 },
  "segoe ui": { single: 1.3301, ascent: 1.0791, descent: 0.251 },
  "trebuchet ms": { single: 1.1611, ascent: 0.939, descent: 0.2222 },
  "calibri light": { single: 1.2207, ascent: 0.9521, descent: 0.2686 },
};

const SERIF = /times|serif|garamond|georgia|cambria|book|palatino|century schoolbook|constantia|baskerville|caslon|didot|bodoni|rockwell|maiandra/i;
const MONO = /courier|consolas|mono|lucida console|menlo/i;

// The open twin with identical widths, if there is one.
export function metricTwin(family: string): string | null {
  const f = family.trim().toLowerCase();
  if (/^calibri( light)?$/.test(f) || f === "carlito") return "Calibri";
  if (/^cambria/.test(f) || f === "caladea") return "Cambria";
  if (f === "arial" || f === "helvetica" || f === "liberation sans" || f === "arial mt") return "Arial";
  if (f === "times new roman" || f === "times" || f === "liberation serif") return "Times New Roman";
  if (f === "courier new" || f === "courier" || f === "liberation mono") return "Courier New";
  return null;
}

function standIn(family: string): string {
  if (MONO.test(family)) return "Courier New";
  if (SERIF.test(family)) return "Times New Roman";
  return "Arial";
}

export interface ResolvedFont {
  font: PDFFont;
  // Draw with this horizontal scale (percent) so widths match `measure`.
  exact: boolean;
  metrics: VMetrics;
  family: string;
  bold: boolean;
  italic: boolean;
}

export class PdfFontSet {
  private embedded = new Map<string, Promise<PDFFont>>();
  private metricsCache = new Map<string, Promise<VMetrics>>();
  private ctx = document.createElement("canvas").getContext("2d")!;

  constructor(private doc: PDFDocument) {}

  private embed(twin: string, bold: boolean, italic: boolean): Promise<PDFFont> {
    const key = `${twin}|${bold}|${italic}`;
    if (!this.embedded.has(key)) {
      this.embedded.set(
        key,
        (async () => {
          try {
            const bytes = await metricFontBytes(twin, bold, italic);
            if (bytes) return await this.doc.embedFont(bytes, { subset: true });
          } catch {
            // fall back to a standard font below
          }
          const std = bold && italic ? StandardFonts.HelveticaBoldOblique : bold ? StandardFonts.HelveticaBold : italic ? StandardFonts.HelveticaOblique : StandardFonts.Helvetica;
          return this.doc.embedFont(std);
        })()
      );
    }
    return this.embedded.get(key)!;
  }

  private metrics(family: string, twin: string): Promise<VMetrics> {
    const known = KNOWN[family.trim().toLowerCase()];
    if (known) return Promise.resolve(known);
    if (!this.metricsCache.has(twin)) {
      this.metricsCache.set(
        twin,
        (async () => {
          try {
            const bytes = await metricFontBytes(twin, false, false);
            const fk = await getFontkit();
            const f = fk.create(new Uint8Array(await bytes!));
            const u = f.unitsPerEm;
            return { single: (f.ascent - f.descent + f.lineGap) / u, ascent: (f.ascent + f.lineGap) / u, descent: -f.descent / u };
          } catch {
            return { single: 1.15, ascent: 0.93, descent: 0.22 };
          }
        })()
      );
    }
    return this.metricsCache.get(twin)!;
  }

  async get(family: string, bold: boolean, italic: boolean): Promise<ResolvedFont> {
    const twin = metricTwin(family);
    const drawAs = twin || standIn(family);
    // Heavy families have no open twin; bold is the closest.
    const heavy = /black|heavy|extrabold|ultra/i.test(family);
    const font = await this.embed(drawAs, bold || heavy, italic);
    return { font, exact: !!twin, metrics: await this.metrics(family, drawAs), family, bold: bold || heavy, italic };
  }

  // Width of `text` as Office lays it out.
  width(rf: ResolvedFont, text: string, size: number): number {
    if (!rf.exact && isInstalled(rf.family)) {
      this.ctx.font = `${rf.italic ? "italic " : ""}${rf.bold ? "700 " : "400 "}${size * 4}px "${rf.family}"`;
      return this.ctx.measureText(text).width / 4;
    }
    try {
      return rf.font.widthOfTextAtSize(text, size);
    } catch {
      return size * 0.5 * text.length;
    }
  }

  // Horizontal scale (percent) that makes the embedded font as wide as
  // `width` says, for fonts drawn with a stand-in.
  stretch(rf: ResolvedFont, text: string, size: number): number {
    if (rf.exact || !text.trim()) return 100;
    let drawn = 0;
    try {
      drawn = rf.font.widthOfTextAtSize(text, size);
    } catch {
      return 100;
    }
    if (!drawn) return 100;
    return Math.max(50, Math.min(200, (this.width(rf, text, size) / drawn) * 100));
  }
}

// Replaces characters the embedded font can't encode, so one odd symbol
// doesn't stop the whole document from drawing.
export function encodable(font: PDFFont, text: string): string {
  try {
    font.encodeText(text);
    return text;
  } catch {
    return Array.from(text)
      .map((ch) => {
        try {
          font.encodeText(ch);
          return ch;
        } catch {
          return ch.trim() ? "?" : " ";
        }
      })
      .join("");
  }
}
