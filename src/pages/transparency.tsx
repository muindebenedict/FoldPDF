import React from "react";
import * as Lucide from "lucide-react";

interface TransparencyProps {
  navigate: (path: string) => void;
}

export default function TransparencyPage({ navigate }: TransparencyProps) {
  const canaryIndicators = [
    {
      title: "No Secret Government Subpoenas",
      value: "Canary Active",
      desc: "To date, FoldPDF has received zero secret court directives, national security requests, or data interception demands from government or law enforcement agencies globally.",
      icon: <Lucide.Activity className="h-5 w-5 text-emerald-500" />
    },
    {
      title: "No User Backdoors Configured",
      value: "Verified",
      desc: "We have configured zero client backdoors or secret pathways. The application has no mechanism to intercept or decrypt custom document arrays processed in browser RAM.",
      icon: <Lucide.KeyRound className="h-5 w-5 text-indigo-505" />
    },
    {
      title: "Zero Third-Party Search Assets",
      value: "Protected",
      desc: "We do not sell, rent, or monetize raw metadata layers or document structures to artificial intelligence developers or marketing trackers.",
      icon: <Lucide.UserCheck className="h-5 w-5 text-sky-500" />
    }
  ];

  const subProcessors = [
    {
      name: "Google Cloud Platform / Cloud Run",
      role: "Static Asset Hosting & Server Proxy",
      dataStored: "Absolutely None (No caches or file storage configured)",
      location: "Germany / EU West"
    },
    {
      name: "Google Gemini API Gateway",
      role: "Local AI Text Parsing Proxy",
      dataStored: "Zero (Ephemeral text token analysis only; strict zero-training policies)",
      location: "United States (Encrypted API Gateway)"
    }
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 font-body animate-in fade-in duration-300 dark:bg-slate-950 dark:text-slate-100">
      
      {/* Page Header */}
      <div className="text-center max-w-2xl mx-auto mb-16">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-55 text-indigo-650 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-100/30">
          <Lucide.Combine className="h-3.5 w-3.5" />
          Transparency & Integrity Reports
        </span>
        <h1 className="mt-4 font-display text-4xl sm:text-5.5xl font-extrabold tracking-tight text-slate-800 dark:text-white leading-[1.1]">
          Transparency & Trust Report
        </h1>
        <p className="mt-4 text-slate-505 dark:text-slate-400 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
          At FoldPDF, transparency is not an legal page—it is built directly into our code. Read our live metrics, warrant canaries, and data security standards.
        </p>
      </div>

      {/* Warrant Canary Cards */}
      <div className="mb-16">
        <div className="mb-8 max-w-xl">
          <h2 className="font-display text-2xl font-black text-slate-850 dark:text-white flex items-center gap-2">
            <Lucide.HeartHandshake className="h-6 w-6 text-indigo-500 animate-pulse" /> Live Warrant Canary
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-2 leading-relaxed">
            Many government agencies force organizations to hide wiretap orders under gag directives. This section serves as our live Warrant Canary, updated dynamically to verify that all systems remain sound.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {canaryIndicators.map((item, id) => (
            <div key={id} className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 rounded-2xl p-5 shadow-premium-sm">
              <div className="flex justify-between items-center mb-4">
                <span className="text-[10px] uppercase font-bold text-slate-400">System Canary</span>
                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 px-2 py-0.5 rounded text-[9px] font-extrabold uppercase">
                  {item.value}
                </span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                {item.icon}
                <h4 className="text-sm font-extrabold text-slate-850 dark:text-white">{item.title}</h4>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Audit Guide Section */}
      <div className="grid gap-10 lg:grid-cols-2 mb-16 items-center">
        <div>
          <h2 className="font-display text-2xl sm:text-3.5xl font-black text-slate-855 dark:text-white mb-4">
            How to Audit the Code Yourself
          </h2>
          <p className="text-xs sm:text-sm text-slate-555 dark:text-slate-400 leading-relaxed mb-4">
            You do not need to take our word for it. You can inspect the network connections in real-time. Follow this simple guide to see our browser-based security in action.
          </p>
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="h-6 w-6 rounded-full bg-indigo-55 text-indigo-550 dark:bg-indigo-955/35 dark:text-indigo-400 font-bold flex items-center justify-center text-xs shrink-0">1</div>
              <p className="text-xs text-slate-505 dark:text-slate-400 mt-0.5">
                Right-click the page and select <strong>Inspect</strong> or press <code>F12</code> to open your mobile or desktop developer tools catalog.
              </p>
            </div>
            <div className="flex gap-3">
              <div className="h-6 w-6 rounded-full bg-indigo-55 text-indigo-550 dark:bg-indigo-955/35 dark:text-indigo-400 font-bold flex items-center justify-center text-xs shrink-0">2</div>
              <p className="text-xs text-slate-505 dark:text-slate-400 mt-0.5">
                Switch to the <strong>Network</strong> audit tab. This monitors all HTTP requests, sockets, and assets travelling between your device and external databases.
              </p>
            </div>
            <div className="flex gap-3">
              <div className="h-6 w-6 rounded-full bg-indigo-55 text-indigo-550 dark:bg-indigo-955/35 dark:text-indigo-400 font-bold flex items-center justify-center text-xs shrink-0">3</div>
              <p className="text-xs text-slate-505 dark:text-slate-400 mt-0.5">
                Select one of our browser-based tools and execute an action like <strong>Merge</strong> or <strong>Watermark</strong>. You can observe that zero document assets are sent to the cloud. All math executes 100% locally.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-premium-sm">
          <h3 className="font-display text-lg font-bold text-slate-805 dark:text-white mb-4 flex items-center gap-1.5">
            <Lucide.Cpu className="h-5 w-5 text-indigo-505" /> Zero-Trust Technical Metrics
          </h3>
          <div className="space-y-3.5">
            <div className="flex justify-between text-xs border-b border-slate-100 dark:border-slate-850 pb-2">
              <span className="text-slate-450">Local WebAssembly Threads:</span>
              <span className="font-bold text-slate-800 dark:text-white">Multi-threaded Client</span>
            </div>
            <div className="flex justify-between text-xs border-b border-slate-100 dark:border-slate-850 pb-2">
              <span className="text-slate-450">Document Buffer Caching:</span>
              <span className="font-bold text-slate-800 dark:text-white">Volatile Heap Only (No disk sync)</span>
            </div>
            <div className="flex justify-between text-xs border-b border-slate-100 dark:border-slate-850 pb-2">
              <span className="text-slate-450">Average Storage Caches:</span>
              <span className="font-bold text-slate-808 dark:text-white">0 Bytes Saved on Server</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-450">Active Database Queues:</span>
              <span className="font-bold text-slate-808 dark:text-white">None (Natively stateless)</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-450 dark:text-slate-500 mt-4 leading-relaxed">
            Because we construct standard layout schemas on the client-side level, our architecture satisfies compliance controls by discarding document components immediately when active browser sessions close.
          </p>
        </div>
      </div>

      {/* Subprocessor Disclosure */}
      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-6 sm:p-8 rounded-3xl">
        <h3 className="font-display text-xl sm:text-2xl font-black text-slate-850 dark:text-white mb-4 flex items-center gap-1.5">
          <Lucide.Boxes className="h-6 w-6 text-indigo-550" /> Approved Subprocessor Disclosure
        </h3>
        <p className="text-xs sm:text-sm text-slate-505 dark:text-slate-400 leading-relaxed mb-6">
          Transparency means detailing exactly who helps deliver our services. FoldPDF keeps subprocessor lists very tight. Under no condition can downstream partners retrieve raw document components without client commands.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-450 uppercase font-bold tracking-widest">
                <th className="py-3 px-2">Subprocessor Name</th>
                <th className="py-3 px-2">Functional Role</th>
                <th className="py-3 px-2">Data Retained</th>
                <th className="py-3 px-2">Entity Jurisdiction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
              {subProcessors.map((proc, id) => (
                <tr key={id} className="text-slate-650 dark:text-slate-355 hover:bg-white/40 dark:hover:bg-slate-850/20">
                  <td className="py-3.5 px-2 font-bold text-slate-800 dark:text-white">{proc.name}</td>
                  <td className="py-3.5 px-2">{proc.role}</td>
                  <td className="py-3.5 px-2">{proc.dataStored}</td>
                  <td className="py-3.5 px-2">{proc.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}