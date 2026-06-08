import React, { useState, useCallback } from "react";
import { readAB, readTxt, getPdfJs, getPdfLib, getFontkit, getMammoth, getXLSX, getPptxGen, extractText, fmt, getOutputFile, loadScript } from "./PdfScriptLoader";
import { Proc } from "./SharedComponents";

interface ToolProps {
  onSuccess?: (fileName: string, toolName: string) => void;
  toolName: string;
}

// TrueType font paths from a highly reliable cdnjs and jsDelivr mirroring of pdfmake
const REGULAR_FONT_URLS = [
  "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf",
  "https://cdn.jsdelivr.net/npm/pdfmake@0.1.66/build/fonts/Roboto-Regular.ttf",
  "https://unpkg.com/pdfmake@0.1.66/build/fonts/Roboto-Regular.ttf"
];
const BOLD_FONT_URLS = [
  "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Bold.ttf",
  "https://cdn.jsdelivr.net/npm/pdfmake@0.1.66/build/fonts/Roboto-Bold.ttf",
  "https://unpkg.com/pdfmake@0.1.66/build/fonts/Roboto-Bold.ttf"
];
const ITALIC_FONT_URLS = [
  "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Italic.ttf",
  "https://cdn.jsdelivr.net/npm/pdfmake@0.1.66/build/fonts/Roboto-Italic.ttf",
  "https://unpkg.com/pdfmake@0.1.66/build/fonts/Roboto-Italic.ttf"
];
const BOLD_ITALIC_FONT_URLS = [
  "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-BoldItalic.ttf",
  "https://cdn.jsdelivr.net/npm/pdfmake@0.1.66/build/fonts/Roboto-BoldItalic.ttf",
  "https://unpkg.com/pdfmake@0.1.66/build/fonts/Roboto-BoldItalic.ttf"
];

const fontCache: Record<string, Uint8Array> = {};

async function fetchFont(urls: string[], name: string, prog?: (m: string) => void): Promise<Uint8Array | null> {
  const cacheKey = urls[0];
  if (fontCache[cacheKey]) return fontCache[cacheKey];
  if (prog) prog(`Fetching standard typography: ${name}…`);
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const buf = await response.arrayBuffer();
        const arr = new Uint8Array(buf);
        fontCache[cacheKey] = arr;
        return arr;
      }
    } catch (e) {
      console.warn(`Failed to fetch font from ${url}`, e);
    }
  }
  return null; // Graceful fallback
}

// Sanitization function to convert non-WinAnsi Unicode text characters when using standard built-in fonts in pdf-lib (Helvetica / Times)
function sanitizeWinAnsiText(str: string): string {
  if (!str) return "";
  // 1. Replace tab characters (\t, 0x0009) with spaces
  let clean = str.replace(/\t/g, "    ");
  
  // 2. Replace smart/curly quotes with straight quotes
  clean = clean.replace(/[\u201C\u201D\u201F\u2033\u2036\u221F]/g, '"');
  clean = clean.replace(/[\u2018\u2019\u201B\u2032\u2035]/g, "'");

  // 3. Replace em and en dashes with hyphens (single '-' for safety)
  clean = clean.replace(/[\u2013\u2014\u2212]/g, "-");

  // 4. Replace ellipsis with three dots
  clean = clean.replace(/\u2026/g, "...");

  // 5. Strip any null bytes or control characters (0x00-0x08, 0x0B-0x1F)
  clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // 6. Replace any character outside the ASCII range (0x00-0x7F) with a space
  let asciiClean = "";
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    if (code >= 0 && code <= 127) {
      asciiClean += clean[i];
    } else {
      asciiClean += " ";
    }
  }

  return asciiClean;
}

// Interfaces for DOM block elements
interface TextSegment {
  text: string;
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  fontSize: number;
  isMonospace?: boolean;
}

interface BlockElement {
  type: "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "li" | "table" | "br" | "hr";
  segments: TextSegment[];
  alignment: "left" | "center" | "right" | "justify";
  indentLevel: number;
  listType?: "bullet" | "number";
  listIndex?: number;
  tableData?: BlockElement[][][]; // Row -> Cell -> BlockElements
}

// Parsing structures from HTML directly to semantic block-level arrays
function parseHtmlToBlocks(htmlContent: string): BlockElement[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, "text/html");
  const blocks: BlockElement[] = [];

  function parseInline(node: Node, parentStyles: { isBold: boolean; isItalic: boolean; isUnderline: boolean; fontSize: number; isMonospace?: boolean }): TextSegment[] {
    const segments: TextSegment[] = [];
    const styles = { ...parentStyles };

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (tag === "strong" || tag === "b") styles.isBold = true;
      if (tag === "em" || tag === "i") styles.isItalic = true;
      if (tag === "u") styles.isUnderline = true;
      if (tag === "code" || tag === "pre") styles.isMonospace = true;
    }

    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i];
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent || "";
        if (text) {
          segments.push({
            text: sanitizeWinAnsiText(text),
            isBold: styles.isBold,
            isItalic: styles.isItalic,
            isUnderline: styles.isUnderline,
            fontSize: styles.fontSize,
            isMonospace: styles.isMonospace,
          });
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (tag === "br") {
          segments.push({
            text: "\n",
            isBold: styles.isBold,
            isItalic: styles.isItalic,
            isUnderline: styles.isUnderline,
            fontSize: styles.fontSize,
            isMonospace: styles.isMonospace,
          });
        } else {
          segments.push(...parseInline(child, styles));
        }
      }
    }
    return segments;
  }

  function processBlock(node: Node, indent = 0, listInfo?: { type: "bullet" | "number"; index?: number }) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    let alignment: "left" | "center" | "right" | "justify" = "left";
    const textAlign = el.style.textAlign || el.getAttribute("align") || "";
    if (textAlign.toLowerCase() === "center") alignment = "center";
    else if (textAlign.toLowerCase() === "right") alignment = "right";
    else if (textAlign.toLowerCase() === "justify") alignment = "justify";

    if (tag === "p" || tag.match(/^h[1-6]$/) || tag === "li" || tag === "blockquote") {
      let defaultSize = 11;
      let isHeading = false;
      let blockType: BlockElement["type"] = "p";

      if (tag === "h1") { defaultSize = 21; isHeading = true; blockType = "h1"; }
      else if (tag === "h2") { defaultSize = 17; isHeading = true; blockType = "h2"; }
      else if (tag === "h3") { defaultSize = 14; isHeading = true; blockType = "h3"; }
      else if (tag === "h4") { defaultSize = 12; isHeading = true; blockType = "h4"; }
      else if (tag === "h5") { defaultSize = 11; isHeading = true; blockType = "h5"; }
      else if (tag === "h6") { defaultSize = 10; isHeading = true; blockType = "h6"; }
      else if (tag === "li") { blockType = "li"; }

      const segments = parseInline(el, {
        isBold: isHeading,
        isItalic: false,
        isUnderline: false,
        fontSize: defaultSize
      });

      blocks.push({
        type: blockType,
        segments,
        alignment,
        indentLevel: indent,
        listType: listInfo?.type,
        listIndex: listInfo?.index,
      });
    } else if (tag === "ul" || tag === "ol") {
      let idx = 1;
      for (let i = 0; i < el.childNodes.length; i++) {
        const item = el.childNodes[i];
        if (item.nodeName.toLowerCase() === "li") {
          processBlock(item, indent + 1, {
            type: tag === "ol" ? "number" : "bullet",
            index: tag === "ol" ? idx++ : undefined
          });
        } else {
          processBlock(item, indent);
        }
      }
    } else if (tag === "table") {
      const rows: BlockElement[][][] = [];
      const trs = el.querySelectorAll("tr");
      trs.forEach((tr) => {
        const rowCells: BlockElement[][] = [];
        const cellNodes = tr.querySelectorAll("td, th");
        cellNodes.forEach((cell) => {
          const cellBlocks: BlockElement[] = [];
          cell.childNodes.forEach((c) => {
            if (c.nodeType === Node.ELEMENT_NODE) {
              const elChild = c as HTMLElement;
              const childTag = elChild.tagName.toLowerCase();
              if (["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol"].includes(childTag)) {
                const bkPrev = [...blocks];
                blocks.length = 0;
                processBlock(c, 0);
                cellBlocks.push(...blocks);
                blocks.length = 0;
                blocks.push(...bkPrev);
              } else {
                const segs = parseInline(c, { isBold: false, isItalic: false, isUnderline: false, fontSize: 10 });
                if (segs.length > 0) {
                  cellBlocks.push({
                    type: "p",
                    segments: segs,
                    alignment: "left",
                    indentLevel: 0
                  });
                }
              }
            } else if (c.nodeType === Node.TEXT_NODE && c.textContent?.trim()) {
              cellBlocks.push({
                type: "p",
                segments: [{ text: c.textContent, isBold: false, isItalic: false, isUnderline: false, fontSize: 10 }],
                alignment: "left",
                indentLevel: 0
              });
            }
          });
          if (cellBlocks.length === 0 && cell.textContent) {
            cellBlocks.push({
              type: "p",
              segments: [{ text: cell.textContent, isBold: false, isItalic: false, isUnderline: false, fontSize: 10 }],
              alignment: "left",
              indentLevel: 0
            });
          }
          rowCells.push(cellBlocks);
        });
        rows.push(rowCells);
      });

      blocks.push({
        type: "table",
        segments: [],
        alignment: "left",
        indentLevel: indent,
        tableData: rows,
      });
    } else if (tag === "hr") {
      blocks.push({
        type: "hr",
        segments: [],
        alignment: "left",
        indentLevel: indent
      });
    } else {
      for (let i = 0; i < el.childNodes.length; i++) {
        processBlock(el.childNodes[i], indent);
      }
    }
  }

  const body = doc.body;
  for (let i = 0; i < body.childNodes.length; i++) {
    processBlock(body.childNodes[i]);
  }

  return blocks;
}

// Wrap styled text segments into horizontal boundaries
interface StyledSpan {
  text: string;
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  fontSize: number;
}

interface RenderLine {
  spans: StyledSpan[];
  height: number;
  width: number;
}

function wrapSegments(segments: TextSegment[], maxWidth: number, fontGetter: (bold: boolean, italic: boolean) => any, hasEmbeddedFont: boolean): RenderLine[] {
  const lines: RenderLine[] = [];
  let currentSpans: StyledSpan[] = [];
  let currentWidth = 0;
  let maxFontSizeInLine = 11;

  const flushLine = () => {
    if (currentSpans.length === 0) return;
    lines.push({
      spans: currentSpans,
      height: maxFontSizeInLine * 1.35,
      width: currentWidth
    });
    currentSpans = [];
    currentWidth = 0;
    maxFontSizeInLine = 11;
  };

  for (const seg of segments) {
    const textToProcess = hasEmbeddedFont ? seg.text : sanitizeWinAnsiText(seg.text);
    if (!textToProcess) continue;

    if (textToProcess === "\n") {
      flushLine();
      lines.push({ spans: [], height: seg.fontSize * 1.35, width: 0 });
      continue;
    }

    const words = textToProcess.split(/(\s+)/);
    for (const word of words) {
      if (!word) continue;
      const font = fontGetter(seg.isBold, seg.isItalic);
      const wWidth = font.widthOfTextAtSize(word, seg.fontSize);

      if (currentWidth + wWidth <= maxWidth) {
        currentSpans.push({
          text: word,
          isBold: seg.isBold,
          isItalic: seg.isItalic,
          isUnderline: seg.isUnderline,
          fontSize: seg.fontSize
        });
        currentWidth += wWidth;
        if (seg.fontSize > maxFontSizeInLine) maxFontSizeInLine = seg.fontSize;
      } else {
        if (word.trim() === "") {
          flushLine();
        } else {
          if (wWidth > maxWidth) {
            flushLine();
            let chunk = "";
            let chunkW = 0;
            for (const char of word) {
              const charW = font.widthOfTextAtSize(char, seg.fontSize);
              if (chunkW + charW > maxWidth) {
                currentSpans.push({
                  text: chunk,
                  isBold: seg.isBold,
                  isItalic: seg.isItalic,
                  isUnderline: seg.isUnderline,
                  fontSize: seg.fontSize
                });
                flushLine();
                chunk = char;
                chunkW = charW;
              } else {
                chunk += char;
                chunkW += charW;
              }
            }
            if (chunk) {
              currentSpans.push({
                text: chunk,
                isBold: seg.isBold,
                isItalic: seg.isItalic,
                isUnderline: seg.isUnderline,
                fontSize: seg.fontSize
              });
              currentWidth = chunkW;
              maxFontSizeInLine = seg.fontSize;
            }
          } else {
            flushLine();
            currentSpans.push({
              text: word,
              isBold: seg.isBold,
              isItalic: seg.isItalic,
              isUnderline: seg.isUnderline,
              fontSize: seg.fontSize
            });
            currentWidth = wWidth;
            maxFontSizeInLine = seg.fontSize;
          }
        }
      }
    }
  }

  flushLine();
  return lines;
}

// Coordinates layout and state across sheets/pages
class PageLayoutState {
  doc: any;
  pW: number;
  pH: number;
  mg: number;
  currentPage: any;
  y: number;
  fontGetter: (bold: boolean, italic: boolean) => any;
  rgb: any;
  hasEmbeddedFont: boolean;

  constructor(doc: any, fontGetter: (bold: boolean, italic: boolean) => any, rgb: any, hasEmbeddedFont: boolean, pW = 595, pH = 842, mg = 50) {
    this.doc = doc;
    this.pW = pW;
    this.pH = pH;
    this.mg = mg;
    this.fontGetter = fontGetter;
    this.rgb = rgb;
    this.hasEmbeddedFont = hasEmbeddedFont;
    this.currentPage = doc.addPage([pW, pH]);
    this.y = pH - mg;
  }

  ensureSpace(neededHeight: number) {
    if (this.y - neededHeight < this.mg) {
      this.currentPage = this.doc.addPage([this.pW, this.pH]);
      this.y = this.pH - this.mg;
    }
  }

  drawTextLine(line: RenderLine, alignment: "left" | "center" | "right" | "justify", xOffset: number) {
    this.ensureSpace(line.height);
    const avWidth = this.pW - this.mg * 2 - xOffset;

    let xStart = this.mg + xOffset;
    if (alignment === "center") {
      xStart = this.mg + xOffset + (avWidth - line.width) / 2;
    } else if (alignment === "right") {
      xStart = this.pW - this.mg - line.width;
    }

    let x = xStart;

    for (const span of line.spans) {
      const font = this.fontGetter(span.isBold, span.isItalic);
      const textToDraw = this.hasEmbeddedFont ? span.text : sanitizeWinAnsiText(span.text);
      this.currentPage.drawText(textToDraw, {
        x,
        y: this.y - span.fontSize,
        size: span.fontSize,
        font,
        color: this.rgb(0.08, 0.08, 0.08),
      });

      if (span.isUnderline) {
        const textWidth = font.widthOfTextAtSize(textToDraw, span.fontSize);
        this.currentPage.drawLine({
          start: { x, y: this.y - span.fontSize - 1.5 },
          end: { x: x + textWidth, y: this.y - span.fontSize - 1.5 },
          thickness: 0.8,
          color: this.rgb(0.08, 0.08, 0.08),
        });
      }

      x += font.widthOfTextAtSize(textToDraw, span.fontSize);
    }

    this.y -= line.height;
  }

  drawTable(tableData: BlockElement[][][]) {
    if (!tableData || tableData.length === 0) return;
    const numCols = Math.max(...tableData.map(row => row.length));
    if (numCols === 0) return;
    const availWidth = this.pW - this.mg * 2;
    const colWidth = availWidth / numCols;

    for (const row of tableData) {
      const cellLines: RenderLine[][] = [];
      let maxCellHeight = 0;

      for (let cIdx = 0; cIdx < numCols; cIdx++) {
        const cellBlocks = row[cIdx] || [];
        const cellBlockLines: RenderLine[] = [];
        for (const b of cellBlocks) {
          const wrapped = wrapSegments(b.segments, colWidth - 8, this.fontGetter, this.hasEmbeddedFont);
          cellBlockLines.push(...wrapped);
          if (b !== cellBlocks[cellBlocks.length - 1]) {
            cellBlockLines.push({ spans: [], height: 4, width: 0 });
          }
        }
        cellLines.push(cellBlockLines);
        const cellHeight = cellBlockLines.reduce((acc, l) => acc + l.height, 0) + 8;
        if (cellHeight > maxCellHeight) maxCellHeight = cellHeight;
      }

      this.ensureSpace(maxCellHeight);

      // Draw gridlines
      this.currentPage.drawRectangle({
        x: this.mg,
        y: this.y - maxCellHeight,
        width: availWidth,
        height: maxCellHeight,
        borderColor: this.rgb(0.85, 0.85, 0.85),
        borderWidth: 0.8,
      });

      for (let cIdx = 1; cIdx < numCols; cIdx++) {
        this.currentPage.drawLine({
          start: { x: this.mg + cIdx * colWidth, y: this.y },
          end: { x: this.mg + cIdx * colWidth, y: this.y - maxCellHeight },
          thickness: 0.8,
          color: this.rgb(0.85, 0.85, 0.85),
        });
      }

      for (let cIdx = 0; cIdx < numCols; cIdx++) {
        const lines = cellLines[cIdx] || [];
        let cellY = this.y - 4;
        const cellX = this.mg + cIdx * colWidth + 4;

        for (const line of lines) {
          let x = cellX;
          for (const span of line.spans) {
            const font = this.fontGetter(span.isBold, span.isItalic);
            const textToDraw = this.hasEmbeddedFont ? span.text : sanitizeWinAnsiText(span.text);
            this.currentPage.drawText(textToDraw, {
              x,
              y: cellY - span.fontSize,
              size: span.fontSize,
              font,
              color: this.rgb(0.12, 0.12, 0.12),
            });
            x += font.widthOfTextAtSize(textToDraw, span.fontSize);
          }
          cellY -= line.height;
        }
      }

      this.y -= maxCellHeight;
    }
  }
}

// Custom plain text parser for TxtToPdfTool preserves space/tabs
function parseTxtToBlocks(text: string, fontSize: number): BlockElement[] {
  const lines = text.split(/\r?\n/);
  const blocks: BlockElement[] = [];

  for (const line of lines) {
    if (!line.trim()) {
      blocks.push({
        type: "p",
        segments: [{ text: "\n", isBold: false, isItalic: false, isUnderline: false, fontSize }],
        alignment: "left",
        indentLevel: 0
      });
      continue;
    }

    let indent = 0;
    const matchSpacing = line.match(/^(\s+)/);
    if (matchSpacing) {
      indent = Math.floor(matchSpacing[0].length / 4);
    }

    blocks.push({
      type: "p",
      segments: [{ text: sanitizeWinAnsiText(line.trim()), isBold: false, isItalic: false, isUnderline: false, fontSize }],
      alignment: "left",
      indentLevel: indent
    });
  }
  return blocks;
}

/* PDF→TXT */
export const PdfToTxtTool = ({ onSuccess, toolName }: ToolProps) => {
  const run = useCallback(async (files: File[], prog: (p: number, m?: string) => void) => {
    prog(15, "Opening PDF stream…");
    const ab = await readAB(files[0]);
    prog(40, "Parsing plain text streams…");
    const { text, numPages } = await extractText(ab);
    prog(90, "Assembling plain text document…");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    return {
      blob,
      name: getOutputFile(files[0]?.name, "extracted", ".txt"),
      info: `Extracted ${numPages} page text layers`
    };
  }, []);

  return <Proc id="pdf-to-txt" label="Extract PDF Text" accept=".pdf" run={run} onSuccess={onSuccess} toolName={toolName} />;
};

/* TXT→PDF */
export const TxtToPdfTool = ({ onSuccess, toolName }: ToolProps) => {
  const [fs, setFs] = useState(12);

  const run = useCallback(async (files: File[], prog: (p: number, m?: string) => void) => {
    prog(10, "Opening plain text stream…");
    const text = await readTxt(files[0]);

    prog(25, "Loading PDF framework engines…");
    const { PDFDocument, rgb, StandardFonts } = await getPdfLib();
    const fontkit = await getFontkit();
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);

    const fontBytes = await fetchFont(REGULAR_FONT_URLS, "Roboto-Regular", (m) => prog(35, m));
    const fontBoldBytes = await fetchFont(BOLD_FONT_URLS, "Roboto-Bold", (m) => prog(45, m));
    
    prog(60, "Configuring typography system…");
    const hasEmbedded = !!fontBytes && !!fontBoldBytes;
    const fontReg = hasEmbedded ? await doc.embedFont(fontBytes!) : await doc.embedStandardFont(StandardFonts.Helvetica);
    const fontBold = hasEmbedded ? await doc.embedFont(fontBoldBytes!) : await doc.embedStandardFont(StandardFonts.HelveticaBold);

    const fontGetter = (b: boolean) => (b ? fontBold : fontReg);

    prog(75, "Compiling logical whitespace blocks…");
    const textBlocks = parseTxtToBlocks(text, fs);

    const pW = 595;
    const pH = 842;
    const mg = 50;

    prog(85, "Drawing character matrices on canvas…");
    const layout = new PageLayoutState(doc, fontGetter, rgb, hasEmbedded, pW, pH, mg);

    for (const block of textBlocks) {
      const indentText = block.indentLevel * 15;
      const wrapped = wrapSegments(block.segments, pW - mg * 2 - indentText, fontGetter, hasEmbedded);
      wrapped.forEach((line) => {
        layout.drawTextLine(line, block.alignment, indentText);
      });
      layout.y -= 4; // Add comfortable micro margin after lines
    }

    prog(95, "Compressing offset structures…");
    const bytes = await doc.save({ useObjectStreams: true });
    return {
      blob: new Blob([bytes], { type: "application/pdf" }),
      name: getOutputFile(files[0]?.name, "from-text", ".pdf")
    };
  }, [fs]);

  return (
    <Proc
      id="txt-to-pdf"
      label="Compile to PDF"
      accept=".txt"
      run={run}
      onSuccess={onSuccess}
      toolName={toolName}
      opts={
        <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 mb-1.5 uppercase font-mono">
            Output Font Size: {fs}pt
          </label>
          <input
            type="range"
            min={10}
            max={18}
            value={fs}
            onChange={(e) => setFs(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-200 dark:bg-neutral-800 rounded-lg cursor-pointer"
          />
        </div>
      }
    />
  );
};

/* PDF→WORD */
export const PdfToWordTool = ({ onSuccess, toolName }: ToolProps) => {
  const run = useCallback(async (files: File[], prog: (p: number, m?: string) => void) => {
    prog(10, "Uploading PDF to conversion engine…");

    const formData = new FormData();
    formData.append("file", files[0]);

    const response = await fetch("https://foldpdf-api-1.onrender.com/api/convert-to-word", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error("Conversion failed. Please try again.");
    }

    prog(80, "Downloading converted document…");
    const blob = await response.blob();
    const docxBlob = new Blob([blob], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    });

    return {
      blob: docxBlob,
      name: getOutputFile(files[0]?.name, "converted", ".docx")
    };
  }, []);

  return (
    <Proc
      id="pdf-to-word"
      label="Convert to Word (DOCX)"
      accept=".pdf"
      run={run}
      onSuccess={onSuccess}
      toolName={toolName}
    />
  );
};
/* WORD→PDF */
export const WordToPdfTool = ({ onSuccess, toolName }: ToolProps) => {
  const run = useCallback(async (files: File[], prog: (p: number, m?: string) => void) => {
    prog(10, "Fetching dependencies…");
    const m = await getMammoth();
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js", "html2canvas");
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js", "jspdf");

    const ab = await readAB(files[0]);
    
    prog(25, "Converting DOCX structures to HTML markup…");
    let html = "";
    try {
      const r = await m.convertToHtml({ arrayBuffer: ab });
      html = r.value;
    } catch {
      throw new Error("Could not parse DOCX package. File may be password protected or contains unsupported structural macros.");
    }

    prog(50, "Rendering document view in virtual space…");

    // Dynamic hidden document host
    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.left = "-9999px";
    container.style.top = "-9999px";
    container.style.background = "white";
    container.style.width = "794px"; // Standard A4 width in pixels at 96 DPI
    container.style.color = "black";
    container.style.fontFamily = "'Times New Roman', Times, serif, Arial, sans-serif";
    container.style.fontSize = "15px";
    container.style.lineHeight = "1.6";
    container.style.padding = "60px"; // Comfortable margins
    container.style.boxSizing = "border-box";
    container.innerHTML = `
      <style>
        h1 { font-size: 26px; margin-bottom: 12px; font-weight: bold; }
        h2 { font-size: 20px; margin-bottom: 10px; font-weight: bold; }
        h3 { font-size: 16px; margin-bottom: 8px; font-weight: bold; }
        p { margin-bottom: 12px; text-align: justify; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 20px; }
        th, td { border: 1px solid #666666; padding: 10px; text-align: left; }
        th { background: #f5f5f5; font-weight: bold; }
        ul, ol { padding-left: 20px; margin-bottom: 12px; }
        li { margin-bottom: 5px; }
      </style>
      ${html}
    `;
    document.body.appendChild(container);

    // Give time for markup parsing
    await new Promise((r) => setTimeout(r, 400));

    prog(75, "Compiling page canvas images…");

    const html2canvasLib = (window as any).html2canvas;
    const jspdfLib = (window as any).jspdf;

    if (!html2canvasLib || !jspdfLib) {
      document.body.removeChild(container);
      throw new Error("Failed to load layout rendering libraries. Please check your network and try again.");
    }

    let pdfBytes: ArrayBuffer;
    try {
      const canvas = await html2canvasLib(container, {
        scale: 2, // Capture at high resolution
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff"
      });

      const imgWidth = container.offsetWidth;
      const imgHeight = container.offsetHeight;

      // jsPDF coordinates (A4 is 595.28 pt x 841.89 pt)
      const pdfPageWidth = 595.28;
      const pdfPageHeight = 841.89;
      const onePageImgHeight = imgWidth * (pdfPageHeight / pdfPageWidth);

      let leftHeight = imgHeight;
      let position = 0;

      const pdf = new jspdfLib.jsPDF("p", "pt", "a4");

      let firstPage = true;
      while (leftHeight > 0) {
        if (!firstPage) {
          pdf.addPage();
        }
        firstPage = false;

        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = Math.min(canvas.height - position * 2, onePageImgHeight * 2);

        const pageCtx = pageCanvas.getContext("2d");
        if (pageCtx) {
          pageCtx.drawImage(
            canvas,
            0,
            position * 2,
            canvas.width,
            pageCanvas.height,
            0,
            0,
            pageCanvas.width,
            pageCanvas.height
          );
        }

        const pageImgData = pageCanvas.toDataURL("image/jpeg", 0.95);
        pdf.addImage(
          pageImgData,
          "JPEG",
          0,
          0,
          pdfPageWidth,
          Math.min(pdfPageHeight, (pageCanvas.height / 2) * (pdfPageWidth / imgWidth))
        );

        leftHeight -= onePageImgHeight;
        position += onePageImgHeight;
      }

      pdfBytes = pdf.output("arraybuffer");
    } finally {
      document.body.removeChild(container);
    }

    prog(95, "Completing PDF document layer stream…");
    return {
      blob: new Blob([pdfBytes], { type: "application/pdf" }),
      name: getOutputFile(files[0]?.name, "docx-to-pdf", ".pdf")
    };
  }, []);

  return (
    <Proc
      id="word-to-pdf"
      label="Compile Word to PDF"
      accept=".docx"
      run={run}
      onSuccess={onSuccess}
      toolName={toolName}
    />
  );
};

/* PDF→EXCEL */
export const PdfToExcelTool = ({ onSuccess, toolName }: ToolProps) => {
  const run = useCallback(async (files: File[], prog: (p: number, m?: string) => void) => {
    prog(15, "Opening PDF grid matrix…");
    const ab = await readAB(files[0]);
    prog(40, "Scanning table segments…");
    const { text } = await extractText(ab);
    
    prog(65, "Spawning SheetJS Excel cells…");
    const X = await getXLSX();
    const rows = text.split("\n").map((l) => l.split(/\s{2,}|\t/).map((c) => c.trim()).filter(Boolean));
    const ws = X.utils.aoa_to_sheet(rows);
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws, "PDF Text Blocks");

    prog(90, "Writing spreadsheet bytes…");
    const buf = X.write(wb, { bookType: "xlsx", type: "array" });
    return {
      blob: new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      name: getOutputFile(files[0]?.name, "dataset", ".xlsx"),
      info: "Table detection works best with simple, clean PDF tables."
    };
  }, []);

  return <Proc id="pdf-to-excel" label="Convert PDF to Spreadsheet" accept=".pdf" run={run} onSuccess={onSuccess} toolName={toolName} />;
};

/* EXCEL→PDF */
export const ExcelToPdfTool = ({ onSuccess, toolName }: ToolProps) => {
  const run = useCallback(async (files: File[], prog: (p: number, m?: string) => void) => {
    prog(10, "Loading SheetJS book reader…");
    const X = await getXLSX();
    const ab = await readAB(files[0]);
    const wb = X.read(ab, { type: "array" });
    
    prog(25, "Booting PDF grid compiler…");
    const { PDFDocument, rgb, StandardFonts } = await getPdfLib();
    const fontkit = await getFontkit();
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);

    const fontBytesReg = await fetchFont(REGULAR_FONT_URLS, "Roboto-Regular", (msg) => prog(35, msg));
    const fontBytesBold = await fetchFont(BOLD_FONT_URLS, "Roboto-Bold", (msg) => prog(45, msg));

    prog(60, "Embedding unicode typography…");
    const hasEmbedded = !!fontBytesReg && !!fontBytesBold;
    const fontReg = hasEmbedded ? await doc.embedFont(fontBytesReg!) : await doc.embedStandardFont(StandardFonts.Helvetica);
    const fontBold = hasEmbedded ? await doc.embedFont(fontBytesBold!) : await doc.embedStandardFont(StandardFonts.HelveticaBold);

    prog(75, "Constructing landscape page segments…");
    for (const sn of wb.SheetNames) {
      const ws = wb.Sheets[sn];
      const data: any[][] = X.utils.sheet_to_json(ws, { header: 1, defval: "" });
      if (data.length === 0) continue;

      const pW = 842; // Landscape paper bounds
      const pH = 595;
      const mg = 35;
      const availWidth = pW - mg * 2;

      const numCols = Math.max(...data.map(r => r.length));
      if (numCols === 0) continue;

      // Compute optimal cell column layouts based on content lengths
      const colWidths = new Array(numCols).fill(0);
      for (const row of data) {
        for (let cIdx = 0; cIdx < numCols; cIdx++) {
          const val = String(row[cIdx] || "");
          const textToMeasure = hasEmbedded ? val : sanitizeWinAnsiText(val);
          const valLen = fontReg.widthOfTextAtSize(textToMeasure, 9);
          if (valLen > colWidths[cIdx]) {
            colWidths[cIdx] = valLen;
          }
        }
      }

      for (let i = 0; i < numCols; i++) {
        colWidths[i] = Math.max(45, colWidths[i] + 16);
      }

      const totalColWidth = colWidths.reduce((acc, w) => acc + w, 0);
      if (totalColWidth > availWidth) {
        const factor = availWidth / totalColWidth;
        for (let i = 0; i < numCols; i++) {
          colWidths[i] = colWidths[i] * factor;
        }
      }

      let pg = doc.addPage([pW, pH]);
      let y = pH - mg;

      pg.drawText(`Sheet Grid Layer: ${sn}`, {
        x: mg,
        y: y - 12,
        size: 14,
        font: fontBold,
        color: rgb(0.12, 0.2, 0.45),
      });
      y -= 25;

      const rH = 22;

      const drawRowTextAndBorders = (row: any[], isHeader = false) => {
        if (y < mg + rH) {
          pg = doc.addPage([pW, pH]);
          y = pH - mg;
        }

        if (isHeader) {
          pg.drawRectangle({
            x: mg,
            y: y - rH,
            width: availWidth,
            height: rH,
            color: rgb(0.94, 0.96, 0.98),
          });
        }

        let xCurrent = mg;
        row.forEach((cell, idx) => {
          if (idx >= numCols) return;
          const colW = colWidths[idx];

          pg.drawRectangle({
            x: xCurrent,
            y: y - rH,
            width: colW,
            height: rH,
            borderColor: rgb(0.85, 0.85, 0.85),
            borderWidth: 0.5,
          });

          const text = String(cell || "");
          const fontSize = 9;
          const font = isHeader ? fontBold : fontReg;

          const textToMeasure = hasEmbedded ? text : sanitizeWinAnsiText(text);
          let printableText = textToMeasure;
          let textW = font.widthOfTextAtSize(printableText, fontSize);
          const maxTextW = colW - 8;

          if (textW > maxTextW) {
            while (printableText.length > 1 && textW > maxTextW) {
              printableText = printableText.slice(0, printableText.length - 2) + "…";
              textW = font.widthOfTextAtSize(printableText, fontSize);
            }
          }

          pg.drawText(printableText, {
            x: xCurrent + 4,
            y: y - rH / 2 - fontSize / 2 + 1,
            size: fontSize,
            font,
            color: isHeader ? rgb(0.1, 0.15, 0.3) : rgb(0.15, 0.15, 0.15),
          });

          xCurrent += colW;
        });

        y -= rH;
      };

      if (data.length > 0) {
        const headerRow = data[0];
        drawRowTextAndBorders(headerRow, true);

        for (let i = 1; i < data.length; i++) {
          drawRowTextAndBorders(data[i], false);
        }
      }
    }

    prog(90, "Assembling PDF document layers…");
    const bytes = await doc.save({ useObjectStreams: true });
    return {
      blob: new Blob([bytes], { type: "application/pdf" }),
      name: getOutputFile(files[0]?.name, "spreadsheet", ".pdf")
    };
  }, []);

  return <Proc id="excel-to-pdf" label="Convert Spreadsheet to PDF" accept=".xlsx,.xls,.csv" run={run} onSuccess={onSuccess} toolName={toolName} />;
};

/* PDF→PPT */
export const PdfToPptTool = ({ onSuccess, toolName }: ToolProps) => {
  const run = useCallback(async (files: File[], prog: (p: number, m?: string) => void) => {
    prog(10, "Uploading PDF to conversion engine…");

    const formData = new FormData();
    formData.append("file", files[0]);

    const response = await fetch("https://foldpdf-api-1.onrender.com/api/convert-to-ppt", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error("Conversion failed. Please try again.");
    }

    prog(80, "Downloading converted presentation…");
    const blob = await response.blob();
    const pptxBlob = new Blob([blob], {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    });

    return {
      blob: pptxBlob,
      name: getOutputFile(files[0]?.name, "converted", ".pptx"),
      info: "Converted using Adobe PDF Services — structure preserved"
    };
  }, []);

  return <Proc id="pdf-to-ppt" label="Convert PDF to slides (PPTX)" accept=".pdf" run={run} onSuccess={onSuccess} toolName={toolName} />;
};

/* PPT→PDF */
export const PptToPdfTool = ({ onSuccess, toolName }: ToolProps) => {
  const run = useCallback(async (files: File[], prog: (p: number, m?: string) => void) => {
    prog(10, "Uploading PowerPoint file…");

    const formData = new FormData();
    formData.append("file", files[0]);

    const response = await fetch("https://foldpdf-api-1.onrender.com/api/convert-to-pdf", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error("Conversion failed. Please try again.");
    }

    prog(80, "Downloading converted PDF…");
    const blob = await response.blob();
    const pdfBlob = new Blob([blob], { type: "application/pdf" });

    return {
      blob: pdfBlob,
      name: getOutputFile(files[0]?.name, "converted", ".pdf")
    };
  }, []);

  return (
    <Proc
      id="ppt-to-pdf"
      label="Convert PowerPoint to PDF"
      accept=".pptx,.ppt"
      run={run}
      onSuccess={onSuccess}
      toolName={toolName}
    />
  );
};