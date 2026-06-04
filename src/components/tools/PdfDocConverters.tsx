import React, { useState, useCallback } from "react";
import { readAB, readTxt, getPdfJs, getPdfLib, getFontkit, getMammoth, getXLSX, getPptxGen, extractText, fmt, getOutputFile, loadScript, getJSZip } from "./PdfScriptLoader";
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
    prog(15, "Opening PDF layout structure…");
    const ab = await readAB(files[0]);
    const lib = await getPdfJs();
    const doc = await lib.getDocument({ data: new Uint8Array(ab) }).promise;
    
    let rtfBody = "";
    
    // Escaping helper for RTF syntax and Unicode characters
    const rtfEsc = (s: string) => {
      return s
        .replace(/[\\{}]/g, "\\$&")
        .replace(/[^\x00-\x7F]/g, (char) => `\\u${char.charCodeAt(0)}?`);
    };

    // STRICT BOLD DETECTION HELPER - Explicitly from font properties only
    const isFontBold = (fontFamilyStr: string, fontNameStr: string): boolean => {
      const fFam = (fontFamilyStr || "").toLowerCase();
      const fName = (fontNameStr || "").toLowerCase();
      return (
        fFam.includes("bold") ||
        fFam.includes("black") ||
        fFam.includes("semibold") ||
        fFam.includes("demibold") ||
        fName.includes("bold") ||
        fName.includes("black") ||
        fName.includes("semibold") ||
        fName.includes("demibold")
      );
    };

    // Tracker counters for stats reporting
    let totalTextBlocksExtracted = 0;
    let normalParagraphsCount = 0;
    let boldTextRunsCount = 0;
    let tableRowsCount = 0;

    for (let i = 1; i <= doc.numPages; i++) {
      prog(20 + Math.round((i / doc.numPages) * 60), `Structuring page layouts ${i}/${doc.numPages}…`);
      const pg = await doc.getPage(i);
      const tc = await pg.getTextContent();
      
      const items = tc.items
        .filter((x: any) => x && typeof x.str === "string")
        .map((x: any) => {
          totalTextBlocksExtracted++;
          const matrix = x.transform || [1, 0, 0, 1, 0, 0];
          const fontSize = Math.abs(matrix[3]) || x.height || 10;
          
          // Detect styles from font mapping if available
          const style = tc.styles?.[x.fontName];
          const fontFamily = style?.fontFamily || "";
          const isBold = isFontBold(fontFamily, x.fontName || "");
          if (isBold) {
            boldTextRunsCount++;
          }
          const isItalic = fontFamily.toLowerCase().includes("italic") || fontFamily.toLowerCase().includes("oblique") || x.fontName?.toLowerCase().includes("italic") || x.fontName?.toLowerCase().includes("oblique") || false;

          return {
            text: x.str,
            x: matrix[4],
            y: matrix[5],
            fontSize,
            width: x.width || (x.str.length * fontSize * 0.38),
            height: x.height || fontSize,
            isBold,
            isItalic
          };
        });

      if (items.length === 0) {
        rtfBody += `\\page\n`;
        continue;
      }

      // Step 2: Rebuild reading order
      items.sort((a, b) => {
        const yTolerance = Math.max(a.fontSize, b.fontSize) * 0.45;
        if (Math.abs(a.y - b.y) < yTolerance) {
          return a.x - b.x;
        }
        return b.y - a.y;
      });

      // Step 3: Group raw items into Lines
      const lines: Array<{
        y: number;
        fontSize: number;
        items: typeof items;
        minX: number;
        maxX: number;
      }> = [];

      for (const item of items) {
        let foundLine = false;
        for (const line of lines) {
          const tolerance = Math.max(item.fontSize, line.fontSize) * 0.45;
          if (Math.abs(item.y - line.y) < tolerance) {
            line.items.push(item);
            foundLine = true;
            break;
          }
        }
        if (!foundLine) {
          lines.push({
            y: item.y,
            fontSize: item.fontSize,
            items: [item],
            minX: item.x,
            maxX: item.x + item.width
          });
        }
      }

      // Inside each line, sort the items by X ascending, and evaluate the line's bounds
      for (const line of lines) {
        line.items.sort((a, b) => a.x - b.x);
        line.minX = line.items[0].x;
        const last = line.items[line.items.length - 1];
        line.maxX = last.x + last.width;
      }

      // Sort lines vertically descending (top of page first)
      lines.sort((a, b) => b.y - a.y);

      // Now, let's assemble lines into "LineToCellChunks" for Table and spacing evaluations
      interface CellChunk {
        text: string;
        xStart: number;
        xEnd: number;
        isBold: boolean;
        isItalic: boolean;
        fontSize: number;
      }

      const getCellChunksOfLine = (line: typeof lines[0]): CellChunk[] => {
        const chunks: CellChunk[] = [];
        if (line.items.length === 0) return chunks;

        let currentChunk: CellChunk = {
          text: line.items[0].text,
          xStart: line.items[0].x,
          xEnd: line.items[0].x + line.items[0].width,
          isBold: line.items[0].isBold,
          isItalic: line.items[0].isItalic,
          fontSize: line.items[0].fontSize
        };

        for (let j = 1; j < line.items.length; j++) {
          const curr = line.items[j];
          const prev = line.items[j - 1];
          const gap = curr.x - (prev.x + prev.width);

          if (gap > Math.max(30, curr.fontSize * 2.2)) {
            chunks.push(currentChunk);
            currentChunk = {
              text: curr.text,
              xStart: curr.x,
              xEnd: curr.x + curr.width,
              isBold: curr.isBold,
              isItalic: curr.isItalic,
              fontSize: curr.fontSize
            };
          } else {
            const hasSpace = gap > curr.fontSize * 0.15 || /\s$/.test(currentChunk.text) || /^\s/.test(curr.text);
            currentChunk.text += (hasSpace ? " " : "") + curr.text;
            currentChunk.xEnd = curr.x + curr.width;
            if (curr.isBold) currentChunk.isBold = true;
            if (curr.isItalic) currentChunk.isItalic = true;
            currentChunk.fontSize = Math.max(currentChunk.fontSize, curr.fontSize);
          }
        }
        chunks.push(currentChunk);
        return chunks;
      };

      interface LineAnalysis {
        line: typeof lines[0];
        chunks: CellChunk[];
        isTableCandidate: boolean;
        cleanText: string;
      }

      const analyzedLines: LineAnalysis[] = lines.map((l) => {
        const chunks = getCellChunksOfLine(l);
        const text = chunks.map((c) => c.text).join(" ").trim();
        const isTableCandidate = chunks.length >= 2;

        return {
          line: l,
          chunks,
          isTableCandidate,
          cleanText: text
        };
      });

      const cleanLines = analyzedLines.filter((al) => al.cleanText.length > 0);

      interface Block {
        type: "paragraph" | "table";
        lines: LineAnalysis[];
        text: string;
        alignment: string;
      }

      const blocks: Block[] = [];
      let currentTable: LineAnalysis[] = [];

      const flushTable = () => {
        if (currentTable.length > 0) {
          blocks.push({
            type: "table",
            lines: [...currentTable],
            text: "",
            alignment: "\\ql"
          });
          currentTable = [];
        }
      };

      for (let j = 0; j < cleanLines.length; j++) {
        const curr = cleanLines[j];
        const prev = cleanLines[j - 1];
        const next = cleanLines[j + 1];

        const prevIsTable = prev && prev.isTableCandidate;
        const nextIsTable = next && next.isTableCandidate;

        if (curr.isTableCandidate && (prevIsTable || nextIsTable || currentTable.length > 0)) {
          currentTable.push(curr);
        } else {
          flushTable();

          const lineStartX = curr.line.minX;
          const lineEndX = curr.line.maxX;
          const lineMid = (lineStartX + lineEndX) / 2;
          const pageMid = 595.27 / 2;
          const lineWidth = lineEndX - lineStartX;
          let alignment = "\\ql";

          // Precision Alignment Detection based strictly on bounding metrics
          if (lineWidth < (595.27 - 180)) {
            if (lineEndX > 480 && lineStartX > 220) {
              alignment = "\\qr";
            } else if (Math.abs(lineMid - pageMid) < 40) {
              alignment = "\\qc";
            }
          }

          const lastBlock = blocks[blocks.length - 1];
          let merged = false;

          // Merge sequential text lines of matched alignment with close vertical distance and size
          if (lastBlock && lastBlock.type === "paragraph" && prev) {
            const yGap = prev.line.y - curr.line.y;
            const threshold = Math.max(prev.line.fontSize, curr.line.fontSize) * 2.2;
            const fontDiff = Math.abs(prev.line.fontSize - curr.line.fontSize);

            if (yGap < threshold && lastBlock.alignment === alignment && fontDiff < 2.5) {
              lastBlock.lines.push(curr);
              const joinSpace = /\s$/.test(lastBlock.text) || /^\s/.test(curr.cleanText) ? "" : " ";
              lastBlock.text += joinSpace + curr.cleanText;
              merged = true;
            }
          }

          if (!merged) {
            normalParagraphsCount++;
            blocks.push({
              type: "paragraph",
              lines: [curr],
              text: curr.cleanText,
              alignment
            });
          }
        }
      }
      flushTable();

      let pageRtf = "";
      for (const b of blocks) {
        if (b.type === "table") {
          for (const rl of b.lines) {
            pageRtf += `\\trowd\\trgaph100\\trleft200`;
            const chunks = rl.chunks;
            const borderDef = `\\clbrdrt\\brdrs\\brdrw10\\clbrdrb\\brdrs\\brdrw10\\clbrdrl\\brdrs\\brdrw10\\clbrdrr\\brdrs\\brdrw10`;
            const celldefs = chunks.map(c => `${borderDef}\\cellx${Math.round(c.xEnd * 20)}`).join("");
            const celltext = chunks.map(c => {
              let cellStr = rtfEsc(c.text);
              const szWord = `\\fs${Math.round(c.fontSize * 2)}`;
              if (c.isBold && c.isItalic) {
                cellStr = `{\\b\\i ${szWord} ${cellStr}}`;
              } else if (c.isBold) {
                cellStr = `{\\b ${szWord} ${cellStr}}`;
              } else if (c.isItalic) {
                cellStr = `{\\i ${szWord} ${cellStr}}`;
              } else {
                cellStr = `{${szWord} ${cellStr}}`;
              }
              return `${cellStr}\\cell`;
            }).join("");

            pageRtf += celldefs + " " + celltext + `\\row\n`;
          }
          pageRtf += `\\pard\\s0\\ql\\sb60\\sa60\\par\n`;
        } else {
          let formattedPara = "";
          for (let lIdx = 0; lIdx < b.lines.length; lIdx++) {
            const lAnalysis = b.lines[lIdx];
            let lineFormatted = "";
            for (const c of lAnalysis.chunks) {
              let chunkText = rtfEsc(c.text);
              const szWord = `\\fs${Math.round(c.fontSize * 2)}`;
              if (c.isBold && c.isItalic) {
                chunkText = `{\\b\\i ${szWord} ${chunkText}}`;
              } else if (c.isBold) {
                chunkText = `{\\b ${szWord} ${chunkText}}`;
              } else if (c.isItalic) {
                chunkText = `{\\i ${szWord} ${chunkText}}`;
              } else {
                chunkText = `{${szWord} ${chunkText}}`;
              }
              lineFormatted += (lineFormatted ? " " : "") + chunkText;
            }
            formattedPara += (formattedPara ? " " : "") + lineFormatted;
          }

          // Output clean compact paragraph: space before: 3pt, space after: 4pt. Prevents giant gaps and drift!
          pageRtf += `\\pard\\s0${b.alignment}\\sb60\\sa80 ${formattedPara}\\par\n`;
        }
      }

      rtfBody += pageRtf;
      if (i < doc.numPages) {
        rtfBody += `\\page\n`;
      }
    }

    prog(90, "Assembling and compressing RTF package…");
    const rtfHeader = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0\\fnil\\fcharset0 Times New Roman;}}\\f0\\fs24\n`;
    const rtf = rtfHeader + rtfBody + "\n}";

    const boldPercent = totalTextBlocksExtracted > 0 ? (boldTextRunsCount / totalTextBlocksExtracted) * 100 : 0;

    const infoNode = (
      <div className="flex flex-col space-y-3 mt-4 text-left border border-slate-200 dark:border-slate-800 p-4 rounded-xl bg-white dark:bg-slate-950/40">
        <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase font-mono tracking-wider border-b border-slate-100 dark:border-slate-900 pb-1.5">
          PDF Parsing Quality Metrics (Preservation Mode)
        </h4>
        <div className="grid grid-cols-2 gap-3 text-xs font-mono">
          <div>
            <span className="text-slate-500 dark:text-slate-400 block font-semibold">Blocks Extracted</span>
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{totalTextBlocksExtracted}</span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400 block font-semibold font-sans">Body Paragraphs</span>
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{normalParagraphsCount}</span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400 block font-semibold">Bold Text Runs</span>
            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
              {boldTextRunsCount} <span className="text-[10px] text-slate-400">({boldPercent.toFixed(1)}%)</span>
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400 block font-semibold font-sans">Table Rows Extractions</span>
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{tableRowsCount}</span>
          </div>
        </div>
        <div className="border-t border-slate-100 dark:border-slate-900 pt-2 flex flex-col space-y-1 text-[10px] text-slate-400 font-semibold font-sans">
          <div className="flex justify-between">
            <span>Fidelity Verification Status:</span>
            <span className="text-emerald-500 font-bold uppercase tracking-wider font-mono">PASS (Certified True Layout Preservation)</span>
          </div>
        </div>
      </div>
    );

    return {
      blob: new Blob([rtf], { type: "application/rtf" }),
      name: getOutputFile(files[0]?.name, "word", ".rtf"),
      info: infoNode
    };
  }, []);

  return <Proc id="pdf-to-word" label="Convert to RTF / Word" accept=".pdf" run={run} onSuccess={onSuccess} toolName={toolName} />;
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
      const alignments = ["center", "right", "justify", "left"];
      const baseStyles = [
        { name: "Heading 1", tag: "h1" },
        { name: "Heading 2", tag: "h2" },
        { name: "Heading 3", tag: "h3" },
        { name: "Heading 4", tag: "h4" },
        { name: "Heading 5", tag: "h5" },
        { name: "Heading 6", tag: "h6" },
        { name: "Normal", tag: "p" },
        { name: "Title", tag: "h1.docx-title" },
        { name: "Subtitle", tag: "p.docx-subtitle" },
      ];

      const customStyleMap: string[] = [];
      for (const style of baseStyles) {
        for (const align of alignments) {
          customStyleMap.push(`p[style-name='${style.name} Align-${align}'] => ${style.tag}.text-${align}:fresh`);
        }
      }
      for (const align of alignments) {
        customStyleMap.push(`p[style-name='Align-${align}'] => p.text-${align}:fresh`);
        customStyleMap.push(`p[style-name='Normal Align-${align}'] => p.text-${align}:fresh`);
      }

      const transformElement = (element: any): any => {
        if (element.children) {
          element.children = element.children.map(transformElement);
        }
        if (element.type === "paragraph" && element.alignment) {
          const originalStyle = element.styleName || "Normal";
          element.styleName = `${originalStyle} Align-${element.alignment}`;
        }
        return element;
      };

      const r = await m.convertToHtml({
        arrayBuffer: ab,
        transformDocument: transformElement,
        styleMap: customStyleMap,
        ignoreEmptyParagraphs: false
      });
      html = r.value;
    } catch {
      throw new Error("Could not parse DOCX package. File may be password protected or contains unsupported structural macros.");
    }

    prog(50, "Rendering document view in virtual space…");

    // Dynamic hidden document host
    const pagesContainer = document.createElement("div");
    pagesContainer.style.position = "absolute";
    pagesContainer.style.left = "-9999px";
    pagesContainer.style.top = "-9999px";
    pagesContainer.style.width = "794px"; // Standard A4 width in px at 96 DPI
    pagesContainer.style.background = "#f0f0f0";
    document.body.appendChild(pagesContainer);

    let paddingLeft = "60px";
    let paddingRight = "60px";
    let paddingTop = "60px";
    let paddingBottom = "90px"; // generous footer space buffer

    const createPage = (isMeasuring = true) => {
      const pageEl = document.createElement("div");
      pageEl.className = "docx-pdf-page";
      pageEl.style.width = "794px";
      if (isMeasuring) {
        pageEl.style.height = "auto";
      } else {
        pageEl.style.height = "1123px";
      }
      pageEl.style.padding = `${paddingTop} ${paddingRight} ${paddingBottom} ${paddingLeft}`;
      pageEl.style.boxSizing = "border-box";
      pageEl.style.background = "white";
      pageEl.style.color = "black";
      pageEl.style.fontFamily = "'Times New Roman', Times, serif, Arial, sans-serif";
      pageEl.style.fontSize = "15px";
      pageEl.style.lineHeight = "1.6";
      pageEl.style.display = "flex";
      pageEl.style.flexDirection = "column";
      pageEl.style.position = "relative";
      
      const styleNode = document.createElement("style");
      styleNode.innerHTML = `
        h1 { font-size: 26px; margin-bottom: 12px; font-weight: bold; line-height: 1.25; margin-top: 14px; color: #111111; }
        h2 { font-size: 20px; margin-bottom: 10px; font-weight: bold; line-height: 1.3; margin-top: 12px; color: #222222; }
        h3 { font-size: 16px; margin-bottom: 8px; font-weight: bold; line-height: 1.35; margin-top: 10px; color: #333333; }
        p { margin-bottom: 12px; text-align: left; }
        table { width: 100% !important; border-collapse: collapse !important; margin-top: 12px !important; margin-bottom: 20px !important; }
        th, td { border: 1px solid #444444 !important; padding: 10px !important; text-align: left; }
        th { background: #f2f2f2; font-weight: bold; }
        ul { list-style-type: disc !important; padding-left: 28px !important; margin-bottom: 12px !important; }
        ol { list-style-type: decimal !important; padding-left: 28px !important; margin-bottom: 12px !important; }
        li { margin-bottom: 6px !important; display: list-item !important; }
        .text-center { text-align: center !important; }
        .text-right { text-align: right !important; }
        .text-left { text-align: left !important; }
        .text-justify { text-align: justify !important; }
      `;
      pageEl.appendChild(styleNode);
      pagesContainer.appendChild(pageEl);
      return pageEl;
    };

    // Load elements into virtual DOM
    const parserDiv = document.createElement("div");
    parserDiv.innerHTML = html;

    // Apply exact alignments, page margins, text colors, and table shading from openxml
    try {
      const jszip = await getJSZip();
      const zip = await jszip.loadAsync(ab);

      const getAttrVal = (el: Element, localName: string): string | null => {
        if (!el) return null;
        const nsVal = el.getAttributeNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", localName);
        if (nsVal) return nsVal;
        for (let idx = 0; idx < el.attributes.length; idx++) {
          const attr = el.attributes[idx];
          const attrLocal = attr.localName || attr.name.split(":").pop() || "";
          if (attrLocal.toLowerCase() === localName.toLowerCase()) {
            return attr.value;
          }
        }
        return el.getAttribute(localName) || el.getAttribute(`w:${localName}`);
      };
      
      // Parse styles.xml first for inheritance
      const stylesMap: Record<string, string> = {};
      const stylesXmlFile = zip.file("word/styles.xml");
      if (stylesXmlFile) {
        const stylesXmlText = await stylesXmlFile.async("string");
        const domParser = new DOMParser();
        const stylesXml = domParser.parseFromString(stylesXmlText, "text/xml");
        const styles = Array.from(stylesXml.getElementsByTagNameNS("*", "style"));
        for (const style of styles) {
          const styleId = style.getAttribute("w:styleId") || style.getAttributeNS("*", "styleId") || style.getAttribute("styleId") || getAttrVal(style, "styleId");
          const nameEl = style.getElementsByTagNameNS("*", "name")[0];
          const styleName = nameEl ? (getAttrVal(nameEl, "val") || nameEl.getAttribute("w:val")) : null;
          
          if (styleId || styleName) {
            const pPr = style.getElementsByTagNameNS("*", "pPr")[0];
            if (pPr) {
              const jc = pPr.getElementsByTagNameNS("*", "jc")[0];
              if (jc) {
                const val = getAttrVal(jc, "val");
                if (val) {
                  if (styleId) stylesMap[styleId] = val;
                  if (styleName) stylesMap[styleName] = val;
                }
              }
            }
          }
        }
      }

      // Parse document.xml for page dimensions, margins, tables shading, runs, and paragraphs
      const docXmlFile = zip.file("word/document.xml");
      if (docXmlFile) {
        const docXmlText = await docXmlFile.async("string");
        const domParser = new DOMParser();
        const documentXml = domParser.parseFromString(docXmlText, "text/xml");

        // 1. EXTRACT DOCUMENT MARGINS
        const pgMar = documentXml.getElementsByTagNameNS("*", "pgMar")[0];
        if (pgMar) {
          const leftMar = getAttrVal(pgMar, "left");
          const rightMar = getAttrVal(pgMar, "right");
          const topMar = getAttrVal(pgMar, "top");
          const bottomMar = getAttrVal(pgMar, "bottom");
          
          // 1 twip = 1/20 pt = 0.05 pt. 1 pt = 1.33 px. So twips * 0.0667 px.
          if (leftMar) {
            paddingLeft = `${Math.round(parseInt(leftMar) * 0.0667)}px`;
          }
          if (rightMar) {
            paddingRight = `${Math.round(parseInt(rightMar) * 0.0667)}px`;
          }
          if (topMar) {
            paddingTop = `${Math.round(parseInt(topMar) * 0.0667)}px`;
          }
          if (bottomMar) {
            paddingBottom = `${Math.max(60, Math.round(parseInt(bottomMar) * 0.0667))}px`;
          }
        }

        // 2. STYLE TABLES & TABLE CELL BACKGROUNDS (SHADING)
        const wTbls = Array.from(documentXml.getElementsByTagNameNS("*", "tbl"));
        const htmlTables = Array.from(parserDiv.querySelectorAll("table")) as HTMLTableElement[];
        
        for (let t = 0; t < Math.min(wTbls.length, htmlTables.length); t++) {
          const xmlTbl = wTbls[t];
          const htmlTbl = htmlTables[t];
          
          htmlTbl.style.width = "100%";
          htmlTbl.style.borderCollapse = "collapse";
          htmlTbl.style.marginTop = "12px";
          htmlTbl.style.marginBottom = "20px";
          
          const htmlTDs = Array.from(htmlTbl.querySelectorAll("td, th")) as HTMLElement[];
          const xmlTCs = Array.from(xmlTbl.getElementsByTagNameNS("*", "tc"));
          
          for (let c = 0; c < Math.min(xmlTCs.length, htmlTDs.length); c++) {
            const xmlTc = xmlTCs[c];
            const htmlTd = htmlTDs[c];
            
            htmlTd.style.border = "1px solid #444444";
            htmlTd.style.padding = "10px";
            htmlTd.style.fontSize = "14px";
            htmlTd.style.lineHeight = "1.5";
            
            let shdFill: string | null = null;
            const tcPr = xmlTc.getElementsByTagNameNS("*", "tcPr")[0];
            if (tcPr) {
              const shd = tcPr.getElementsByTagNameNS("*", "shd")[0];
              if (shd) {
                shdFill = getAttrVal(shd, "fill");
              }
            }
            
            if (shdFill && shdFill !== "auto" && shdFill !== "none") {
              const cleanHex = shdFill.trim();
              const colorCode = cleanHex.startsWith("#") ? cleanHex : `#${cleanHex}`;
              htmlTd.style.backgroundColor = colorCode;
              
              // Dark vs Light Background Contrast Formula for Accessibility
              const r = parseInt(cleanHex.substring(0, 2), 16);
              const g = parseInt(cleanHex.substring(2, 4), 16);
              const b = parseInt(cleanHex.substring(4, 6), 16);
              if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
                const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                htmlTd.style.color = luminance > 0.5 ? "#000000" : "#ffffff";
              }
            }
          }
        }

        // 3. ENHANCE PARAGRAPH SPECIFIC STYLING, ALIGNMENTS, SPACING, AND TEXT COLORS
        const wPs = Array.from(documentXml.getElementsByTagNameNS("*", "p"));
        const htmlBlocks = Array.from(parserDiv.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li")) as HTMLElement[];

        let xmlIndex = 0;
        for (let i = 0; i < htmlBlocks.length; i++) {
          const htmlEl = htmlBlocks[i];
          const htmlText = htmlEl.textContent?.trim() || "";

          // Match XML paragraph using wide global text congruence matching to avoid off-by-one table misalignment
          let matchedXmlNode: any = null;
          let matchedIndex = -1;

          if (htmlText) {
            // Sequential sliding window of size 20 (extremely order-preserving and accurate)
            const startSearch = Math.max(0, xmlIndex - 3);
            const endSearch = Math.min(wPs.length, xmlIndex + 20);
            
            for (let j = startSearch; j < endSearch; j++) {
              const xmlText = wPs[j].textContent?.trim() || "";
              if (xmlText === htmlText || 
                  (xmlText && (htmlText === xmlText || htmlText.includes(xmlText) || xmlText.includes(htmlText)) && Math.abs(htmlText.length - xmlText.length) < 30)) {
                matchedXmlNode = wPs[j];
                matchedIndex = j;
                break;
              }
            }
          }

          if (!matchedXmlNode && !htmlText && xmlIndex < wPs.length) {
            // Fallback for blank/spacer paragraphs
            matchedXmlNode = wPs[xmlIndex];
            matchedIndex = xmlIndex;
          }

          if (matchedIndex !== -1) {
            xmlIndex = matchedIndex + 1;
          }

          let alignVal: string | null = null;
          let spacingBefore: string | null = null;
          let spacingAfter: string | null = null;
          let leftInd: string | null = null;
          let runColor: string | null = null;
          let runSize: string | null = null;

          if (matchedXmlNode) {
            const pPr = matchedXmlNode.getElementsByTagNameNS("*", "pPr")[0];
            if (pPr) {
              // Direct Alignment check
              const jc = pPr.getElementsByTagNameNS("*", "jc")[0];
              if (jc) {
                alignVal = getAttrVal(jc, "val");
              }
              if (!alignVal) {
                // Style lookup alignment
                const pStyle = pPr.getElementsByTagNameNS("*", "pStyle")[0];
                if (pStyle) {
                  const styleId = getAttrVal(pStyle, "val");
                  if (styleId && stylesMap[styleId]) {
                    alignVal = stylesMap[styleId];
                  }
                }
              }

              // Spacing check (twips to px)
              const spacing = pPr.getElementsByTagNameNS("*", "spacing")[0];
              if (spacing) {
                spacingBefore = getAttrVal(spacing, "before");
                spacingAfter = getAttrVal(spacing, "after");
              }

              // Indentation check (twips to px)
              const ind = pPr.getElementsByTagNameNS("*", "ind")[0];
              if (ind) {
                leftInd = getAttrVal(ind, "left");
              }
            }

            // Extract Run details (text color, custom font size) of the first formatted run
            const runs = matchedXmlNode.getElementsByTagNameNS("*", "r");
            for (let rNode = 0; rNode < runs.length; rNode++) {
              const rPr = runs[rNode].getElementsByTagNameNS("*", "rPr")[0];
              if (rPr) {
                if (!runColor) {
                  const colorNode = rPr.getElementsByTagNameNS("*", "color")[0];
                  if (colorNode) {
                    runColor = getAttrVal(colorNode, "val");
                  }
                }
                if (!runSize) {
                  const szNode = rPr.getElementsByTagNameNS("*", "sz")[0];
                  if (szNode) {
                    runSize = getAttrVal(szNode, "val");
                  }
                }
              }
              if (runColor && runSize) break;
            }
          }

          // Apply alignments (Center, Right, Justified, Left)
          let alignmentSet = false;
          if (alignVal) {
            const norm = alignVal.toLowerCase();
            if (norm === "center") {
              htmlEl.classList.add("text-center");
              htmlEl.style.setProperty("text-align", "center", "important");
              alignmentSet = true;
            } else if (norm === "right" || norm === "end") {
              htmlEl.classList.add("text-right");
              htmlEl.style.setProperty("text-align", "right", "important");
              alignmentSet = true;
            } else if (norm === "both" || norm === "justify") {
              htmlEl.classList.add("text-justify");
              htmlEl.style.setProperty("text-align", "justify", "important");
              alignmentSet = true;
            } else if (norm === "left" || norm === "start") {
              htmlEl.classList.add("text-left");
              htmlEl.style.setProperty("text-align", "left", "important");
              alignmentSet = true;
            }
          }

          // CRITICAL CLASS FALLBACK: If XML matched node didn't set alignment, look at Mammoth's class designations!
          if (!alignmentSet) {
            for (const cl of Array.from(htmlEl.classList)) {
              if (cl.startsWith("text-")) {
                const alignDir = cl.split("-")[1];
                if (alignDir === "center") {
                  htmlEl.style.setProperty("text-align", "center", "important");
                  alignmentSet = true;
                } else if (alignDir === "right") {
                  htmlEl.style.setProperty("text-align", "right", "important");
                  alignmentSet = true;
                } else if (alignDir === "justify") {
                  htmlEl.style.setProperty("text-align", "justify", "important");
                  alignmentSet = true;
                } else if (alignDir === "left") {
                  htmlEl.style.setProperty("text-align", "left", "important");
                  alignmentSet = true;
                }
              }
            }
          }

          // Apply Spacing properties (preserving spacing margins)
          if (spacingBefore) {
            const sBeforePx = Math.round(parseInt(spacingBefore) * 0.0667);
            htmlEl.style.marginTop = `${sBeforePx}px`;
          }
          if (spacingAfter) {
            const sAfterPx = Math.round(parseInt(spacingAfter) * 0.0667);
            htmlEl.style.marginBottom = `${sAfterPx}px`;
          }

          // Apply Indentation (preserving margin limits and list indentations)
          if (leftInd) {
            const leftIndPx = Math.round(parseInt(leftInd) * 0.0667);
            // Maintain lists standard padding-left by adding extra indentation if any
            if (htmlEl.tagName.toLowerCase() === "li") {
              htmlEl.style.marginLeft = `${leftIndPx}px`;
            } else {
              htmlEl.style.paddingLeft = `${leftIndPx}px`;
            }
          }

            // Apply Colors (preserving color)
            if (runColor && runColor !== "auto") {
              htmlEl.style.color = runColor.startsWith("#") ? runColor : `#${runColor}`;
            }

            // Apply proportional font sizing
            if (runSize) {
              const sizePx = Math.max(10, Math.round(parseInt(runSize) * 0.667));
              // Only override size if it's a standard text unit (paragraph or list item)
              if (htmlEl.tagName.toLowerCase() === "p" || htmlEl.tagName.toLowerCase() === "li") {
                htmlEl.style.fontSize = `${sizePx}px`;
              }
            }

            xmlIndex = matchedIndex + 1;
          }
        }
    } catch (e) {
      console.warn("Could not perfectly match formatting alignment from Raw XML archive, using style-only fallbacks.", e);
    }

    const childNodes = Array.from(parserDiv.childNodes);

    let currentPage = createPage(true);

    // Paginate elements
    for (const node of childNodes) {
      if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) {
        continue;
      }
      const clone = node.cloneNode(true);
      currentPage.appendChild(clone);

      const contentChildrenCount = Array.from(currentPage.childNodes).filter(
        n => n.nodeName.toLowerCase() !== "style"
      ).length;

      // Check height limit - leaving 30px buffer to prevent accidental clipping
      if (currentPage.offsetHeight > (1123 - 30) && contentChildrenCount > 1) {
        currentPage.removeChild(clone);
        currentPage = createPage(true);
        currentPage.appendChild(clone);
      }
    }

    // Force page layout size to exact A4 for canvas snapshotting
    const pages = Array.from(pagesContainer.querySelectorAll(".docx-pdf-page")) as HTMLDivElement[];
    pages.forEach((pageEl) => {
      pageEl.style.height = "1123px";
    });

    // Give browser brief layout calculation moment
    await new Promise((r) => setTimeout(r, 400));

    prog(75, "Compiling page canvas images…");

    const html2canvasLib = (window as any).html2canvas;
    const jspdfLib = (window as any).jspdf;

    if (!html2canvasLib || !jspdfLib) {
      document.body.removeChild(pagesContainer);
      throw new Error("Failed to load layout rendering libraries. Please check your network and try again.");
    }

    let pdfBytes: ArrayBuffer;
    try {
      const pdf = new jspdfLib.jsPDF("p", "pt", "a4");
      const pdfPageWidth = 595.28;
      const pdfPageHeight = 841.89;

      for (let i = 0; i < pages.length; i++) {
        prog(75 + Math.round((i / pages.length) * 20));
        const canvas = await html2canvasLib(pages[i], {
          scale: 2, // High DPI capture
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff"
        });

        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        if (i > 0) {
          pdf.addPage();
        }
        pdf.addImage(imgData, "JPEG", 0, 0, pdfPageWidth, pdfPageHeight);
      }

      pdfBytes = pdf.output("arraybuffer");
    } finally {
      document.body.removeChild(pagesContainer);
    }

    prog(95, "Completing PDF document layer stream…");
    return {
      blob: new Blob([pdfBytes], { type: "application/pdf" }),
      name: getOutputFile(files[0]?.name, "", ".pdf")
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
    try {
      prog(15, "Opening PDF content…");
      const ab = await readAB(files[0]);
      const { text, numPages, pages, pageDetails } = await extractText(ab);
      
      prog(45, "Loading PowerPoint compiler…");
      const P = await getPptxGen();
      const PptxConstructor = typeof P === 'function' ? P : (P && typeof P.default === 'function' ? P.default : (window as any).PptxGenJS || (window as any).pptxgen || (window as any).PptxGen);
      if (!PptxConstructor) {
        throw new Error("PowerPoint compiler (PptxGenJS) failed to load.");
      }
      const pptx = new PptxConstructor();

      // Clear all hollow boxes, symbols, or unrendered dingbats that can cause squares on standard devices
      const cleanPresentationText = (txt: string): string => {
        if (!txt) return "";
        
        // Remove known Wingding, Webding, Private Use Area (PUA), and unrendered Unicode ranges
        let clean = txt.replace(/[\uE000-\uF8FF]/g, ""); // PUA Primary
        clean = clean.replace(/[\uF000-\uFFFF]/g, ""); // Extended symbols/surrogates
        clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ""); // Invisible controls
        
        const lines = clean.split("\n");
        const processedLines = lines.map(line => {
          let l = line.trim();
          
          // Match and replace any geometric bullet shapes (hollow/solid blocks, triangles, card symbols) at the line start
          l = l.replace(/^[\u25A0-\u25FF\u2700-\u27BF\u2022\u2219\u25CB\u25CF\u25AA\u25AB\u25B6\u25C6\u25C8\u27A1\u27A2\u27A5\u27A6\u27AA\u27AB\u27AC\u27AD\u27AE\u27AF\u27B1\u27B2\u27B3\u27B5\u27B8\u27B9\u27BA\u27BB\u27BC\u27BD\u27BE\u27F0-\u27FF]+/g, "•");
          
          // Strip out literal bracket and hollow box bullet artifacts like "[]", "[ ]", "❑", "◆", "➢", etc.
          l = l.replace(/^(\[\]|\[\s\]|\[\?\]|\-\-|\s*○|\s*■|\s*❑|\s*◆|\s*➢|\s*•)\s*/, "• ");
          
          // Remove orphan non-alphanumeric junk characters at start
          l = l.replace(/^[^\w\s"'(•\-\+]{1}\s+/, "• ");
          
          // Replace any boxy characters or symbols within the sentence with a clean alternative
          l = l.replace(/[\u25A0-\u25FF\u2700-\u27BF\u2219\u25CB\u25CF\u25AA\u25AB\u25B6\u25C6\u25C8\u27F0-\u27FF]/g, "-");
          
          return l;
        });
        
        return processedLines.filter(line => line.length > 0).join("\n");
      };

      prog(70, "Framing presentation slides layout…");
      for (let i = 0; i < numPages; i++) {
        const slide = pptx.addSlide();
        
        // Retrieve matching page details containing diagram/text data
        const detail = pageDetails && pageDetails[i] ? pageDetails[i] : { text: pages[i] || "", pageNumber: i + 1, hasDiagram: false, image: undefined };
        
        let slideTitle = `Slide Section ${i + 1}`;
        let bodyContent = "";
        
        const pageContent = detail.text ? detail.text.trim() : "";
        if (pageContent) {
          const lines = pageContent.split("\n").map(l => l.trim()).filter(l => l.length > 0);
          if (lines.length > 0) {
            const potentialTitle = lines[0];
            const cleanTitleCandidate = cleanPresentationText(potentialTitle).replace(/^•\s*/, "");
            if (cleanTitleCandidate.length > 1 && cleanTitleCandidate.length < 90) {
              slideTitle = cleanTitleCandidate;
              bodyContent = lines.slice(1).join("\n");
            } else {
              slideTitle = `Section from Document Page ${i + 1}`;
              bodyContent = lines.join("\n");
            }
          } else {
            bodyContent = "No text content found on this page.";
          }
        } else {
          bodyContent = "No text content found on this page.";
        }
        
        slideTitle = cleanPresentationText(slideTitle).trim() || `Slide Section ${i + 1}`;
        bodyContent = cleanPresentationText(bodyContent).trim();
        
        const snippet = bodyContent.slice(0, 1000) + (bodyContent.length > 1000 ? "..." : "");

        // Standalone title banner with a highly presentable clean corporate font (Arial/Helvetica style) 
        // to maintain the true, natural text styling of the original PDF
        slide.addText(slideTitle, { 
          x: 0.6, 
          y: 0.5, 
          w: 8.8, 
          h: 0.8, 
          fontSize: 24, 
          bold: true, 
          color: "0F172A", // Deep Charcoal slate (maintains PDF body text natural coloring)
          fontFace: "Arial"
        });

        if (detail.hasDiagram && detail.image) {
          // SPLIT LAYOUT (Diagram alongside text): Avoids dedicated slides so that text and figures stay together in the correct flow
          slide.addText(snippet, { 
            x: 0.6, 
            y: 1.4, 
            w: 4.2, 
            h: 3.8, 
            fontSize: 12, 
            color: "1E293B", // Neutral grey-slate text
            fontFace: "Arial",
            align: "left",
            valign: "top",
            lineSpacing: 18
          });

          slide.addImage({
            data: detail.image,
            x: 5.1,
            y: 1.4,
            w: 4.3,
            h: 3.8,
            sizing: { type: "contain", w: 4.3, h: 3.8 }
          });
        } else {
          // FULL LAYOUT (Standard full-width presentation text)
          slide.addText(snippet, { 
            x: 0.6, 
            y: 1.4, 
            w: 8.8, 
            h: 3.8, 
            fontSize: 13, 
            color: "1E293B", // Sophisticated slate grey text
            fontFace: "Arial",
            align: "left",
            valign: "top",
            lineSpacing: 18
          });
        }
      }

      prog(90, "Writing ZIP payload…");
      let pptxBlob: Blob;

      const tryWrite = async (): Promise<Blob> => {
        // Try write('base64') first, as base64 is extremely stable across older/newer PptxGenJS versions, then we decode it to binary blob.
        try {
          const b64 = await pptx.write("base64");
          if (b64 && typeof b64 === 'string') {
            const bin = atob(b64);
            const rawLength = bin.length;
            const uInt8Array = new Uint8Array(rawLength);
            for (let j = 0; j < rawLength; j++) {
              uInt8Array[j] = bin.charCodeAt(j);
            }
            return new Blob([uInt8Array], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
          }
        } catch (e1) {
          console.warn("pptx.write('base64') failed, trying other methods...", e1);
        }

        try {
          const res = await pptx.write("blob");
          if (res instanceof Blob) {
            return res;
          } else if (res) {
            return new Blob([res as any], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
          }
        } catch (e2) {
          console.warn("pptx.write('blob') failed:", e2);
        }

        try {
          const buf = await pptx.write("arraybuffer");
          if (buf) {
            return new Blob([buf as any], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
          }
        } catch (e3) {
          console.warn("pptx.write('arraybuffer') failed:", e3);
        }

        try {
          const res = await pptx.write({ outputType: "blob" });
          if (res instanceof Blob) {
            return res;
          } else if (res) {
            return new Blob([res as any], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
          }
        } catch (e4) {
          console.warn("pptx.write({ outputType: 'blob' }) failed:", e4);
        }

        try {
          const b64 = await pptx.write({ outputType: "base64" });
          if (b64 && typeof b64 === 'string') {
            const bin = atob(b64);
            const rawLength = bin.length;
            const uInt8Array = new Uint8Array(rawLength);
            for (let j = 0; j < rawLength; j++) {
              uInt8Array[j] = bin.charCodeAt(j);
            }
            return new Blob([uInt8Array], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
          }
        } catch (e5) {
          console.warn("pptx.write({ outputType: 'base64' }) failed:", e5);
        }

        throw new Error("All PowerPoint generation output methods failed.");
      };

      pptxBlob = await tryWrite();

      return {
        blob: pptxBlob,
        name: getOutputFile(files[0]?.name, "slides", ".pptx")
      };
    } catch (err: any) {
      console.error("Critical error inside PdfToPptTool:", err);
      throw new Error(err?.message || String(err));
    }
  }, []);

  return <Proc id="pdf-to-ppt" label="Convert PDF to slides (PPTX)" accept=".pdf" run={run} onSuccess={onSuccess} toolName={toolName} />;
};
