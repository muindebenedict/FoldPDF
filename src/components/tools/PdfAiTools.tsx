import React, { useState, useRef, useEffect } from "react";
import { readAB, extractText, fmt, dl, getOutputFile } from "./PdfScriptLoader";
import { Spin, Err, validateUploadedFiles } from "./SharedComponents";


interface ToolProps {
  onSuccess?: (fileName: string, toolName: string) => void;
  toolName: string;
}

const STOP = new Set("a an and are as at be been by for from had has have he her him his how i if in is it its me more my not of on or our said she so than that the their them then there they this to up was we were what when which who will with you your".split(" "));

const tok = (t: string): string[] => 
  t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));

const freq = (ws: string[]): Record<string, number> => {
  const f: Record<string, number> = {};
  for (const w of ws) f[w] = (f[w] || 0) + 1;
  return f;
};

/* AI SUMMARIZER */
export const AiSumTool = ({ onSuccess, toolName }: ToolProps) => {
  const [res, setRes] = useState<any>(null);
  const [st, setSt] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [err, setErr] = useState("");
  const [fileName, setFileName] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  const go = async (f: File) => {
    setFileName(f.name);
    setSt("processing");
    setErr("");
    try {
      const ab = await readAB(f);
      const { text, numPages } = await extractText(ab);
      if (text.trim().length < 40) throw new Error("No readable text found inside PDF. Scanned PDFs require the OCR Tool first.");

      const sents = text.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 30);
      const words = tok(text);
      const fr = freq(words);

      const scored = sents.map((s) => ({
        s,
        sc: tok(s).reduce((a, w) => a + (fr[w] || 0), 0) / (tok(s).length || 1)
      })).sort((a, b) => b.sc - a.sc);

      const top = scored.slice(0, 5).map((x) => x.s);
      const lt = text.toLowerCase();
      
      const types = [
        ["Resume / CV", ["experience", "education", "skills", "resume", "cv"]],
        ["Contract Agreement", ["agreement", "clause", "liability", "terminate", "warrant"]],
        ["Academic Research Paper", ["abstract", "methodology", "results", "conclusion", "research"]]
      ];
      
      let docType = "General Document Report";
      for (const [t, ws] of types as [string, string[]][]) {
        if (ws.filter((w) => lt.includes(w)).length >= 2) {
          docType = t;
          break;
        }
      }

      const keyTerms = Object.entries(fr).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w]) => w);
      
      const summaryResult = {
        exec: [sents[0], top[0]].filter(Boolean).join(". ").slice(0, 420) + ".",
        pts: top.slice(0, 5),
        docType,
        keyTerms,
        numPages,
        wc: words.length
      };

      setRes(summaryResult);
      setSt("done");
      if (onSuccess) onSuccess(f.name, toolName);

    } catch (e: any) {
      setErr(e.message || "Summarization failed.");
      setSt("error");
    }
  };

  const dlSummary = () => {
    if (!res) return;
    const summaryText = `FoldPDF AI Summary Report\n${"=".repeat(40)}\n` +
      `Category: ${res.docType}\nPages tracked: ${res.numPages}\nWord volume: ~${res.wc} words\n\n` +
      `EXECUTIVE SUMMARY:\n${res.exec}\n\n` +
      `PRIMARY HIGHLIGHTS:\n${res.pts.map((s: string, idx: number) => `${idx + 1}. ${s}`).join("\n")}\n\n` +
      `CORE INDEX KEY TERMS:\n${res.keyTerms.join(", ")}`;
    dl(new Blob([summaryText], { type: "text/plain" }), getOutputFile(fileName, "summary", ".txt"));
  };

  if (st === "done" && res) {
    return (
      <div className="text-left font-display animate-in zoom-in-95">
        <div className="bg-slate-50 dark:bg-slate-900 border dark:border-slate-800 p-5 rounded-2xl space-y-4">
          <div className="flex gap-2 flex-wrap">

            <span className="bg-indigo-50 text-indigo-700 dark:bg-indigo-955/40 dark:text-indigo-400 font-bold text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              🤖 {res.docType}
            </span>
            <span className="bg-slate-100 dark:bg-neutral-800 text-slate-500 rounded px-2 py-0.5 text-[10px] font-bold font-mono">
              {res.numPages} Pages
            </span>
            <span className="bg-slate-100 dark:bg-neutral-800 text-slate-500 rounded px-2 py-0.5 text-[10px] font-bold font-mono">
              {res.wc} Words
            </span>
          </div>

          <div>
            <h4 className="border-b dark:border-slate-800 pb-1 text-xs font-bold uppercase tracking-wider text-indigo-600 mb-2 font-mono">
              Executive Abstract
            </h4>
            <p className="text-xs leading-relaxed text-slate-650 dark:text-slate-300 font-medium">
              {res.exec}
            </p>
          </div>

          <div>
            <h4 className="border-b dark:border-slate-800 pb-1 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-350 mb-2 font-mono">
              Primary Extracted Points
            </h4>
            <ul className="space-y-2 text-xs">
              {res.pts.map((pt: string, idx: number) => (
                <li key={idx} className="flex gap-2 items-start text-slate-600 dark:text-slate-350 font-medium">
                  <span className="text-indigo-500 font-bold">→</span>
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="border-b dark:border-slate-800 pb-1 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-350 mb-2 font-mono">
              Vocabulary Core Indexes
            </h4>
            <div className="flex gap-1.5 flex-wrap">
              {res.keyTerms.map((t: string) => (
                <span key={t} className="bg-slate-100 dark:bg-neutral-800 border dark:border-slate-800 text-slate-600 dark:text-slate-450 text-[10px] font-bold font-mono px-2 py-0.5 rounded">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <button
            type="button"
            onClick={dlSummary}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
          >
            ⬇ Download Summary
          </button>
          <button
            type="button"
            onClick={() => { setSt("idle"); setRes(null); }}
            className="bg-slate-100 hover:bg-slate-200 text-slate-705 dark:bg-slate-800 dark:text-slate-300 hover:text-slate-905 dark:hover:text-white rounded-xl py-2.5 text-xs font-bold transition cursor-pointer"
          >
            Reset
          </button>
        </div>
      </div>
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
        onClick={() => ref.current?.click()}
        className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center cursor-pointer bg-slate-50/50 hover:border-indigo-400 dark:bg-slate-900/10 transition animate-in zoom-in-95"
      >
        <input
          ref={ref}
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
        <div className="text-3xl mb-1.5 animate-bounce">🤖</div>
        <p className="font-display font-extrabold text-sm text-slate-800 dark:text-white">
          AI Summarizer Reader
        </p>
        <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">
          Drop your PDF file here to extract abstract and key points
        </p>
      </div>

      {st === "processing" && <Spin msg="Processing local document abstract weight nodes…" />}
      <Err msg={err} onClose={() => setErr("")} />
    </div>
  );
};

/* AI CHAT WITH PDF */
export const AiChatTool = ({ onSuccess, toolName }: ToolProps) => {
  const [pdfTxt, setPdfTxt] = useState<string | null>(null);
  const [paras, setParas] = useState<string[]>([]);
  const [msgs, setMsgs] = useState<{ r: "ai" | "u"; t: string }[]>([]);
  const [inp, setInp] = useState("");
  const [loading, setLoading] = useState(false);
  const [npg, setNpg] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [chatId] = useState(() => `ai_chat_${Date.now()}`);
  const [activeFileName, setActiveFileName] = useState("");

  const load = async (f: File) => {
    setLoading(true);
    setActiveFileName(f.name);
    try {
      const ab = await readAB(f);
      const { text, numPages } = await extractText(ab);
      setPdfTxt(text);
      setNpg(numPages);
      setParas(text.split("\n\n").filter((p) => p.trim().length > 20));
      setMsgs([{ r: "ai", t: `Loaded **${f.name}** (${numPages} pages). I have mapped the text streams local layout. Go ahead with your questions!` }]);
      setLoading(false);
      if (onSuccess) onSuccess(f.name, toolName);
    } catch {
      setLoading(false);
    }
  };



  const ask = async () => {
    if (!inp.trim() || !pdfTxt) return;
    const q = inp.trim();
    setInp("");
    setMsgs((p) => [...p, { r: "u", t: q }]);
    setLoading(true);
    await new Promise((r) => setTimeout(r, 200));

    let ans = "";
    const ql = q.toLowerCase();
    
    if (/summary|summarize/i.test(ql)) {
      const ws = tok(pdfTxt);
      const fr = freq(ws);
      const ss = pdfTxt.split(/[.!?]+/).filter((s) => s.length > 25);
      const top = ss.map((s) => ({ s, sc: tok(s).reduce((a, w) => a + (fr[w] || 0), 0) / (tok(s).length || 1) })).sort((a, b) => b.sc - a.sc).slice(0, 2).map((x) => x.s);
      ans = "Dynamic Document Summary: " + top.join(". ") + ".";
    } else if (/pages|how many page/i.test(ql)) {
      ans = `Based on my structure parse of the catalog, this document has ${npg} page${npg !== 1 ? "s" : ""}.`;
    } else if (/words|word count/i.test(ql)) {
      ans = `This document contains approximately ${tok(pdfTxt).length} key index words.`;
    } else {
      const qt = tok(ql);
      const best = paras.map((p) => ({ p, sc: qt.filter((w) => tok(p).includes(w)).length })).sort((a, b) => b.sc - a.sc);
      if (best[0]?.sc > 0) {
        ans = best[0].p.slice(0, 420) + (best[0].p.length > 420 ? "…" : "");
      } else {
        const fw = Object.entries(freq(tok(pdfTxt))).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w);
        ans = `I couldn't locate references to that. The document contains heavy focus terms like **${fw.join(", ")}**. Consider reframing your query.`;
      }
    }

    setMsgs((p) => [...p, { r: "ai", t: ans }]);
    setLoading(false);
    setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
  };

  if (!pdfTxt) {
    return (
      <div className="w-full">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = (Array.from(e.dataTransfer.files) as File[]).find((fi) => fi.type === "application/pdf" || fi.name.endsWith(".pdf"));
            if (f) load(f);
          }}
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center cursor-pointer bg-slate-50/50 hover:border-indigo-400 dark:bg-slate-900/10 transition animate-in zoom-in-95"
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) load(e.target.files[0]);
            }}
          />
          <div className="text-3xl mb-1.5 animate-bounce">💬</div>
          <p className="font-display font-extrabold text-sm text-slate-800 dark:text-white">
            Sandbox Chat with PDF
          </p>
          <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">
            Drop your PDF file here to start immediate, secure chat session
          </p>
        </div>
        {loading && <Spin msg="Indexing PDF layout channels…" />}
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col h-96 font-display rounded-2xl overflow-hidden border dark:border-slate-800 animate-in zoom-in-95">
      <div className="flex-1 overflow-y-auto p-4 bg-slate-50/80 dark:bg-slate-950/70 flex flex-col gap-3">
        {msgs.map((m, idx) => (
          <div key={idx} className={`flex ${m.r === "u" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-xl px-3.5 py-2 text-xs font-semibold leading-relaxed break-all ${
              m.r === "u" ? "bg-indigo-600 text-white rounded-br-none" : "bg-white border dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-bl-none shadow-sm"
            }`}>
              {m.t.replace(/\*\*(.*?)\*\*/g, "$1")}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-1 items-center py-2">
            {[0, 0.15, 0.3].map((d) => (
              <span key={d} style={{ animationDelay: d + "s" }} className="w-2 h-2 bg-indigo-550 rounded-full animate-bounce" />
            ))}
          </div>
        )}
        <div ref={scrollRef} />
      </div>
      <div className="flex gap-2 p-2 bg-white dark:bg-slate-900 border-t dark:border-slate-850">
        <input
          value={inp}
          onChange={(e) => setInp(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") ask(); }}
          placeholder="Query document cells…"
          className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-205 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-bold focus:outline-none"
        />
        <button
          onClick={ask}
          disabled={!inp.trim() || loading}
          className="bg-indigo-600 hover:bg-indigo-705 text-white w-9 h-9 flex items-center justify-center rounded-lg border-none cursor-pointer text-sm shrink-0"
        >
          →
        </button>
      </div>
    </div>
  );
};

/* RESUME ANALYZER */
export const ResumeTool = ({ onSuccess, toolName }: ToolProps) => {
  const [res, setRes] = useState<any>(null);
  const [st, setSt] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [err, setErr] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  const go = async (f: File) => {
    setSt("processing");
    setErr("");
    try {
      const ab = await readAB(f);
      const { text } = await extractText(ab);
      if (text.length < 50) throw new Error("Could not parse text levels.");

      const lt = text.toLowerCase();
      const wc = text.split(/\s+/).filter(Boolean).length;
      
      const secs = {
        experience: /\b(experience|history|employment|work|career)\b/i,
        education: /\b(education|degree|university|academic|college|school)\b/i,
        skills: /\b(skills|technologies|tools|competencies)\b/i,
        summary: /\b(summary|profile|objective|statement)\b/i
      };
      
      const verbs = ["managed", "developed", "led", "created", "built", "designed", "increased", "reduced", "delivered", "improved", "launched", "achieved", "coordinated", "implemented"];
      
      const secF = Object.fromEntries(Object.entries(secs).map(([k, regex]) => [k, regex.test(text)]));
      const foundCount = Object.values(secF).filter(Boolean).length;
      const verbCount = verbs.filter((v) => lt.includes(v)).length;

      const sugg = [];
      if (!secF.summary) sugg.push("➕ Add an Executive Professional Summary section");
      if (!secF.skills) sugg.push("➕ Add a dedicated Technical Skills section");
      if (verbCount < 3) sugg.push("💪 Use action words (e.g. built, scaled, managed, executed)");
      if (wc < 220) sugg.push("📝 Content volume is sparse. Expand on key accomplishments");
      if (wc > 850) sugg.push("✂️ Resume exceeds single-page length limit. Optimize phrasing");
      if (!secF.experience) sugg.push("💼 Document is missing Work Experience timeline boundaries");
      if (!/\d+%|\d+x|\$\d+/.test(text)) sugg.push("📊 Quantify accomplishments (e.g. boosted clicks by 40%)");

      const fmtSc = Math.round((foundCount / 4) * 100);
      const cntSc = Math.min(100, verbCount * 12 + (/\d/.test(text) ? 20 : 0));
      const lenSc = wc >= 200 && wc <= 650 ? 100 : wc < 200 ? Math.round(wc / 2) : Math.max(35, 100 - Math.round((wc - 650) / 10));

      const parsedOutput = {
        fmtSc,
        cntSc,
        lenSc,
        overall: Math.round((fmtSc + cntSc + lenSc) / 3),
        sugg,
        wc,
        verbCount
      };

      setRes(parsedOutput);
      setSt("done");
      if (onSuccess) onSuccess(f.name, toolName);


    } catch (e: any) {
      setErr(e.message || "Parse crash.");
      setSt("error");
    }
  };

  const SBar = ({ label, sc }: { label: string; sc: number }) => (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1 font-bold">
        <span className="text-slate-700 dark:text-slate-350">{label}</span>
        <span className={sc >= 70 ? "text-emerald-600" : sc >= 40 ? "text-amber-500" : "text-rose-500"}>{sc}/100</span>
      </div>
      <div className="h-2 bg-slate-100 dark:bg-neutral-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-600 ${
            sc >= 70 ? "bg-emerald-600" : sc >= 40 ? "bg-amber-500" : "bg-rose-500"
          }`}
          style={{ width: sc + "%" }}
        />
      </div>
    </div>
  );

  if (st === "done" && res) {
    return (
      <div className="font-display text-left animate-in zoom-in-95">

        <div className="flex flex-col items-center mb-4">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-xl font-extrabold"
            style={{
              background: `conic-gradient(${res.overall >= 70 ? "#10b981" : "#f59e0b"} ${res.overall * 3.6}deg, #f1f5f9 0deg)`
            }}
          >
            <div className="w-16 h-16 bg-white dark:bg-slate-905 rounded-full flex items-center justify-center text-slate-800 dark:text-white font-extrabold">
              {res.overall}
            </div>
          </div>
          <p className="text-xs font-extrabold mt-1.5 uppercase font-mono tracking-wider text-slate-500">Overall ATS Score</p>
        </div>

        <SBar label="Header Format Alignment" sc={res.fmtSc} />
        <SBar label="Content Action Impact" sc={res.cntSc} />
        <SBar label="Optimal Length" sc={res.lenSc} />

        <div className="bg-slate-50 dark:bg-slate-900/40 p-4 border dark:border-slate-800 rounded-2xl mt-4 font-display">
          <p className="text-xs font-bold text-slate-750 dark:text-slate-300 uppercase mb-2 font-mono">
            Optimized Improvement list:
          </p>
          <div className="space-y-1 bg-white dark:bg-neutral-950 p-3 rounded-xl border dark:border-slate-800">
            {res.sugg.length ? (
              res.sugg.map((s: string, idx: number) => (
                <p key={idx} className="text-xs font-semibold text-slate-650 dark:text-slate-400 leading-relaxed">
                  {s}
                </p>
              ))
            ) : (
              <p className="text-xs text-emerald-600 font-bold">✓ Structure looks beautifully calibrated for standard ATS parses!</p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => { setSt("idle"); setRes(null); }}
          className="w-full mt-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-850 dark:text-slate-350 rounded-xl py-2.5 text-xs font-bold transition cursor-pointer"
        >
          Analyze Alternate Resume
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = (Array.from(e.dataTransfer.files) as File[]).find((fi) => fi.type === "application/pdf" || fi.name.endsWith(".pdf"));
          if (f) go(f);
        }}
        onClick={() => ref.current?.click()}
        className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center cursor-pointer bg-slate-50/50 hover:border-indigo-400 dark:bg-slate-900/10 transition animate-in zoom-in-95"
      >
        <input
          ref={ref}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) go(e.target.files[0]);
          }}
        />
        <div className="text-3xl mb-1.5 animate-bounce">👔</div>
        <p className="font-display font-extrabold text-sm text-slate-800 dark:text-white">
          AI Resume ATS Optimizer
        </p>
        <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">
          Drop your PDF CV file here or click to browse
        </p>
      </div>

      {st === "processing" && <Spin msg="Processing local document abstract weight nodes…" />}
      <Err msg={err} onClose={() => setErr("")} />
    </div>
  );
};

/* CONTRACT LEGAL SIMPLIFIER */
const LEGAL_TERMS: Record<string, string> = {
  "hereinafter": "from this point forward",
  "indemnify": "protect from legal liability",
  "indemnification": "protection from claims",
  "warranty": "guarantee",
  "warranties": "guarantees",
  "liability": "legal responsibility",
  "force majeure": "uncontrollable events",
  "termination": "ending the agreement",
  "breach": "breaking the agreement",
  "pursuant": "according to",
  "hereof": "of this agreement",
  "therein": "in that document",
  "notwithstanding": "regardless of",
  "heretofore": "before this",
  "shall": "must",
  "duly": "properly",
  "forthwith": "immediately",
  "aforementioned": "previously mentioned"
};

export const ContractTool = ({ onSuccess, toolName }: ToolProps) => {
  const [res, setRes] = useState<any>(null);
  const [st, setSt] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [err, setErr] = useState("");
  const [fileName, setFileName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const go = async (f: File) => {
    setFileName(f.name);
    setSt("processing");
    setErr("");
    try {
      const ab = await readAB(f);
      const { text } = await extractText(ab);
      if (text.length < 50) throw new Error("No readable text structures located");

      const paras = text.split("\n\n").filter((p) => p.trim().length > 40);
      const highlights: any[] = [];
      const simplifies: string[] = [];

      for (const p of paras.slice(0, 16)) {
        const jargonWords: any[] = [];
        let simplifiedParagraph = p;
        for (const [jargon, explanation] of Object.entries(LEGAL_TERMS)) {
          const regex = new RegExp("\\b" + jargon + "\\b", "gi");
          if (regex.test(p)) {
            jargonWords.push({ jargon, explanation });
            simplifiedParagraph = simplifiedParagraph.replace(regex, `[${explanation}]`);
          }
        }
        highlights.push({ text: p, jargon: jargonWords });
        simplifies.push(simplifiedParagraph);
      }

      const activeCount = Object.keys(LEGAL_TERMS).filter((term) => text.toLowerCase().includes(term)).length;
      setRes({
        highlights,
        simplifies,
        count: activeCount
      });
      setSt("done");
      if (onSuccess) onSuccess(f.name, toolName);
    } catch (e: any) {
      setErr(e.message || "Simplified process failed.");
      setSt("error");
    }
  };

  const dlSimplified = () => {
    if (!res) return;
    const cleanOutput = res.simplifies.join("\n\n");
    dl(new Blob([cleanOutput], { type: "text/plain" }), getOutputFile(fileName, "simplified", ".txt"));
  };

  if (st === "done" && res) {
    return (
      <div className="font-display text-left animate-in zoom-in-95">
        <p className="text-xs text-slate-500 font-semibold mb-3">
          Parsed {res.count} legalese parameters · Hover over dotted lines to display human explanations:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-50 border dark:border-slate-800 p-3.5 rounded-xl max-h-56 overflow-y-auto">
            <h5 className="text-[10px] font-extrabold uppercase font-mono tracking-wider text-slate-400 mb-2">Original Clauses</h5>
            {res.highlights.slice(0, 8).map((p: any, idx: number) => {
              const regex = new RegExp("(" + Object.keys(LEGAL_TERMS).join("|") + ")", "gi");
              const parts = p.text.split(regex);
              return (
                <p key={idx} className="text-xs text-slate-600 dark:text-slate-350 leading-relaxed max-w-sm mb-3 font-medium">
                  {parts.map((part: string, subIdx: number) => {
                    const key = part.toLowerCase();
                    const explain = LEGAL_TERMS[key];
                    if (explain) {
                      return (
                        <mark key={subIdx} title={explain} className="bg-amber-100/70 border-b border-dashed border-amber-600 cursor-help rounded-sm px-0.5 select-none font-bold text-slate-800">
                          {part}
                        </mark>
                      );
                    }
                    return part;
                  })}
                </p>
              );
            })}
          </div>

          <div className="bg-emerald-50/20 border border-emerald-150 p-3.5 rounded-xl max-h-56 overflow-y-auto">
            <h5 className="text-[10px] font-extrabold uppercase font-mono tracking-wider text-emerald-600 mb-2">Plain English Clauses</h5>
            {res.simplifies.slice(0, 8).map((p: string, idx: number) => (
              <p key={idx} className="text-xs leading-relaxed max-w-sm mb-3 font-semibold text-slate-650 dark:text-slate-300">
                {p}
              </p>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <button
            type="button"
            onClick={dlSimplified}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
          >
            ⬇ Download Simplified
          </button>
          <button
            type="button"
            onClick={() => { setSt("idle"); setRes(null); }}
            className="bg-slate-100 hover:bg-slate-200 text-slate-705 dark:bg-slate-800 dark:text-slate-300 hover:text-slate-905 dark:hover:text-white rounded-xl py-2.5 text-xs font-bold transition cursor-pointer"
          >
            Reset
          </button>
        </div>
      </div>
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
        <div className="text-3xl mb-1.5 animate-bounce">⚖️</div>
        <p className="font-display font-extrabold text-sm text-slate-800 dark:text-white">
          AI Legal Plain-English Simplifier
        </p>
        <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">
          Drop your Contract PDF file here to clarify legalese jargon
        </p>
      </div>

      {st === "processing" && <Spin msg="Simplifying legalese matrices…" />}
      <Err msg={err} onClose={() => setErr("")} />
    </div>
  );
};