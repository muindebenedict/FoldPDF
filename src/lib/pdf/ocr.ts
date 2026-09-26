// OCR for scanned PDFs, entirely in the browser.
//
// Each page is rendered with pdf.js, read by Tesseract, and the recognised
// words are written back onto the ORIGINAL page as invisible text (render
// mode 3). The page looks exactly as before, but the text can be searched,
// selected and copied. Pages that already carry a text layer are left alone.

import {
  PDFDocument,
  StandardFonts,
  TextRenderingMode,
  beginText,
  endText,
  popGraphicsState,
  pushGraphicsState,
  setCharacterSqueeze,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
} from "@cantoo/pdf-lib";
import { getPdfJs, getTesseract } from "../../components/tools/PdfScriptLoader";

type Progress = (pct: number, msg: string) => void;

interface OcrWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  // The word's line baseline, when Tesseract found one. The box bottom
  // includes descenders, so the baseline places the text layer more exactly.
  baseline?: { x0: number; y0: number; x1: number; y1: number; has_baseline?: boolean };
}

function baselineY(w: OcrWord, x: number): number {
  const b = w.baseline;
  if (!b || b.has_baseline === false || b.x1 === b.x0) return w.bbox.y1;
  const y = b.y0 + ((x - b.x0) * (b.y1 - b.y0)) / (b.x1 - b.x0);
  // Ignore a baseline that doesn't sit inside the word's box.
  return y > w.bbox.y0 && y <= w.bbox.y1 + 1 ? y : w.bbox.y1;
}

export interface OcrResult {
  pdf: Uint8Array;
  text: string;
  pagesScanned: number;
  pagesWithText: number;
  words: number;
}

// Render scale for recognition. 2x (about 144 DPI) is a good balance between
// Tesseract accuracy and speed on phones.
const OCR_SCALE = 2;

// Helvetica (WinAnsi) can't encode everything Tesseract may return. The layer
// is invisible, so replacing the rare unencodable character only affects
// search for that character.
function toWinAnsi(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function collectWords(data: any): OcrWord[] {
  const words: OcrWord[] = [];
  for (const block of data?.blocks || [])
    for (const para of block.paragraphs || [])
      for (const line of para.lines || [])
        for (const w of line.words || []) words.push({ text: w.text, bbox: w.bbox, baseline: line.baseline });
  if (!words.length && Array.isArray(data?.words)) return data.words;
  return words;
}

export async function ocrPdf(bytes: ArrayBuffer, onProgress: Progress): Promise<OcrResult> {
  const pdfjs = await getPdfJs();
  const src = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
  const out = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const font = await out.embedFont(StandardFonts.Helvetica);

  onProgress(8, "Loading the text recognition engine...");
  const Tesseract = await getTesseract();
  const worker = await Tesseract.createWorker("eng");

  let fullText = "";
  let pagesScanned = 0;
  let pagesWithText = 0;
  let wordCount = 0;

  try {
    const total = src.numPages;
    for (let i = 1; i <= total; i++) {
      const page = await src.getPage(i);
      const outPage = out.getPage(i - 1);

      // A page that already has real text doesn't need OCR, and adding a
      // second layer would duplicate every search hit.
      const existing = await page.getTextContent();
      const existingText = existing.items.map((it: any) => it.str).join(" ").trim();
      if (existingText.replace(/\s+/g, "").length > 25) {
        pagesWithText++;
        fullText += `\n--- Page ${i} ---\n${existingText}\n`;
        continue;
      }

      onProgress(10 + Math.round(((i - 1) / total) * 85), `Reading page ${i} of ${total}...`);
      const viewport = page.getViewport({ scale: OCR_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // "print" rendering keeps going in a background tab (no animation frames).
      await page.render({ canvasContext: ctx, viewport, intent: "print" }).promise;

      const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
      fullText += `\n--- Page ${i} ---\n${(data.text || "").trim()}\n`;
      pagesScanned++;

      // pdf-lib's font dictionary keys are per page, so register the font on
      // this page and draw each word where Tesseract found it.
      const key = outPage.node.newFontDictionary(font.name, font.ref);
      const ops: any[] = [pushGraphicsState()];
      for (const w of collectWords(data)) {
        const text = toWinAnsi((w.text || "").trim());
        if (!text) continue;
        const { x0, y0, x1 } = w.bbox;
        const base0 = baselineY(w, x0);
        const base1 = baselineY(w, x1);
        // Map the word's baseline ends from canvas pixels to PDF space; this
        // handles rotated pages and offset media boxes.
        const [ax, ay] = viewport.convertToPdfPoint(x0, base0);
        const [bx, by] = viewport.convertToPdfPoint(x1, base1);
        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.hypot(dx, dy);
        if (len < 1) continue;
        // Cap height is roughly 70% of the font size.
        const size = Math.max(4, (Math.min(base0, base1) - y0) / OCR_SCALE / 0.72);
        const natural = font.widthOfTextAtSize(text, size);
        const squeeze = natural > 0 ? Math.max(10, Math.min(400, (len / natural) * 100)) : 100;
        const cos = dx / len;
        const sin = dy / len;
        ops.push(
          beginText(),
          setTextRenderingMode(TextRenderingMode.Invisible),
          setFontAndSize(key, size),
          setCharacterSqueeze(squeeze),
          setTextMatrix(cos, sin, -sin, cos, ax, ay),
          showText(font.encodeText(text)),
          endText()
        );
        wordCount++;
      }
      ops.push(popGraphicsState());
      outPage.pushOperators(...ops);
      page.cleanup();
    }
  } finally {
    await worker.terminate();
    await src.destroy();
  }

  onProgress(97, "Saving your searchable PDF...");
  const pdf = await out.save({ useObjectStreams: true });
  return { pdf, text: fullText.trim() + "\n", pagesScanned, pagesWithText, words: wordCount };
}
