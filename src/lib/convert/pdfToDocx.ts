// PDF → Word (.docx), "exact look", entirely in the browser.
//
// Each PDF page becomes one Word page of the same size. Everything that isn't
// text (pictures, table borders, shapes, fills, underlines) is placed behind
// the text as images cut from a text-free render of the page. Every block of
// text becomes a frame at its exact position, with the same font, size and
// colour, one Word line per PDF line, so nothing re-wraps and the spacing
// matches the PDF.
//
// Placement relies on a measured Word rule: with exact line spacing L, Word
// puts a frame's first baseline 0.80 × L below the frame's top, starts text at
// the frame's left edge, and steps each following line by exactly L
// (calibrated against Word 16 for Calibri, Arial, Times New Roman, Cambria,
// Segoe UI and Verdana at 10–24 pt).

import {
  Document,
  FrameAnchorType,
  FrameWrap,
  HeightRule,
  HorizontalPositionRelativeFrom,
  ImageRun,
  LineRuleType,
  Packer,
  Paragraph,
  TextRun,
  TextWrappingType,
  VerticalPositionRelativeFrom,
} from "docx";
import { extractPageModels, type Block, type PageModel, type TextRun as PdfRun } from "../pdf/pageModel";
import { measureText } from "../fonts/metricFonts";

type Progress = (pct: number, msg: string) => void;

const WORD_BASELINE_RATIO = 0.8;
const twip = (pt: number) => Math.round(pt * 20);
const emu = (pt: number) => Math.round(pt * 12700);
const px = (pt: number) => (pt * 96) / 72;

// Word sizes are whole half-points.
const wordSize = (size: number) => Math.max(2, Math.round(size * 2)) / 2;

async function runsFor(run: PdfRun, isLastInLine: boolean): Promise<TextRun[]> {
  const size = wordSize(run.size);
  let text = run.text;
  // A trailing space at the end of a line only pads it; drop it.
  if (isLastInLine) text = text.replace(/\s+$/, "");
  if (!text) return [];
  const base = {
    font: { ascii: run.family, hAnsi: run.family, cs: run.family, eastAsia: run.family },
    size: size * 2,
    bold: run.bold,
    italics: run.italic,
    color: run.color,
    noProof: true,
  };

  // Stretch or squeeze so the run is exactly as wide as in the PDF. Justified
  // lines get their extra room in the spaces, like the original; anything
  // else is spread evenly across the characters. The comparison uses the
  // text as the PDF drew it, trailing space included.
  const natural = await measureText(run.text, run.family, size, run.bold, run.italic);
  if (natural === null) return [new TextRun({ ...base, text })];
  const delta = run.width - natural;
  if (Math.abs(delta) < 0.3) return [new TextRun({ ...base, text })];

  // With the original font present, extra width can only come from the PDF
  // stretching its spaces (justified text). With a stand-in font, the
  // difference is the fonts' own widths, so it's spread over every letter.
  const spaces = (text.match(/ /g) || []).length;
  if (!run.substituted && spaces > 0 && delta > 0.5 && delta / spaces > 0.3) {
    const perSpace = Math.min(40, delta / spaces);
    const out: TextRun[] = [];
    for (const part of text.split(/( )/)) {
      if (!part) continue;
      out.push(new TextRun({ ...base, text: part, characterSpacing: part === " " ? twip(perSpace) : undefined }));
    }
    return out;
  }
  const perChar = Math.max(-2, Math.min(4, delta / Math.max(1, text.length)));
  return [new TextRun({ ...base, text, characterSpacing: twip(perChar) })];
}

async function blockParagraphs(block: Block, pageWidth: number, pageHeight: number): Promise<Paragraph[]> {
  const first = block.lines[0];
  const multi = block.lines.length > 1;
  // For a single line, pick a line height that leaves room for accents and
  // descenders; for several, use the PDF's own baseline-to-baseline distance.
  const L = multi ? block.leading : Math.max(first.size * 1.2, 1);
  // Word drops a frame that runs off the bottom of the page, so text the PDF
  // shows cut off at the edge is nudged up just enough to stay visible.
  const top = Math.max(0, Math.min(first.baseline - WORD_BASELINE_RATIO * L, pageHeight - L * block.lines.length));
  // Generous extra width so a slightly wider font can't force a wrap; lines
  // are left-aligned, so the extra room is invisible.
  const width = Math.min(pageWidth - block.x, block.width * 1.15 + 12);
  const frame = {
    type: "absolute" as const,
    position: { x: twip(block.x), y: twip(top) },
    width: twip(Math.max(width, 6)),
    height: twip(L * block.lines.length),
    rule: HeightRule.ATLEAST,
    wrap: FrameWrap.NONE,
    anchor: { horizontal: FrameAnchorType.PAGE, vertical: FrameAnchorType.PAGE },
  };
  const paragraphs: Paragraph[] = [];
  for (const line of block.lines) {
    const children: TextRun[] = [];
    for (let i = 0; i < line.runs.length; i++) {
      children.push(...(await runsFor(line.runs[i], i === line.runs.length - 1)));
    }
    paragraphs.push(
      new Paragraph({
        frame,
        spacing: { line: twip(L), lineRule: LineRuleType.EXACT, before: 0, after: 0 },
        indent: { left: twip(Math.max(0, line.x - block.x)) },
        children,
      })
    );
  }
  return paragraphs;
}

async function pageChildren(model: PageModel): Promise<Paragraph[]> {
  // The first paragraph carries the background pictures; it's 1 pt tall so it
  // never pushes anything onto a second page.
  const images = model.background.map(
    (piece, i) =>
      new ImageRun({
        type: piece.type,
        data: piece.data,
        transformation: { width: px(piece.width), height: px(piece.height) },
        floating: {
          horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: emu(piece.x) },
          verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: emu(piece.y) },
          behindDocument: true,
          allowOverlap: true,
          wrap: { type: TextWrappingType.NONE },
          zIndex: i,
        },
      })
  );
  const anchor = new Paragraph({
    spacing: { line: 20, lineRule: LineRuleType.EXACT, before: 0, after: 0 },
    children: images.length ? images : [new TextRun({ text: "", size: 2 })],
  });
  const out = [anchor];
  for (const block of model.blocks) out.push(...(await blockParagraphs(block, model.width, model.height)));
  return out;
}

export async function pdfToDocx(bytes: ArrayBuffer, title: string, onProgress: Progress): Promise<{ blob: Blob; pages: number }> {
  const models = await extractPageModels(bytes, onProgress);
  onProgress(88, "Building your Word document...");
  const sections = [];
  for (const model of models) {
    sections.push({
      properties: {
        page: {
          size: { width: twip(model.width), height: twip(model.height) },
          margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0, gutter: 0 },
        },
      },
      children: await pageChildren(model),
    });
  }
  const doc = new Document({
    title,
    creator: "FoldPDF",
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections,
  });
  onProgress(96, "Saving your Word document...");
  return { blob: await Packer.toBlob(doc), pages: models.length };
}
