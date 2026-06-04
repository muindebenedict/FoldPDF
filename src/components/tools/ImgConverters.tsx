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
    prog(10, "Loading PDFJS engine…");
    const lib = await getPdfJs();
    const ab = await readAB(files[0]);
    prog(30, "Parsing PDF structure…");
    const doc = await lib.getDocument({ data: new Uint8Array(ab) }).promise;
    const tot = doc.numPages;

    const renderSingleAndGetPreview = async () => {
      prog(50, "Rendering single page to canvas…");
      const cv = await renderPage(doc, 1, scale);
      const blob = await new Promise<Blob>((resolve) => {
        cv.toBlob(
          (b) => resolve(b || new Blob()),
          `image/${targetFormat === "webp" ? "webp" : targetFormat}`,
          targetFormat === "jpeg" ? qual : targetFormat === "webp" ? 0.92 : undefined
        );
      });

      prog(98, "Generating preview...");
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
      prog(30 + Math.round((i / tot) * 55), `Rendering page ${i}/${tot}…`);
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

    prog(95, "Generating preview...");
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

    prog(98, "Zipping all images…");
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
    prog(10, "Initializing PDF-Lib engine…");
    const { PDFDocument } = await getPdfLib();
    const doc = await PDFDocument.create();

    for (let i = 0; i < files.length; i++) {
      prog(15 + Math.round((i / files.length) * 75), `Embedding image ${i + 1}/${files.length}…`);
      const f = files[i];
      const ab = await readAB(f);
      const isJ = f.type === "image/jpeg" || f.type === "image/jpg" || /\.(jpg|jpeg)$/i.test(f.name);
      const isP = f.type === "image/png" || /\.(png)$/i.test(f.name);
      
      let img;
      try {
        if (isJ) img = await doc.embedJpg(ab);
        else if (isP) img = await doc.embedPng(ab);
        else {
          // Fallback via dynamic canvas compression rendering for non-native files like WEBP/HEIC
          const url = await readURL(f);
          const el = new Image();
          await new Promise<void>((resolve, reject) => {
            el.onload = () => resolve();
            el.onerror = () => reject(new Error("Image render issue"));
            el.src = url;
          });
          const cv = document.createElement("canvas");
          cv.width = el.width;
          cv.height = el.height;
          const ctx = cv.getContext("2d");
          if (ctx) ctx.drawImage(el, 0, 0);
          const b = await new Promise<Blob>((resolve) => {
            cv.toBlob((blob) => resolve(blob || new Blob()), "image/jpeg", 0.95);
          });
          img = await doc.embedJpg(await b.arrayBuffer());
        }
      } catch (err) {
        throw new Error(`Failed to process image format of ${f.name}. Please ensure file is undamaged.`);
      }

      let W = img.width;
      let H = img.height;
      if (ps === "A4") {
        const isLandscape = img.width > img.height;
        W = isLandscape ? 842 : 595;
        H = isLandscape ? 595 : 842;
      } else if (ps === "letter") {
        const isLandscape = img.width > img.height;
        W = isLandscape ? 792 : 612;
        H = isLandscape ? 612 : 792;
      }

      const sc = ps === "fit" ? 1.0 : Math.min(W / img.width, H / img.height);
      const sw = img.width * sc;
      const sh = img.height * sc;
      const pg = doc.addPage([W, H]);
      pg.drawImage(img, {
        x: (W - sw) / 2,
        y: (H - sh) / 2,
        width: sw,
        height: sh
      });
    }

    prog(95, "Serializing clean PDF blocks…");
    const bytes = await doc.save({ useObjectStreams: true });
    return { blob: new Blob([bytes], { type: "application/pdf" }), name: getOutputFile(files[0]?.name, "converted", ".pdf"), info: `${files.length} photo(s) compiled` };
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

/* IMAGE→IMAGE (JPEG→PNG, PNG→JPEG) */
export const ImgToImgTool = ({ fmt: targetFormat, onSuccess, toolName }: { fmt: "png" | "jpeg" } & ToolProps) => {
  const [qual, setQual] = useState(0.95);

  const run = useCallback(async (files: File[], prog: (p: number, m?: string) => void) => {
    prog(15, "Parsing image data…");
    const f = files[0];
    const url = await readURL(f);
    const el = new Image();
    
    prog(40, "Loading image onto canvas…");
    await new Promise<void>((resolve, reject) => {
      el.onload = () => resolve();
      el.onerror = () => reject(new Error("Failed to load image. Ensure file is undamaged."));
      el.src = url;
    });

    const cv = document.createElement("canvas");
    cv.width = el.width;
    cv.height = el.height;
    const ctx = cv.getContext("2d");
    if (!ctx) throw new Error("Could not initialize 2D context.");
    
    prog(70, "Converting pixel buffers…");
    // Draw white background if target is JPEG to handle PNG transparency elegantly
    if (targetFormat === "jpeg") {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, cv.width, cv.height);
    }
    ctx.drawImage(el, 0, 0);

    prog(90, "Compressing and generating output file…");
    const mimeType = targetFormat === "png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob>((resolve) => {
      cv.toBlob((blob) => resolve(blob || new Blob()), mimeType, targetFormat === "jpeg" ? qual : undefined);
    });

    const extension = targetFormat === "png" ? ".png" : ".jpg";
    const previewUrl = cv.toDataURL("image/jpeg", 0.85);

    const infoNode = (
      <div className="flex flex-col items-center mt-4">
        <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase font-mono mb-2">Image Preview</p>
        <div className="relative border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm max-w-[180px] bg-white">
          <img src={previewUrl} className="max-h-48 block w-auto mx-auto" alt="Converted preview" referrerPolicy="no-referrer" />
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 font-semibold">
          Successfully processed: {f.name}
        </p>
      </div>
    );

    return {
      blob,
      name: getOutputFile(f.name, "converted", extension),
      info: infoNode
    };
  }, [targetFormat, qual]);

  return (
    <Proc
      id={`${targetFormat === "png" ? "jpeg-to-png" : "png-to-jpg"}`}
      label={targetFormat === "png" ? "Convert JPEG to PNG (Lossless)" : "Convert PNG to JPEG (Compressed)"}
      accept={targetFormat === "png" ? ".jpg,.jpeg" : ".png"}
      run={run}
      onSuccess={onSuccess}
      toolName={toolName}
      opts={
        targetFormat === "jpeg" ? (
          <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 mb-1.5 uppercase font-mono">
              JPEG Compression Quality: {Math.round(qual * 100)}%
            </label>
            <input
              type="range"
              min={0.5}
              max={1.0}
              step={0.05}
              value={qual}
              onChange={(e) => setQual(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-250 dark:bg-neutral-800 rounded-lg cursor-pointer"
            />
          </div>
        ) : undefined
      }
    />
  );
};
