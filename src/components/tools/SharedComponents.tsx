import React, { useState, useRef, useCallback, useEffect } from "react";
import * as Lucide from "lucide-react";
import { fmt, dl } from "./PdfScriptLoader";

export const Spin = ({ msg = "" }: { msg?: string }) => (
  <div className="text-center py-8 flex flex-col items-center justify-center gap-3 animate-in fade-in duration-300">
    <div className="w-10 h-10 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin" />
    {msg && <p className="text-slate-650 dark:text-slate-300 text-sm font-semibold">{msg}</p>}
  </div>
);

export const Bar = ({ v, msg }: { v: number; msg?: string }) => (
  <div className="mt-4 animate-in slide-in-from-top-2 duration-200">
    <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-bold">
      <span>{msg || "Processing…"}</span>
      <span>{v}%</span>
    </div>
    <div className="h-2.5 bg-slate-100 dark:bg-neutral-800 rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all duration-300"
        style={{ width: v + "%" }}
      />
    </div>
  </div>
);

export const Err = ({ msg, onClose }: { msg: string; onClose?: () => void }) => {
  if (!msg) return null;
  return (
    <div className="bg-rose-50 border border-rose-150 rounded-xl p-3.5 mt-4 flex gap-3 items-start animate-in zoom-in-95 duration-200">
      <span className="text-rose-500 text-lg">⚠️</span>
      <span className="flex-1 text-xs font-semibold text-rose-700 leading-relaxed">{msg}</span>
      {onClose && (
        <button onClick={onClose} className="text-rose-500 hover:text-rose-700 text-sm font-bold">
          ✕
        </button>
      )}
    </div>
  );
};

export const Done = ({
  blob,
  name,
  origSize,
  info,
  onReset,
  onSuccess,
  toolName
}: {
  blob?: Blob;
  name: string;
  origSize?: number;
  info?: React.ReactNode;
  onReset: () => void;
  onSuccess?: (fileName: string, toolName: string) => void;
  toolName: string;
}) => {
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  // Fire the verification callback once downloaded successfully
  useEffect(() => {
    if (onSuccessRef.current && name) {
      onSuccessRef.current(name, toolName);
    }
  }, [name, toolName]);

  return (
    <div className="text-center py-8 px-4 animate-in zoom-in-95 duration-300">
      <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl shadow-premium-sm">
        ✓
      </div>
      <h3 className="font-display font-extrabold text-lg text-slate-900 dark:text-white mb-1.5">
        Workspace Success!
      </h3>
      <p className="text-slate-650 dark:text-slate-350 text-sm break-all font-semibold max-w-sm mx-auto mb-1">
        {name}
      </p>
      
      {origSize && blob && origSize > blob.size && (
        <p className="text-xs text-slate-500 mb-2 font-medium">
          {fmt(origSize)} → <strong className="text-emerald-600">{fmt(blob.size)}</strong>
          <span className="text-emerald-600 font-bold"> ({Math.round((1 - blob.size / origSize) * 100)}% smaller)</span>
        </p>
      )}
      {info && <div className="text-xs text-slate-500 dark:text-slate-400 mb-4">{info}</div>}
      
      <div className="flex gap-3 justify-center flex-wrap mt-5">
        {blob && (
          <button
            onClick={() => dl(blob, name)}
            className="bg-indigo-600 dark:bg-indigo-500 text-white font-bold text-sm px-6 py-2.5 rounded-xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 dark:hover:bg-indigo-400 cursor-pointer transition"
          >
            ⬇ Download {name}
          </button>
        )}
        <button
          onClick={onReset}
          className="bg-slate-50 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-sm px-5 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition"
        >
          Process Another File
        </button>
      </div>
    </div>
  );
};

interface ProcProps {
  id: string;
  label: string;
  accept?: string;
  multi?: boolean;
  run: (files: File[], prog: (p: number, m?: string) => void) => Promise<{ blob: Blob; name: string; info?: React.ReactNode }>;
  opts?: React.ReactNode;
  onSuccess?: (fileName: string, toolName: string) => void;
  toolName: string;
}

export const Proc = ({ id, label, accept = ".pdf", multi = false, run, opts, onSuccess, toolName }: ProcProps) => {
  const [files, setFiles] = useState<File[]>([]);
  const [st, setSt] = useState<"idle" | "reading" | "processing" | "done" | "error">("idle");
  const [pct, setPct] = useState(0);
  const [pmsg, setPmsg] = useState("");
  const [res, setRes] = useState<{ blob: Blob; name: string; info?: string } | null>(null);
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const getFriendlyFormatName = () => {
    const idLower = id.toLowerCase();
    const acceptLower = accept.toLowerCase();
    
    if (idLower === "heic-to-pdf" || acceptLower.includes(".heic")) return multi ? "HEIC file(s)" : "HEIC file";
    if (idLower === "png-to-pdf" || acceptLower === ".png") return multi ? "PNG file(s)" : "PNG file";
    if (idLower === "jpg-to-pdf" || acceptLower.includes(".jpg") || acceptLower.includes(".jpeg")) return multi ? "JPG file(s)" : "JPG file";
    if (idLower === "webp-to-pdf" || acceptLower.includes(".webp")) return multi ? "WebP file(s)" : "WebP file";
    
    if (idLower === "word-to-pdf" || acceptLower.includes(".docx") || acceptLower.includes(".doc")) return multi ? "Word document(s)" : "Word document";
    if (idLower === "excel-to-pdf" || acceptLower.includes(".xlsx") || acceptLower.includes(".xls") || acceptLower.includes(".csv")) return multi ? "Excel spreadsheet(s)" : "Excel spreadsheet";
    if (idLower === "ppt-to-pdf" || acceptLower.includes(".pptx") || acceptLower.includes(".ppt")) return multi ? "PowerPoint document(s)" : "PowerPoint document";
    if (idLower === "txt-to-pdf" || acceptLower.includes(".txt")) return multi ? "TXT file(s)" : "TXT file";
    
    if (idLower.includes("pdf") || acceptLower.includes("pdf")) return multi ? "PDF files" : "PDF file";
    
    return multi ? "files" : "file";
  };

  const reset = () => {
    setFiles([]);
    setSt("idle");
    setPct(0);
    setRes(null);
    setErr("");
  };

  const go = useCallback(async () => {
    if (!files.length) return;
    setSt("reading");
    setPct(5);
    setErr("");
    try {
      const r = await run(files, (p, m) => {
        setPct(p);
        if (m) setPmsg(m);
      });
      setRes(r);
      setSt("done");
      setPct(100);
    } catch (e: any) {
      setErr(e.message || "Processing failed.");
      setSt("error");
    }
  }, [files, run]);

  const pick = useCallback((fl: FileList | null) => {
    if (!fl) return;
    const a = Array.from(fl);
    if (!multi && a.length > 1) a.splice(1);
    setFiles(a);
    setErr("");
    setSt("idle");
  }, [multi]);

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
      />
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
        onClick={() => ref.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition ${
          drag
            ? "border-indigo-500 bg-indigo-55/10 dark:bg-indigo-950/20"
            : "border-slate-200 hover:border-indigo-400 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/40"
        }`}
      >
        <input
          ref={ref}
          type="file"
          accept={accept}
          multiple={multi}
          className="hidden"
          onChange={(e) => pick(e.target.files)}
        />
        <div className="text-3xl mb-3 animate-bounce">📂</div>
        <p className="font-display font-extrabold text-sm text-slate-800 dark:text-white mb-1">
          {files.length ? `${files.length} file(s) selected` : `Drag and drop your ${getFriendlyFormatName()} here`}
        </p>
        <p className="text-slate-400 dark:text-slate-500 text-xs">
          or click to browse local files · Max 100 MB
        </p>
        {files.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 justify-center max-w-md mx-auto">
            {files.map((f, i) => (
              <span
                key={i}
                className="bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 rounded-lg px-2.5 py-1 text-xs font-semibold font-mono"
              >
                {f.name} ({fmt(f.size)})
              </span>
            ))}
          </div>
        )}
      </div>
      
      {opts && <div className="mt-4">{opts}</div>}
      
      {files.length > 0 && st !== "reading" && st !== "processing" && (
        <button
          onClick={go}
          className="w-full mt-4 bg-indigo-600 text-white font-bold rounded-xl py-3 text-sm hover:bg-indigo-700 shadow-md shadow-indigo-600/15 cursor-pointer transition flex items-center justify-center gap-2 uppercase tracking-wide"
        >
          {label === "COMPRESS PDF" || id === "compress-pdf" ? "COMPRESS PDF" : `⚡ ${label} Now`}
        </button>
      )}
      
      {(st === "reading" || st === "processing") && <Bar v={pct} msg={pmsg || "Processing…"} />}
      <Err msg={err} onClose={() => setErr("")} />
    </div>
  );
};
