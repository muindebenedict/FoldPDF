import * as Lucide from 'lucide-react';
import { BLOG_POSTS } from '../toolsData';

interface BlogSectionProps {
  postSlug?: string;
  navigate: (path: string) => void;
}

export function BlogSection({ postSlug, navigate }: BlogSectionProps) {
  
  // Find specific blog post
  const activePost = BLOG_POSTS.find((p) => p.slug === postSlug);

  // BACK TO MAIN BLOGS INDEX
  const handleBackToBlogs = () => {
    navigate('/blog');
  };

  // 1. CHOSEN ARTICLE READER SCREEN
  if (postSlug && activePost) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* BREADCRUMB */}
        <nav className="mb-6 flex items-center space-x-2 text-xs text-neutral-500 dark:text-neutral-450">
          <span onClick={() => navigate('/')} className="hover:text-indigo-650 cursor-pointer">FoldPDF Home</span>
          <Lucide.ChevronRight className="h-3 w-3" />
          <span onClick={handleBackToBlogs} className="hover:text-indigo-650 cursor-pointer">Learning Center Blog</span>
          <Lucide.ChevronRight className="h-3 w-3" />
          <span className="line-clamp-1 text-neutral-800 dark:text-neutral-200 font-semibold">{activePost.title}</span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* ARTICLE BODY */}
          <article className="lg:col-span-2 rounded-3xl border border-gray-150 p-6 sm:p-8 dark:border-neutral-800 bg-white dark:bg-neutral-900/40 shadow-sm animate-in fade-in duration-300">
            <div className="flex items-center space-x-3 text-xs font-semibold uppercase text-indigo-600 dark:text-indigo-400">
              <span>{activePost.category}</span>
              <span className="h-1 w-1 rounded-full bg-gray-300 dark:bg-neutral-600" />
              <span className="text-neutral-500 dark:text-neutral-450">{activePost.date}</span>
            </div>

            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-neutral-950 dark:text-white sm:text-4xl font-sans mb-4 leading-tight">
              {activePost.title}
            </h1>

            <div className="flex items-center space-x-3 mb-8 pb-6 border-b border-gray-150 dark:border-neutral-800">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-605 text-sm font-bold dark:bg-indigo-950/40 dark:text-indigo-400">
                FP
              </div>
              <div className="text-xs">
                <p className="font-bold text-neutral-900 dark:text-white">FoldPDF Editorial Staff</p>
                <p className="text-neutral-450">Senior Document Architect • {activePost.readTime}</p>
              </div>
            </div>

            {/* Markdown rendered body with standard elegant spacing */}
            <div className="prose prose-indigo max-w-none dark:prose-invert text-neutral-700 dark:text-neutral-350 text-base leading-relaxed space-y-6">
              {activePost.content.split('\n\n').map((para, idx) => {
                if (para.trim().startsWith('###')) {
                  return (
                    <h3 key={idx} className="text-xl font-bold text-neutral-950 dark:text-white mt-8 mb-2">
                      {para.replace('###', '').trim()}
                    </h3>
                  );
                }
                if (para.trim().startsWith('####')) {
                  return (
                    <h4 key={idx} className="text-lg font-bold text-neutral-950 dark:text-white mt-6 mb-2">
                      {para.replace('####', '').trim()}
                    </h4>
                  );
                }
                return (
                  <p key={idx} className="whitespace-pre-line leading-relaxed">
                    {para.trim()}
                  </p>
                );
              })}
            </div>

            {/* AD SENS SLOT IN BLOG READING FLOW */}
            <div className="mt-8 border-t border-gray-150 dark:border-neutral-800 pt-6">
              <div className="p-4 bg-gray-50 dark:bg-neutral-950/40 rounded-2xl border border-dashed border-gray-200 dark:border-neutral-800 text-center">
                <span className="text-[10px] font-bold tracking-widest text-neutral-401 uppercase block mb-1">Sponsored Recommendation</span>
                <p className="text-xs text-neutral-500 mb-2">Need to apply changes discovered in the guide? Try FoldPDF fast compression optimizer.</p>
                <button 
                  onClick={() => navigate('/compress-pdf')}
                  className="rounded-full bg-indigo-600 text-white font-semibold text-xs px-4 py-1.5 shadow-md shadow-indigo-650/10 hover:bg-indigo-700 transition"
                >
                  Compress PDF File Online
                </button>
              </div>
            </div>
          </article>

          {/* SIDEBAR FOR ADS AND POPULAR TOOLS IN BLOG */}
          <div className="space-y-6">
            <div className="rounded-3xl border border-gray-150 p-6 dark:border-neutral-800 bg-white dark:bg-neutral-900/40">
              <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900 dark:text-white mb-4">
                Popular Learning Tools
              </h3>
              <div className="space-y-3">
                {[
                  { name: 'Compress PDF', desc: 'Reduce document size elegantly', icon: 'FileDown', path: '/compress-pdf' },
                  { name: 'PDF to Word (DOCX)', desc: 'Excellent layout preservation', icon: 'FileText', path: '/pdf-to-word' },
                  { name: 'JPG to PDF', desc: 'Compile receipts and images', icon: 'Image', path: '/jpg-to-pdf' }
                ].map((t) => (
                  <div 
                    key={t.name}
                    onClick={() => navigate(t.path)}
                    className="flex cursor-pointer items-center p-2.5 rounded-2xl hover:bg-gray-50 dark:hover:bg-neutral-850/50 transition-colors"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 text-xs font-semibold dark:bg-indigo-950/40 dark:text-indigo-400 mr-3">
                      FP
                    </div>
                    <div>
                      <p className="text-sm font-bold text-neutral-950 dark:text-white">{t.name}</p>
                      <p className="text-xs text-neutral-500">{t.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* PLATFORM SECURE HIGHLIGHT IN SIDEBAR */}
            <div className="rounded-3xl border border-slate-150 p-6 dark:border-neutral-800 bg-white dark:bg-neutral-900/40 text-center shadow-premium-sm">
              <div className="h-9 w-9 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Lucide.Zap className="h-5 w-5" />
              </div>
              <span className="text-[10px] font-bold tracking-widest text-indigo-600 dark:text-indigo-400 uppercase block mb-1">No Sign-up Required</span>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed my-2">
                Convert, merge, split, and edit files instantly without creating an account or paying fees.
              </p>
              <button 
                onClick={() => navigate('/')} 
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline mt-2 inline-flex items-center"
              >
                Go to Workspace <Lucide.ChevronRight className="h-3 w-3 ml-0.5" />
              </button>
            </div>
          </div>
        </div>

        {/* OTHER RELEVANT READS SECTION */}
        <div className="mt-12 pt-8 border-t border-gray-150 dark:border-neutral-800">
          <h2 className="text-2xl font-extrabold text-neutral-950 dark:text-white mb-6">People Also Reading</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {BLOG_POSTS.filter((p) => p.slug !== activePost.slug).slice(0, 3).map((post) => (
              <div 
                key={post.slug}
                onClick={() => navigate(`/blog/${post.slug}`)}
                className="group cursor-pointer rounded-2xl border border-gray-150 p-5 dark:border-neutral-850 bg-white dark:bg-neutral-900/30 hover:shadow-lg transition-all duration-200"
              >
                <div className="text-xs font-bold text-indigo-600 uppercase mb-2">{post.category}</div>
                <h4 className="text-base font-bold text-neutral-900 dark:text-white group-hover:text-indigo-650 transition-colors line-clamp-1">
                  {post.title}
                </h4>
                <p className="text-xs text-neutral-500 mt-2 line-clamp-2">{post.excerpt}</p>
                <div className="mt-4 flex items-center justify-between text-xs text-neutral-400">
                  <span>{post.date}</span>
                  <span className="font-semibold text-indigo-605 group-hover:underline flex items-center">
                    Read Post <Lucide.ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 2. BLOG INDEX SCREEN
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="text-center max-w-xl mx-auto mb-12">
        <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-450 uppercase tracking-widest">
          FoldPDF Learning Center
        </span>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-neutral-950 dark:text-white sm:text-4.5xl font-sans leading-none">
          Document Archiving Blog
        </h1>
        <p className="mt-3.5 text-sm text-neutral-500 dark:text-neutral-400 leading-normal">
          Read our guides on how to shrink files, copy scanned pages, clean up images, and keep your legal documents private.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* BIG HERO ARTICLE CARD IN BLOCK */}
        <div className="lg:col-span-2 space-y-8">
          {BLOG_POSTS.slice(0, 3).map((post) => (
            <div 
              key={post.slug}
              onClick={() => navigate(`/blog/${post.slug}`)}
              className="group cursor-pointer rounded-3xl border border-gray-150 p-6 sm:p-8 dark:border-neutral-800 bg-white dark:bg-neutral-900/40 hover:shadow-2xl transition-all duration-300"
            >
              <div className="flex items-center space-x-2 text-xs font-semibold uppercase text-indigo-600 dark:text-indigo-400">
                <span>{post.category}</span>
                <span className="h-1 w-1 rounded-full bg-gray-300 dark:bg-neutral-600" />
                <span className="text-neutral-500">{post.date}</span>
              </div>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-neutral-950 dark:text-white group-hover:text-indigo-650 dark:group-hover:text-indigo-400 transition-colors">
                {post.title}
              </h2>
              <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed line-clamp-2">
                {post.excerpt}
              </p>
              <div className="mt-6 flex items-center justify-between text-xs font-semibold">
                <span className="text-neutral-450">{post.readTime}</span>
                <span className="text-indigo-600 flex items-center">
                  Read Article <Lucide.ArrowUpRight className="h-4 w-4 ml-1 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* SIDE BAR CARD AD/RECOMMENDATIONS */}
        <div className="space-y-6">
          <div className="rounded-3xl border border-gray-150 p-6 dark:border-neutral-800 bg-white dark:bg-neutral-900/40">
            <h3 className="text-xs font-extrabold tracking-wider uppercase text-neutral-400 mb-4">
              Other Related Guides
            </h3>
            <div className="space-y-4">
              {BLOG_POSTS.slice(3).map((post) => (
                <div 
                  key={post.slug}
                  onClick={() => navigate(`/blog/${post.slug}`)}
                  className="group cursor-pointer border-b border-gray-100 dark:border-neutral-850 pb-4 last:border-b-0 last:pb-0"
                >
                  <span className="text-[10px] font-bold tracking-widest uppercase text-indigo-600">{post.category}</span>
                  <h4 className="text-sm font-bold text-neutral-900 dark:text-white group-hover:text-indigo-650 transition-colors line-clamp-1">
                    {post.title}
                  </h4>
                  <span className="text-[11px] text-neutral-400">{post.date}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-150 p-6 dark:border-neutral-800 bg-white dark:bg-neutral-900/40 text-center shadow-premium-sm">
            <div className="h-9 w-9 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Lucide.ShieldCheck className="h-5 w-5" />
            </div>
            <span className="text-[10px] font-bold tracking-widest text-emerald-600 dark:text-emerald-400 uppercase block mb-1">Privacy Focused</span>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed my-2">
              All documents are cleared automatically from server memory. Zero tracking, zero storage, complete peace of mind.
            </p>
            <button 
              onClick={() => navigate('/')} 
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline mt-2 inline-flex items-center"
            >
              Open Workspace <Lucide.ChevronRight className="h-3 w-3 ml-0.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}