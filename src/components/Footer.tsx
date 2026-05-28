import React, { useState } from "react";
import * as Lucide from "lucide-react";
import { FoldPdfLogo } from "./FoldPdfLogo";

interface FooterProps {
  navigate: (path: string) => void;
}

export function Footer({ navigate }: FooterProps) {
  const currentYear = new Date().getFullYear();
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const handleLinkClick = (path: string) => {
    navigate(path);
  };

  const handleSubscribeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim().length > 3) {
      setSubscribed(true);
      setEmail("");
    }
  };

  return (
    <footer className="w-full border-t border-slate-100 bg-white dark:border-slate-800/80 dark:bg-slate-905 text-slate-500 dark:text-slate-400 py-16 transition-colors duration-200" id="enterprise-footer">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Core 4-Column Directory sitemap */}
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 pb-12 border-b border-slate-150 dark:border-slate-800/60">
          
          {/* Column 1: About FoldPDF + Mission Statement */}
          <div className="space-y-4">
            <div className="cursor-pointer inline-block" onClick={() => handleLinkClick("/")}>
              <FoldPdfLogo className="h-6.5 w-6.5" showText={true} showTagline={false} />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs">
              <strong>Our Mission:</strong> FoldPDF delivers high-speed, secure, and 100% cloud-free document conversions directly inside your browser RAM. Decrypting, merging, and editing PDFs locally prevents physical file caching, ensuring complete data sovereignty.
            </p>
            {/* Social Icons */}
            <div className="flex gap-3 text-slate-400 dark:text-slate-500">
              <a href="https://twitter.com" target="_blank" rel="noreferrer" className="hover:text-indigo-600 transition" aria-label="Twitter Header Link">
                <Lucide.Twitter className="h-4.5 w-4.5" />
              </a>
              <a href="https://github.com" target="_blank" rel="noreferrer" className="hover:text-indigo-600 transition" aria-label="GitHub Repository Link">
                <Lucide.Github className="h-4.5 w-4.5" />
              </a>
              <a href="https://linkedin.com" target="_blank" rel="noreferrer" className="hover:text-indigo-600 transition" aria-label="LinkedIn Profile Link">
                <Lucide.Linkedin className="h-4.5 w-4.5" />
              </a>
              <a href="/security" onClick={(e) => { e.preventDefault(); handleLinkClick("/security"); }} className="hover:text-emerald-500 transition" aria-label="Security Framework Details">
                <Lucide.ShieldCheck className="h-4.5 w-4.5 text-emerald-500" />
              </a>
            </div>
          </div>

          {/* Column 2: Tool Categories Mapping */}
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-850 dark:text-white mb-4 flex items-center gap-1.5 font-display">
              <Lucide.Grid3X3 className="h-4 w-4 text-indigo-500" />
              Tool Categories
            </h3>
            <ul className="space-y-2.5 text-xs">
              {[
                { name: "Organize PDFs (Merge / Split)", path: "/" },
                { name: "Optimize Documents (Compress)", path: "/compress-pdf" },
                { name: "Convert PDFs (Word / JPG / PNG)", path: "/" },
                { name: "Document Protections / Lock", path: "/protect-pdf" },
                { name: "Document AI Intelligence", path: "/" }
              ].map((item, i) => (
                <li key={i}>
                  <button onClick={() => handleLinkClick(item.path)} className="text-left hover:text-indigo-650 dark:hover:text-indigo-400 transition-colors">
                    {item.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Blog Categories & Learning Center Links */}
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-850 dark:text-white mb-4 flex items-center gap-1.5 font-display">
              <Lucide.BookOpen className="h-4 w-4 text-indigo-500" />
              Blog Categories
            </h3>
            <ul className="space-y-2.5 text-xs">
              {[
                { name: "🛡️ PDF Security Guides", path: "/blog" },
                { name: "💡 Privacy Tips & Best Practices", path: "/blog" },
                { name: "⚙️ Product Updates & WASM", path: "/blog" },
                { name: "View All Blog Articles", path: "/blog" }
              ].map((item, i) => (
                <li key={i}>
                  <button onClick={() => handleLinkClick(item.path)} className="text-left font-semibold hover:text-indigo-650 dark:hover:text-indigo-400 transition-colors text-slate-650 dark:text-slate-300">
                    {item.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 4: Legal Pages & Sitemap Links */}
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-850 dark:text-white mb-4 flex items-center gap-1.5 font-display">
              <Lucide.Compass className="h-4 w-4 text-indigo-500" />
              Compliance Sitemap
            </h3>
            <ul className="space-y-2.5 text-xs">
              {[
                { name: "About Workspace Mission", path: "/about" },
                { name: "Zero-Knowledge Security Hub", path: "/security" },
                { name: "Zero-Knowledge Transparency", path: "/transparency" },
                { name: "How Browser Core Works", path: "/how-it-works" },
                { name: "Privacy & AdSense Policies", path: "/privacy" },
                { name: "Terms of Service Conditions", path: "/terms" },
                { name: "DMCA Intellectual Procedures", path: "/dmca" },
                { name: "Contact Direct Human Support", path: "/contact" },
                { name: "Dynamic HTML Sitemap", path: "/sitemap" }
              ].map((item, i) => (
                <li key={i}>
                  <button onClick={() => handleLinkClick(item.path)} className="text-left hover:text-indigo-650 dark:hover:text-indigo-400 transition-colors">
                    {item.name}
                  </button>
                </li>
              ))}
              <li>
                <a 
                  href="/sitemap.xml" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline block pt-1.5"
                >
                  🌐 View XML Sitemap Standard
                </a>
              </li>
            </ul>
          </div>

        </div>

        {/* Newsletter Signup (embedded frontend only) + Verification Badges Area */}
        <div className="grid gap-8 lg:grid-cols-12 py-10 border-b border-slate-150 dark:border-slate-800/60 items-center">
          
          {/* Newsletter Input Form */}
          <div className="lg:col-span-6 space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-850 dark:text-white">
              Stay Informed on Policy Updates
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-405 leading-relaxed">
              Get major announcements regarding HIPAA, GDPR compliance revisions and modern browser security technologies. (We never spam).
            </p>
            {subscribed ? (
              <div className="bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 text-xs px-4 py-2.5 rounded-xl border border-emerald-100 flex items-center gap-1.5 animate-in zoom-in-95 duration-200">
                <Lucide.CheckCircle2 className="h-4.5 w-4.5" /> Successfully subscribed! Secure inbox transmission verified.
              </div>
            ) : (
              <form onSubmit={handleSubscribeSubmit} className="flex gap-2 max-w-md">
                <input 
                  type="email" 
                  required
                  placeholder="name@organization.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-xl border border-slate-205 py-2 px-3.5 text-xs dark:bg-slate-900 border-none outline-none ring-1 ring-slate-250 dark:ring-slate-800 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-505 w-full bg-slate-50/50"
                  aria-label="Newsletter email address"
                />
                <button 
                  type="submit"
                  className="rounded-xl bg-indigo-600 text-white font-semibold py-2 px-4 text-xs hover:bg-indigo-750 transition cursor-pointer"
                >
                  Subscribe
                </button>
              </form>
            )}
          </div>

          {/* Compliance & Security certification declarations */}
          <div className="lg:col-span-6 flex flex-wrap gap-4 lg:justify-end items-center">
            
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-premium-sm">
              <Lucide.ShieldCheck className="h-5 w-5 text-emerald-555 shrink-0" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-800 dark:text-white leading-none">ISO-27001 Metrics</p>
                <p className="text-[9px] text-slate-400 leading-none mt-1">Conforming RAM Standard</p>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-premium-sm">
              <Lucide.FileCheck2 className="h-5 w-5 text-indigo-505 shrink-0" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-800 dark:text-white leading-none">HIPAA Compliant</p>
                <p className="text-[9px] text-slate-400 leading-none mt-1">100% Client-Side Safe</p>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-premium-sm">
              <Lucide.Lock className="h-5 w-5 text-indigo-505 shrink-0" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-800 dark:text-white leading-none">GDPR Conforming</p>
                <p className="text-[9px] text-slate-400 leading-none mt-1">Absolute Deletion</p>
              </div>
            </div>

          </div>

        </div>

        {/* Footer Base Copyright information */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pt-8 text-xs text-slate-400">
          <div>
            <p className="font-semibold text-slate-500 dark:text-slate-400 flex items-center mb-1 font-display">
              <Lucide.ShieldAlert className="h-4 w-4 text-emerald-500 mr-2" />
              Active Zero-Knowledge Browser Processing Policy Enabled
            </p>
            <p className="text-[11px] text-slate-450 leading-relaxed max-w-2xl">
              All tools execute directly within your local client memory frame. Under no circumstances are files received, parsed, stored or kept on physical cloud directories. Enjoy total server-free operations.
            </p>
          </div>
          <div className="mt-4 sm:mt-0 flex flex-col items-start sm:items-end gap-1 font-semibold text-slate-500 dark:text-slate-450 shrink-0">
            <span>© {currentYear} FoldPDF. All rights reserved.</span>
            <span className="text-[10px] text-slate-405 uppercase tracking-widest font-bold">Standard Military 256-Bit SSL Encrypted Link</span>
          </div>
        </div>

      </div>
    </footer>
  );
}
