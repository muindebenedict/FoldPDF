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
    title: "Helpful Guide on PDF Compression",
    description: "Trying to email a giant file but it keeps getting rejected? We can help with that. This compression tool shrinks your file size so modern layouts and charts stay readable. We are completely upfront about how this works: files are sent to our secure server, processed, and deleted immediately after you download. Nothing is stored or logged. Your data is kept safe while we decrease the space your files take up.",
    features: [
      { icon: "Shield", title: "Immediate Deletion", desc: "Your file is sent to our secure server, processed, and deleted immediately after you download. Nothing is saved." },
      { icon: "Gauge", title: "Super Fast Scale", desc: "No queue waits. The compression runs on our secure backend and completes within a few seconds." },
      { icon: "Lock", title: "Clean Visual Quality", desc: "We scale bulky pictures inside your PDF while keeping standard text boundaries crisp." }
    ],
    faqs: [
      { q: "Are there file size limits?", a: "You can compress files up to a few hundred megabytes securely. The server will handle it and erase it right after." },
      { q: "Will it flatten form inputs?", a: "No! Interactive checkboxes, forms, and signatures remain fully clickable in your smaller PDF draft." },
      { q: "How is security handled?", a: "Files are sent to our secure server, processed, and deleted immediately after you download. Nothing is stored or logged." }
    ]
  },
  "protect-pdf": {
    title: "Protecting Your Files with Strong Passwords",
    description: "Need to make sure your private agreements and financial charts remain confidential? You can add a password to your document using this secure locking tool. Choose a custom password and disable copying or printing text so nobody can alter your work. Since everything runs inside your browser, your file never leaves your device at any point.",
    features: [
      { icon: "Lock", title: "Strong Password Protection", desc: "Set encryption passwords on your local device to lock pages and margins." },
      { icon: "EyeOff", title: "No Passwords Saved", desc: "We hold no records of your password string. If you forget it, we cannot help unlock your files." },
      { icon: "ServerOff", title: "Entirely On-Device", desc: "No data is sent over the internet. Calculations run inside your own browser tab." }
    ],
    faqs: [
      { q: "Can I restrict specific actions, like printing or text copies?", a: "Yes. You can disable standard printing, text selection, and form alterations." },
      { q: "Are my passwords saved in history?", a: "Absolutely not. Passwords are only used on your local machine to lock the file and are discarded from memory immediately." },
      { q: "Is the locked PDF standard-compliant?", a: "Yes! Any standard reader like Adobe Acrobat or Apple Preview will ask for the password upon opening." }
    ]
  },
  "unlock-pdf": {
    title: "Removing Outdated PDF Password Restricts",
    description: "Do you have a PDF document that won't let you select text, copy paragraphs, or press print? When you possess the password keys, we can remove those restrictions immediately. Clear out administrative permission flags so you can resume your work without roadblocks. Since everything runs inside your browser, your file never leaves your device at any point.",
    features: [
      { icon: "Unlock", title: "Local Lock Stripping", desc: "Clear permissions blocks and passwords within your own browser tab." },
      { icon: "Cpu", title: "Keeps Layouts Crisp", desc: "We remove locks without altering any elements, texts, or pictures." },
      { icon: "CloudOff", title: "No Cloud Uploads", desc: "File handling takes place completely on-device, keeping corporate sheets secure." }
    ],
    faqs: [
      { q: "Can this crack a password?", a: "If the document has an open password, you need to type the correct passcode string. If it only has print or copy restrictions, we can strip them instantly." },
      { q: "Are my credentials logged?", a: "Never, we have no backend databases to store logs and maintain an absolute zero-tracking policy." },
      { q: "Is the unlocked PDF standard-compliant?", a: "Yes. The resulting PDF is fully compliant and opens easily on all standard document reading apps." }
    ]
  },
  "ocr-pdf": {
    title: "Scanning and Extracting Text with OCR",
    description: "Getting tired of typing out paragraphs from flat photo scans or unsearchable PDF receipts? Our optical scanner identifies character shapes in picture files, creating selectable text fields. You can search, edit, and copy from your scans directly. Since everything runs inside your browser, your file never leaves your device at any point.",
    features: [
      { icon: "BookOpen", title: "Local Character Reading", desc: "Character coordinate scanning executes entirely within your browser." },
      { icon: "FileText", title: "Searchable Overlay Lines", desc: "Lays selectable text fields over flat scans so you can copy text easily." },
      { icon: "Cpu", title: "Instant Scans", desc: "No server queue waits. The scanner processes pages on your local device." }
    ],
    faqs: [
      { q: "What languages does it read?", a: "It features supreme recognition for English and common Latin scripts." },
      { q: "Does the scanner consume internet bandwidth?", a: "Not at all. You can run the entire OCR process offline once the website has finished loading." },
      { q: "Can I download raw text?", a: "Yes, you can extract either a selectable page PDF or a simple text notepad file." }
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
  const SERVER_TOOLS = ["compress-pdf", "pdf-to-word", "pdf-to-powerpoint", "powerpoint-to-pdf"];
  const isServerTool = SERVER_TOOLS.includes(normalizedId);
  
  const selectedData = SEO_CONTENT_MAP[normalizedId] || {
    title: `${toolId.split('-').map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' ')} - Secure Workspace Options`,
    description: isServerTool
      ? `Need to convert your files securely? Conduct your ${toolId.replace('-', ' ')} changes with ease. For this tool, files are sent to our secure server, processed, and deleted immediately after you download. Nothing is stored or logged.`
      : `Need to adjust your files securely? Conduct your ${toolId.replace('-', ' ')} changes with ease. Since everything runs inside your browser, your file never leaves your device at any point. We never use remote servers or keep records of your documents. Closing your active browser tab will instantly erase your file from memory, ensuring you can process documents cleanly without forced registrations or tracking cookies.`,
    features: isServerTool ? [
      { icon: "Shield" as const, title: "Immediate Deletion", desc: "Your file is sent to our secure server, processed, and deleted immediately after you download." },
      { icon: "Gauge" as const, title: "Super Fast Scale", desc: "No queue waits. The conversion runs on our secure backend and completes within a few seconds." },
      { icon: "Lock" as const, title: "Clean Visual Quality", desc: "We convert layout files while keeping standard text boundaries crisp." }
    ] : [
      { icon: "Shield" as const, title: "No Server Uploads", desc: "Your files never leave your device at any point and are never saved on a remote disk." },
      { icon: "Cpu" as const, title: "On-device Processing", desc: "Heavy formatting tasks are processed directly using user's computer processing power." },
      { icon: "Lock" as const, title: "Standard Security", desc: "Works beautifully to satisfy corporate standards by omitting external database storage." }
    ],
    faqs: []
  };

  const matchedTool = TOOLS_DATA.find(t => t.id === normalizedId);
  const displayFaqs = matchedTool?.faqs && matchedTool.faqs.length > 0
    ? matchedTool.faqs.map(f => ({ q: f.question, a: f.answer }))
    : (SEO_CONTENT_MAP[normalizedId]?.faqs || [
        { q: `Does ${toolId.replace('-', ' ')} require paid account memberships?`, a: "No. Core features are 100% free and open, letting users execute documents endlessly without limits." },
        { q: "Are temporary file backups kept on our cloud systems?", a: "Absolutely not. Our server-free architecture ensures documents never write to external hard disk databases." },
        { q: "Can I process documents on mobile browser tabs?", a: "Yes. Our tools are responsive and execute comfortably within modern iOS, Android, and tablet browsers." }
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
        {SERVER_TOOLS.includes(normalizedId) && (
          <p className="text-2xs text-slate-505 dark:text-indigo-400 mt-4 leading-normal font-normal">
            Four of our tools send files to our secure server for processing: Compress PDF, PDF to Word, PDF to PowerPoint, and PowerPoint to PDF. Your file is deleted immediately after you download.
          </p>
        )}
      </div>

      {/* Feature visual cards */}
      <div className="grid gap-6 sm:grid-cols-3">
        {selectedData.features.map((feat, idx) => {
          // Resolve icon safely
          const IconComponent = (Lucide as any)[feat.icon] || Lucide.Shield;
          return (
            <div key={idx} className="bg-slate-50 dark:bg-slate-905 p-5 border border-slate-100 dark:border-slate-850 rounded-2xl flex flex-col items-start font-body">
              <div className="h-9 w-9 bg-white dark:bg-slate-850 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center shadow-sm mb-3">
                <IconComponent className="h-4.5 w-4.5" />
              </div>
              <h4 className="text-xs font-extrabold text-slate-800 dark:text-white uppercase tracking-wider">{feat.title}</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{feat.desc}</p>
            </div>
          );
        })}
      </div>

    </div>
  );
}
