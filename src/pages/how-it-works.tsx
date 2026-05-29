import React from "react";
import * as Lucide from "lucide-react";

interface HowItWorksProps {
  navigate: (path: string) => void;
}

export default function HowItWorksPage({ navigate }: HowItWorksProps) {
  const compilationSteps = [
    {
      num: "01",
      title: "File Loading & Allocation",
      desc: "When you drag a file into the tool, FoldPDF parses its raw binary stream into a localized volatile JavaScript ArrayBuffer. Under no condition are these raw bytes transmitted to external disks."
    },
    {
      num: "02",
      title: "Local WASM Parsing",
      desc: "Our native C++ and Rust compiled WebAssembly engine triggers locally in your browser. This isolates the PDF structural trees and begins processing page parameters in microseconds."
    },
    {
      num: "03",
      title: "Dynamic Transformations",
      desc: "Adjustments (compression, watermarking, merges) compile directly within the browser's sandbox. It runs calculations purely on your workstation hardware."
    },
    {
      num: "04",
      title: "Instant RAM Purging",
      desc: "Once the output file triggers download, the page garbage collection routines purge the active ArrayBuffer from temporary memory. Your data vanishes instantly on tab close."
    }
  ];

  const comparisons = [
    {
      feature: "File Transmission Secure",
      local: "100% Secure (Files never stream outward)",
      cloud: "Vulnerable (Transmitted over public networks)",
      icon: <Lucide.Network className="h-4.5 w-4.5 text-emerald-500" />
    },
    {
      feature: "Risk of Data Breach",
      local: "0% (No servers, databases, or cloud storage)",
      cloud: "High (Server databases store and cache copies)",
      icon: <Lucide.ShieldAlert className="h-4.5 w-4.5 text-indigo-505" />
    },
    {
      feature: "Processing Delay / Speed",
      local: "Sub-second (Local GPU & RAM calculations)",
      cloud: "Lags (Queues, upload bandwidth, and downloads)",
      icon: <Lucide.Zap className="h-4.5 w-4.5 text-amber-500" />
    },
    {
      feature: "HIPAA & GDPR Compliance",
      local: "Guaranteed (Stateless architecture, zero cookies)",
      cloud: "Complex (Demands detailed BAAs and storage logs)",
      icon: <Lucide.FileCheck className="h-4.5 w-4.5 text-teal-500" />
    },
    {
      feature: "Offline Compatibility",
      local: "Yes (Runs fully without internet connections)",
      cloud: "No (Requires active servers to process)",
      icon: <Lucide.CloudOff className="h-4.5 w-4.5 text-rose-500" />
    }
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 font-body animate-in fade-in duration-300 dark:bg-slate-950 dark:text-slate-100">
      
      {/* Page Header */}
      <div className="text-center max-w-2xl mx-auto mb-16">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-55 text-indigo-650 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-100/30">
          <Lucide.Settings className="h-3.5 w-3.5" />
          Under the Hood Runtimes
        </span>
        <h1 className="mt-4 font-display text-4xl sm:text-5.5xl font-extrabold tracking-tight text-slate-800 dark:text-white leading-[1.1]">
          How Browser-Based PDF Processing Works
        </h1>
        <p className="mt-4 text-slate-505 dark:text-slate-405 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
          FoldPDF does not process documents like traditional cloud software. Learn how WebAssembly and browser sandboxing enable high-fidelity manipulations entirely within your browser.
        </p>
      </div>

      {/* Visual Workflow Stage */}
      <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 rounded-3xl p-6 sm:p-10 shadow-premium-md mb-16">
        <div className="grid gap-8 lg:grid-cols-2 items-center">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-black text-slate-850 dark:text-white mb-4">
              Our Zero-Knowledge Workflow Model
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
              Unlike typical SaaS utilities that force uploads onto remote hosts, FoldPDF turns your web browser into an isolated, hyper-secure document workstation. By shifting execution loads to your local hardware, we prevent data leakage and bypass server wait queues.
            </p>
            <div className="border-l-4 border-indigo-500 dark:border-indigo-400 bg-indigo-50/40 dark:bg-indigo-955/20 p-4 rounded-r-2xl text-xs text-slate-600 dark:text-slate-350">
              💡 <strong>Developer audit note:</strong> All file reading, conversion, and assembly operates in-memory. No document content is ever sent to any remote server or API endpoint.
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <Lucide.Cpu className="h-4 w-4" /> Internal Processing Stack
            </h3>
            <div className="space-y-4">
              <div className="flex gap-3 bg-slate-50 dark:bg-slate-905 p-3 rounded-2xl border border-slate-100 dark:border-slate-850">
                <div className="h-8 w-8 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-indigo-500 shadow-sm shrink-0">W</div>
                <div>
                  <h4 className="text-xs font-extrabold text-slate-800 dark:text-white">WebAssembly (WASM) Module</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-404 mt-0.5">Executes heavy layout rendering and file compilation using C++ routines compiled natively for web browsers.</p>
                </div>
              </div>
              <div className="flex gap-3 bg-slate-50 dark:bg-slate-905 p-3 rounded-2xl border border-slate-100 dark:border-slate-850">
                <div className="h-8 w-8 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-indigo-500 shadow-sm shrink-0">H</div>
                <div>
                  <h4 className="text-xs font-extrabold text-slate-800 dark:text-white">Volatile RAM Sandbox</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-404 mt-0.5">Keeps all extracted text layers, graphic vector frames, and metadata isolated strictly inside temporary memory arrays.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Step Grid */}
      <div className="mb-16">
        <h3 className="font-display text-xl sm:text-2.5xl font-black text-slate-850 dark:text-white mb-8 text-center">
          Step-by-Step Security Pipeline
        </h3>
        <div className="grid gap-6 md:grid-cols-4">
          {compilationSteps.map((step, id) => (
            <div key={id} className="relative bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 rounded-2xl p-5 shadow-premium-sm">
              <span className="absolute top-4 right-4 text-xl font-extrabold text-indigo-100 dark:text-slate-800 tracking-tighter">
                {step.num}
              </span>
              <h4 className="text-sm font-extrabold text-slate-800 dark:text-white mb-2 pr-6">
                {step.title}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Local vs Cloud Comparison Grid Table */}
      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-6 sm:p-8 rounded-3xl">
        <h3 className="font-display text-xl sm:text-2xl font-black text-slate-855 dark:text-white mb-3">
          SaaS Technical Comparison: Edge vs. Cloud
        </h3>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-404 leading-relaxed mb-6">
          Compare the technical details of local edge compilers like FoldPDF with traditional server-based cloud conversion models.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-bold tracking-widest">
                <th className="py-3 px-2">Key Criteria</th>
                <th className="py-3 px-2">Local-First (FoldPDF)</th>
                <th className="py-3 px-2">Cloud-Based (Typical SaaS)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150 dark:divide-slate-850">
              {comparisons.map((row, id) => (
                <tr key={id} className="text-slate-650 dark:text-slate-350 hover:bg-white/40 dark:hover:bg-slate-850/20">
                  <td className="py-3.5 px-2 font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                    {row.icon}
                    {row.feature}
                  </td>
                  <td className="py-3.5 px-2 text-emerald-600 dark:text-emerald-400 font-bold">{row.local}</td>
                  <td className="py-3.5 px-2 text-rose-500 dark:text-rose-400">{row.cloud}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
