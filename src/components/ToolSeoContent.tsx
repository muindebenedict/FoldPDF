import React, { useState } from "react";
import * as Lucide from "lucide-react";
import { TOOLS_DATA } from "../toolsData";

interface ToolSeoData {
  title: string;
  description: string;
  features: { icon: keyof typeof Lucide; title: string; desc: string }[];
  faqs: { q: string; a: string }[];
}

const SEO_CONTENT_MAP: Record<string, ToolSeoData> = {
  "compress-pdf": {
    title: "Secure Client-Side PDF Compressor",
    description: "Our high-fidelity PDF compression engine executes entirely within your browser's private sandbox. Shifting calculation loads to WebAssembly lets you shrink file payload weights by up to 90% without losing critical text layer layouts or core image crispness. Because standard PDF helpers force users to send sensitive invoices, agreements, and receipts over public networks, we designed FoldPDF to run locally. Under no condition do any raw file bytes travel to remote target storage units. Modern companies rely on this browser-only approach to maintain data integrity and speed. In typical operations, server queues add massive delays; our client-side compiler finishes compression calculations in volatile RAM inside fragments of seconds, rendering transmission security leaks mathematically impossible.",
    features: [
      { icon: "ShieldAlert", title: "100% In-Memory RAM", desc: "No disk writes. Garbage collection erases all caches the millisecond the compilation completes." },
      { icon: "Gauge", title: "WebAssembly Compiler", desc: "Launches local multi-threaded parsing on your GPU/CPU threads for peak execution speed." },
      { icon: "Network", title: "Offline-Capable Core", desc: "The page functions perfectly even when you pull your internet connection line." }
    ],
    faqs: [
      { q: "Is there a file size capacity constraint on local compression?", a: "No! Because calculations execute locally, there are no unsecure cloud bandwidth limits. Large 500MB documents compile comfortably in your client thread." },
      { q: "Does compressing a layout flatten standard form fields?", a: "No. Our compression sweeps metadata and downscales raw image nodes while preserving Interactive forms and text markers perfectly." },
      { q: "How can I verify that my assets never left my hardware?", a: "You can open your browser's developer console network audit tool and verify that zero packets travel while pressing the compress action." }
    ]
  },
  "protect-pdf": {
    title: "Military-Grade Client-Side PDF Protection",
    description: "Locking legal documents and personal folders requires absolute trust in the protective engine. Our PDF protect utility conducts full standard 128-bit and 256-bit AES encryption inside your browser. By generating mathematical security keys locally, FoldPDF seals the file framework and guarantees that unauthorized systems cannot decrypt or alter document layouts. Standard online locker scripts receive your key and original text streams onto their servers, raising safety concerns; our tool runs entirely in-browser, meaning your passwords and file bytes never traverse the wire. Enforcing lock parameters locally maintains standard HIPAA and corporate regulatory compliance.",
    features: [
      { icon: "Lock", title: "Local AES Encryption", desc: "Applies rigid password constraints natively on the client level using standard math models." },
      { icon: "EyeOff", title: "Zero Key Logging", desc: "We hold zero registers. If you forget your chosen password string, we cannot retrieve it." },
      { icon: "ServerOff", title: "No Server Handshakes", desc: "Everything is bundled right inside the static code. Safe from remote interceptions." }
    ],
    faqs: [
      { q: "Can I choose which actions are locked (such as printing or editing)?", a: "Yes, our native compiler maps custom permissions to disable layout replication, text selection, printing, or form adjustments." },
      { q: "Are passwords saved in any temporary server session registries?", a: "Absolutely not. Passwords are utilized purely to compile the encrypted vector stream and are discarded from RAM instantly." },
      { q: "Is the final encrypted PDF standard-compliant?", a: "Yes. It utilizes globally recognized AES standards compatible with Adobe Acrobat Reader, Apple Preview, and institutional decrypters." }
    ]
  },
  "unlock-pdf": {
    title: "Instant Decryption & Restriction Removal",
    description: "Unlock file permissions and strip passcode barriers without compromising document integrity. While remote systems require you to upload locked files, FoldPDF strips passwords directly within your browser thread. If you possess the passcode or need to clear permission constraints, our WebAssembly compiler reformats the metadata catalog, delivering an unlocked document instantly. This keeps corporate contracts and banking papers completely safe. No external physical databases hold copies of decrypted information, satisfying strict corporate security protocols and keeping your records private.",
    features: [
      { icon: "Unlock", title: "Instant Local Removal", desc: "Strips password barriers and structural restriction flags inside browser RAM threads." },
      { icon: "Cpu", title: "Preserved Alignments", desc: "Strips encryption without rasterizing pages or corrupting text indexes." },
      { icon: "CloudOff", title: "Zero Upload Risks", desc: "Decryption happens completely on-device, shielding secret contents from standard networks." }
    ],
    faqs: [
      { q: "Does this locker tool crack files without passwords?", a: "If the file requires a password to read, you must input the correct passcode string. Our tool removes edit and print locks instantly without keys." },
      { q: "Are decoded credentials stored in standard history logs?", a: "No. FoldPDF maintains an absolute zero-tracking registry policy. Decoded file paths never write to local disk databases." },
      { q: "Does the output remain compatible with standard PDF engines?", a: "Yes. The resulting unlocked document is standard-compliant and readable on any modern reader." }
    ]
  },
  "ocr-pdf": {
    title: "Client-Side Optical Character Recognition (OCR)",
    description: "Convert flat scanned page pixels and image templates into searchable text layers with complete privacy. FoldPDF conducts OCR using browser compilers, bypassing target server conversions. By parsing character coordinates inside your local web app browser sandbox, our OCR system layers digital text nodes over physical scan layers without transferring files across cloud databases. This approach avoids standard information leaks, allowing legal counsel and clinical practitioners to scan confidential briefs and medical records without SOC-2 or compliance violations.",
    features: [
      { icon: "BookOpen", title: "Local Optical Grid", desc: "Character matrix mapping occurs purely inside local client rendering canvases." },
      { icon: "FileText", title: "Selectable Overlay Layers", desc: "Produces searchable text grids that let users copy metadata contents with exact coordinates." },
      { icon: "Cpu", title: "Zero Processing Queues", desc: "No queue queues exist. OCR tasks run continuously directly inside local hardware cores." }
    ],
    faqs: [
      { q: "Which language templates does the client-side character compiler support?", a: "It currently features deep support for English, Latin characters, and common Western European scripts, running entirely client-side." },
      { q: "Does running OCR locally consume heavy server resources?", a: "No, it utilizes your local computer hardware. Performance is determined entirely by your device processor and page counts." },
      { q: "Can I export OCR outcomes into standard text layouts?", a: "Yes, our compiler lets you download either searchable PDFs or isolated text drafts." }
    ]
  }
};

interface ToolSeoContentProps {
  toolId: string;
}

export function ToolSeoContent({ toolId }: ToolSeoContentProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  
  // Use fallback values if selected tool is not mapped to prevent black screens
  const normalizedId = toolId.toLowerCase();
  
  const selectedData = SEO_CONTENT_MAP[normalizedId] || {
    title: `${toolId.split('-').map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' ')} - Secure Workspace Options`,
    description: `Conduct zero-knowledge ${toolId.replace('-', ' ')} adjustments completely inside your browser local sandbox. FoldPDF leverages modern client WebAssembly compilers to execute rich modifications inside isolated heap structures, preventing external security liabilities. No documents are transmitted over standard networks, keeping organizational metrics and private documents safe from data leakage. Closing active browser tabs clears processing RAM instantly, delivering high-speed, secure calculations without forced registrations.`,
    features: [
      { icon: "ShieldAlert" as const, title: "Zero Cloud Logging", desc: "No tracking parameters, physical logs, or record queues exist in our backend framework." },
      { icon: "Cpu" as const, title: "WebAssembly Compiler", desc: "Heavy layout transformations run locally at Peak CPU speeds inside browser sandbox sandboxes." },
      { icon: "Lock" as const, title: "Regulatory Conformity", desc: "Safely complies with HIPAA, SOC-2, and GDPR standards by omitting physical data collections." }
    ],
    faqs: []
  };

  const matchedTool = TOOLS_DATA.find(t => t.id === normalizedId);
  const displayFaqs = matchedTool?.faqs && matchedTool.faqs.length > 0
    ? matchedTool.faqs.map(f => ({ q: f.question, a: f.answer }))
    : (SEO_CONTENT_MAP[normalizedId]?.faqs || [
        { q: `Does ${toolId.replace('-', ' ')} require paid account memberships?`, a: "No. Core features are 100% free and open, letting users execute documents endlessly without limits." },
        { q: "Are temporary file backups compiled on FoldPDF cloud systems?", a: "Absolutely not. Our server-free architecture ensures documents never write to external hard disk databases." },
        { q: "Can I process documents on mobile browser tabs?", a: "Yes. FoldPDF is responsive and executes comfortably within modern iOS, Android, and tablet sandboxes." }
      ]);

  return (
    <div className="mt-16 border-t border-slate-150 dark:border-slate-800/80 pt-12 space-y-12 max-w-6xl mx-auto pb-10 font-body animate-in fade-in" id="tool-seo-resource">
      
      {/* Title & Wordy Description Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/80 rounded-3xl p-6 sm:p-8 shadow-premium-sm">
        <h2 className="font-display text-xl sm:text-2.5xl font-black text-slate-850 dark:text-white mb-4">
          Educational Overview: {selectedData.title}
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          {selectedData.description}
        </p>
      </div>

      {/* Feature visual cards */}
      <div className="grid gap-6 sm:grid-cols-3">
        {selectedData.features.map((feat, idx) => {
          // Resolve icon safely
          const IconComponent = (Lucide as any)[feat.icon] || Lucide.ShieldAlert;
          return (
            <div key={idx} className="bg-slate-50 dark:bg-slate-905 p-5 border border-slate-100 dark:border-slate-850 rounded-2xl flex flex-col items-start">
              <div className="h-9 w-9 bg-white dark:bg-slate-850 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center shadow-sm mb-3">
                <IconComponent className="h-4.5 w-4.5" />
              </div>
              <h4 className="text-xs font-extrabold text-slate-800 dark:text-white uppercase tracking-wider">{feat.title}</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{feat.desc}</p>
            </div>
          );
        })}
      </div>

      {/* 3 Accordion FAQ Area */}
      <div className="space-y-4">
        <h3 className="font-display text-base font-bold text-slate-850 dark:text-white">
          🛡️ Secure Frequently Asked Questions
        </h3>
        <div className="space-y-3">
          {displayFaqs.map((faq, idx) => (
            <div key={idx} className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 rounded-2xl p-4 shadow-premium-sm">
              <button
                onClick={() => setActiveIdx(activeIdx === idx ? null : idx)}
                className="w-full text-left font-bold text-xs sm:text-sm text-slate-850 dark:text-white flex items-center justify-between cursor-pointer outline-none border-none p-0 bg-transparent"
              >
                <span>{faq.q}</span>
                <Lucide.ChevronDown className={`h-4.5 w-4.5 text-slate-450 transition-transform ${activeIdx === idx ? "rotate-180" : ""}`} />
              </button>
              {activeIdx === idx && (
                <p className="text-xs text-slate-500 dark:text-slate-405 mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 leading-relaxed font-body">
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
