import React, { useState, useCallback, useRef, useEffect } from "react";
import { Check } from "lucide-react";
import { readAB, getPdfLib, getPdfJs, getJSZip, renderPage, fmt, dl } from "./PdfScriptLoader";
import { Proc, Done, Bar, Err } from "./SharedComponents";

interface ToolProps {
  onSuccess?: (fileName: string, toolName: string) => void;
  toolName: string;
}

/* COMPRESS PDF */
export const CompressTool = ({ onSuccess, toolName }: ToolProps) => {
  const [lvl, setLvl] = useState<"light" | "medium" | "strong">("medium");

  const run = useCallback(async (files: File[], prog: (p: number, m?: string) => void) => {
    prog(5, "Preparing document upload buffer…");
    
    const file = files[0];
    const originalSizeVal = file.size;
    
    // Config mappings: Ultra (strong), Smart (medium), Quality (light)
    const mode = lvl === "strong" ? "ultra" : lvl === "medium" ? "smart" : "quality";
    
    const config = {
      ultra:   { label: "Ultra Compression (Server)" },
      smart:   { label: "Smart Compression (Server)" },
      quality: { label: "Quality Compression (Server)" },
    }[mode];
    
    prog(20, "Uploading document to Vercel hybrid compression backend…");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("mode", mode);
    
    const response = await fetch("https://foldpdf-api-1.onrender.com/api/compress", {
      method: "POST",
      body: formData,
    });
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || `Server error during compression (HTTP ${response.status})`);
    }
    
    prog(80, "Downloading optimized binary stream…");
    const blobData = await response.blob();
    const pdfBlob = new Blob([blobData], { type: "application/pdf" });
    
    prog(95, "Reading response headers with final specs…");
    
    const xOriginalSize = response.headers.get("X-Original-Size") || response.headers.get("x-original-size");
    const xNewSize = response.headers.get("X-New-Size") || response.headers.get("x-new-size");
    
    const finalOriginalSize = xOriginalSize ? parseInt(xOriginalSize, 10) : originalSizeVal;
    const finalNewSize = xNewSize ? parseInt(xNewSize, 10) : pdfBlob.size;
    
    const savingsPercent = (((finalOriginalSize - finalNewSize) / finalOriginalSize) * 100).toFixed(1);
    const finalFilename = `foldpdf-compressed-${Date.now()}.pdf`;
    
    // Trigger automatic browser download
    dl(pdfBlob, finalFilename);
    
    const infoNode = (
      <div className="space-y-3 mt-3 select-none text-left bg-slate-50 dark:bg-slate-900/50 p-4 border border-slate-150 dark:border-slate-800 rounded-xl max-w-sm mx-auto animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="flex justify-between items-center text-xs text-slate-700 dark:text-slate-350 border-b pb-1.5 dark:border-slate-800 font-semibold font-mono">
          <span className="uppercase tracking-wide font-bold">Compression Summary</span>
          <span className="rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 text-[10px] uppercase font-bold">
            {config.label}
          </span>
        </div>
        
        <div className="space-y-1 text-xs text-slate-650 dark:text-slate-300 animate-in fade-in duration-500">
          <div className="flex justify-between text-indigo-600 dark:text-indigo-400">
            <span className="text-slate-500 font-medium font-mono uppercase tracking-tight text-[10px]">Strategy:</span>
            <span className="font-bold">Hybrid Vercel Server Compression</span>
          </div>
          
          <div className="flex justify-between pt-1.5">
            <span className="text-slate-550 font-medium font-mono uppercase tracking-tight text-[10px]">Original Size:</span>
            <span className="font-bold">{fmt(finalOriginalSize)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span className="text-slate-550 font-medium font-mono uppercase tracking-tight text-[10px]">Compressed Size:</span>
            <span className="text-emerald-600 dark:text-emerald-400">{fmt(finalNewSize)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span className="text-slate-550 font-medium font-mono uppercase tracking-tight text-[10px]">Reduction:</span>
            <span className="text-emerald-600 dark:text-emerald-400">{savingsPercent}%</span>
          </div>
        </div>
        
        <div className="border-t dark:border-slate-800 pt-2 text-[10px] space-y-1 text-slate-550 dark:text-slate-400 leading-relaxed font-semibold">
          <div className="flex items-start gap-1 text-emerald-600 dark:text-emerald-500">
            <span className="text-xs">✅</span>
            <span>True server-side layout compression applied. Vector and text elements remain fully selectable and crystal clear!</span>
          </div>
        </div>
      </div>
    );
    
    return {
      blob: pdfBlob,
      name: finalFilename,
      info: infoNode as any
    };
  }, [lvl]);

  return (
    <Proc
      id="compress-pdf"
      label="COMPRESS PDF"
      run={run}
      onSuccess={onSuccess}
      toolName={toolName}
      opts={
        <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3 shadow-sm">
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
                  onClick={() => setLvl(v as any)}
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
      }
    />
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
    setList((p) => [...p, ...Array.from(fl).filter((f) => f.type === "application/pdf" || f.name.endsWith(".pdf"))]);
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
      const bytes = await merged.save();
      setRes({
        blob: new Blob([bytes], { type: "application/pdf" }),
        name: `foldpdf-merged-${Date.now()}.pdf`,
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
        const bytes = await nd.save();
        setRes({
          blob: new Blob([bytes], { type: "application/pdf" }),
          name: `foldpdf-split-${Date.now()}.pdf`,
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
          const bytes = await nd.save();
          zip.file(`split-segment-${i + 1}.pdf`, bytes);
        }
        setPct(95);
        const zb = await zip.generateAsync({ type: "blob" });
        setRes({
          blob: zb,
          name: `foldpdf-split-${Date.now()}.zip`,
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
            const f = (Array.from(e.dataTransfer.files) as File[]).find((fi) => fi.type === "application/pdf" || fi.name.endsWith(".pdf"));
            if (f) loadThumbs(f);
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
              if (e.target.files && e.target.files[0]) loadThumbs(e.target.files[0]);
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
      const bytes = await doc.save();
      setRes({
        blob: new Blob([bytes], { type: "application/pdf" }),
        name: `foldpdf-rotated-${Date.now()}.pdf`
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
            const f = (Array.from(e.dataTransfer.files) as File[]).find((fi) => fi.type === "application/pdf" || fi.name.endsWith(".pdf"));
            if (f) load(f);
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
              if (e.target.files && e.target.files[0]) load(e.target.files[0]);
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
      const bytes = await nd.save();
      setRes({
        blob: new Blob([bytes], { type: "application/pdf" }),
        name: `foldpdf-cleaned-${Date.now()}.pdf`,
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
            const f = (Array.from(e.dataTransfer.files) as File[]).find((fi) => fi.type === "application/pdf" || fi.name.endsWith(".pdf"));
            if (f) load(f);
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
              if (e.target.files && e.target.files[0]) load(e.target.files[0]);
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
    prog(10, "Opening PDF document…");
    const { PDFDocument, rgb, degrees } = await getPdfLib();
    const ab = await readAB(files[0]);
    const doc = await PDFDocument.load(ab, { ignoreEncryption: true });
    
    prog(40, "Embedding diagonal watermarks…");
    const rVal = parseInt(col.slice(1, 3), 16) / 255;
    const gVal = parseInt(col.slice(3, 5), 16) / 255;
    const bVal = parseInt(col.slice(5, 7), 16) / 255;

    for (const pg of doc.getPages()) {
      const { width, height } = pg.getSize();
      pg.drawText(text, {
        x: width / 2 - (text.length * fs * 0.28),
        y: height / 2,
        size: fs,
        opacity: op / 100,
        color: rgb(rVal, gVal, bVal),
        rotate: degrees(45)
      });
    }

    prog(85, "Merging PDF structures…");
    const bytes = await doc.save();
    return {
      blob: new Blob([bytes], { type: "application/pdf" }),
      name: `foldpdf-watermarked-${Date.now()}.pdf`
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
    prog(10, "Opening PDF layout…");
    const { PDFDocument, rgb } = await getPdfLib();
    const ab = await readAB(files[0]);
    const doc = await PDFDocument.load(ab, { ignoreEncryption: true });
    
    prog(40, "Embossing dynamic index stamps…");
    const pgs = doc.getPages();
    pgs.forEach((pg: any, idx: number) => {
      if (skip && idx === 0) return;
      const { width, height } = pg.getSize();
      const n = idx + start;
      const lbl = fmt2.replace("{n}", String(n)).replace("{t}", String(pgs.length));
      
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

      pg.drawText(lbl, {
        x: xm[pos] !== undefined ? xm[pos] : 40,
        y: ym[pos] !== undefined ? ym[pos] : 22,
        size: 9.5,
        color: rgb(0.35, 0.35, 0.35)
      });
    });

    prog(85, "Completing encryption schemas…");
    const bytes = await doc.save();
    return {
      blob: new Blob([bytes], { type: "application/pdf" }),
      name: `foldpdf-numbered-${Date.now()}.pdf`
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
