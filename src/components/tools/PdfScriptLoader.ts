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

export const getPdfJs = () => loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js", "pdfjsLib").then(lib => {
  if (lib && lib.GlobalWorkerOptions && !lib.GlobalWorkerOptions.workerSrc) {
    lib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
  return lib;
});

export const getJSZip = () => loadScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js", "JSZip");

export const getMammoth = () => loadScript("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js", "mammoth");

export const getXLSX = () => loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", "XLSX");

export const getPptxGen = () => loadScript("https://cdnjs.cloudflare.com/ajax/libs/pptxgenjs/3.12.0/pptxgen.bundle.js", "PptxGenJS");

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

export async function extractText(ab: ArrayBuffer): Promise<{ text: string; numPages: number }> {
  const lib = await getPdfJs();
  const doc = await lib.getDocument({ data: new Uint8Array(ab) }).promise;
  let txt = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    const tc = await pg.getTextContent();
    txt += tc.items.map((x: any) => x && 'str' in x ? x.str : "").join(" ") + "\n\n";
  }
  return { text: txt, numPages: doc.numPages };
}
