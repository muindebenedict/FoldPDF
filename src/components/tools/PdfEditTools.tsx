import React, { useState, useCallback, useRef, useEffect } from "react";
import { Check } from "lucide-react";
import { readAB, getPdfLib, getPdfJs, getJSZip, renderPage, fmt, dl, getOutputFile } from "./PdfScriptLoader";
import { Proc, Done, Bar, Err, validateUploadedFiles } from "./SharedComponents";

interface ToolProps {
  onSuccess?: (fileName: string, toolName: string) => void;
  toolName: string;
}

/* COMPRESS PDF */
export const CompressTool = ({ onSuccess, toolName }: ToolProps) => {
  const [lvl, setLvl] = useState<"light" | "medium" | "strong">("medium");
  const [files, setFiles] = useState<File[]>([]);
  const [st, setSt] = useState<"idle" | "processing" | "done">("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [err, setErr] = useState("");
  const [res, setRes] = useState<{ blob: Blob; name: string; info?: string } | null>(null);
  const [drag, setDrag] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [retryCountdown, setRetryCountdown] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const elapsedTimerRef = useRef<any>(null);
  const retryTimerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
      if (retryTimerRef.current) clearInterval(retryTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  const reset = () => {
    setFiles([]);
    setSt("idle");
    setRes(null);
    setErr("");
    setStatusMsg("");
    setRetryCount(0);
    setRetryCountdown(0);
  };

  const cancelAndReset = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (retryTimerRef.current) {
      clearInterval(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    setSt("idle");
    setStatusMsg("");
    setRetryCount(0);
    setRetryCountdown(0);
  };

  const pick = (fl: FileList | null) => {
    if (!fl) return;
    const a = Array.from(fl);
    if (a.length > 1) a.splice(1);

    const overSized = a.some((f) => f.size > 50 * 1024 * 1024);
    if (overSized) {
      setErr("File too large. Maximum size is 50MB.");
      return;
    }

    const vRes = validateUploadedFiles(a, ".pdf");
    if (!vRes.isValid) {
      setErr(vRes.error || "Please try again with a valid PDF file.");
      return;
    }

    setFiles(a);
    setErr("");
  };

  const startCompression = async (retryAttempt = 0) => {
    if (!files.length) return;
    setErr("");
    setSt("processing");
    setStatusMsg("Uploading your file...");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let secondsElapsed = 0;
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);

    elapsedTimerRef.current = setInterval(() => {
      secondsElapsed += 1;
      if (secondsElapsed >= 30) {
        setStatusMsg("Still working, thank you for your patience...");
      } else if (secondsElapsed >= 15) {
        setStatusMsg("Almost done, large files take a moment...");
      } else if (secondsElapsed >= 2) {
        setStatusMsg("Compressing your PDF...");
      }
    }, 1000);

    const file = files[0];
    const mode = lvl === "strong" ? "ultra" : lvl === "medium" ? "smart" : "quality";

    const formData = new FormData();
    formData.append("file", file);
    formData.append("mode", mode);

    const fetchTimeoutId = setTimeout(() => {
      controller.abort();
    }, 60000);

    try {
      const response = await fetch("https://foldpdf-api-1.onrender.com/api/compress", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(fetchTimeoutId);
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }

      if (response.status === 429) {
        if (retryAttempt < 3) {
          setRetryCount(retryAttempt + 1);
          let count = 15;
          setRetryCountdown(count);
          setStatusMsg(
            `High demand right now. Your file will be processed shortly — please wait... Retrying in ${count} seconds...`
          );

          if (retryTimerRef.current) clearInterval(retryTimerRef.current);
          retryTimerRef.current = setInterval(() => {
            count -= 1;
            setRetryCountdown(count);
            if (count > 0) {
              setStatusMsg(
                `High demand right now. Your file will be processed shortly — please wait... Retrying in ${count} seconds...`
              );
            } else {
              clearInterval(retryTimerRef.current);
              retryTimerRef.current = null;
              startCompression(retryAttempt + 1);
            }
          }, 1000);

          return;
        } else {
          throw new Error("PROX_MORE_429");
        }
      }

      if (response.status === 500) {
        throw new Error("SERVER_500");
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Server error during compression (HTTP ${response.status})`);
      }

      const blobData = await response.blob();
      const pdfBlob = new Blob([blobData], { type: "application/pdf" });

      const xOriginalSize = response.headers.get("X-Original-Size") || response.headers.get("x-original-size");
      const xNewSize = response.headers.get("X-New-Size") || response.headers.get("x-new-size");

      const finalOriginalSize = xOriginalSize ? parseInt(xOriginalSize, 10) : file.size;
      const finalNewSize = xNewSize ? parseInt(xNewSize, 10) : pdfBlob.size;

      const savedPercent = (((finalOriginalSize - finalNewSize) / finalOriginalSize) * 100).toFixed(1);
      const finalFilename = getOutputFile(file.name, "compressed", ".pdf");

      dl(pdfBlob, finalFilename);

      setRes({
        blob: pdfBlob,
        name: finalFilename,
        info: `Successfully compressed your PDF by ${savedPercent}% (${fmt(finalOriginalSize)} → ${fmt(finalNewSize)})`,
      });
      setSt("done");

      if (onSuccess) {
        onSuccess(finalFilename, toolName);
      }
    } catch (e: any) {
      clearTimeout(fetchTimeoutId);
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
      if (retryTimerRef.current) {
        clearInterval(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      if (e.name === "AbortError" || controller.signal.aborted) {
        setSt("idle");
        setStatusMsg("");
        return;
      }

      const errMsg = e.message || String(e);
      let friendly = "Compression failed. Please check your network and try again.";

      if (errMsg === "SERVER_500") {
        friendly = "Compression failed. Please try a smaller file or try again.";
      } else if (errMsg === "PROX_MORE_429") {
        friendly = "Please try again in a few minutes.";
      } else if (errMsg.includes("504") || errMsg.includes("timeout") || errMsg.includes("TIMEOUT")) {
        friendly = "Processing took too long. Please try a smaller file.";
      } else if (errMsg.includes("limit") || errMsg.includes("429")) {
        friendly = "High demand right now. Please try again in a few minutes.";
      }

      setErr(friendly);
      setSt("idle");
    } finally {
      abortControllerRef.current = null;
    }
  };

  if (st === "done" && res) {
    return (
      <Done
        blob={res.blob}
        name={res.name}
        origSize={files[0]?.size}
        info={res.info}
        onReset={reset}
        onSuccess={onSuccess}
        toolName={toolName}
        toolId="compress-pdf"
      />
    );
  }

  if (st === "processing") {
    return (
      <div className="w-full flex flex-col items-center justify-center py-12 px-6 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900/60 shadow-lg max-w-lg mx-auto">
        <div className="relative flex items-center justify-center mb-6">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-indigo-100 border-t-indigo-600 dark:border-indigo-950 dark:border-t-indigo-400"></div>
          <div className="absolute text-xl">⚡</div>
        </div>
        <p className="text-sm font-extrabold text-slate-800 dark:text-white text-center font-display mb-2">
          {statusMsg || "Compressing your PDF..."}
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 font-mono text-center">
          {files[0]?.name} ({fmt(files[0]?.size)})
        </p>
        <button
          onClick={cancelAndReset}
          className="mt-8 px-5 py-2 bg-slate-100 dark:bg-slate-805 text-slate-700 dark:text-slate-300 hover:bg-slate-205 dark:hover:bg-slate-700 font-bold rounded-xl text-xs uppercase tracking-wider cursor-pointer transition shadow-sm"
        >
          Cancel Operation
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pick(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition ${
          drag
            ? "border-indigo-500 bg-indigo-50/10 dark:bg-indigo-950/20"
            : "border-slate-200 hover:border-indigo-400 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/40"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => pick(e.target.files)}
        />
        <div className="text-3xl mb-3 animate-bounce">📂</div>
        <p className="font-display font-extrabold text-sm text-slate-800 dark:text-white mb-1">
          {files.length ? `${files.length} file selected` : "Drag and drop your PDF here"}
        </p>
        <p className="text-slate-400 dark:text-slate-500 text-xs">
          or click to browse local files · Max 50 MB
        </p>
        {files.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 justify-center max-w-md mx-auto">
            {files.map((f, i) => (
              <span
                key={i}
                className="bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 rounded-lg px-2.5 py-1 text-xs font-semibold font-mono whitespace-nowrap overflow-hidden text-ellipsis max-w-[250px]"
              >
                {f.name} ({fmt(f.size)})
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3 shadow-sm">
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest font-mono">
          Compression Quality Target
        </p>
        <div className="flex flex-col gap-3">
          {[
            {
              v: "strong",
              l: "Ultra Compression",
              d: "Maximum size reduction for smaller PDFs",
            },
            {
              v: "medium",
              l: "Smart Compression",
              d: "Optimized quality and compression balance",
            },
            {
              v: "light",
              l: "Quality Compression",
              d: "Preserves more detail with lighter compression",
            },
          ].map(({ v, l, d }) => {
            const active = lvl === v;
            return (
              <div
                key={v}
                onClick={(e) => {
                  e.stopPropagation();
                  setLvl(v as any);
                }}
                className={`relative cursor-pointer rounded-xl border p-4 transition-all duration-300 flex items-center justify-between select-none hover:scale-[1.01] hover:border-indigo-400 active:scale-[0.99] ${
                  active
                    ? "border-indigo-600 bg-indigo-50/15 dark:bg-indigo-950/20 ring-1 ring-indigo-500 dark:ring-indigo-400/50 shadow-md shadow-indigo-600/10"
                    : "border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-950/25 hover:bg-slate-100/50 dark:hover:bg-slate-900/40"
                }`}
              >
                <div className="flex flex-col pr-6 text-left">
                  <span className={`text-xs font-bold transition-all duration-200 ${
                    active 
                      ? "text-indigo-600 dark:text-indigo-400 font-extrabold" 
                      : "text-slate-800 dark:text-slate-200"
                  }`}>
                    {l}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    {d}
                  </span>
                </div>
                {active && (
                  <div className="flex items-center justify-center h-5 w-5 rounded-full bg-indigo-600 text-white shrink-0 shadow-sm transition-all duration-300 scale-100">
                    <Check className="h-3 w-3 stroke-[3]" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {files.length > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            startCompression();
          }}
          className="w-full mt-4 bg-indigo-600 text-white font-bold rounded-xl py-3 text-sm hover:bg-indigo-700 shadow-md shadow-indigo-600/15 cursor-pointer transition flex items-center justify-center gap-2 uppercase tracking-wide"
        >
          COMPRESS PDF NOW
        </button>
      )}

      {err && <Err msg={err} onClose={() => setErr("")} />}
    </div>
  );
};

/* MERGE PDF */
export const MergeTool = ({ onSuccess, toolName }: ToolProps) => {
  const [list, setList] = useState<File[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [st, setSt] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [pct, setPct] = useState(0);
  const [pmsg, setPmsg] = useState("");
  const [res, setRes] = useState<{ blob: Blob; name: string; info?: string } | null>(null);
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (fl: FileList | null) => {
    if (!fl) return;
    const filesArray = Array.from(fl);
    const vRes = validateUploadedFiles(filesArray, ".pdf");
    if (!vRes.isValid) {
      setErr(vRes.error || "Please upload a PDF file.");
      return;
    }
    setErr("");
    setList((p) => [...p, ...filesArray]);
  };

  const rem = (i: number) => {
    setList((p) => p.filter((_, x) => x !== i));
  };

  const go = async () => {
    if (list.length < 2) return;
    setSt("processing");
    setPct(10);
    setErr("");
    try {
      const { PDFDocument } = await getPdfLib();
      const merged = await PDFDocument.create();
      
      for (let i = 0; i < list.length; i++) {
        setPct(20 + Math.round((i / list.length) * 70));
        setPmsg(`Merging document ${i + 1}/${list.length}: ${list[i].name}`);
        const ab = await readAB(list[i]);
        const doc = await PDFDocument.load(ab, { ignoreEncryption: true });
        const pgs = await merged.copyPages(doc, doc.getPageIndices());
        pgs.forEach((p: any) => merged.addPage(p));
      }
      
      setPct(95);
      setPmsg("Writing nested catalog streams…");
      const bytes = await merged.save({ useObjectStreams: true });
      setRes({
        blob: new Blob([bytes], { type: "application/pdf" }),
        name: getOutputFile(list[0]?.name, "merged", ".pdf"),
        info: `${list.length} separate PDFs merged into a unified document`
      });
      setSt("done");
    } catch (e: any) {
      setErr(e.message || "Merge compilation failed.");
      setSt("error");
    }
  };

  if (st === "done" && res) {
    return (
      <Done
        blob={res.blob}
        name={res.name}
        info={res.info}
        onReset={() => {
          setList([]);
          setSt("idle");
          setRes(null);
        }}
        onSuccess={onSuccess}
        toolName={toolName}
      />
    );
  }

  return (
    <div className="w-full">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          add(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center cursor-pointer bg-slate-50/50 hover:border-indigo-400 dark:bg-slate-900/10 transition"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={(e) => add(e.target.files)}
        />
        <div className="text-3xl mb-1.5 animate-bounce">➕</div>
        <p className="font-display font-extrabold text-sm text-slate-800 dark:text-white">
          Add PDF Files
        </p>
        <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">
          Drop your PDF files here or click to browse
        </p>
      </div>

      {list.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase font-mono tracking-widest">
            Drag items to reorder compiling order:
          </p>
          {list.map((f, i) => (
            <div
              key={i}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIdx === null || dragIdx === i) return;
                const a = [...list];
                const [x] = a.splice(dragIdx, 1);
                a.splice(i, 0, x);
                setList(a);
                setDragIdx(null);
              }}
              className={`flex items-center gap-3 bg-white dark:bg-slate-950 p-3 rounded-xl border border-slate-150 dark:border-slate-800 cursor-grab transition-opacity ${
                dragIdx === i ? "opacity-40" : ""
              }`}
            >
              <span className="text-slate-300 font-bold hover:text-slate-500">⠿</span>
              <span className="w-5 h-5 rounded-lg bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white leading-none shrink-0">
                {i + 1}
              </span>
              <p className="flex-1 text-xs font-bold text-slate-700 dark:text-slate-350 truncate">
                {f.name}
              </p>
              <span className="text-[10px] text-slate-400 shrink-0 font-mono font-medium">{fmt(f.size)}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  rem(i);
                }}
                className="text-rose-500 hover:text-rose-700 text-xs font-bold p-1"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {list.length >= 2 && st !== "processing" && (
        <button
          onClick={go}
          className="w-full mt-4 bg-indigo-600 text-white font-bold rounded-xl py-3 text-sm hover:bg-indigo-700 shadow-md cursor-pointer transition"
        >
          🔗 Merge {list.length} PDFs
        </button>
      )}
      {list.length === 1 && (
        <p className="text-center mt-3 text-xs text-slate-400 font-medium">Add at least another PDF to perform merge.</p>
      )}

      {st === "processing" && <Bar v={pct} msg={pmsg} />}
      <Err msg={err} onClose={() => setErr("")} />
    </div>
  );
};

/* SPLIT PDF */
export const SplitTool = ({ onSuccess, toolName }: ToolProps) => {
  const [mode, setMode] = useState<"range" | "extract" | "every">("range");
  const [range, setRange] = useState("1-3");
  const [every, setEvery] = useState(2);
  const [sel, setSel] = useState<number[]>([]);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [npg, setNpg] = useState(0);
  const [st, setSt] = useState<"idle" | "reading" | "processing" | "done" | "error">("idle");
  const [pct, setPct] = useState(0);
  const [pmsg, setPmsg] = useState("");
  const [res, setRes] = useState<{ blob: Blob; name: string; info?: string } | null>(null);
  const [err, setErr] = useState("");
  const [theFile, setTheFile] = useState<File | null>(null);

  const loadThumbs = async (f: File) => {
    setTheFile(f);
    setSt("reading");
    setPct(15);
    setErr("");
    try {
      const lib = await getPdfJs();
      const ab = await readAB(f);
      const doc = await lib.getDocument({ data: new Uint8Array(ab) }).promise;
      setNpg(doc.numPages);
      
      const t: string[] = [];
      const renderLimit = Math.min(doc.numPages, 24);
      for (let i = 1; i <= renderLimit; i++) {
        setPct(15 + Math.round((i / renderLimit) * 80));
        setPmsg(`Rendering visual thumbnail ${i}/${renderLimit}…`);
        const cv = await renderPage(doc, i, 0.3);
        t.push(cv.toDataURL("image/jpeg", 0.7));
      }
      setThumbs(t);
      setSt("idle");
    } catch (e: any) {
      setErr(e.message || "Failed to parse PDF document.");
      setSt("error");
    }
  };

  const parseRanges = (s: string, tot: number): number[] => {
    const ps = new Set<number>();
    s.split(",").forEach((p) => {
      const t = p.trim();
      if (t.includes("-")) {
        const [a, b] = t.split("-").map(Number);
        for (let i = a; i <= Math.min(b, tot); i++) if (i >= 1) ps.add(i);
      } else {
        const n = parseInt(t);
        if (n >= 1 && n <= tot) ps.add(n);
      }
    });
    return Array.from(ps).sort((a, b) => a - b);
  };

  const go = async () => {
    if (!theFile) return;
    setSt("processing");
    setPct(10);
    setErr("");
    try {
      const { PDFDocument } = await getPdfLib();
      const ab = await readAB(theFile);
      const src = await PDFDocument.load(ab, { ignoreEncryption: true });
      const tot = src.getPageCount();
      
      let sets: number[][] = [];
      if (mode === "range") {
        sets = [parseRanges(range, tot).map((p) => p - 1)];
      } else if (mode === "extract") {
        sets = [sel.map((p) => p - 1)];
      } else {
        for (let i = 0; i < tot; i += every) {
          const s: number[] = [];
          for (let j = i; j < Math.min(i + every, tot); j++) s.push(j);
          sets.push(s);
        }
      }

      if (sets.length === 1) {
        setPct(50);
        setPmsg("Extracting page frames…");
        const nd = await PDFDocument.create();
        const pgs = await nd.copyPages(src, sets[0]);
        pgs.forEach((p: any) => nd.addPage(p));
        const bytes = await nd.save({ useObjectStreams: true });
        setRes({
          blob: new Blob([bytes], { type: "application/pdf" }),
          name: getOutputFile(theFile?.name, "split", ".pdf"),
          info: `Extracted ${sets[0].length} selected pages`
        });
      } else {
        const JSZipLib = await getJSZip();
        const zip = new JSZipLib();
        for (let i = 0; i < sets.length; i++) {
          setPct(20 + Math.round((i / sets.length) * 70));
          setPmsg(`Assembling split Zip segment ${i + 1}…`);
          const nd = await PDFDocument.create();
          const pgs = await nd.copyPages(src, sets[i]);
          pgs.forEach((p: any) => nd.addPage(p));
          const bytes = await nd.save({ useObjectStreams: true });
          zip.file(`split-segment-${i + 1}.pdf`, bytes);
        }
        setPct(95);
        const zb = await zip.generateAsync({ type: "blob" });
        setRes({
          blob: zb,
          name: getOutputFile(theFile?.name, "split", ".zip"),
          info: `Zipped split files archive — ${sets.length} segments`
        });
      }
      setSt("done");
      setPct(100);
    } catch (e: any) {
      setErr(e.message || "Split operation failed.");
      setSt("error");
    }
  };

  if (st === "done" && res) {
    return (
      <Done
        blob={res.blob}
        name={res.name}
        info={res.info}
        onReset={() => {
          setSt("idle");
          setRes(null);
          setThumbs([]);
          setSel([]);
          setNpg(0);
          setTheFile(null);
        }}
        onSuccess={onSuccess}
        toolName={toolName}
      />
    );
  }

  return (
    <div className="w-full">
      {!theFile ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const filesArray = Array.from(e.dataTransfer.files) as File[];
            if (filesArray.length > 0) {
              const vRes = validateUploadedFiles(filesArray, ".pdf");
              if (!vRes.isValid) {
                setErr(vRes.error || "Please upload a PDF file.");
                return;
              }
              setErr("");
              loadThumbs(filesArray[0]);
            }
          }}
          onClick={() => document.getElementById("split-input-loader")?.click()}
          className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center cursor-pointer bg-slate-50/50 hover:border-indigo-400 dark:bg-slate-900/10 transition animate-in zoom-in-95"
        >
          <input
            id="split-input-loader"
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                const filesArray = [e.target.files[0]];
                const vRes = validateUploadedFiles(filesArray, ".pdf");
                if (!vRes.isValid) {
                  setErr(vRes.error || "Please upload a PDF file.");
                  return;
                }
                setErr("");
                loadThumbs(e.target.files[0]);
              }
            }}
          />
          <div className="text-3xl mb-1.5 animate-bounce">✂️</div>
          <p className="font-display font-extrabold text-sm text-slate-800 dark:text-white">
            Split PDF Pages
          </p>
          <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">
            Drop your PDF file here to visually sequence and split
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {[
              ["range", "Custom Range"],
              ["extract", "Visual Select"],
              ["every", "Every N Pages"]
            ].map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => setMode(v as any)}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-xl border transition ${
                  mode === v
                    ? "border-indigo-600 bg-indigo-50/25 text-indigo-700 dark:text-indigo-300"
                    : "border-slate-200 dark:border-slate-800 hover:bg-slate-100/50"
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          {mode === "range" && (
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 uppercase mb-1 font-mono">
                Specify Ranges (e.g. 1-3, 5, 8-10) — {npg} pages total
              </label>
              <input
                value={range}
                onChange={(e) => setRange(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold focus:ring-1 focus:ring-indigo-550 focus:outline-none"
              />
            </div>
          )}

          {mode === "every" && (
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 uppercase mb-1 font-mono">
                Split into individual segments of N pages each
              </label>
              <input
                type="number"
                min={1}
                value={every}
                onChange={(e) => setEvery(Math.max(1, Number(e.target.value)))}
                className="w-24 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none"
              />
            </div>
          )}

          {mode === "extract" && thumbs.length > 0 && (
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-2 font-mono">
                Click pages to select to extract · {sel.length} pages selected:
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-56 overflow-y-auto p-1 border dark:border-slate-800 rounded-xl">
                {thumbs.map((src, idx) => {
                  const isS = sel.includes(idx + 1);
                  return (
                    <div
                      key={idx}
                      onClick={() =>
                        setSel((p) => (p.includes(idx + 1) ? p.filter((x) => x !== idx + 1) : [...p, idx + 1]))
                      }
                      className={`relative cursor-pointer border rounded-lg overflow-hidden transition-all ${
                        isS ? "border-indigo-600 ring-2 ring-indigo-50" : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <img src={src} className="w-full h-auto block" alt={`Page ${idx + 1}`} />
                      <div className="absolute inset-x-0 bottom-0 text-center bg-black/60 text-white text-[9px] font-bold py-0.5">
                        {idx + 1}
                      </div>
                      {isS && (
                        <div className="absolute top-1 right-1 w-3.5 h-3.5 bg-indigo-600 rounded-full flex items-center justify-center text-[8px] text-white font-bold">
                          ✓
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {st !== "processing" && (
            <button
              onClick={go}
              className="w-full bg-indigo-600 text-white font-bold rounded-xl py-3 text-sm hover:bg-indigo-700 shadow-md transition"
            >
              ✂️ Split PDF Now
            </button>
          )}
        </div>
      )}

      {st === "processing" && <Bar v={pct} msg={pmsg} />}
      {st === "reading" && <Bar v={pct} msg={pmsg} />}
      <Err msg={err} onClose={() => setErr("")} />
    </div>
  );
};

/* ROTATE PDF */
export const RotateTool = ({ onSuccess, toolName }: ToolProps) => {
  const [rots, setRots] = useState<Record<number, number>>({});
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [npg, setNpg] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [st, setSt] = useState<"idle" | "reading" | "processing" | "done" | "error">("idle");
  const [pct, setPct] = useState(0);
  const [res, setRes] = useState<{ blob: Blob; name: string } | null>(null);
  const [err, setErr] = useState("");
  const [theFile, setTheFile] = useState<File | null>(null);

  const load = async (f: File) => {
    setTheFile(f);
    setSt("reading");
    setPct(10);
    try {
      const lib = await getPdfJs();
      const ab = await readAB(f);
      const doc = await lib.getDocument({ data: new Uint8Array(ab) }).promise;
      setNpg(doc.numPages);
      
      const t: string[] = [];
      const drawLimit = Math.min(doc.numPages, 18);
      for (let i = 1; i <= drawLimit; i++) {
        setPct(10 + Math.round((i / drawLimit) * 85));
        const cv = await renderPage(doc, i, 0.3);
        t.push(cv.toDataURL("image/jpeg", 0.7));
      }
      setThumbs(t);
      setRots({});
      setLoaded(true);
      setSt("idle");
    } catch (e: any) {
      setErr(e.message || "Parse failed.");
      setSt("error");
    }
  };

  const rot = (i: number, d: number) => {
    setRots((p) => ({ ...p, [i]: ((p[i] || 0) + d + 360) % 360 }));
  };

  const rotAll = (d: number) => {
    const r: Record<number, number> = {};
    for (let i = 0; i < npg; i++) {
      r[i] = ((rots[i] || 0) + d + 360) % 360;
    }
    setRots(r);
  };

  const go = async () => {
    if (!theFile) return;
    setSt("processing");
    setPct(20);
    setErr("");
    try {
      const { PDFDocument, degrees } = await getPdfLib();
      const ab = await readAB(theFile);
      const doc = await PDFDocument.load(ab, { ignoreEncryption: true });
      
      doc.getPages().forEach((p: any, i: number) => {
        if (rots[i]) {
          p.setRotation(degrees(rots[i]));
        }
      });
      
      setPct(80);
      const bytes = await doc.save({ useObjectStreams: true });
      setRes({
        blob: new Blob([bytes], { type: "application/pdf" }),
        name: getOutputFile(theFile?.name, "rotated", ".pdf")
      });
      setSt("done");
      setPct(100);
    } catch (e: any) {
      setErr(e.message || "Failed applying rotation.");
      setSt("error");
    }
  };

  if (st === "done" && res) {
    return (
      <Done
        blob={res.blob}
        name={res.name}
        onReset={() => {
          setSt("idle");
          setRes(null);
          setLoaded(false);
          setThumbs([]);
          setRots({});
          setTheFile(null);
        }}
        onSuccess={onSuccess}
        toolName={toolName}
      />
    );
  }

  return (
    <div className="w-full">
      {!loaded ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const filesArray = Array.from(e.dataTransfer.files) as File[];
            if (filesArray.length > 0) {
              const vRes = validateUploadedFiles(filesArray, ".pdf");
              if (!vRes.isValid) {
                setErr(vRes.error || "Please upload a PDF file.");
                return;
              }
              setErr("");
              load(filesArray[0]);
            }
          }}
          onClick={() => document.getElementById("rot-input-loader")?.click()}
          className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center cursor-pointer bg-slate-50/50 hover:border-indigo-400 dark:bg-slate-900/10 transition animate-in zoom-in-95"
        >
          <input
            id="rot-input-loader"
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                const filesArray = [e.target.files[0]];
                const vRes = validateUploadedFiles(filesArray, ".pdf");
                if (!vRes.isValid) {
                  setErr(vRes.error || "Please upload a PDF file.");
                  return;
                }
                setErr("");
                load(e.target.files[0]);
              }
            }}
          />
          <div className="text-3xl mb-1.5 animate-bounce">🔄</div>
          <p className="font-display font-extrabold text-sm text-slate-800 dark:text-white">
            Rotate PDF Pages
          </p>
          <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">
            Drop your PDF file here to configure rotations visually
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {[
              ["All CW 90°", 90],
              ["All Counter CCW 90°", -90],
              ["Aline 180° Flip", 180]
            ].map(([l, d]) => (
              <button
                key={l as string}
                type="button"
                onClick={() => rotAll(d as number)}
                className="flex-1 py-1.5 text-xs font-bold font-mono rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100/50 transition dark:text-slate-350"
              >
                ↻ {l}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 max-h-60 overflow-y-auto p-1 border dark:border-slate-800 rounded-xl">
            {thumbs.map((src, idx) => {
              const rotatedDir = rots[idx] || 0;
              return (
                <div key={idx} className="flex flex-col items-center gap-1 bg-slate-50 dark:bg-slate-950 p-1 rounded-lg border dark:border-slate-800">
                  <div className="relative border rounded overflow-hidden aspect-video w-full flex items-center justify-center bg-white dark:bg-neutral-900">
                    <img
                      src={src}
                      className="max-h-full max-w-full block transition-transform duration-300"
                      style={{ transform: `rotate(${rotatedDir}deg)` }}
                      alt={`Page ${idx + 1}`}
                    />
                    {rotatedDir > 0 && (
                      <span className="absolute top-0.5 right-0.5 bg-indigo-650 text-white font-bold text-[8px] px-1 rounded">
                        {rotatedDir}°
                      </span>
                    )}
                  </div>
                  <span className="text-[9px] text-slate-400 font-bold font-mono">P. {idx + 1}</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => rot(idx, -90)}
                      className="bg-white border rounded p-0.5 text-[9px] w-5 font-bold cursor-pointer hover:bg-slate-50"
                    >
                      ↺
                    </button>
                    <button
                      type="button"
                      onClick={() => rot(idx, 90)}
                      className="bg-white border rounded p-0.5 text-[9px] w-5 font-bold cursor-pointer hover:bg-slate-50"
                    >
                      ↻
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {st !== "processing" && (
            <button
              onClick={go}
              className="w-full bg-indigo-605 text-white font-bold rounded-xl py-3 text-sm hover:bg-indigo-705 shadow-md cursor-pointer transition"
            >
              💾 Apply Rotation & Save
            </button>
          )}
        </div>
      )}

      {st === "processing" && <Bar v={pct} msg="Applying rotations to PDF layers…" />}
      {st === "reading" && <Bar v={pct} msg="Extracting preview metadata…" />}
      <Err msg={err} onClose={() => setErr("")} />
    </div>
  );
};

/* REMOVE PAGES */
export const RemoveTool = ({ onSuccess, toolName }: ToolProps) => {
  const [marked, setMarked] = useState<number[]>([]);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [npg, setNpg] = useState(0);
  const [st, setSt] = useState<"idle" | "reading" | "processing" | "done" | "error">("idle");
  const [pct, setPct] = useState(0);
  const [res, setRes] = useState<{ blob: Blob; name: string; info: string } | null>(null);
  const [err, setErr] = useState("");
  const [theFile, setTheFile] = useState<File | null>(null);

  const load = async (f: File) => {
    setTheFile(f);
    setSt("reading");
    setPct(10);
    try {
      const lib = await getPdfJs();
      const ab = await readAB(f);
      const doc = await lib.getDocument({ data: new Uint8Array(ab) }).promise;
      setNpg(doc.numPages);
      
      const t: string[] = [];
      const drawLimit = Math.min(doc.numPages, 24);
      for (let i = 1; i <= drawLimit; i++) {
        setPct(10 + Math.round((i / drawLimit) * 85));
        const cv = await renderPage(doc, i, 0.3);
        t.push(cv.toDataURL("image/jpeg", 0.7));
      }
      setThumbs(t);
      setMarked([]);
      setSt("idle");
    } catch (e: any) {
      setErr(e.message || "Load failed.");
      setSt("error");
    }
  };

  const go = async () => {
    if (!theFile) return;
    setSt("processing");
    setPct(20);
    setErr("");
    try {
      const { PDFDocument } = await getPdfLib();
      const ab = await readAB(theFile);
      const src = await PDFDocument.load(ab, { ignoreEncryption: true });
      const keep = src.getPageIndices().filter((i: number) => !marked.includes(i));
      
      if (keep.length === 0) {
        throw new Error("Cannot delete all pages in the PDF document. Must keep at least one page.");
      }

      const nd = await PDFDocument.create();
      const pgs = await nd.copyPages(src, keep);
      pgs.forEach((p: any) => nd.addPage(p));
      
      setPct(80);
      const bytes = await nd.save({ useObjectStreams: true });
      setRes({
        blob: new Blob([bytes], { type: "application/pdf" }),
        name: getOutputFile(theFile?.name, "removed", ".pdf"),
        info: `Removed ${marked.length} pages: ${npg - marked.length} pages remaining`
      });
      setSt("done");
    } catch (e: any) {
      setErr(e.message || "Failed page wipe.");
      setSt("error");
    }
  };

  if (st === "done" && res) {
    return (
      <Done
        blob={res.blob}
        name={res.name}
        info={res.info}
        onReset={() => {
          setSt("idle");
          setRes(null);
          setThumbs([]);
          setMarked([]);
          setNpg(0);
          setTheFile(null);
        }}
        onSuccess={onSuccess}
        toolName={toolName}
      />
    );
  }

  return (
    <div className="w-full">
      {!thumbs.length ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const filesArray = Array.from(e.dataTransfer.files) as File[];
            if (filesArray.length > 0) {
              const vRes = validateUploadedFiles(filesArray, ".pdf");
              if (!vRes.isValid) {
                setErr(vRes.error || "Please upload a PDF file.");
                return;
              }
              setErr("");
              load(filesArray[0]);
            }
          }}
          onClick={() => document.getElementById("rm-input-loader")?.click()}
          className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center cursor-pointer bg-slate-50/50 hover:border-indigo-400 dark:bg-slate-900/10 transition animate-in zoom-in-95"
        >
          <input
            id="rm-input-loader"
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                const filesArray = [e.target.files[0]];
                const vRes = validateUploadedFiles(filesArray, ".pdf");
                if (!vRes.isValid) {
                  setErr(vRes.error || "Please upload a PDF file.");
                  return;
                }
                setErr("");
                load(e.target.files[0]);
              }
            }}
          />
          <div className="text-3xl mb-1.5 animate-bounce">🗑️</div>
          <p className="font-display font-extrabold text-sm text-slate-800 dark:text-white">
            Remove PDF Pages
          </p>
          <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">
            Drop your PDF file here to visually wipe pages
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between items-center text-xs">
            <p className="text-slate-500 dark:text-slate-450 font-semibold">
              Mark pages to wipe · <strong className="text-rose-600">{marked.length} highlighted</strong>
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMarked(thumbs.map((_, i) => i))}
                className="bg-white border px-2 py-1 rounded text-[10px] font-bold font-mono cursor-pointer"
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setMarked([])}
                className="bg-white border px-2 py-1 rounded text-[10px] font-bold font-mono cursor-pointer"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-60 overflow-y-auto p-1 border dark:border-slate-800 rounded-xl">
            {thumbs.map((src, idx) => {
              const isMarked = marked.includes(idx);
              return (
                <div
                  key={idx}
                  onClick={() => setMarked((p) => (p.includes(idx) ? p.filter((x) => x !== idx) : [...p, idx]))}
                  className={`relative cursor-pointer border rounded-lg overflow-hidden transition-all ${
                    isMarked ? "border-rose-500 opacity-50 bg-rose-50" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <img src={src} className="w-full h-auto block" alt={`Page ${idx + 1}`} />
                  {isMarked && (
                    <div className="absolute inset-0 bg-rose-500/25 flex items-center justify-center text-xl">
                      🗑️
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 text-center bg-black/60 text-white text-[9px] font-bold py-0.5">
                    {idx + 1}
                  </div>
                </div>
              );
            })}
          </div>

          {marked.length > 0 && st !== "processing" && (
            <button
              onClick={go}
              className="w-full bg-rose-600 text-white font-bold rounded-xl py-3 text-sm hover:bg-rose-700 shadow-md cursor-pointer transition flex items-center justify-center gap-2"
            >
              🗑️ Erase {marked.length} Page{marked.length > 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}

      {st === "processing" && <Bar v={pct} msg="Erasing pages from document…" />}
      {st === "reading" && <Bar v={pct} msg="Pre-rendering page thumbs…" />}
      <Err msg={err} onClose={() => setErr("")} />
    </div>
  );
};

/* WATERMARK TOOL */
export const WatermarkTool = ({ onSuccess, toolName }: ToolProps) => {
  const [text, setText] = useState("CONFIDENTIAL");
  const [op, setOp] = useState(30);
  const [fs, setFs] = useState(48);
  const [col, setCol] = useState("#808080");

  const run = useCallback(async (files: File[], prog: (p: number, m?: string) => void) => {
    prog(10, "Processing your PDF...");
    const { PDFDocument, rgb, degrees } = await getPdfLib();
    const ab = await readAB(files[0]);
    const doc = await PDFDocument.load(ab, { ignoreEncryption: true });
    
    prog(40, "Processing your PDF...");
    const rVal = parseInt(col.slice(1, 3), 16) / 255;
    const gVal = parseInt(col.slice(3, 5), 16) / 255;
    const bVal = parseInt(col.slice(5, 7), 16) / 255;

    const sanitizedText = text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7E]/g, " ");

    for (const pg of doc.getPages()) {
      const { width, height } = pg.getSize();
      pg.drawText(sanitizedText, {
        x: width / 2 - (sanitizedText.length * fs * 0.28),
        y: height / 2,
        size: fs,
        opacity: op / 100,
        color: rgb(rVal, gVal, bVal),
        rotate: degrees(45)
      });
    }

    prog(85, "Processing your PDF...");
    const bytes = await doc.save({ useObjectStreams: true });
    return {
      blob: new Blob([bytes], { type: "application/pdf" }),
      name: getOutputFile(files[0]?.name, "watermarked", ".pdf")
    };
  }, [text, op, fs, col]);

  return (
    <Proc
      id="add-watermark"
      label="Inject Watermark"
      run={run}
      onSuccess={onSuccess}
      toolName={toolName}
      opts={
        <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-705 dark:text-slate-350 mb-1 font-mono uppercase">
              Stamp Text Label
            </label>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-705 dark:text-slate-350 mb-1 font-mono uppercase">
              Stamp Color
            </label>
            <input
              type="color"
              value={col}
              onChange={(e) => setCol(e.target.value)}
              className="w-full h-8 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer p-0.5 bg-white dark:bg-neutral-900"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-750 dark:text-slate-350 mb-1 font-mono uppercase">
              Font size: {fs}pt
            </label>
            <input
              type="range"
              min={20}
              max={100}
              value={fs}
              onChange={(e) => setFs(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-250 dark:bg-neutral-800 rounded-lg cursor-pointer"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-750 dark:text-slate-350 mb-1 font-mono uppercase">
              Transparency: {op}%
            </label>
            <input
              type="range"
              min={10}
              max={100}
              value={op}
              onChange={(e) => setOp(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-250 dark:bg-neutral-800 rounded-lg cursor-pointer"
            />
          </div>
        </div>
      }
    />
  );
};

/* PAGE NUMBERS TOOL */
export const PageNumTool = ({ onSuccess, toolName }: ToolProps) => {
  const [fmt2, setFmt] = useState("Page {n} of {t}");
  const [pos, setPos] = useState("bottom-center");
  const [start, setStart] = useState(1);
  const [skip, setSkip] = useState(false);

  const run = useCallback(async (files: File[], prog: (p: number, m?: string) => void) => {
    prog(10, "Processing your PDF...");
    const { PDFDocument, rgb } = await getPdfLib();
    const ab = await readAB(files[0]);
    const doc = await PDFDocument.load(ab, { ignoreEncryption: true });
    
    prog(40, "Processing your PDF...");
    const pgs = doc.getPages();
    pgs.forEach((pg: any, idx: number) => {
      if (skip && idx === 0) return;
      const { width, height } = pg.getSize();
      const n = idx + start;
      const lbl = fmt2.replace("{n}", String(n)).replace("{t}", String(pgs.length));
      const cleanLbl = lbl
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\x20-\x7E]/g, " ");
      
      const xm: Record<string, number> = {
        "bottom-left": 40,
        "bottom-center": width / 2 - 20,
        "bottom-right": width - 100,
        "top-left": 40,
        "top-center": width / 2 - 20,
        "top-right": width - 100
      };
      const ym: Record<string, number> = {
        "bottom-left": 22,
        "bottom-center": 22,
        "bottom-right": 22,
        "top-left": height - 32,
        "top-center": height - 32,
        "top-right": height - 32
      };

      pg.drawText(cleanLbl, {
        x: xm[pos] !== undefined ? xm[pos] : 40,
        y: ym[pos] !== undefined ? ym[pos] : 22,
        size: 9.5,
        color: rgb(0.35, 0.35, 0.35)
      });
    });

    prog(85, "Processing your PDF...");
    const bytes = await doc.save({ useObjectStreams: true });
    return {
      blob: new Blob([bytes], { type: "application/pdf" }),
      name: getOutputFile(files[0]?.name, "numbered", ".pdf")
    };
  }, [fmt2, pos, start, skip]);

  return (
    <Proc
      id="add-page-numbers"
      label="Enstamp Page Numbers"
      run={run}
      onSuccess={onSuccess}
      toolName={toolName}
      opts={
        <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-705 dark:text-slate-350 mb-1.5 uppercase font-mono">
              Index Stamp Format
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {["{n}", "Page {n}", "Page {n} of {t}", "{n}/{t}"].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFmt(f)}
                  className={`py-1.5 text-xs font-bold rounded-lg border transition ${
                    fmt2 === f
                      ? "border-indigo-600 bg-indigo-50/20 text-indigo-750 dark:text-indigo-300"
                      : "border-slate-200 dark:border-slate-800 hover:bg-slate-100/50"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-705 dark:text-slate-350 mb-1.5 uppercase font-mono">
              Align Position
            </label>
            <div className="grid grid-cols-3 gap-2">
              {["bottom-left", "bottom-center", "bottom-right", "top-left", "top-center", "top-right"].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPos(p)}
                  className={`py-1 text-xs font-semibold rounded-lg border transition capitalize ${
                    pos === p
                      ? "border-indigo-600 bg-indigo-50/20 text-indigo-750 dark:text-indigo-300"
                      : "border-slate-200 dark:border-slate-800 hover:bg-slate-100/50"
                  }`}
                >
                  {p.replace("-", " ")}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-4 items-center flex-wrap pt-2 border-t dark:border-slate-800">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-705 uppercase font-mono">
                Start Page:
              </label>
              <input
                type="number"
                min={1}
                value={start}
                onChange={(e) => setStart(Math.max(1, Number(e.target.value)))}
                className="w-16 bg-white dark:bg-slate-950 border rounded-lg px-2 py-1 text-xs font-bold focus:outline-none"
              />
            </div>
            <label className="text-xs font-bold text-slate-650 dark:text-slate-400 p-1 flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={skip}
                onChange={(e) => setSkip(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500"
              />
              Bypasses Title Page (Skip First)
            </label>
          </div>
        </div>
      }
    />
  );
};