import React, { useState, useEffect } from "react";
import * as Lucide from "lucide-react";
import { DETAILED_BLOG_POSTS, DetailedBlogPost } from "./blogPostsData";
import { generateMetaTags, generateStructuredData } from "../../utils/seo";

interface BlogPostPageProps {
  slug: string;
  navigate: (path: string) => void;
}

export default function BlogPostPage({ slug, navigate }: BlogPostPageProps) {
  const activePost = DETAILED_BLOG_POSTS.find((p) => p.slug === slug);
  const [scrollProgress, setScrollProgress] = useState(0);

  // Exclude current post and return 3 related posts
  const relatedArticles = DETAILED_BLOG_POSTS.filter((p) => p.slug !== slug).slice(0, 3);

  // Monitor scroll progress for the progress bar
  useEffect(() => {
    const handleScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (totalHeight > 0) {
        const progress = (window.scrollY / totalHeight) * 100;
        setScrollProgress(progress);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Update dynamic metadata whenever active post loads
  useEffect(() => {
    if (activePost) {
      // 1. Meta / OpenGraph Tags
      generateMetaTags({
        title: `${activePost.title} | FoldPDF Security Blog`,
        description: activePost.excerpt,
        path: `/blog/${activePost.slug}`,
        type: "article",
        publishDate: activePost.date,
        modifyDate: activePost.lastUpdated,
        authorName: activePost.author
      });

      // 2. Structured JSON-LD Data for Search Engines
      generateStructuredData("Article", {
        slug: activePost.slug,
        title: activePost.title,
        excerpt: activePost.excerpt,
        publishDate: activePost.date,
        modifyDate: activePost.lastUpdated,
        faqs: activePost.faqs
      });
    }
  }, [activePost]);

  if (!activePost) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center font-body dark:text-slate-100">
        <Lucide.FileWarning className="mx-auto h-12 w-12 text-rose-500 mb-4 animate-bounce" />
        <h2 className="text-2xl font-black font-display text-slate-900 dark:text-white">Article Not Discovered</h2>
        <p className="text-slate-500 mt-2 text-sm">We could not match the requested PDF security post slug.</p>
        <button
          onClick={() => navigate("/blog")}
          className="mt-6 inline-flex items-center gap-1 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-indigo-750 transition"
        >
          <Lucide.ArrowLeft className="h-4 w-4" /> Go Back to Blog Listing
        </button>
      </div>
    );
  }

  // Parse H2 lines statically to populate Table of Contents items
  const headings = activePost.content
    .split("\n")
    .filter((line) => line.trim().startsWith("<h2>"))
    .map((rawLine) => {
      const text = rawLine.replace(/<[^>]*>/g, "").trim();
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      return { text, id };
    });

  const handleHeadingClick = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="relative font-body dark:text-slate-100 dark:bg-slate-950 pb-20">
      
      {/* 1. Sticky Reading Progress Header */}
      <div className="fixed top-[57px] left-0 w-full h-[3.5px] bg-slate-100 dark:bg-slate-900 z-40">
        <div 
          className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 transition-all duration-75"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      {/* Main Container */}
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        
        {/* Navigation Breadcrumbs */}
        <nav className="mb-8 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span onClick={() => navigate("/")} className="hover:text-indigo-600 cursor-pointer flex items-center gap-1"><Lucide.Home className="h-3 w-3" /> Home</span>
          <Lucide.ChevronRight className="h-3 w-3" />
          <span onClick={() => navigate("/blog")} className="hover:text-indigo-600 cursor-pointer">Security Blog</span>
          <Lucide.ChevronRight className="h-3 w-3" />
          <span className="line-clamp-1 font-semibold text-slate-800 dark:text-white">{activePost.title}</span>
        </nav>

        {/* Dynamic Column Layout */}
        <div className="grid gap-10 lg:grid-cols-12 items-start">
          
          {/* Main Article Segment */}
          <article className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-3xl p-6 sm:p-8 shadow-premium-sm">
            
            {/* Metadata Badges */}
            <div className="flex flex-wrap items-center gap-3.5 text-xs font-semibold text-indigo-650 dark:text-indigo-400 uppercase tracking-widest mb-4">
              <span className="bg-indigo-50 dark:bg-indigo-950/40 px-3 py-1 rounded-full">{activePost.category}</span>
              <span className="text-slate-350">•</span>
              <span className="flex items-center gap-1"><Lucide.Calendar className="h-3.5 w-3.5" /> Published: {activePost.date}</span>
              <span className="text-slate-350">•</span>
              <span className="text-slate-500 dark:text-slate-405 flex items-center gap-1"><Lucide.RefreshCw className="h-3.5 w-3.5" /> Updated: {activePost.lastUpdated}</span>
            </div>

            {/* Main Headline */}
            <h1 className="font-display text-3xl sm:text-4.5xl font-black text-slate-805 dark:text-white leading-[1.1] tracking-tight mb-6">
              {activePost.title}
            </h1>

            {/* Author Attribution Card */}
            <div className="flex items-center gap-3 mb-8 pb-6 border-b border-slate-100 dark:border-slate-850">
              <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-indigo-505 to-purple-500 flex items-center justify-center font-bold text-white text-xs shadow-sm">FP</div>
              <div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Written by: {activePost.author}</p>
                <p className="text-[10px] text-slate-405 uppercase tracking-wider flex items-center gap-1">
                  Senior Document Compliance • <Lucide.Clock className="h-3 w-3" /> {activePost.readTime}
                </p>
              </div>
            </div>

            {/* SUMMARY BOX - FEATURE 8 */}
            <div className="bg-slate-50/80 dark:bg-slate-905 border-l-4 border-indigo-500 dark:border-indigo-400 rounded-r-2xl p-5 mb-8">
              <div className="flex items-center gap-2 mb-1.5 text-slate-800 dark:text-slate-200">
                <Lucide.BookMarked className="h-5 w-5 text-indigo-500" />
                <h4 className="text-sm font-bold uppercase tracking-wider">Executive Summary</h4>
              </div>
              <p className="text-xs sm:text-sm text-slate-650 dark:text-slate-400 leading-relaxed italic">
                "{activePost.summary}"
              </p>
            </div>

            {/* STATISTIC CALLOUT - FEATURE 8 */}
            <div className="bg-gradient-to-r from-indigo-600/5 to-purple-600/5 border border-indigo-200 dark:border-indigo-900 rounded-3xl p-6 mb-8 flex flex-col sm:flex-row gap-4 items-center">
              <div className="h-12 w-12 bg-white dark:bg-slate-850 rounded-2xl flex items-center justify-center text-indigo-650 dark:text-indigo-400 shadow-sm shrink-0">
                <Lucide.PieChart className="h-6 w-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold tracking-widest text-indigo-600 dark:text-indigo-400 uppercase">Key Industry Statistic</span>
                <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-bold mt-0.5 leading-relaxed">
                  {activePost.statistic}
                </p>
              </div>
            </div>

            {/* RENDERED ARTICLE HTML CONTENT - Custom parsed to inject Header IDs matching TOC */}
            <div className="prose prose-indigo max-w-none dark:prose-invert text-slate-700 dark:text-slate-350 text-[15px] sm:text-base leading-relaxed space-y-6">
              {activePost.content.split("\n").map((line, idx) => {
                const trimmed = line.trim();
                if (trimmed.startsWith("<h2>")) {
                  const headingText = trimmed.replace(/<[^>]*>/g, "").trim();
                  const headingId = headingText.toLowerCase().replace(/[^a-z0-9]+/g, "-");
                  return (
                    <h2 
                      key={idx} 
                      id={headingId} 
                      className="text-xl sm:text-2xl font-black font-display text-slate-850 dark:text-white mt-10 mb-4 pt-4 border-t border-slate-100/40"
                    >
                      {headingText}
                    </h2>
                  );
                }
                if (trimmed.startsWith("<h3>")) {
                  return (
                    <h3 key={idx} className="text-lg font-bold text-slate-850 dark:text-white mt-6 mb-3">
                      {trimmed.replace(/<[^>]*>/g, "").trim()}
                    </h3>
                  );
                }
                if (trimmed) {
                  return (
                    <p key={idx} className="leading-relaxed whitespace-normal">
                      {trimmed.replace(/<p>|<\/p>/g, "")}
                    </p>
                  );
                }
                return null;
              })}
            </div>

            {/* EXTERNAL REFERENCE LINKS - FEATURE 8 */}
            <div className="mt-10 pt-8 border-t border-slate-100 dark:border-slate-805">
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
                <Lucide.ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                Verified References & Framework Sources
              </h4>
              <ul className="space-y-2.5">
                {activePost.externalLinks.map((link, i) => (
                  <li key={i}>
                    <a 
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 dark:text-indigo-400 text-xs sm:text-sm font-semibold hover:underline flex items-center gap-1"
                    >
                      🛡️ {link.text} <Lucide.ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* INLINE FAQ SECTION ACCORDION WITH FAQS SCHEMA BINDING */}
            <div className="mt-12 bg-slate-50 dark:bg-slate-905 border border-slate-100 dark:border-slate-850 rounded-2xl p-5 sm:p-6">
              <h3 className="text-base font-bold font-display text-slate-850 dark:text-white mb-4 flex items-center gap-1.5">
                <Lucide.HelpCircle className="h-5 w-5 text-indigo-500" />
                Frequently Asked Inquiries
              </h3>
              <div className="space-y-4">
                {activePost.faqs.map((faq, i) => (
                  <div key={i} className="border-b border-slate-200/50 dark:border-slate-800 pb-4 last:border-0 last:pb-0">
                    <p className="text-xs sm:text-sm font-extrabold text-slate-800 dark:text-white flex items-start gap-1">
                      <span>Q:</span> {faq.question}
                    </p>
                    <p className="text-xs text-slate-505 dark:text-slate-400 mt-1.5 pl-4 sm:pl-5 leading-relaxed">
                      {faq.answer}
                    </p>
                  </div>
                ))}
              </div>
            </div>

          </article>

          {/* Table of Contents & Related Sidebar */}
          <div className="lg:col-span-4 space-y-8 sticky top-24">
            
            {/* Table of Contents sidebar */}
            {headings.length > 0 && (
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-3xl p-5 shadow-premium-sm">
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-1.5">
                  <Lucide.ListTree className="h-4 w-4" />
                  Table of Contents
                </h3>
                <ul className="space-y-3 border-l-2 border-slate-100 dark:border-slate-800 pl-3.5 text-xs">
                  {headings.map((head, i) => (
                    <li key={i}>
                      <button
                        onClick={() => handleHeadingClick(head.id)}
                        className="text-left font-semibold text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer hover:underline line-clamp-2"
                      >
                        {head.text}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Private File Optimizer in Sidebar */}
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-3xl p-5 text-center shadow-premium-sm">
              <Lucide.Cpu className="h-10 w-10 text-indigo-650 dark:text-indigo-400 mx-auto mb-3" />
              <h4 className="text-sm font-bold text-slate-800 dark:text-white">Secure Server Optimizer</h4>
              <p className="text-xs text-slate-500 mt-1 mb-4 leading-relaxed">
                Try our secure, fast PDF shrinker. Files are processed and permanently deleted immediately after downloading.
              </p>
              <button
                onClick={() => navigate("/compress-pdf")}
                className="w-full bg-indigo-600 text-white rounded-xl py-2 px-3 text-xs font-semibold hover:bg-indigo-750 transition shadow-sm"
              >
                Access Fast Compressor
              </button>
            </div>

          </div>

        </div>

        {/* RELATED ARTICLES LISTING GRID - FEATURE 3 */}
        <div className="mt-16 pt-12 border-t border-slate-100 dark:border-slate-850">
          <h3 className="font-display text-xl sm:text-2xl font-black text-slate-805 dark:text-white mb-6">
            Recommended Security Guides
          </h3>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {relatedArticles.map((article) => (
              <div
                key={article.slug}
                onClick={() => navigate(`/blog/${article.slug}`)}
                className="group cursor-pointer bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-2xl p-5 shadow-premium-sm hover:shadow-premium-md hover:-translate-y-1 transition-all duration-300"
              >
                <div className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase mb-2">
                  {article.category}
                </div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-white group-hover:text-indigo-605 transition duration-200 line-clamp-1">
                  {article.title}
                </h4>
                <p className="text-xs text-slate-505 dark:text-slate-400 mt-2 line-clamp-2">
                  {article.excerpt}
                </p>
                <div className="mt-4 flex items-center justify-between text-[11px] text-slate-400">
                  <span>{article.date}</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400 group-hover:underline flex items-center">
                    Read Post <Lucide.ArrowRight className="h-3.5 w-3.5 ml-0.5" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}