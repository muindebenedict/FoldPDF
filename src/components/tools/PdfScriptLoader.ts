// CDN script and package loading helpers for browser-sandboxed real execution in FoldPDF

declare global {
  interface Window {
    PDFLib: any;
    pdfjsLib: any;
    JSZip: any;
    mammoth: any;
    XLSX: any;
    Tesseract: any;
    PptxGenJS: any;
  }
}

const cache: Record<string, Promise<any>> = {};

export const loadScript = (url: string, globalName?: string): Promise<any> => {
  if (cache[url]) return cache[url];
  cache[url] = new Promise((res, rej) => {
    if (globalName && (window as any)[globalName]) {
      res((window as any)[globalName]);
      return;
    }
    const s = document.createElement("script");
    s.src = url;
    s.onload = () => res(globalName ? (window as any)[globalName] : true);
    s.onerror = rej;
    document.head.appendChild(s);
  });
  return cache[url];
};

export const getPdfLib = () => loadScript("https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js", "PDFLib");

export const getFontkit = () => loadScript("https://unpkg.com/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js", "fontkit");

export const getPdfJs = () => loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js", "pdfjsLib").then(lib => {
  if (lib && lib.GlobalWorkerOptions && !lib.GlobalWorkerOptions.workerSrc) {
    lib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
  return lib;
});

export const getJSZip = () => loadScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js", "JSZip");

export const getMammoth = () => loadScript("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js", "mammoth");

export const getXLSX = () => loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", "XLSX");

export const getPptxGen = () => loadScript("https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js", "PptxGenJS");

export const getTesseract = () => loadScript("https://unpkg.com/tesseract.js@5.1.1/dist/tesseract.min.js", "Tesseract");

// General purpose utils
export const readAB = (f: File): Promise<ArrayBuffer> => new Promise((r, j) => {
  const x = new FileReader();
  x.onload = e => r(e.target?.result as ArrayBuffer);
  x.onerror = j;
  x.readAsArrayBuffer(f);
});

export const readURL = (f: File): Promise<string> => new Promise((r, j) => {
  const x = new FileReader();
  x.onload = e => r(e.target?.result as string);
  x.onerror = j;
  x.readAsDataURL(f);
});

export const readTxt = (f: File): Promise<string> => new Promise((r, j) => {
  const x = new FileReader();
  x.onload = e => r(e.target?.result as string);
  x.onerror = j;
  x.readAsText(f);
});

export const fmt = (b: number): string => 
  b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(1) + " KB" : (b / 1048576).toFixed(2) + " MB";

export const getOutputFile = (originalName: string | undefined, suffix: string, extWithDot: string): string => {
  if (!originalName) return `foldpdf-${suffix || "output"}-${Date.now()}${extWithDot}`;
  const base = originalName.replace(/\.[^/.]+$/, "");
  if (!suffix) return `${base}${extWithDot}`;
  return `${base}-${suffix}${extWithDot}`;
};

export const dl = (blob: Blob, name: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1200);
};

export async function renderPage(pdfDoc: any, n: number, scale: number = 1.5): Promise<HTMLCanvasElement> {
  const page = await pdfDoc.getPage(n);
  const vp = page.getViewport({ scale });
  const cv = document.createElement("canvas");
  cv.width = vp.width;
  cv.height = vp.height;
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("Could not construct 2D context");
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return cv;
}

export async function extractText(ab: ArrayBuffer): Promise<{ 
  text: string; 
  numPages: number; 
  pages: string[]; 
  pageDetails?: Array<{ 
    text: string; 
    pageNumber: number; 
    hasDiagram: boolean; 
    image?: string; 
  }> 
}> {
  const lib = await getPdfJs();
  const doc = await lib.getDocument({ data: new Uint8Array(ab) }).promise;
  try {
    let fullText = "";
    const pages: string[] = [];
    const pageDetails: Array<{ text: string; pageNumber: number; hasDiagram: boolean; image?: string }> = [];
    
    for (let i = 1; i <= doc.numPages; i++) {
      const pg = await doc.getPage(i);
      const tc = await pg.getTextContent();
      
      // Detect images and drawings
      let hasDiagram = false;
      let image: string | undefined = undefined;
      try {
        const opList = await pg.getOperatorList();
        const ops = opList.fnArray;
        const OPS = lib.OPS || (window as any).pdfjsLib?.OPS || {};
        
        let drawCount = 0;
        let imageCount = 0;
        for (let j = 0; j < ops.length; j++) {
          const op = ops[j];
          if (op === OPS.paintImageXObject || op === OPS.paintInlineImageXObject || op === OPS.paintImageMaskXObject) {
            imageCount++;
          } else if (op === OPS.stroke || op === OPS.fill || op === OPS.shadingFill) {
            drawCount++;
          }
        }
        
        if (imageCount > 0 || drawCount > 8) {
          hasDiagram = true;
          // Render diagram page to PNG base64
          const scale = 1.5;
          const vp = pg.getViewport({ scale });
          const cv = document.createElement("canvas");
          cv.width = vp.width;
          cv.height = vp.height;
          const ctx = cv.getContext("2d");
          if (ctx) {
            await pg.render({ canvasContext: ctx, viewport: vp }).promise;
            image = cv.toDataURL("image/png");
          }
        }
      } catch (err) {
        console.warn("Operator list inspect or page rendering failed for page " + i + ":", err);
      }
      
      // Extract items with readable strings and layout metrics
      const items = tc.items
        .filter((x: any) => x && typeof x.str === "string")
        .map((x: any) => {
          const matrix = x.transform || [1, 0, 0, 1, 0, 0];
          // transform[3] represents scaleY (font size in standard text coordinates)
          const fontSize = Math.abs(matrix[3]) || x.height || 10;
          return {
            text: x.str,
            x: matrix[4], // horizontal translation
            y: matrix[5], // vertical translation
            fontSize,
            width: x.width || 0,
            height: x.height || fontSize,
            item: x
          };
        });

      let pageText = "";
      if (items.length > 0) {
        // Sort items by Y descending (PDF coordinates: bottom-up, so top of page has highest Y)
        items.sort((a, b) => b.y - a.y);

        // Group items into rows/lines with vertical tolerance
        const lines: Array<{ y: number; fontSize: number; items: typeof items }> = [];
        for (const item of items) {
          let foundLine = false;
          for (const line of lines) {
            // If the Y coordinate of the item is close enough to the line Y, add it to this line
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
              items: [item]
            });
          }
        }

        // Since items were initially sorted by Y descending, lines are already in top-to-bottom order.
        // Within each line, sort items by X coordinate ascending (left-to-right)
        for (const line of lines) {
          line.items.sort((a, b) => a.x - b.x);
        }

        // Reconstruct the text for this page preserving spacing and word integrity
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
          const line = lines[lineIndex];
          let lineStr = "";
          
          for (let j = 0; j < line.items.length; j++) {
            const curr = line.items[j];
            if (j === 0) {
              lineStr += curr.text;
            } else {
              const prev = line.items[j - 1];
              // Heuristic to estimate character width if not provided
              const approxCharWidth = curr.fontSize * 0.38;
              const prevWidth = prev.width || (prev.text.length * approxCharWidth);
              const gap = curr.x - (prev.x + prevWidth);
              
              const endsWithSpace = /\s$/.test(prev.text);
              const startsWithSpace = /^\s/.test(curr.text);
              
              if (endsWithSpace || startsWithSpace) {
                lineStr += curr.text;
              } else if (gap > curr.fontSize * 1.5) {
                // Large horizontal gap: likely a column separation or tab
                lineStr += "\t" + curr.text;
              } else if (gap > curr.fontSize * 0.16) {
                // Normal spacing between words
                lineStr += " " + curr.text;
              } else {
                // Very small/negative gap: split character/word chunking merge directly
                lineStr += curr.text;
              }
            }
          }

          pageText += lineStr;

          // Handle vertical formatting to reconstruct paragraph/block spacing
          if (lineIndex < lines.length - 1) {
            const nextLine = lines[lineIndex + 1];
            const yGap = line.y - nextLine.y; // positive since sorted top-to-bottom
            const verticalTolerance = Math.max(line.fontSize, nextLine.fontSize) * 1.6;
            if (yGap > verticalTolerance) {
              pageText += "\n\n"; // Double-height gap translates to paragraph break
            } else {
              pageText += "\n";   // Standard line break
            }
          } else {
            pageText += "\n";
          }
        }
      } else {
        pageText = "This page contains diagrammatic or graphical layout directly from the document.";
      }

      pages.push(pageText.trim());
      pageDetails.push({ text: pageText.trim(), pageNumber: i, hasDiagram, image });
      fullText += pageText + "\n";
    }
    
    return { text: fullText.trim(), numPages: doc.numPages, pages, pageDetails };
  } finally {
    if (doc && typeof doc.destroy === "function") {
      await doc.destroy();
    }
  }
}
