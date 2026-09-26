import React, { useState, useCallback } from "react";
import { readAB, readURL, getPdfJs, getJSZip, getPdfLib, renderPage, fmt, getOutputFile } from "./PdfScriptLoader";
import { Proc, Done } from "./SharedComponents";

interface ToolProps {
  onSuccess?: (fileName: string, toolName: string) => void;
  toolName: string;
}

/* PDF→IMAGE (JPEG & PNG & WEBP) */
export const PdfToImgTool = ({ fmt: targetFormat, onSuccess, toolName }: { fmt: "jpeg" | "png" | "webp" } & ToolProps) => {
  const [scale, setScale] = useState(2.0);
  const [qual, setQual] = useState(0.95);

  const run = useCallback(async (files: File[], prog: (p: number, m?: string) => void) => {
    prog(10, "Converting your file...");
    const lib = await getPdfJs();
    const ab = await readAB(files[0]);
    prog(30, "Converting your file...");
    const doc = await lib.getDocument({ data: new Uint8Array(ab) }).promise;
    const tot = doc.numPages;

    const renderSingleAndGetPreview = async () => {
      prog(50, "Converting your file...");
      const cv = await renderPage(doc, 1, scale);
      const blob = await new Promise<Blob>((resolve) => {
        cv.toBlob(
          (b) => resolve(b || new Blob()),
          `image/${targetFormat === "webp" ? "webp" : targetFormat}`,
          targetFormat === "jpeg" ? qual : targetFormat === "webp" ? 0.92 : undefined
        );
      });

      prog(98, "Converting your file...");
      const previewCv = await renderPage(doc, 1, 1.0);
      const previewUrl = previewCv.toDataURL("image/jpeg", 0.85);

      const infoNode = (
        <div className="flex flex-col items-center mt-4">
          <p className="text-xs font-bold text-slate-405 dark:text-slate-500 uppercase font-mono mb-2">First Page Preview</p>
          <div className="relative border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm max-w-[180px] bg-white">
            <img src={previewUrl} className="max-h-48 block w-auto mx-auto" alt="Page 1 preview" referrerPolicy="no-referrer" />
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 font-semibold">
            Single page converted directly
          </p>
        </div>
      );

      return {
        blob,
        name: getOutputFile(files[0]?.name, "page-1", targetFormat === "jpeg" ? ".jpg" : targetFormat === "png" ? ".png" : ".webp"),
        info: infoNode
      };
    };

    if (tot === 1) {
      return await renderSingleAndGetPreview();
    }

    const JSZipLib = await getJSZip();
    const zip = new JSZipLib();
    for (let i = 1; i <= tot; i++) {
      prog(30 + Math.round((i / tot) * 55), "Converting your file...");
      const cv = await renderPage(doc, i, scale);
      const blob = await new Promise<Blob>((resolve) => {
        cv.toBlob(
          (b) => resolve(b || new Blob()),
          `image/${targetFormat === "webp" ? "webp" : targetFormat}`,
          targetFormat === "jpeg" ? qual : targetFormat === "webp" ? 0.92 : undefined
        );
      });
      const buf = await blob.arrayBuffer();
      zip.file(`page-${i}.${targetFormat === "jpeg" ? "jpg" : targetFormat === "png" ? "png" : "webp"}`, buf);
    }

    prog(95, "Converting your file...");
    const previewCv = await renderPage(doc, 1, 1.0);
    const previewUrl = previewCv.toDataURL("image/jpeg", 0.85);

    const infoNode = (
      <div className="flex flex-col items-center mt-4">
        <p className="text-xs font-bold text-slate-405 dark:text-slate-500 uppercase font-mono mb-2">First Page Preview</p>
        <div className="relative border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm max-w-[180px] bg-white">
          <img src={previewUrl} className="max-h-48 block w-auto mx-auto" alt="Page 1 preview" referrerPolicy="no-referrer" />
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 font-semibold">
          {tot} pages compressed into a high-fidelity ZIP archive
        </p>
      </div>
    );

    prog(98, "Converting your file...");
    const zb = await zip.generateAsync({ type: "blob" });
    return { blob: zb, name: getOutputFile(files[0]?.name, "images", ".zip"), info: infoNode };
  }, [targetFormat, scale, qual]);

  return (
    <Proc
      id={`pdf-to-${targetFormat}`}
      label={`PDF to ${targetFormat.toUpperCase()}`}
      run={run}
      onSuccess={onSuccess}
      toolName={toolName}
      opts={
        <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 mb-1.5 uppercase font-mono">
              Render Scale: {scale}x
            </label>
            <input
              type="range"
              min={2}
              max={4}
              step={0.5}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-250 dark:bg-neutral-800 rounded-lg cursor-pointer"
            />
          </div>
          {targetFormat === "jpeg" && (
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 mb-1.5 uppercase font-mono">
                JPEG Quality: {Math.round(qual * 100)}%
              </label>
              <input
                type="range"
                min={0.95}
                max={1}
                step={0.01}
                value={qual}
                onChange={(e) => setQual(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-250 dark:bg-neutral-800 rounded-lg cursor-pointer"
              />
            </div>
          )}
        </div>
      }
    />
  );
};

/* IMAGE→PDF (JPG, PNG, WEBP, HEIC) */
export const ImgToPdfTool = ({ accept = ".jpg,.jpeg,.png,.webp", onSuccess, toolName }: { accept?: string } & ToolProps) => {
  const [ps, setPs] = useState("fit");

  const run = useCallback(async (files: File[], prog: (p: number, m?: string) => void) => {
    prog(10, "Converting your file...");
    const { PDFDocument, degrees } = await getPdfLib();
    const { toEmbeddable, jpegOrientation } = await import("../../lib/image/decode");
    const doc = await PDFDocument.create();
    let pages = 0;

    for (let i = 0; i < files.length; i++) {
      prog(15 + Math.round((i / files.length) * 75), "Converting your file...");
      const f = files[i];

      let images;
      try {
        images = await toEmbeddable(f);
      } catch (err) {
        throw new Error(`Could not read the image ${f.name}. Please check the file isn't damaged.`);
      }

      for (let e of images) {
        // Mirrored EXIF orientations (2, 4, 5, 7) are rare; let the browser
        // apply those by redrawing. Plain rotations are applied losslessly below.
        if (e.kind === "jpg" && [2, 4, 5, 7].includes(e.orientation)) {
          const bmp = await createImageBitmap(new Blob([e.bytes], { type: "image/jpeg" }));
          const cv = document.createElement("canvas");
          cv.width = bmp.width;
          cv.height = bmp.height;
          cv.getContext("2d")!.drawImage(bmp, 0, 0);
          const b = await new Promise<Blob>((res) => cv.toBlob((x) => res(x!), "image/jpeg", 0.92));
          const bytes = await b.arrayBuffer();
          e = { kind: "jpg", bytes, orientation: jpegOrientation(bytes) };
        }
        const img = e.kind === "jpg" ? await doc.embedJpg(e.bytes) : await doc.embedPng(e.bytes);
        const quarterTurn = e.orientation === 6 || e.orientation === 8;
        // Size of the photo as it should appear.
        const dispW = quarterTurn ? img.height : img.width;
        const dispH = quarterTurn ? img.width : img.height;

        let W = dispW;
        let H = dispH;
        if (ps === "A4" || ps === "letter") {
          const landscape = dispW > dispH;
          const [a, b] = ps === "A4" ? [595, 842] : [612, 792];
          W = landscape ? b : a;
          H = landscape ? a : b;
        }

        const sc = ps === "fit" ? 1.0 : Math.min(W / dispW, H / dispH);
        const bx = (W - dispW * sc) / 2;
        const by = (H - dispH * sc) / 2;
        // Drawn size of the stored (unrotated) pixels.
        const w = img.width * sc;
        const h = img.height * sc;
        const pg = doc.addPage([W, H]);
        if (e.orientation === 6) pg.drawImage(img, { x: bx, y: by + w, width: w, height: h, rotate: degrees(-90) });
        else if (e.orientation === 8) pg.drawImage(img, { x: bx + h, y: by, width: w, height: h, rotate: degrees(90) });
        else if (e.orientation === 3) pg.drawImage(img, { x: bx + w, y: by + h, width: w, height: h, rotate: degrees(180) });
        else pg.drawImage(img, { x: bx, y: by, width: w, height: h });
        pages++;
      }
    }

    prog(95, "Converting your file...");
    const bytes = await doc.save({ useObjectStreams: true });
    return {
      blob: new Blob([bytes], { type: "application/pdf" }),
      name: getOutputFile(files[0]?.name, "converted", ".pdf"),
      info: `${pages} photo${pages === 1 ? "" : "s"} compiled`
    };
  }, [ps]);

  return (
    <Proc
      id="img-to-pdf"
      label="Convert Images to PDF"
      accept={accept}
      multi
      run={run}
      onSuccess={onSuccess}
      toolName={toolName}
      opts={
        <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 mb-1.5 uppercase font-mono">
            Output Layout Framing
          </label>
          <div className="flex gap-2">
            {[
              ["fit", "Fit Photo Bounds"],
              ["A4", "Physical A4 Page"],
              ["letter", "Physical US Letter"]
            ].map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => setPs(v)}
                className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition ${
                  ps === v
                    ? "border-indigo-600 bg-indigo-50/20 text-indigo-700 dark:text-indigo-300"
                    : "border-slate-200 dark:border-slate-800 hover:bg-slate-100/50"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      }
    />
  );
};