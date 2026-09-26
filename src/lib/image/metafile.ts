// Windows metafiles (WMF/EMF) are common in older Office files (clip art,
// pasted objects, OLE previews) but browsers can't display them. rtf.js
// (MIT) renders them to SVG; the SVG is then rasterised so any PDF or image
// pipeline can use it. The renderer scripts load only when a metafile shows up.

import { loadScript } from "../../components/tools/PdfScriptLoader";

const WMF_URL = "https://cdn.jsdelivr.net/npm/rtf.js@3.0.9/dist/WMFJS.bundle.min.js";
const EMF_URL = "https://cdn.jsdelivr.net/npm/rtf.js@3.0.9/dist/EMFJS.bundle.min.js";

export function isMetafile(ext: string): boolean {
  return /^(wmf|emf)$/i.test(ext);
}

// Renders a WMF/EMF to PNG bytes at the given pixel size.
export async function metafileToPng(bytes: Uint8Array, ext: string, widthPx: number, heightPx: number): Promise<Uint8Array> {
  const w = Math.max(16, Math.min(3000, Math.round(widthPx)));
  const h = Math.max(16, Math.min(3000, Math.round(heightPx)));
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  let svg: SVGElement;
  if (/^emf$/i.test(ext)) {
    const EMFJS = await loadScript(EMF_URL, "EMFJS");
    EMFJS.loggingEnabled?.(false);
    svg = new EMFJS.Renderer(buf).render({ width: `${w}px`, height: `${h}px`, wExt: w, hExt: h, xExt: w, yExt: h, mapMode: 8 });
  } else {
    const WMFJS = await loadScript(WMF_URL, "WMFJS");
    WMFJS.loggingEnabled?.(false);
    svg = new WMFJS.Renderer(buf).render({ width: `${w}px`, height: `${h}px`, xExt: w, yExt: h, mapMode: 8 });
  }
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const markup = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("metafile render failed"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    const png = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("png"))), "image/png"));
    return new Uint8Array(await png.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}
