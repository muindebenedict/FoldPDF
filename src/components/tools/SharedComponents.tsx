import React, { useState, useRef, useCallback, useEffect } from "react";
import { fmt, dl } from "./PdfScriptLoader";
import { SERVER_TOOL_IDS } from "./serverApi";
import {
  IconAlertTriangle,
  IconCircleCheckFilled,
  IconCloudUpload,
  IconDownload,
  IconFile,
  IconFileTypeDoc,
  IconFileTypeJpg,
  IconFileTypePdf,
  IconFileTypePng,
  IconFileTypePpt,
  IconFileTypeTxt,
  IconFileTypeXls,
  IconLock,
  IconPhoto,
  IconShieldCheck,
  IconX,
} from "@tabler/icons-react";

export const Spin = ({ msg = "" }: { msg?: string }) => (
  <div className="text-center py-8 flex flex-col items-center justify-center gap-3 animate-in fade-in duration-300">
    <div className="w-10 h-10 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin" />
    {msg && <p className="text-slate-650 dark:text-slate-300 text-sm font-semibold">{msg}</p>}
  </div>
);

export const Bar = ({ v, msg }: { v: number; msg?: string }) => (
  <div className="mt-5 animate-in fade-in slide-in-from-top-1 duration-300" role="status" aria-live="polite">
    <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
      <span className="flex min-w-0 items-center gap-2">
        <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600 dark:border-indigo-900 dark:border-t-indigo-400" />
        <span className="truncate">{msg}</span>
      </span>
      <span className="tabular-nums text-slate-500 dark:text-slate-400">{v}%</span>
    </div>
    <div
      className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="relative h-full overflow-hidden rounded-full bg-indigo-600 transition-[width] duration-500 ease-out dark:bg-indigo-500"
        style={{ width: v + "%" }}
      >
        <span className="absolute inset-0 animate-shimmer bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent)]" />
      </div>
    </div>
  </div>
);

export const Err = ({ msg, onClose }: { msg: string; onClose?: () => void }) => {
  if (!msg) return null;
  return (
    <div
      role="alert"
      className="mt-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3.5 animate-in fade-in zoom-in-95 duration-200 dark:border-rose-900/60 dark:bg-rose-950/30"
    >
      <IconAlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-500" aria-hidden="true" />
      <span className="flex-1 text-xs font-semibold leading-relaxed text-rose-700 dark:text-rose-300">{msg}</span>
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Dismiss message"
          className="rounded-md p-0.5 text-rose-500 transition hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-900/40"
        >
          <IconX size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

// Small colour-coded file tile, matching the tool icon colours (PDF red, Word blue, and so on).
const FILE_STYLES: { test: RegExp; tile: string; Glyph: typeof IconFile }[] = [
  { test: /\.pdf$/i, tile: "bg-tool-pdf", Glyph: IconFileTypePdf },
  { test: /\.docx?$/i, tile: "bg-tool-word", Glyph: IconFileTypeDoc },
  { test: /\.pptx?$/i, tile: "bg-tool-powerpoint", Glyph: IconFileTypePpt },
  { test: /\.(xlsx?|csv)$/i, tile: "bg-tool-excel", Glyph: IconFileTypeXls },
  { test: /\.jpe?g$/i, tile: "bg-tool-image", Glyph: IconFileTypeJpg },
  { test: /\.png$/i, tile: "bg-tool-image", Glyph: IconFileTypePng },
  { test: /\.(webp|heic|heif|gif|bmp)$/i, tile: "bg-tool-image", Glyph: IconPhoto },
  { test: /\.txt$/i, tile: "bg-tool-text", Glyph: IconFileTypeTxt },
];

export const FileTypeTile = ({ name }: { name: string }) => {
  const style = FILE_STYLES.find((s) => s.test.test(name)) ?? { tile: "bg-slate-500", Glyph: IconFile };
  const Glyph = style.Glyph;
  return (
    <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white ${style.tile}`}>
      <Glyph size={22} stroke={1.75} />
    </span>
  );
};

// The chosen files, sliding in one after another. Pass onRemove to show a remove button on each.
export const FileList = ({ files, onRemove }: { files: File[]; onRemove?: (index: number) => void }) => {
  if (!files.length) return null;
  return (
    <ul className="mt-3 space-y-2" aria-label="Selected files">
      {files.map((file, i) => (
        <li
          key={`${file.name}-${file.size}-${i}`}
          style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5 pr-3 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both dark:border-slate-800 dark:bg-slate-900"
        >
          <FileTypeTile name={file.name} />
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{file.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{fmt(file.size)}</p>
          </div>
          <IconCircleCheckFilled size={20} className="shrink-0 text-emerald-500 animate-pop-in" aria-label="Ready" />
          {onRemove && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRemove(i); }}
              aria-label={`Remove ${file.name}`}
              className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <IconX size={16} aria-hidden="true" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
};

interface DropZoneProps {
  accept: string;
  multiple?: boolean;
  onFiles: (files: FileList | null) => void;
  /** What to drop, for example "Word document" or "PDF files". */
  formatLabel: string;
  /** Used for the privacy note: server tools delete the file, the others keep it on the device. */
  toolId?: string;
  maxSizeLabel?: string;
  compact?: boolean;
}

// The upload area every tool shares: keyboard accessible, and it reacts while a file is dragged over it.
export const DropZone = ({ accept, multiple = false, onFiles, formatLabel, toolId, maxSizeLabel = "Up to 50 MB", compact = false }: DropZoneProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const usesServer = toolId ? SERVER_TOOL_IDS.includes(toolId) : false;
  const formats = accept.split(",").map((e) => e.trim().replace(/^\./, "").toUpperCase()).filter(Boolean).join(", ");
  const open = () => inputRef.current?.click();

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Choose ${formatLabel} to upload, or drop ${multiple ? "them" : "it"} here`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        onFiles(e.dataTransfer.files);
      }}
      className={`group relative cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed text-center outline-none transition duration-300 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
        compact ? "px-5 py-6" : "px-6 py-10"
      } ${
        dragging
          ? "scale-[1.01] border-indigo-500 bg-indigo-50/80 dark:border-indigo-400 dark:bg-indigo-500/10"
          : "border-slate-200 bg-slate-50/60 hover:border-indigo-400 hover:bg-indigo-50/40 dark:border-slate-700 dark:bg-slate-900/40 dark:hover:border-indigo-400/70 dark:hover:bg-indigo-500/5"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        tabIndex={-1}
        className="sr-only"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div className={`relative mx-auto flex items-center justify-center ${compact ? "mb-3 h-12 w-12" : "mb-4 h-16 w-16"}`}>
        {dragging && <span className="absolute inset-0 rounded-2xl bg-indigo-500/30 animate-soft-ping" />}
        <span
          className={`relative flex h-full w-full items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 transition-transform duration-300 group-hover:-translate-y-1 dark:bg-indigo-500 ${
            dragging ? "-translate-y-1" : ""
          }`}
        >
          <IconCloudUpload size={compact ? 24 : 30} stroke={1.75} className={dragging ? "animate-float-up" : ""} aria-hidden="true" />
        </span>
      </div>

      <p className={`font-display font-extrabold text-slate-900 dark:text-white ${compact ? "text-sm" : "text-base"}`}>
        {dragging ? `Drop your ${formatLabel} to upload` : `Drag and drop your ${formatLabel}`}
      </p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        or <span className="font-semibold text-indigo-600 underline-offset-2 group-hover:underline dark:text-indigo-400">browse your files</span>
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        {formats && <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">{formats}</span>}
        <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">{maxSizeLabel}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
          {usesServer ? <IconShieldCheck size={13} aria-hidden="true" /> : <IconLock size={13} aria-hidden="true" />}
          {usesServer ? "Deleted right after processing" : "Stays on your device"}
        </span>
      </div>
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
  toolName,
  toolId
}: {
  blob?: Blob;
  name: string;
  origSize?: number;
  info?: React.ReactNode;
  onReset: () => void;
  onSuccess?: (fileName: string, toolName: string) => void;
  toolName: string;
  toolId?: string;
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

  const isCompressor = toolId === "compress-pdf" || toolName?.toLowerCase().includes("compress");

  return (
    <div className="px-4 py-8 text-center animate-in fade-in duration-300" role="status">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 animate-pop-in">
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray={24} className="animate-draw-check" />
        </svg>
      </div>
      <h3 className="mb-1.5 font-display text-lg font-extrabold text-slate-900 dark:text-white">
        Your file is ready
      </h3>
      <p className="mx-auto mb-1 max-w-sm break-all text-sm font-semibold text-slate-700 dark:text-slate-300">
        {name}
      </p>

      {isCompressor && origSize && blob ? (
        <p className="mb-2 text-xs font-medium text-slate-500">
          {fmt(origSize)} → <strong className={blob.size < origSize ? "text-emerald-600" : "text-neutral-700 dark:text-neutral-300"}>{fmt(blob.size)}</strong>
          {origSize > blob.size && (
            <span className="font-bold text-emerald-600"> ({Math.round((1 - blob.size / origSize) * 100)}% smaller)</span>
          )}
        </p>
      ) : (
        blob && (
          <p className="mb-2 text-xs font-medium text-slate-500">
            Size: {fmt(blob.size)}
          </p>
        )
      )}
      {info && <div className="mb-4 text-xs text-slate-500 dark:text-slate-400">{info}</div>}

      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {blob && (
          <button
            onClick={() => dl(blob, name)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:-translate-y-0.5 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            <IconDownload size={18} aria-hidden="true" />
            Download file
          </button>
        )}
        <button
          onClick={onReset}
          className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-5 py-2.5 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Process another file
        </button>
      </div>
    </div>
  );
};

export function validateUploadedFiles(files: File[], accept: string): { isValid: boolean; error?: string } {
  if (!accept) return { isValid: true };
  const allowedSpecs = accept.split(",")
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  
  if (allowedSpecs.length === 0) return { isValid: true };

  for (const file of files) {
    const nameLower = file.name.toLowerCase();
    const ext = "." + nameLower.split(".").pop();
    
    const isAllowed = allowedSpecs.some(spec => {
      if (spec === "*") return true;
      if (spec.startsWith(".") && ext === spec) return true;
      if (spec.includes("/") && file.type && (file.type === spec || file.type.startsWith(spec.replace("*", "")))) return true;
      return false;
    });

    if (!isAllowed) {
      let friendlyExpected = "";
      if (accept.includes(".jpg") || accept.includes(".jpeg")) friendlyExpected = "JPG";
      else if (accept.includes(".png")) friendlyExpected = "PNG";
      else if (accept.includes(".webp")) friendlyExpected = "WebP";
      else if (accept.includes(".heic")) friendlyExpected = "HEIC";
      else if (accept.includes(".pdf")) friendlyExpected = "PDF";
      else if (accept.includes(".docx")) friendlyExpected = "Word";
      else if (accept.includes(".xlsx") || accept.includes(".xls") || accept.includes(".csv")) friendlyExpected = "Excel/Spreadsheet";
      else {
        friendlyExpected = allowedSpecs.map(e => e.replace(".", "").toUpperCase()).join("/");
      }

      const uploadedExt = ext.replace(".", "").toUpperCase() || "unknown";
      return {
        isValid: false,
        error: `Please upload a ${friendlyExpected} file instead of a ${uploadedExt} file.`
      };
    }
  }

  return { isValid: true };
}

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
  const timeoutIdRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
      }
    };
  }, []);

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
    
    // Validate file sizes (50MB limit)
    const overSized = files.some(f => f.size > 50 * 1024 * 1024);
    if (overSized) {
      setFiles([]);
      setErr("File too large. Maximum size is 50MB.");
      setSt("idle");
      return;
    }

    setSt("reading");
    setPct(5);
    setErr("");
    
    try {
      const timeoutPromise = new Promise((_, reject) => {
        const tid = setTimeout(() => {
          reject(new Error("TIMEOUT_ERROR"));
        }, 120000);
        timeoutIdRef.current = tid;
      });

      const executePromise = run(files, (p, m) => {
        setPct(p);
        if (m) setPmsg(m);
      });

      const r = await Promise.race([executePromise, timeoutPromise]) as { blob: Blob; name: string; info?: string };
      
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }

      setRes(r);
      setSt("done");
      setPct(100);
    } catch (e: any) {
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
      
      const errMsg = String(e?.message || e || "");
      let friendlyError = "Something went wrong. Please refresh and try again.";
      
      if (errMsg === "TIMEOUT_ERROR") {
        friendlyError = "Processing took too long. Please try a smaller file.";
      } else if (errMsg.includes("unsupported characters") || errMsg.includes("WinAnsi cannot encode") || errMsg.includes("WinAnsi")) {
        friendlyError = "This document contains unsupported characters. Try saving it as a plain .txt file first.";
      } else if (
        errMsg.includes("damaged") || 
        errMsg.includes("password-protected") || 
        errMsg.includes("decrypt") || 
        errMsg.includes("encrypted") || 
        errMsg.includes("structure") || 
        errMsg.includes("corrupt") || 
        errMsg.includes("Invalid PDF structure") ||
        errMsg.includes("bad decrypt")
      ) {
        friendlyError = "This PDF appears to be damaged or password-protected.";
      } else if (
        errMsg.includes("Cannot read properties") || 
        errMsg.includes("undefined") || 
        errMsg.includes("null") || 
        errMsg.includes("unsupported") ||
        errMsg.includes("Type Error")
      ) {
        friendlyError = "Could not read this file. Please try again.";
      } else if (
        errMsg.includes("Out of memory") || 
        errMsg.includes("memory") || 
        errMsg.includes("Allocation failed") ||
        errMsg.includes("out of memory")
      ) {
        friendlyError = "This file is too large to process in your browser.";
      } else if (
        errMsg.includes("Network error") || 
        errMsg.includes("fetch") || 
        errMsg.includes("network") || 
        errMsg.includes("connect")
      ) {
        friendlyError = "Connection lost. Please check your internet and try again.";
      } else if (e?.message) {
        friendlyError = e.message;
      }
      
      setErr(friendlyError);
      setFiles([]);
      setSt("idle");
      setPct(0);
    }
  }, [files, run]);

  const pick = useCallback((fl: FileList | null) => {
    if (!fl) return;
    const a = Array.from(fl);
    if (!multi && a.length > 1) a.splice(1);
    
    // Check file sizes
    const overSized = a.some(f => f.size > 50 * 1024 * 1024);
    if (overSized) {
      setFiles([]);
      setErr("File too large. Maximum size is 50MB.");
      setSt("idle");
      return;
    }

    const vRes = validateUploadedFiles(a, accept);
    if (!vRes.isValid) {
      setFiles([]);
      setErr(vRes.error || "Please try again with a valid file.");
      setSt("idle");
      return;
    }

    setFiles(a);
    setErr("");
    setSt("idle");
  }, [multi, accept]);

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
        toolId={id}
      />
    );
  }

  return (
    <div className="w-full">
      <DropZone
        accept={accept}
        multiple={multi}
        onFiles={pick}
        formatLabel={getFriendlyFormatName()}
        toolId={id}
      />
      <FileList
        files={files}
        onRemove={st === "reading" || st === "processing" ? undefined : (i) => setFiles((prev) => prev.filter((_, j) => j !== i))}
      />

      {opts && <div className="mt-4">{opts}</div>}
      
      {files.length > 0 && st !== "reading" && st !== "processing" && (
        <button
          onClick={go}
          className="w-full mt-4 bg-indigo-600 text-white font-bold rounded-xl py-3 text-sm hover:bg-indigo-700 shadow-md shadow-indigo-600/15 cursor-pointer transition flex items-center justify-center gap-2 uppercase tracking-wide"
        >
          {label === "COMPRESS PDF" || id === "compress-pdf" ? "COMPRESS PDF" : `${label} Now`}
        </button>
      )}
      
      {(st === "reading" || st === "processing") && <Bar v={pct} msg={id === "ppt-to-pdf" ? "Converting your PowerPoint — this usually takes 30 to 60 seconds. Please wait..." : (pmsg || "Processing your PDF...")} />}
      <Err msg={err} onClose={() => setErr("")} />
    </div>
  );
};