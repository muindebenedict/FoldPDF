import React from "react";
import * as Lucide from "lucide-react";

interface AboutProps {
  navigate: (path: string) => void;
}

export default function AboutPage({ navigate }: AboutProps) {
  const coreValues = [
    {
      icon: <Lucide.ShieldCheck className="h-6 w-6 text-indigo-500" />,
      title: "1. Security & Privacy First",
      desc: "Most of our tools process files on your own computer. For the four tools that send files to our secure server for processing (Compress PDF, PDF to Word, PDF to PowerPoint, and PowerPoint to PDF), files are deleted immediately."
    },
    {
      icon: <Lucide.Key className="h-6 w-6 text-indigo-500" />,
      title: "2. Zero forced signups",
      desc: "Instant access to all workspace features without requiring a phone number, password, or credit card."
    },
    {
      icon: <Lucide.Smartphone className="h-6 w-6 text-indigo-500" />,
      title: "3. Works on Every Device",
      desc: "Optimized interfaces designed to work smoothly on mobile screens, tablets, and giant desktop monitors."
    },
    {
      icon: <Lucide.Sparkles className="h-6 w-6 text-indigo-500" />,
      title: "4. Constant Innovation",
      desc: "Proactively deploying simple, helpful file processing tools and document tools based on user feedback."
    }
  ];

  const roadmapSteps = [
    {
      phase: "Phase 1: Foundation",
      status: "Completed",
      desc: "Release over 25 core tools to let you merge, split, compress, and convert files safely."
    },
    {
      phase: "Phase 2: Offline OCR",
      status: "Active",
      desc: "Enable quick optical character recognition so you can copy and edit text inside scanned PDFs safely."
    },
    {
      phase: "Phase 3: Team Workspaces",
      status: "Upcoming",
      desc: "Build secure, local-first shared workspaces for teams to review and inspect files together."
    },
    {
      phase: "Phase 4: Simple AI Audit",
      status: "Upcoming",
      desc: "Embed secure document summary helpers, resume scanners, and legal translators using safe developer servers."
    }
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 font-sans animate-in fade-in duration-300 dark:bg-slate-950 dark:text-slate-100">
      
      {/* Header Banner */}
      <div className="text-center max-w-2xl mx-auto mb-16">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-100/30">
          <Lucide.User className="h-3.5 w-3.5" />
          Our Mission
        </span>
        <h1 className="mt-4 font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
          About FoldPDF & Our Vision
        </h1>
        <p className="mt-4 text-slate-500 dark:text-slate-400 text-sm sm:text-base leading-relaxed">
          We believe that document processing should be fast, easy, and completely secure for everyone.
        </p>
      </div>

      {/* Main Grid: Story & Values */}
      <div className="grid gap-8 lg:grid-cols-2 items-stretch mb-16">
        
        {/* Why FoldPDF Was Created */}
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 rounded-3xl p-6 sm:p-10 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-6">
              Why FoldPDF Was Created
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-350 leading-relaxed mb-6">
              Our founder, Benedict Muinde, built FoldPDF because he needed a simple way to merge PDFs without uploading them to random external servers. 
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-355 leading-relaxed mb-6">
              We grew tired of standard utility websites that are loaded with spam ads, demand forced premium registration walls, and send your sensitive documents to distant databases. 
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-355 leading-relaxed">
              We realized that modern browser technology is strong enough to process documents securely inside your own tab. FoldPDF exists to prove that safe, professional PDF utilities can run at lightspeed with zero file tracking.
            </p>
            <p className="text-xs text-slate-500 dark:text-indigo-400 mt-4 leading-normal font-normal">
              Four of our tools send files to our secure server for processing: Compress PDF, PDF to Word, PDF to PowerPoint, and PowerPoint to PDF. Your file is deleted immediately after you download.
            </p>
          </div>
        </div>

        {/* Core Values */}
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 rounded-3xl p-6 sm:p-10 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-6">
              Our Core Principles
            </h2>
            <div className="grid gap-6">
              {coreValues.map((val, id) => (
                <div key={id} className="flex gap-4">
                  <div className="shrink-0 p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 h-10 w-10 flex items-center justify-center">
                    {val.icon}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {val.title}
                    </h3>
                    <p className="text-xs text-slate-550 dark:text-slate-400 mt-1 leading-relaxed">
                      {val.desc}
                    </p>
                    {id === 0 && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-normal font-normal">
                        Four of our tools send files to our secure server for processing: Compress PDF, PDF to Word, PDF to PowerPoint, and PowerPoint to PDF. Your file is deleted immediately after you download.
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* Trust, Revenue & Contact Cards */}
      <div className="grid gap-6 md:grid-cols-2 mb-16">
        
        {/* Revenue Model */}
        <div className="bg-slate-50 dark:bg-slate-905 border border-slate-100 dark:border-slate-850 p-6 sm:p-8 rounded-2xl">
          <div className="flex gap-4 items-start">
            <div className="p-3 bg-white dark:bg-slate-800 rounded-2xl shadow-sm text-indigo-500 shrink-0">
              <Lucide.Coins className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                How We Make Money
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-350 leading-relaxed">
                We display quiet, non-intrusive advertisements sponsored by Google AdSense to pay for hosting and keep all 25+ tools free. We do not sell your personal files or telemetry history, and we may offer premium feature plans in the future.
              </p>
            </div>
          </div>
        </div>

        {/* Simple Trust Foundations */}
        <div className="bg-slate-50 dark:bg-slate-905 border border-slate-100 dark:border-slate-855 p-6 sm:p-8 rounded-2xl">
          <div className="flex gap-4 items-start">
            <div className="p-3 bg-white dark:bg-slate-800 rounded-2xl shadow-sm text-indigo-500 shrink-0">
              <Lucide.Mail className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                Need Support or Have Bugs?
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-350 leading-relaxed mb-3">
                If you encounter any issues or have feature feedback, please send an email directly to our human support mailbox.
              </p>
              <div className="flex flex-row items-center gap-2 sm:gap-3 flex-wrap">
                <a 
                  href="mailto:foldpdf.support@gmail.com" 
                  className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  foldpdf.support@gmail.com
                </a>
                <span className="text-slate-300 dark:text-slate-700 select-none">|</span>
                <button 
                  onClick={() => navigate("/contact")}
                  className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Contact Form
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Project Roadmap Grid */}
      <div className="mt-16">
        <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-center text-slate-900 dark:text-white mb-10">
          Project Development Roadmap
        </h2>
        <div className="grid gap-6 md:grid-cols-4">
          {roadmapSteps.map((step, id) => (
            <div key={id} className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 rounded-2xl p-5 shadow-sm relative flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {step.phase}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide border ${
                    step.status === "Completed" 
                      ? "bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/30"
                      : step.status === "Active"
                      ? "bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/30"
                      : "bg-slate-50 text-slate-500 border-slate-100 dark:bg-slate-850/40 dark:text-slate-400 dark:border-slate-800/40"
                  }`}>
                    {step.status}
                  </span>
                </div>
                <p className="text-xs font-bold text-slate-800 dark:text-white mb-2">
                  {step.phase.split(": ")[1]}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {step.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}