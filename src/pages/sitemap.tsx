import React from "react";
import * as Lucide from "lucide-react";
import { TOOLS_DATA } from "../toolsData";
import { DETAILED_BLOG_POSTS } from "./blog/blogPostsData";

interface SitemapProps {
  navigate: (path: string) => void;
}

export default function SitemapPage({ navigate }: SitemapProps) {
  // Group tools by categories
  const categories = Array.from(new Set(TOOLS_DATA.map(t => t.category)));

  const companyRoutes = [
    { name: "About Story & Values", path: "/about" },
    { name: "Global Security Hub", path: "/security" },
    { name: "Zero-Knowledge Transparency", path: "/transparency" },
    { name: "Under the Hood: How it Works", path: "/how-it-works" },
    { name: "Interactive Contact Portal", path: "/contact" },
    { name: "Learning Center / Corporate Blog", path: "/blog" }
  ];

  const complianceRoutes = [
    { name: "General Privacy Policy (AdSense Configured)", path: "/privacy" },
    { name: "Standard Terms of Service Use", path: "/terms" },
    { name: "DMCA Intellectual Claim Policies", path: "/dmca" },
    { name: "Sitemap Index (HTML Manual)", path: "/sitemap" }
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 font-body animate-in fade-in duration-300 dark:bg-slate-950 dark:text-slate-100">
      
      {/* Title Header */}
      <div className="text-center max-w-2xl mx-auto mb-16">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-55 text-indigo-650 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-100/30">
          <Lucide.Compass className="h-3.5 w-3.5" />
          General Sitemap
        </span>
        <h1 className="mt-4 font-display text-4xl sm:text-5.5xl font-extrabold tracking-tight text-slate-800 dark:text-white leading-[1.1]">
          Sitemap Director
        </h1>
        <p className="mt-4 text-slate-505 dark:text-slate-405 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
          Comprehensive roadmap to FoldPDF resources. Directly browse through all thirty-plus browser sandboxed converters, legal pages, and document security guides.
        </p>
      </div>

      <div className="grid gap-10 md:grid-cols-3 xl:grid-cols-4 items-start mb-16">
        
        {/* Core Pages & Links */}
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 p-6 rounded-3xl shadow-premium-sm col-span-1">
          <h3 className="font-display text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-850 pb-2.5">
            <Lucide.Flag className="h-4.5 w-4.5 text-indigo-505" /> Company Pages
          </h3>
          <ul className="space-y-3.5 text-xs">
            {companyRoutes.map((route, id) => (
              <li key={id}>
                <span
                  onClick={() => navigate(route.path)}
                  className="font-semibold text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer transition flex items-center gap-1.5 hover:underline"
                >
                  <Lucide.ChevronRight className="h-3 w-3 shrink-0 text-slate-400" />
                  {route.name}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Legal Pages & Links */}
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 p-6 rounded-3xl shadow-premium-sm col-span-1">
          <h3 className="font-display text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-850 pb-2.5">
            <Lucide.Briefcase className="h-4.5 w-4.5 text-teal-500" /> Compliance & Legal
          </h3>
          <ul className="space-y-3.5 text-xs">
            {complianceRoutes.map((route, id) => (
              <li key={id}>
                <span
                  onClick={() => navigate(route.path)}
                  className="font-semibold text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer transition flex items-center gap-1.5 hover:underline"
                >
                  <Lucide.ChevronRight className="h-3 w-3 shrink-0 text-slate-400" />
                  {route.name}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Dynamic Blog Post Links (20+) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 p-6 rounded-3xl shadow-premium-sm md:col-span-2 col-span-1">
          <h3 className="font-display text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-850 pb-2.5">
            <Lucide.BookOpen className="h-4.5 w-4.5 text-amber-500" /> Security & Privacy Guides ({DETAILED_BLOG_POSTS.length})
          </h3>
          <div className="grid gap-3.5 sm:grid-cols-2 text-xs">
            {DETAILED_BLOG_POSTS.map((post) => (
              <div key={post.slug}>
                <span
                  onClick={() => navigate(`/blog/${post.slug}`)}
                  className="font-semibold text-slate-600 dark:text-slate-400 hover:text-indigo-605 dark:hover:text-indigo-400 cursor-pointer transition flex items-start gap-1.5 hover:underline line-clamp-1"
                >
                  <Lucide.FileText className="h-3.5 w-3.5 shrink-0 text-slate-400 mt-0.5" />
                  {post.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Dynamic PDF Tools Grid Links (30+) */}
      <div className="border-t border-slate-150 dark:border-slate-800 pt-12">
        <h2 className="font-display text-2xl font-black text-slate-850 dark:text-white mb-8 text-center flex items-center justify-center gap-2">
          <Lucide.Grid className="h-6 w-6 text-indigo-500" /> Interactive Browser Workspace Tools ({TOOLS_DATA.length})
        </h2>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((cat) => {
            const toolsInCat = TOOLS_DATA.filter(t => t.category === cat);
            return (
              <div key={cat} className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 p-6 rounded-3xl shadow-premium-sm flex flex-col justify-between">
                <div>
                  <h3 className="font-display text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider mb-4 border-b border-slate-100 dark:border-slate-850 pb-2.5">
                    {cat.replace('-', ' ')}
                  </h3>
                  <ul className="space-y-3 text-xs">
                    {toolsInCat.map((tool) => (
                      <li key={tool.id}>
                        <span
                          onClick={() => navigate(`/${tool.urlPath}`)}
                          className="font-semibold text-slate-605 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer transition flex items-center gap-1.5 hover:underline"
                        >
                          <Lucide.ArrowRight className="h-3 w-3 text-indigo-501" />
                          {tool.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}