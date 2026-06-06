import React, { useState } from "react";
import * as Lucide from "lucide-react";

interface SecurityHubProps {
  navigate: (path: string) => void;
}

export default function SecurityHub({ navigate }: SecurityHubProps) {
  const [checklist, setChecklist] = useState({
    useLocalOnly: true,
    restrictNetwork: true,
    clearHistory: true,
    inspectMata: false
  });

  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  const securityFaqs = [
    {
      q: "If files are processed in my browser, is my device hardware compromised?",
      a: "Not at all. Our client-side WebAssembly parser is carefully sandboxed inside standard modern browser engines, utilizing only basic worker threads. It performs standard mathematical computations without reading external device processes."
    },
    {
      q: "Do you retain any record of file metadata or user names?",
      a: "No! We do not log filenames, text queries, page numbers, IP addresses, or conversion timestamps. Your interactions with FoldPDF remain totally anonymous."
    },
    {
      q: "Does FoldPDF require any subscription for enterprise operations?",
      a: "Core operations inside FoldPDF are, and will remain, 100% free and open for public use, ensuring students, clinicians, and corporate legal departments can convert files without friction."
    }
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 font-body animate-in fade-in duration-300 dark:bg-slate-950 dark:text-slate-100">
      
      {/* Title Header Section */}
      <div className="text-center max-w-3xl mx-auto mb-16">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-605 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200/30">
          <Lucide.ShieldCheck className="h-3.5 w-3.5 text-emerald-555" />
          Enterprise-Grade Protection Framework
        </span>
        <h1 className="mt-4 font-display text-4xl sm:text-5.5xl font-extrabold tracking-tight text-slate-800 dark:text-white leading-[1.1]">
          Security Hub & <span className="text-indigo-650 dark:text-indigo-400">Zero-Knowledge Architecture</span>
        </h1>
        <p className="mt-4 text-slate-500 dark:text-slate-400 text-sm sm:text-base max-w-xl mx-auto">
          Learn how our client-side sandbox completely transforms standard PDF handling. Absolute security by engineering design—files never touch our databases.
        </p>
      </div>

      {/* Grid: How Browser Processing Works & Why Files Never Uploaded */}
      <div className="grid gap-8 lg:grid-cols-2 mb-16">
        
        {/* How Browser-Based Processing Works */}
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/80 rounded-3xl p-6 sm:p-8 shadow-premium-sm flex flex-col justify-between">
          <div>
            <div className="h-11 w-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4">
              <Lucide.Cpu className="h-5.5 w-5.5" />
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-extrabold text-slate-805 dark:text-white mb-3">
              How Browser-Based Processing Works
            </h2>
            <p className="text-xs sm:text-sm text-slate-555 dark:text-slate-450 leading-relaxed space-y-3">
              Most competitive portals act as a proxy: they require you to transmit documents over standard networks onto their servers. That means those documents reside on third-party physical servers.
              <br /><br />
              <strong>FoldPDF is the exact opposite.</strong> We compile PDF parsing and rendering engines directly into high-fidelity WebAssembly packages. When you load a tool page, WebAssembly mounts a private sandbox execution area inside your computer's local RAM. Your files are decrypted, edited, and recomposed right inside your browser window. No data travels over physical wires.
            </p>
          </div>
          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-850">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Lucide.Activity className="h-3.5 w-3.5 text-emerald-500" />
              100% Client-Side Sandboxing
            </span>
          </div>
        </div>

        {/* Why Files Are Never Uploaded */}
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/80 rounded-3xl p-6 sm:p-8 shadow-premium-sm flex flex-col justify-between">
          <div>
            <div className="h-11 w-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4">
              <Lucide.Network className="h-5.5 w-5.5" />
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-extrabold text-slate-805 dark:text-white mb-3">
              Zero Network Transfers
            </h2>
            <p className="text-xs sm:text-sm text-slate-555 dark:text-slate-450 leading-relaxed">
              Because all calculations happen locally in temporary RAM, FoldPDF completely eliminates the risk of interception. Closing your browser tab immediately garbage-collects all memory buffers, erasing any trace of your activity automatically.
              <br /><br />
              This approach protects students, clinical physicians, corporate legal counsel, and banking executives from security exposure. No backend database handles client documents, establishing an unbreakable privacy shield.
            </p>
          </div>
          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-850 flex items-center justify-between text-xs font-bold text-indigo-600 dark:text-indigo-400">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Lucide.Lock className="h-3.5 w-3.5 text-indigo-500" />
              Military-Grade Privacy Shield
            </span>
            <button onClick={() => navigate("/")} className="hover:underline flex items-center shrink-0">
              Try a Tool <Lucide.ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

      </div>

      {/* Feature grid: Zero-Knowledge Privacy Architecture */}
      <div className="mb-16">
        <h3 className="font-display text-xl sm:text-2.5xl font-extrabold text-slate-800 dark:text-white mb-8 text-center">
          Zero-Knowledge Privacy Architecture
        </h3>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          
          <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 p-5 rounded-2xl shadow-premium-sm">
            <Lucide.FolderMinus className="h-8 w-8 text-indigo-550 mb-3" />
            <h4 className="text-sm font-bold text-slate-850 dark:text-white">RAM-Only Execution</h4>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Files exist in sandboxed memory. Purged completely from global state arrays the millisecond of task completions.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 p-5 rounded-2xl shadow-premium-sm">
            <Lucide.UserMinus className="h-8 w-8 text-indigo-550 mb-3" />
            <h4 className="text-sm font-bold text-slate-850 dark:text-white">No Tracking Registries</h4>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              No forms, emails, or user profiles are demanded to perform core document actions, establishing secure environments.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 p-5 rounded-2xl shadow-premium-sm">
            <Lucide.EyeOff className="h-8 w-8 text-indigo-550 mb-3" />
            <h4 className="text-sm font-bold text-slate-850 dark:text-white">Zero Cloud Logs</h4>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Internal proxy routes completely strip telemetry coordinates, ensuring total anonymity.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 p-5 rounded-2xl shadow-premium-sm">
            <Lucide.ShieldCheck className="h-8 w-8 text-indigo-550 mb-3" />
            <h4 className="text-sm font-bold text-slate-850 dark:text-white">Active Cryptography</h4>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Maintains secure standard cryptographic keys and structures locally, rendering data leakage mathematically impossible.
            </p>
          </div>

        </div>
      </div>

      {/* Compliance Matrix Map */}
      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-150 dark:border-slate-800/80 rounded-3xl p-6 sm:p-8 mb-16">
        <div className="text-center max-w-xl mx-auto mb-10">
          <h3 className="font-display text-xl sm:text-2.5xl font-black text-slate-805 dark:text-white">
            Industry Regulatory Standards
          </h3>
          <p className="text-xs text-slate-555 dark:text-slate-400 mt-2 leading-relaxed">
            By avoiding data intake or external file uploads, FoldPDF satisfies strict global compliance mandates.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          
          <div className="bg-white dark:bg-slate-950/40 p-5 rounded-2xl border border-slate-100 dark:border-slate-850">
            <div className="inline-flex px-2.5 py-1 rounded bg-teal-50 dark:bg-teal-950/40 text-teal-605 text-[10px] uppercase font-bold tracking-wider mb-2">SOC-2 Framework</div>
            <h4 className="text-sm font-bold text-slate-800 dark:text-white">Auditable Security Policy</h4>
            <p className="text-xs text-slate-450 mt-1.5 leading-relaxed">
              Fully compliant. Since we choose NOT to hold, collect, or store documents, standard audit scopes can quickly confirm that our databases represent zero leak risk.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-950/40 p-5 rounded-2xl border border-slate-100 dark:border-slate-850">
            <div className="inline-flex px-2.5 py-1 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-655 text-[10px] uppercase font-bold tracking-wider mb-2">HIPAA Standards</div>
            <h4 className="text-sm font-bold text-slate-800 dark:text-white">Protected Health Information</h4>
            <p className="text-xs text-slate-450 mt-1.5 leading-relaxed">
              Clinical employees can process records securely. PHI remains strictly isolated to their specific physical computer RAM, obeying the HIPAA Security Rule.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-950/40 p-5 rounded-2xl border border-slate-100 dark:border-slate-850">
            <div className="inline-flex px-2.5 py-1 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-605 text-[10px] uppercase font-bold tracking-wider mb-2">GDPR Regulations</div>
            <h4 className="text-sm font-bold text-slate-800 dark:text-white">Right to Personal Deletion</h4>
            <p className="text-xs text-slate-450 mt-1.5 leading-relaxed">
              Standard GDPR demands that users retain complete authority to delete metrics. By immediately purving all records, compliance is maintained.
            </p>
          </div>

        </div>
      </div>

      {/* Interactive Best Practices Checklist */}
      <div className="grid gap-8 lg:grid-cols-12 items-start mb-16">
        
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/80 rounded-3xl p-6 sm:p-8 shadow-premium-sm animate-in fade-in">
          <h3 className="font-display text-lg sm:text-xl font-bold text-slate-805 dark:text-white mb-4 flex items-center gap-1.5">
            <Lucide.CheckSquare className="h-5 w-5 text-indigo-555" />
            Security Best Practices (Checklist)
          </h3>
          <p className="text-xs text-slate-500 mb-6 font-medium">
            Take proactive control over sensitive documentation operations. Click on items below to review best practices:
          </p>
          <div className="space-y-4">
            
            <div 
              onClick={() => setChecklist({ ...checklist, useLocalOnly: !checklist.useLocalOnly })}
              className="flex items-start gap-3 cursor-pointer p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-850 transition duration-150"
            >
              <div className="mt-0.5">
                {checklist.useLocalOnly ? (
                  <Lucide.CheckCircle2 className="h-5 w-5 text-emerald-555 shrink-0" />
                ) : (
                  <div className="h-5 w-5 border border-slate-300 dark:border-slate-650 rounded-full shrink-0" />
                )}
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-white">1. Prioritize Client-Side Runtimes</h4>
                <p className="text-xs text-slate-450 mt-0.5">Always verify that PDF helper portals perform calculations directly inside browsers rather than transmitting raw streams outward.</p>
              </div>
            </div>

            <div 
              onClick={() => setChecklist({ ...checklist, restrictNetwork: !checklist.restrictNetwork })}
              className="flex items-start gap-3 cursor-pointer p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-850 transition duration-150"
            >
              <div className="mt-0.5">
                {checklist.restrictNetwork ? (
                  <Lucide.CheckCircle2 className="h-5 w-5 text-emerald-555 shrink-0" />
                ) : (
                  <div className="h-5 w-5 border border-slate-300 dark:border-slate-650 rounded-full shrink-0" />
                )}
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-white">2. Check for Embedded File Metadata</h4>
                <p className="text-xs text-slate-450 mt-0.5">Before distributing final drafts, make sure author details, tracking metadata, and creation timestamps have been fully sanitized.</p>
              </div>
            </div>

            <div 
              onClick={() => setChecklist({ ...checklist, clearHistory: !checklist.clearHistory })}
              className="flex items-start gap-3 cursor-pointer p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-850 transition duration-150"
            >
              <div className="mt-0.5">
                {checklist.clearHistory ? (
                  <Lucide.CheckCircle2 className="h-5 w-5 text-emerald-555 shrink-0" />
                ) : (
                  <div className="h-5 w-5 border border-slate-300 dark:border-slate-650 rounded-full shrink-0" />
                )}
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-white">3. Promptly Clear Volatile Cache Files</h4>
                <p className="text-xs text-slate-450 mt-0.5">Establish office guidelines requiring remote employees to quickly close document handles and tab environments when operations complete.</p>
              </div>
            </div>

          </div>
        </div>

        {/* Data Retention Policy */}
        <div className="lg:col-span-4 bg-indigo-50/50 dark:bg-slate-900 border border-indigo-100/30 dark:border-slate-800/80 rounded-3xl p-6 shadow-premium-sm">
          <Lucide.Info className="h-8 w-8 text-indigo-550 mb-3" />
          <h3 className="font-display text-base font-bold text-slate-850 dark:text-white mb-2">
            Data Retention Policy
          </h3>
          <p className="text-xs text-slate-555 dark:text-slate-400 leading-relaxed">
            Our storage threshold is mathematically **Zero Seconds**. 
            <br /><br />
            Since the FoldPDF layout avoids hard disk writes entirely, we never compile document backup bundles. If your computer power fails mid-conversion, that state is permanently lost—the cleanest storage guarantee possible.
          </p>
        </div>

      </div>

      {/* Accordion FAQ Area */}
      <div className="max-w-4xl mx-auto">
        <h3 className="font-display text-xl sm:text-2.5xl font-black text-slate-805 dark:text-white mb-8 text-center">
          Security FAQs
        </h3>
        <div className="space-y-4">
          {securityFaqs.map((faq, idx) => (
            <div 
              key={idx} 
              className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 rounded-2xl p-4 sm:p-5 shadow-premium-sm transition"
            >
              <button 
                onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
                className="w-full flex items-center justify-between font-bold text-xs sm:text-sm text-slate-805 dark:text-white text-left cursor-pointer outline-none border-none p-0 bg-transparent"
              >
                <span>{faq.q}</span>
                <Lucide.ChevronDown className={`h-4.5 w-4.5 text-slate-400 transition-transform duration-200 ${activeFaq === idx ? "rotate-180" : ""}`} />
              </button>
              {activeFaq === idx && (
                <p className="text-xs text-slate-500 dark:text-slate-450 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 leading-relaxed transition-all">
                  {faq.a}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}