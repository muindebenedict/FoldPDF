import React from "react";
import * as Lucide from "lucide-react";

interface AboutProps {
  navigate: (path: string) => void;
}

export default function AboutPage({ navigate }: AboutProps) {
  const values = [
    {
      icon: <Lucide.Zap className="h-6 w-6 text-indigo-500" />,
      title: "1. Speed & Precision",
      desc: "Instant client-side compile targets completing inside fractions of seconds—eliminating all public server queue waits completely."
    },
    {
      icon: <Lucide.ShieldCheck className="h-6 w-6 text-indigo-500" />,
      title: "2. Absolute Privacy-First",
      desc: "Zero-knowledge processing where documents never lease external network threads, conforming to standards such as HIPAA, GDPR, and SOC-2 specifications."
    },
    {
      icon: <Lucide.Activity className="h-6 w-6 text-indigo-500" />,
      title: "3. Open Access",
      desc: "Delivering core PDF services 100% free with premium interfaces, bypass of signup walls, and clear, functional outcomes."
    },
    {
      icon: <Lucide.Sparkles className="h-6 w-6 text-indigo-500" />,
      title: "4. Constant Innovation",
      desc: "Integrating state-of-the-art Google Gemini models for deep, locally proxy-routed document AI audits."
    }
  ];

  const roadmapSteps = [
    { phase: "Phase 1: Foundation", status: "Completed", desc: "Release over 25 core client-side converter utilities with high-performance WebAssembly runtimes." },
    { phase: "Phase 2: AI Autopilot", status: "Current", desc: "Embed real-time document summarizers, ATS resume checkers, and legalese simplifiers via secure Express APIs." },
    { phase: "Phase 3: Zero-knowledge OCR", status: "Active", desc: "Enable full offline optical character recognition running entirely on browser WebGL layers." },
    { phase: "Phase 4: Collaborative Sync", status: "Upcoming", desc: "Build secure, local-first end-to-end encrypted rooms for team document evaluations." }
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 font-body animate-in fade-in duration-300 dark:bg-slate-950 dark:text-slate-100">
      
      {/* Title Segment */}
      <div className="text-center max-w-2xl mx-auto mb-16">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-606 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-150/35">
          <Lucide.Flag className="h-3.5 w-3.5" />
          Our Mission & Legacy
        </span>
        <h1 className="mt-4 font-display text-4xl sm:text-5.5xl font-extrabold tracking-tight text-slate-800 dark:text-white leading-[1.1]">
          The FoldPDF Story & Values
        </h1>
        <p className="mt-4 text-slate-500 dark:text-slate-400 text-sm sm:text-base max-w-xl mx-auto">
          We are redefining simple document utilities. No registrations, no cookie-cutter scripts, just pristine layout code and local compilers.
        </p>
      </div>

      {/* Why FoldPDF Was Created & Our Mission */}
      <div className="grid gap-10 lg:grid-cols-2 mb-16 items-center">
        <div>
          <h2 className="font-display text-2xl sm:text-3.5xl font-black text-slate-850 dark:text-white mb-4">
            Why FoldPDF Was Created
          </h2>
          <p className="text-xs sm:text-sm text-slate-555 dark:text-slate-400 leading-relaxed mb-4">
            Our founding software engineers were tired of standard utility websites that are loaded with spam ads, demand forced premium registration walls, and show zero modern AI intelligence while sending sensitive documents to unencrypted servers.
            <br /><br />
            We realized that browser technology had matured enough to compile full, complex vector and raster math compilers into clients. We launched FoldPDF to prove that secure utilities could operate at lightning speeds with zero file caching.
          </p>
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-955/20 dark:to-purple-955/20 rounded-2xl p-4 border border-indigo-100/30">
            <h4 className="text-xs font-bold text-slate-850 dark:text-white flex items-center gap-1.5"><Lucide.Fingerprint className="h-4.5 w-4.5 text-indigo-500" /> The Sovereign Data Commitment</h4>
            <p className="text-xs text-slate-450 mt-1">
              "Every individual holds absolute copyright sovereignty over their data. Standard file transfers represents a system risk, and FoldPDF commits to maintaining zero-storage models."
            </p>
          </div>
        </div>

        {/* How It Works */}
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-805 rounded-3xl p-6 sm:p-8 shadow-premium-sm">
          <h3 className="font-display text-xl font-bold text-slate-805 dark:text-white mb-4 flex items-center gap-2">
            <Lucide.Cpu className="h-5.5 w-5.5 text-indigo-500" />
            How It Works (Under The Hood)
          </h3>
          <p className="text-xs sm:text-sm text-slate-505 dark:text-slate-400 leading-relaxed">
            Our platform isolates document processing to browser scopes using three layers:
          </p>
          <ul className="mt-4 space-y-4 text-xs">
            <li className="flex gap-2.5">
              <div className="h-5 w-5 rounded-full bg-indigo-50 text-indigo-500 font-extrabold flex items-center justify-center shrink-0">1</div>
              <div>
                <strong className="text-slate-800 dark:text-white">WebAssembly Bundles:</strong> High performance C++ PDF layouts compile into optimized WASM payloads, running locally in browser memory.
              </div>
            </li>
            <li className="flex gap-2.5">
              <div className="h-5 w-5 rounded-full bg-indigo-50 text-indigo-500 font-extrabold flex items-center justify-center shrink-0">2</div>
              <div>
                <strong className="text-slate-800 dark:text-white">Volatile Heap Buffers:</strong> File arrays remain within a temporary JS heap. Purging tab connections commands browsers to instantly recycle all data.
              </div>
            </li>
            <li className="flex gap-2.5">
              <div className="h-5 w-5 rounded-full bg-indigo-50 text-indigo-500 font-extrabold flex items-center justify-center shrink-0">3</div>
              <div>
                <strong className="text-slate-800 dark:text-white">Secure Proxy Gateways:</strong> Whenever smart-AI tools audit documents, text slices transmit via temporary secure channels that avoid storage disks completely.
              </div>
            </li>
          </ul>
        </div>
      </div>

      {/* Our Values (4 Cards) */}
      <div className="mb-20">
        <h3 className="font-display text-2xl font-black text-slate-850 dark:text-white mb-10 text-center">
          Our Values
        </h3>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {values.map((v, i) => (
            <div key={i} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-150 dark:border-slate-850 shadow-premium-sm">
              <div className="mb-3">{v.icon}</div>
              <h4 className="text-sm font-bold text-slate-850 dark:text-white mb-1.5">{v.title}</h4>
              <p className="text-xs leading-relaxed text-slate-505 dark:text-slate-405">{v.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Trust & Transparency */}
      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-6 sm:p-8 rounded-3xl mb-20">
        <div className="grid gap-8 lg:grid-cols-12 items-center">
          <div className="lg:col-span-8">
            <h3 className="font-display text-xl sm:text-2.5xl font-black text-slate-850 dark:text-white mb-2">
              Trust & Transparency Index
            </h3>
            <p className="text-xs sm:text-sm text-slate-555 dark:text-slate-400 leading-relaxed">
              We believe technology platforms should prove their statements. Our layout operates cleanly with complete frontend audit access. If you have security concerns under medical or corporate parameters, you can check active network connections in your browser DevTools Console to confirm that files never leave your system.
            </p>
          </div>
          <div className="lg:col-span-4 flex justify-center">
            <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 px-4 py-2 rounded-xl text-xs font-bold border border-emerald-300/30 shadow-sm shrink-0">
              <Lucide.CheckCircle2 className="h-4.5 w-4.5" /> Checked & Verified
            </span>
          </div>
        </div>
      </div>

      {/* Roadmap Progression Segment */}
      <div className="mb-20">
        <h3 className="font-display text-2xl font-black text-slate-850 dark:text-white mb-10 text-center">
          Project Development Roadmap
        </h3>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {roadmapSteps.map((step, idx) => (
            <div key={idx} className="relative bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-150 dark:border-slate-850 shadow-premium-sm flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[10px] uppercase font-bold text-slate-400">{step.phase}</span>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase shrink-0 ${
                    step.status === "Completed" ? "bg-emerald-105 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400" :
                    step.status === "Current" ? "bg-indigo-100 text-indigo-650 dark:bg-indigo-950/30 dark:text-indigo-400" :
                    "bg-slate-100 text-slate-450 dark:bg-slate-800 dark:text-slate-500"
                  }`}>
                    {step.status}
                  </span>
                </div>
                <h4 className="text-sm font-bold text-slate-805 dark:text-white mb-2">{step.desc}</h4>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Contact CTA banner */}
      <div className="bg-gradient-to-tr from-indigo-600 to-indigo-800 text-white rounded-3xl p-8 sm:p-10 text-center shadow-premium-lg">
        <h3 className="font-display text-2xl sm:text-3.5xl font-extrabold mb-4 leading-none">
          Do You Require Custom Features?
        </h3>
        <p className="text-indigo-100 text-xs sm:text-sm max-w-sm sm:max-w-md mx-auto mb-6 leading-relaxed">
          Our document engineering group maintains active development cycles. Connect with support to pitch ideas or flag layout bugs.
        </p>
        <button 
          onClick={() => navigate("/contact")}
          className="rounded-full bg-white text-indigo-655 text-xs sm:text-sm font-extrabold px-6 py-3 cursor-pointer hover:bg-slate-50 transition shadow-md"
        >
          Contact Support Staff
        </button>
      </div>

    </div>
  );
}
