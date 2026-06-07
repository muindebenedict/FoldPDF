import React, { useState } from "react";
import * as Lucide from "lucide-react";
import { DETAILED_BLOG_POSTS, DetailedBlogPost } from "./blogPostsData";

interface BlogIndexProps {
  navigate: (path: string) => void;
}

export default function BlogIndex({ navigate }: BlogIndexProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const categories = ["All", "PDF Security", "Privacy Tips", "Product Updates"];

  const filteredPosts = selectedCategory === "All"
    ? DETAILED_BLOG_POSTS
    : DETAILED_BLOG_POSTS.filter(post => post.category === selectedCategory);

  const featuredPost = DETAILED_BLOG_POSTS[0];
  const gridPosts = filteredPosts.filter(post => post.slug !== featuredPost.slug || selectedCategory !== "All");

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 font-body animate-in fade-in duration-300 dark:text-slate-100 dark:bg-slate-950">
      
      {/* Blog Header */}
      <div className="text-center max-w-2xl mx-auto mb-16">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-100/30">
          <Lucide.BookOpen className="h-3.5 w-3.5" />
          FoldPDF Learning Library
        </span>
        <h1 className="mt-4 font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-800 dark:text-white leading-tight">
          Securing Your Digital Workflows
        </h1>
        <p className="mt-4 text-slate-500 dark:text-slate-400 text-sm sm:text-base max-w-xl mx-auto">
          Deep-dive guides on browser security, document privacy compliance, on-device tools, and keeping your files safe.
        </p>
      </div>

      {/* Featured Article Node */}
      {selectedCategory === "All" && featuredPost && (
        <div 
          onClick={() => navigate(`/blog/${featuredPost.slug}`)}
          className="group cursor-pointer bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-3xl p-6 sm:p-8 shadow-premium-md hover:shadow-premium-lg hover:-translate-y-1 transition-all duration-300 mb-16 grid lg:grid-cols-12 gap-8 items-center"
        >
          <div className="lg:col-span-12">
            <div className="flex items-center gap-3 text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-4">
              <span className="bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-1 rounded-md">{featuredPost.category}</span>
              <span className="text-slate-400">•</span>
              <span className="text-slate-400 flex items-center gap-1"><Lucide.Clock className="h-3.5 w-3.5" /> {featuredPost.readTime}</span>
            </div>
            
            <h2 className="font-display text-2xl sm:text-3.5xl font-extrabold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors duration-200 leading-tight">
              {featuredPost.title}
            </h2>
            
            <p className="mt-4 text-slate-605 dark:text-slate-400 text-sm sm:text-base leading-relaxed line-clamp-3">
              {featuredPost.excerpt}
            </p>

            <div className="mt-6 p-4 rounded-2xl bg-slate-50 dark:bg-slate-905 border border-slate-100 dark:border-slate-800/40 max-w-2xl">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Security Index Callout</span>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                👉 <strong>Key Statistic:</strong> {featuredPost.statistic}
              </p>
            </div>

            <div className="mt-8 flex items-center justify-between border-t border-slate-100 dark:border-slate-800/60 pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-extrabold text-indigo-600 dark:text-indigo-400">FP</div>
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-white">{featuredPost.author}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest">{featuredPost.date}</p>
                </div>
              </div>
              <span className="text-xs font-bold text-indigo-650 dark:text-indigo-400 flex items-center gap-1 hover:underline">
                Read Abstract <Lucide.ArrowRight className="h-4 w-4" />
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Category Tabs list */}
      <div className="flex flex-wrap gap-2.5 pb-8 border-b border-slate-100 dark:border-slate-850 mb-10 justify-center">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-4.5 py-2.5 text-xs font-bold tracking-tight rounded-xl duration-200 transition ${
              selectedCategory === cat
                ? "bg-indigo-600 text-white shadow-premium-sm"
                : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-indigo-605 hover:border-indigo-200 dark:hover:bg-slate-850"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grid of articles */}
      {gridPosts.length > 0 ? (
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {gridPosts.map((post) => (
            <article 
              key={post.slug}
              onClick={() => navigate(`/blog/${post.slug}`)}
              className="group cursor-pointer bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/80 rounded-2xl p-6 shadow-premium-sm hover:shadow-premium-md hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-[11px] font-bold text-indigo-605 dark:text-indigo-400 uppercase mb-3">
                  <span>{post.category}</span>
                  <span className="text-slate-400 flex items-center gap-1"><Lucide.Clock className="h-3 w-3" /> {post.readTime}</span>
                </div>
                
                <h3 className="font-display text-lg font-bold text-slate-850 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors flex items-start gap-1">
                  {post.title}
                </h3>
                
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3">
                  {post.excerpt}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-850 flex items-center justify-between text-xs text-slate-400">
                <span>{post.date}</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-0.5 group-hover:underline">
                  Read Article <Lucide.ChevronRight className="h-3 w-3" />
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="py-16 text-center text-slate-400 border border-dashed border-slate-200 rounded-3xl">
          No posts discovered under category "{selectedCategory}".
        </div>
      )}

    </div>
  );
}