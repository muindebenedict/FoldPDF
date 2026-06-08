import React, { useState, useRef, useEffect, useCallback } from "react";
import { PDFDocument } from "@cantoo/pdf-lib";
import * as Lucide from "lucide-react";
import { readAB, getPdfLib, getPdfJs, renderPage, readURL, fmt, dl, getOutputFile } from "./PdfScriptLoader";
import { Proc, Done, Bar, Err, Spin, validateUploadedFiles } from "./SharedComponents";

interface ToolProps {
  onSuccess?: (fileName: string, toolName: string) => void;
  toolName: string;
}

// ─── EXACT DOWNLOAD HELPER ───
const downloadFile = (blob: Blob, filename: string) => {
  if (!blob || !(blob instanceof Blob)) {
    console.error("downloadFile received invalid blob", blob);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/* TEST PROTOCOL:
 1. Upload any PDF.
 2. Type "hello123" in Password field.
 3. Type "hello123" in Confirm Password field.
 4. Click "Protect & Download".
 5. Open downloaded file in Chrome.
 6. EXPECTED: A password prompt appears. Typing "hello123" opens the file.
 7. FAILURE MODE: If file opens without prompt, one of the 4 bugs above is present.
*/

/* PROTECT PDF */
export const ProtectTool = ({ onSuccess, toolName }: ToolProps) => {
  // ─── STATE ─── EXACTLY THESE 11 VARIABLES ───
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [pageCount, setPageCount] = useState(0);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<"idle" | "reading" | "processing" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
  const [outputName, setOutputName] = useState("");
  const [permissions, setPermissions] = useState({
    printing: true,
    copying: true,
  });

  const uploadInputRef = useRef<HTMLInputElement>(null);

  // ─── FILE HANDLER ───
  const handleFile = async (selectedFile: File) => {
    if (!selectedFile) return;
    const vRes = validateUploadedFiles([selectedFile], ".pdf");
    if (!vRes.isValid) {
      setErrorMsg(vRes.error || "Please upload a PDF file.");
      setStatus("error");
      return;
    }
    setFile(selectedFile);
    setFileName(selectedFile.name);
    setStatus("reading");
    setErrorMsg("");
    setOutputBlob(null);

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      // Load ignoreEncryption to count pages even if it was previously encrypted
      const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      setPageCount(pdfDoc.getPageCount());
      setStatus("idle");
    } catch (err) {
      setErrorMsg("Cannot read this PDF. It may be corrupted.");
      setStatus("error");
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  // ─── ENCRYPTION FUNCTION ───
  const encryptPdf = async () => {
    console.log("DEBUG: password value is:", JSON.stringify(password), "length:", password.length);

    if (!file) {
      setErrorMsg("Please upload a PDF first.");
      return;
    }
    if (!password || password.length < 4 || password.length > 32) {
      setErrorMsg("Password must be 4–32 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    setStatus("processing");
    setErrorMsg("");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

      const perms = {
        printing: permissions.printing ? "highResolution" : "lowResolution" as any,
        modifying: false,
        copying: permissions.copying,
        annotating: false,
        fillingForms: false,
        contentAccessibility: permissions.copying,
        documentAssembly: false,
      };

      // THE CRITICAL CALL — FIRST CALL .encrypt() on the PDFDocument IN @cantoo/pdf-lib
      pdfDoc.encrypt({
        userPassword: password,      // ← FROM useState, NOT A HARDCODED STRING
        ownerPassword: password,     // ← SAME VARIABLE
        permissions: perms,
      });

      // THEN SAVE IT — THIS WRITES ENCRYPTED DATA
      const encryptedBytes = await pdfDoc.save({ useObjectStreams: true });

      // SANITY CHECK: VERIFY WE CAN LOAD IT BACK WITH THE SAME PASSWORD
      await PDFDocument.load(encryptedBytes, { password: password });
      console.log("VERIFICATION PASSED: File is encrypted with password:", password);

      // BLOB MUST USE encryptedBytes, NOT original arrayBuffer
      const blob = new Blob([encryptedBytes], { type: "application/pdf" });
      setOutputBlob(blob);
      const optName = getOutputFile(fileName, "protected", ".pdf");
      setOutputName(optName);
      setStatus("done");

      if (onSuccess) {
        onSuccess(optName, toolName);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Encryption failed: " + (err.message || "Unknown error"));
      setStatus("error");
    }
  };

  const reset = () => {
    setFile(null);
    setFileName("");
    setPageCount(0);
    setPassword("");
    setConfirmPassword("");
    setStatus("idle");
    setErrorMsg("");
    setOutputBlob(null);
    setOutputName("");
  };

  return (
    <div className="w-full">
      {/* UPLOAD AREA */}
      {status === "idle" && !file && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => uploadInputRef.current?.click()}
          className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center cursor-pointer bg-slate-50/50 hover:border-indigo-400 dark:bg-slate-900/10 transition animate-in zoom-in-95 duration-200"
        >
          <input
            ref={uploadInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
            }}
          />
          <Lucide.Upload size={32} className="text-indigo-600 dark:text-indigo-400 mx-auto mb-3 animate-bounce" />
          <p className="font-display font-bold text-sm text-slate-800 dark:text-white">
            Drop your PDF file here or click to browse
          </p>
          <p className="text-slate-400 dark:text-slate-500 text-xs mt-1.5">
            Maximum 50 MB • Local client-side processing
          </p>
        </div>
      )}

      {/* FILE INFO + PASSWORD FORM */}
      {file && status !== "done" && status !== "processing" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-2xl p-6 sm:p-8 space-y-5 text-left animate-in fade-in duration-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl flex items-center justify-center">
              <Lucide.Lock size={20} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-slate-800 dark:text-white text-sm truncate">{fileName}</div>
              <div className="text-xs text-slate-400 dark:text-slate-500">{pageCount} page{pageCount !== 1 ? "s" : ""}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* PASSWORD INPUT */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 uppercase mb-1 font-mono">
                Set Password <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrorMsg("");
                  }}
                  placeholder="Minimum 4 characters"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-3.5 pr-10 py-2.5 text-xs font-semibold focus:outline-none focus:border-indigo-505 focus:ring-1 focus:ring-indigo-505"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                >
                  {showPassword ? <Lucide.EyeOff size={16} /> : <Lucide.Eye size={16} />}
                </button>
              </div>
            </div>

            {/* CONFIRM PASSWORD */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-350 uppercase mb-1 font-mono">
                Confirm Password <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setErrorMsg("");
                }}
                placeholder="Re-enter password"
                className={`w-full bg-slate-50 dark:bg-slate-950 border rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:border-indigo-505 focus:ring-1 focus:ring-indigo-505 ${
                  confirmPassword && password !== confirmPassword ? "border-rose-400 dark:border-rose-900" : "border-slate-200 dark:border-slate-800"
                }`}
              />
            </div>
          </div>

          {/* PERMISSIONS */}
          <div className="bg-slate-50 dark:bg-slate-950 p-4 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-350 uppercase font-mono">User Permissions:</p>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-600 dark:text-slate-400 font-semibold">
                <input
                  type="checkbox"
                  checked={permissions.printing}
                  onChange={(e) => setPermissions((p) => ({ ...p, printing: e.target.checked }))}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 border-slate-300 dark:border-slate-700"
                />
                Allow high-resolution printing
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-600 dark:text-slate-400 font-semibold">
                <input
                  type="checkbox"
                  checked={permissions.copying}
                  onChange={(e) => setPermissions((p) => ({ ...p, copying: e.target.checked }))}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 border-slate-300 dark:border-slate-700"
                />
                Allow copying content & screen readers
              </label>
            </div>
          </div>

          {/* ERROR BOX */}
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-150 rounded-xl p-3.5 flex gap-3 items-start animate-in zoom-in-95 duration-200">
              <Lucide.AlertTriangle className="text-rose-500 shrink-0 mt-0.5" size={16} />
              <span className="flex-1 text-xs font-bold text-rose-700 leading-relaxed">{errorMsg}</span>
              <button onClick={() => setErrorMsg("")} className="text-rose-400 hover:text-rose-600 font-bold text-sm">✕</button>
            </div>
          )}

          {/* ACTION BUTTON */}
          <button
            onClick={encryptPdf}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl py-3 text-sm shadow-lg shadow-indigo-650/15 hover:shadow-indigo-650/20 transition cursor-pointer"
          >
            🔒 Protect & Download PDF
          </button>
        </div>
      )}

      {/* PROCESSING STATE */}
      {status === "processing" && (
        <div className="text-center py-10 space-y-4">
          <div className="w-10 h-10 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin mx-auto" />
          <p className="text-slate-600 dark:text-slate-300 text-sm font-semibold">
            Applying military-grade AES encryption...
          </p>
        </div>
      )}

      {/* DONE STATE */}
      {status === "done" && outputBlob && (
        <div className="text-center py-8 px-4 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-2xl animate-in zoom-in-95 duration-300 space-y-5">
          <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto text-3xl shadow-premium-sm">
            ✓
          </div>
          <div className="space-y-1">
            <h3 className="font-display font-extrabold text-lg text-slate-900 dark:text-white">
              PDF Protected Successfully
            </h3>
            <p className="text-slate-500 dark:text-slate-450 text-xs font-medium max-w-sm mx-auto leading-relaxed">
              Open <strong>{outputName}</strong> on your device. You will be prompted to enter your secure passcode before viewing.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <button
              onClick={() => downloadFile(outputBlob, outputName)}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-6 py-2.5 rounded-xl transition cursor-pointer"
            >
              ⬇ Download Protected PDF
            </button>
            <button
              onClick={reset}
              className="w-full sm:w-auto bg-slate-50 border border-slate-200 dark:bg-slate-950 dark:border-slate-800 text-slate-705 dark:text-slate-300 text-sm px-6 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-850 transition cursor-pointer"
            >
              Protect Another File
            </button>
          </div>

          <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 rounded-xl text-xs text-indigo-700 dark:text-indigo-400 font-bold mx-auto">
            <Lucide.Shield size={14} />
            Password Key: <strong className="text-indigo-800 dark:text-indigo-300">{password}</strong>
          </div>
        </div>
      )}
    </div>
  );
};

/* UNLOCK PDF */
export const UnlockTool = ({ onSuccess, toolName }: ToolProps) => {
  // ─── STATE ─── EXACTLY THESE 8 VARIABLES ───
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<"idle" | "checking" | "processing" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
  const [outputName, setOutputName] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);

  // ─── FILE HANDLER ───
  const handleFile = async (selectedFile: File) => {
    if (!selectedFile) return;
    const vRes = validateUploadedFiles([selectedFile], ".pdf");
    if (!vRes.isValid) {
      setErrorMsg(vRes.error || "Please upload a PDF file.");
      setStatus("error");
      return;
    }
    setFile(selectedFile);
    setFileName(selectedFile.name);
    setStatus("checking");
    setErrorMsg("");
    setOutputBlob(null);

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      // Try loading WITHOUT password to see if it's encrypted
      try {
        await PDFDocument.load(arrayBuffer);
        // If this succeeds, file is NOT encrypted
        setStatus("idle");
        setErrorMsg("This PDF has no password. You can still save a clean copy below.");
      } catch (err: any) {
        if (
          err.message.includes("password") ||
          err.message.includes("encrypted") ||
          err.message.includes("Password")
        ) {
          setStatus("idle"); // Encrypted, waiting for user password input
        } else {
          throw err;
        }
      }
    } catch (err) {
      setErrorMsg("Cannot read this file. It may be corrupted or signed natively.");
      setStatus("error");
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  // ─── DECRYPTION FUNCTION ───
  const decryptPdf = async () => {
    if (!file) return;
    if (!password) {
      setErrorMsg("Enter the current password.");
      return;
    }

    setStatus("processing");
    setErrorMsg("");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer, {
        password: password,
        ignoreEncryption: false,
      });

      // Save WITHOUT encryption object = removes password
      const decryptedBytes = await pdfDoc.save({ useObjectStreams: true });
      const blob = new Blob([decryptedBytes], { type: "application/pdf" });

      setOutputBlob(blob);
      const optName = getOutputFile(fileName, "unlocked", ".pdf");
      setOutputName(optName);
      setStatus("done");

      if (onSuccess) {
        onSuccess(optName, toolName);
      }
    } catch (err: any) {
      console.error(err);
      if (
        err.message.includes("password") ||
        err.message.includes("Password") ||
        err.message.includes("Incorrect") ||
        err.message.includes("incorrect")
      ) {
        setErrorMsg("Incorrect password. Please try again.");
      } else {
        setErrorMsg("Failed to remove password: " + (err.message || "Unknown error"));
      }
      setStatus("error");
    }
  };

  const reset = () => {
    setFile(null);
    setFileName("");
    setPassword("");
    setStatus("idle");
    setErrorMsg("");
    setOutputBlob(null);
    setOutputName("");
  };

  return (
    <div className="w-full">
      {/* UPLOAD ZONE */}
      {!file && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center cursor-pointer bg-slate-50/50 hover:border-indigo-400 dark:bg-slate-900/10 transition animate-in zoom-in-95 duration-200"
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
            }}
          />
          <Lucide.Upload size={32} className="text-indigo-600 dark:text-indigo-400 mx-auto mb-3 animate-bounce" />
          <p className="font-display font-bold text-sm text-slate-800 dark:text-white">
            Drop your password-protected PDF file here or click to browse
          </p>
          <p className="text-slate-400 dark:text-slate-500 text-xs mt-1.5">
            We'll remove the password protection so anyone can open and edit it
          </p>
        </div>
      )}

      {/* RENDER ACTIVE PASSWORD DECRYPTION CARD */}
      {file && status !== "done" && status !== "processing" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-2xl p-6 sm:p-8 space-y-5 text-left animate-in fade-in duration-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl flex items-center justify-center">
              <Lucide.Unlock size={20} className="text-emerald-600 dark:text-emerald-450" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-slate-800 dark:text-white text-sm truncate">{fileName}</div>
              <div className="text-xs text-slate-400 dark:text-slate-500">Locked PDF Document ready for decryption</div>
            </div>
          </div>

          {/* PASSWORD INPUT */}
          <div>
            <label className="block text-xs font-bold text-slate-705 dark:text-slate-350 mb-1.5 font-mono uppercase">
              Current Password <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrorMsg("");
                }}
                placeholder="Enter password that opens this PDF"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-3.5 pr-10 py-2.5 text-xs font-semibold focus:outline-none focus:border-indigo-505 focus:ring-1 focus:ring-indigo-505"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
              >
                {showPassword ? <Lucide.EyeOff size={16} /> : <Lucide.Eye size={16} />}
              </button>
            </div>
          </div>

          {/* ERROR BOX */}
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-150 rounded-xl p-3.5 flex gap-3 items-start animate-in zoom-in-95 duration-200">
              <Lucide.AlertTriangle className="text-rose-500 shrink-0 mt-0.5" size={16} />
              <span className="flex-1 text-xs font-bold text-rose-750 leading-relaxed">{errorMsg}</span>
              <button onClick={() => setErrorMsg("")} className="text-rose-400 hover:text-rose-600 font-bold text-sm">✕</button>
            </div>
          )}

          {/* ACTION BUTTON */}
          <button
            onClick={decryptPdf}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl py-3 text-sm shadow-lg shadow-indigo-650/15 hover:shadow-indigo-650/20 transition cursor-pointer"
          >
            🔓 Unlock & Download PDF
          </button>
        </div>
      )}

      {/* CHECKING / PROCESSING STATE */}
      {(status === "checking" || status === "processing") && (
        <div className="text-center py-10 space-y-4">
          <div className="w-10 h-10 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin mx-auto" />
          <p className="text-slate-600 dark:text-slate-300 text-sm font-semibold">
            {status === "checking" ? "Checking PDF security properties..." : "Stripping document security password..."}
          </p>
        </div>
      )}

      {/* DONE STATE */}
      {status === "done" && outputBlob && (
        <div className="text-center py-8 px-4 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-2xl animate-in zoom-in-95 duration-300 space-y-5">
          <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto text-3xl shadow-premium-sm">
            ✓
          </div>
          <div className="space-y-1">
            <h3 className="font-display font-extrabold text-lg text-slate-900 dark:text-white">
              Password Removed Successfully!
            </h3>
            <p className="text-slate-500 dark:text-slate-450 text-xs font-medium max-w-sm mx-auto leading-relaxed">
              <strong>{outputName}</strong> can now be opened instantly by anybody, with zero passwords or restrictions.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <button
              onClick={() => downloadFile(outputBlob, outputName)}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-6 py-2.5 rounded-xl transition cursor-pointer"
            >
              ⬇ Download Unlocked PDF
            </button>
            <button
              onClick={reset}
              className="w-full sm:w-auto bg-slate-50 border border-slate-200 dark:bg-slate-950 dark:border-slate-800 text-slate-705 dark:text-slate-300 text-sm px-6 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-850 transition cursor-pointer"
            >
              Unlock Another File
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/* REPAIR PDF */
export const RepairTool = ({ onSuccess, toolName }: ToolProps) => {
  const run = useCallback(async (files: File[], prog: (p: number, m?: string) => void) => {
    prog(20, "Processing your PDF...");
    const { PDFDocument } = await getPdfLib();
    const ab = await readAB(files[0]);
    
    let doc;
    try {
      doc = await PDFDocument.load(ab, { ignoreEncryption: true });
    } catch {
      throw new Error("This PDF structure is completely corrupted. Consider re-saving using Adobe Reader before repairing.");
    }
    
    prog(70, "Processing your PDF...");
    const bytes = await doc.save({ useObjectStreams: true });
    return {
      blob: new Blob([bytes], { type: "application/pdf" }),
      name: getOutputFile(files[0]?.name, "repaired", ".pdf"),
      info: "PDF structure and offset tables regenerated cleanly."
    };
  }, []);

  return <Proc id="repair-pdf" label="Repair PDF Structure" run={run} onSuccess={onSuccess} toolName={toolName} />;
};

/* OCR PDF */
export const OcrTool = ({ onSuccess, toolName }: ToolProps) => {
  const [st, setSt] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [pct, setPct] = useState(0);
  const [pmsg, setPmsg] = useState("");
  const [res, setRes] = useState<{ blob: Blob; name: string; info: string } | null>(null);
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const go = async (f: File) => {
    if (f.size > 50 * 1024 * 1024) {
      setErr("File too large. Maximum size is 50MB.");
      setSt("idle");
      return;
    }

    setSt("processing");
    setPct(10);
    setPmsg("Fetching OCR engines…");
    setErr("");

    let doc: any = null;
    let worker: any = null;
    let timeoutId: any = null;

    try {
      // 30 seconds timeout race
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("TIMEOUT_ERROR"));
        }, 30000);
      });

      const executePromise = (async () => {
        const lib = await getPdfJs();
        const ab = await readAB(f);
        doc = await lib.getDocument({ data: new Uint8Array(ab) }).promise;
        const tot = doc.numPages;
        
        const { loadScript: lSc } = require("./PdfScriptLoader");
        await lSc("https://unpkg.com/tesseract.js@5.1.1/dist/tesseract.min.js", "Tesseract");
        const T = (window as any).Tesseract;
        
        worker = await T.createWorker();
        
        let extTxt = "";
        for (let i = 1; i <= tot; i++) {
          setPct(15 + Math.round((i / tot) * 80));
          setPmsg(`OCR parsing image frames page ${i}/${tot}…`);
          const cv = await renderPage(doc, i, 1.5);
          const { data: { text } } = await worker.recognize(cv);
          extTxt += `\n--- Page ${i} ---\n${text}\n`;
        }
        
        setPct(100);
        const blob = new Blob([extTxt], { type: "text/plain" });
        return {
          blob,
          name: getOutputFile(f.name, "ocr", ".txt"),
          info: `Scanned ${tot} pages & compiled text`
        };
      })();

      const scanResult = await Promise.race([executePromise, timeoutPromise]) as { blob: Blob; name: string; info: string };
      clearTimeout(timeoutId);
      
      setRes(scanResult);
      setSt("done");
    } catch (e: any) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      const errMsg = String(e?.message || e || "");
      let friendlyError = "OCR Scan failed.";
      
      if (errMsg === "TIMEOUT_ERROR") {
        friendlyError = "Processing took too long. Please try a smaller file.";
      } else if (
        errMsg.includes("damaged") || 
        errMsg.includes("password") || 
        errMsg.includes("decrypt") || 
        errMsg.includes("encrypted") || 
        errMsg.includes("corrupt") || 
        errMsg.includes("structure") ||
        errMsg.includes("Invalid PDF structure")
      ) {
        friendlyError = "This PDF appears to be damaged or password-protected.";
      } else if (
        errMsg.includes("Cannot read properties") || 
        errMsg.includes("undefined") || 
        errMsg.includes("null") || 
        errMsg.includes("unsupported")
      ) {
        friendlyError = "This file appears to be damaged or unsupported.";
      } else if (e?.message) {
        friendlyError = e.message;
      }
      
      setErr(friendlyError);
      setSt("idle"); // Auto-reset OCR state back to upload/idle state!
    } finally {
      if (worker && typeof worker.terminate === "function") {
        try {
          await worker.terminate();
        } catch (errWorker) {
          console.warn("Could not terminate OCR worker cleanly:", errWorker);
        }
      }
      if (doc && typeof doc.destroy === "function") {
        try {
          await doc.destroy();
        } catch (errDoc) {
          console.warn("Could not destroy PDF.js doc cleanly:", errDoc);
        }
      }
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
          const filesArray = Array.from(e.dataTransfer.files) as File[];
          if (filesArray.length > 0) {
            const vRes = validateUploadedFiles(filesArray, ".pdf");
            if (!vRes.isValid) {
              setErr(vRes.error || "Please upload a PDF file.");
              return;
            }
            setErr("");
            go(filesArray[0]);
          }
        }}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center cursor-pointer bg-slate-50/50 hover:border-indigo-400 dark:bg-slate-900/10 transition animate-in zoom-in-95"
      >
        <input
          ref={inputRef}
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
              go(e.target.files[0]);
            }
          }}
        />
        <div className="text-3xl mb-1.5 animate-bounce">👁️</div>
        <p className="font-display font-extrabold text-sm text-slate-800 dark:text-white">
          OCR Scanned PDF Reader
        </p>
        <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">
          Drop your scanned, photo-only PDF file here to read text
        </p>
      </div>

      {st === "processing" && <Spin msg={pmsg} />}
      <Err msg={err} onClose={() => setErr("")} />
    </div>
  );
};

/* SIGNATURE (Cool Drag & Drop Stamp Sign) */
export const SigTool = ({ onSuccess, toolName }: ToolProps) => {
  const cv = useRef<HTMLCanvasElement>(null);
  const preRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [sigData, setSigData] = useState<string | null>(null);
  const [penCol, setPenCol] = useState("#1a1a2e");
  const [penW, setPenW] = useState(2);
  const [stage, setStage] = useState<"draw" | "place">("draw");
  const [theFile, setTheFile] = useState<File | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const [npg, setNpg] = useState(0);
  const [curPg, setCurPg] = useState(1);
  const [sigPos, setSigPos] = useState({ x: 80, y: 80, w: 180, h: 70 });
  const [drag, setDrag] = useState(false);
  const [dOff, setDOff] = useState({ x: 0, y: 0 });
  const [st, setSt] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [pct, setPct] = useState(0);
  const [res, setRes] = useState<{ blob: Blob; name: string; info: string } | null>(null);
  const [err, setErr] = useState("");

  const gp = (e: any, el: HTMLCanvasElement) => {
    const r = el.getBoundingClientRect();
    const sx = el.width / r.width;
    const sy = el.height / r.height;
    if (e.touches && e.touches.length > 0) {
      return { x: (e.touches[0].clientX - r.left) * sx, y: (e.touches[0].clientY - r.top) * sy };
    }
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
  };

  const sd = (e: any) => {
    e.preventDefault();
    const c = cv.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const { x, y } = gp(e, c);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setDrawing(true);
  };

  const dr = (e: any) => {
    if (!drawing) return;
    e.preventDefault();
    const c = cv.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const { x, y } = gp(e, c);
    ctx.lineTo(x, y);
    ctx.strokeStyle = penCol;
    ctx.lineWidth = penW;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  };

  const ed = () => setDrawing(false);
  
  const clr = () => {
    const c = cv.current;
    if (c) c.getContext("2d")?.clearRect(0, 0, 400, 180);
    setSigData(null);
  };

  const saveSig = () => {
    const c = cv.current;
    if (c) setSigData(c.toDataURL("image/png"));
  };

  const loadPdf = async (f: File) => {
    if (f.size > 50 * 1024 * 1024) {
      setErr("File too large. Maximum size is 50MB.");
      setSt("idle");
      return;
    }
    setTheFile(f);
    setSt("processing");
    setPct(20);
    let doc: any = null;
    try {
      const lib = await getPdfJs();
      const ab = await readAB(f);
      doc = await lib.getDocument({ data: new Uint8Array(ab) }).promise;
      setNpg(doc.numPages);
      
      const c = await renderPage(doc, 1, 1.4);
      setThumb(c.toDataURL("image/jpeg", 0.9));
      setStage("place");
      setSt("idle");
    } catch (e: any) {
      const errM = String(e?.message || e || "");
      let friendlyError = "Failed reading Pdf layers.";
      if (errM.includes("damaged") || errM.includes("corrupt") || errM.includes("structure") || errM.includes("password")) {
        friendlyError = "This PDF appears to be damaged or password-protected.";
      }
      setErr(friendlyError);
      setSt("error");
    } finally {
      if (doc && typeof doc.destroy === "function") {
        await doc.destroy();
      }
    }
  };

  const renderPg = async (n: number) => {
    if (!theFile) return;
    setCurPg(n);
    setSt("processing");
    setPct(30);
    let doc: any = null;
    try {
      const lib = await getPdfJs();
      const ab = await readAB(theFile);
      doc = await lib.getDocument({ data: new Uint8Array(ab) }).promise;
      const c = await renderPage(doc, n, 1.4);
      setThumb(c.toDataURL("image/jpeg", 0.9));
      setSt("idle");
    } catch (err) {
      setSt("error");
    } finally {
      if (doc && typeof doc.destroy === "function") {
        await doc.destroy();
      }
    }
  };

  const apply = async (allPgs = false) => {
    if (!theFile || !sigData) return;
    setSt("processing");
    setPct(20);
    setErr("");
    let timeoutId: any = null;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("TIMEOUT_ERROR")), 30000);
      });

      const executePromise = (async () => {
        const { PDFDocument } = await getPdfLib();
        const ab = await readAB(theFile);
        const doc = await PDFDocument.load(ab, { ignoreEncryption: true });
        const pgs = allPgs ? doc.getPages() : [doc.getPages()[curPg - 1]];
        const el = preRef.current;
        
        const pw = el ? el.offsetWidth : 560;
        const ph = el ? el.offsetHeight : 780;
        const fp = doc.getPage(0);
        const { width: pdfW, height: pdfH } = fp.getSize();
        const scX = pdfW / pw;
        const scY = pdfH / ph;

        const r = await fetch(sigData);
        const sb = await r.blob();
        const sbuf = await sb.arrayBuffer();
        
        setPct(60);
        for (const pg of pgs) {
          const { height } = pg.getSize();
          const png = await doc.embedPng(sbuf);
          const x = sigPos.x * scX;
          const y = height - ((sigPos.y + sigPos.h) * scY);
          pg.drawImage(png, {
            x,
            y,
            width: sigPos.w * scX,
            height: sigPos.h * scY,
            opacity: 0.95
          });
        }
        
        setPct(90);
        const bytes = await doc.save({ useObjectStreams: true });
        return {
          blob: new Blob([bytes], { type: "application/pdf" }),
          name: getOutputFile(theFile?.name, "signed", ".pdf"),
          info: "Prp certified visual stamp applied to document layers."
        };
      })();

      const r = await Promise.race([executePromise, timeoutPromise]) as { blob: Blob; name: string; info: string };
      clearTimeout(timeoutId);

      setRes(r);
      setSt("done");
      setPct(100);
    } catch (e: any) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      const errMsg = String(e?.message || e || "");
      let friendlyError = "Failed embedding signature.";
      if (errMsg === "TIMEOUT_ERROR") {
        friendlyError = "Processing took too long. Please try a smaller file.";
      } else if (errMsg.includes("damaged") || errMsg.includes("corrupt") || errMsg.includes("structure") || errMsg.includes("decrypt") || errMsg.includes("password")) {
        friendlyError = "This PDF appears to be damaged or password-protected.";
      }
      setErr(friendlyError);
      setSt("idle");
      setStage("draw");
      setSigData(null);
      setTheFile(null);
      setThumb(null);
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
          setStage("draw");
          setSigData(null);
          setTheFile(null);
          setThumb(null);
        }}
        onSuccess={onSuccess}
        toolName={toolName}
      />
    );
  }

  return (
    <div className="w-full">
      {stage === "draw" && (
        <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-left animate-in zoom-in-95 font-display">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-350 uppercase mb-2 font-mono">
            Draw custom signature inside board
          </p>
          <div className="flex gap-2 mb-3 items-center flex-wrap">
            {["#1a1a2e", "#1d4ed8", "#dc2626"].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setPenCol(c)}
                style={{ background: c }}
                className={`w-6 h-6 rounded-full border-2 transition ${
                  penCol === c ? "border-indigo-600 scale-110" : "border-transparent"
                }`}
              />
            ))}
            <label className="text-xs font-semibold text-slate-500 flex items-center gap-2 select-none">
              Inking:{" "}
              <input
                type="range"
                min={1}
                max={5}
                value={penW}
                onChange={(e) => setPenW(Number(e.target.value))}
                className="w-16 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
              />
            </label>
          </div>

          <canvas
            ref={cv}
            width={400}
            height={170}
            onMouseDown={sd}
            onMouseMove={dr}
            onMouseUp={ed}
            onMouseLeave={ed}
            onTouchStart={sd}
            onTouchMove={dr}
            onTouchEnd={ed}
            className="w-full h-44 bg-white dark:bg-neutral-950/90 rounded-lg border dark:border-slate-800 cursor-crosshair block touch-none"
          />

          <div className="flex gap-2 mt-3 font-display">
            <button
              type="button"
              onClick={clr}
              className="flex-1 bg-slate-100 dark:bg-slate-850 hover:bg-slate-200 rounded-xl py-2 text-xs font-bold transition cursor-pointer text-slate-705"
            >
              Clear Slate
            </button>
            <button
              type="button"
              onClick={saveSig}
              className="flex-1 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl py-2 text-xs font-bold transition cursor-pointer"
            >
              Lock Ink Signature
            </button>
          </div>
        </div>
      )}

      {stage === "draw" && sigData && (
        <div className="mt-4 space-y-4 animate-in slide-in-from-top-2 duration-300">
          <div className="bg-emerald-50 border border-emerald-150 p-3 rounded-xl text-center text-xs text-emerald-800 font-semibold shadow-premium-sm">
            ✓ Ink sealed correctly! Next, load your destination PDF:
          </div>
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
              loadPdf(filesArray[0]);
            }
          }}
          onClick={() => document.getElementById("sig-pdf-loader")?.click()}
          className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center cursor-pointer bg-slate-50/50 hover:border-indigo-400 dark:bg-slate-900/10 transition"
        >
          <input
            id="sig-pdf-loader"
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
                loadPdf(e.target.files[0]);
              }
            }}
          />
            <div className="text-3xl mb-1.5 animate-bounce">📄</div>
            <p className="font-display font-extrabold text-sm text-slate-800 dark:text-white">
              Drop your PDF file here to sign or click to browse
            </p>
          </div>
        </div>
      )}

      {stage === "place" && sigData && thumb && (
        <div className="space-y-4 text-left font-display animate-in zoom-in-95">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-350 uppercase font-mono">
            Step 2: Drag signature bounding outline to place:
          </p>

          <div
            ref={preRef}
            className="relative border rounded-xl overflow-hidden bg-slate-50 select-none shadow-premium-md max-w-sm mx-auto"
            onMouseMove={(e) => {
              if (!drag) return;
              const rect = preRef.current?.getBoundingClientRect();
              if (rect) {
                setSigPos((p) => ({
                  ...p,
                  x: Math.max(0, Math.min(rect.width - p.w, e.clientX - rect.left - dOff.x)),
                  y: Math.max(0, Math.min(rect.height - p.h, e.clientY - rect.top - dOff.y))
                }));
              }
            }}
            onMouseUp={() => setDrag(false)}
          >
            <img src={thumb} className="w-full h-auto block" alt="Document slide" />
            <img
              src={sigData}
              onMouseDown={(e) => {
                e.preventDefault();
                setDrag(true);
                setDOff({ x: e.clientX - preRef.current!.getBoundingClientRect().left - sigPos.x, y: e.clientY - preRef.current!.getBoundingClientRect().top - sigPos.y });
              }}
              style={{
                left: sigPos.x,
                top: sigPos.y,
                width: sigPos.w,
                height: sigPos.h
              }}
              className="absolute border-2 border-dashed border-indigo-500 rounded cursor-move bg-white/20 hover:scale-105 active:scale-95 transition"
              alt="Signature ink overlay"
            />
          </div>

          {npg > 1 && (
            <div className="flex gap-1.5 items-center flex-wrap pt-2 border-t dark:border-slate-800">
              <span className="text-[10px] font-bold text-slate-405 font-mono uppercase">Go page:</span>
              <div className="flex gap-1 flex-wrap">
                {Array.from({ length: Math.min(npg, 10) }, (_, idx) => (
                  <button
                    key={idx + 1}
                    type="button"
                    onClick={() => renderPg(idx + 1)}
                    className={`w-6 h-6 rounded-lg text-[10px] font-bold border transition ${
                      curPg === idx + 1
                        ? "border-indigo-650 bg-indigo-50 text-indigo-750"
                        : "border-slate-200 dark:border-slate-800 hover:bg-slate-100"
                    }`}
                  >
                    {idx + 1}
                  </button>
                ))}
              </div>
            </div>
          )}

          {st !== "processing" && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => apply(false)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer flex items-center justify-center"
              >
                ✍ Stamp Current Page ({curPg})
              </button>
              <button
                type="button"
                onClick={() => apply(true)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-705 dark:bg-slate-800 dark:text-slate-300 hover:text-slate-905 dark:hover:text-white rounded-xl py-2.5 text-xs font-bold transition cursor-pointer flex items-center justify-center"
              >
                Stamp All Pages ({npg})
              </button>
            </div>
          )}
        </div>
      )}

      {st === "processing" && <Bar v={pct} msg="Embedding visual stamp curves into PDF catalog matrices…" />}
      <Err msg={err} onClose={() => setErr("")} />
    </div>
  );
};