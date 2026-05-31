import { useState, useRef, useEffect } from 'react';
import * as Lucide from 'lucide-react';
import { TOOLS_DATA } from '../toolsData';
import { ToolDefinition } from '../types';
import { FoldPdfLogo } from './FoldPdfLogo';

interface HeaderProps {
  currentPath: string;
  navigate: (path: string) => void;
  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;
  user: { name: string; email: string } | null;
  onAuthTrigger: () => void;
  onLogout: () => void;
}

export function Header({
  currentPath,
  navigate,
  darkMode,
  setDarkMode,
  user,
  onAuthTrigger,
  onLogout
}: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close search auto-complete when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [activeMenu, setActiveMenu] = useState<'convert' | 'all' | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close search/dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMenuClick = (menu: 'convert' | 'all') => {
    setActiveMenu(activeMenu === menu ? null : menu);
  };

  const menuNavigate = (path: string) => {
    navigate(path);
    setActiveMenu(null);
  };

  const filteredTools = TOOLS_DATA.filter((tool) =>
    tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tool.shortDesc.toLowerCase().includes(searchQuery.toLowerCase())
  ).slice(0, 6);

  const categories = [
    { id: 'image-conversions', label: 'Image Conversions', icon: 'Image' },
    { id: 'document-conversions', label: 'Document Conversions', icon: 'FileText' },
    { id: 'pdf-editing', label: 'PDF Editing', icon: 'Scissors' }
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-100 bg-white/95 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-905/95 transition-colors duration-200 shadow-premium-sm flex flex-col">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* LOGO */}
        <div 
          onClick={() => navigate('/')} 
          className="flex cursor-pointer items-center space-x-1.5 transition-all duration-200 hover:scale-[1.01]"
          id="hdr-logo-btn"
        >
          <FoldPdfLogo className="h-9 w-9" showText={true} />
        </div>

        {/* NAVIGATION LINKS */}
        <nav className="hidden items-center space-x-5 lg:flex" ref={dropdownRef}>
          <span 
            onClick={() => menuNavigate('/merge-pdf')} 
            className="cursor-pointer text-xs font-bold uppercase tracking-wider text-slate-700 hover:text-indigo-650 dark:text-slate-250 dark:hover:text-indigo-400 transition-colors"
          >
            Merge PDF
          </span>
          <span 
            onClick={() => menuNavigate('/split-pdf')} 
            className="cursor-pointer text-xs font-bold uppercase tracking-wider text-slate-700 hover:text-indigo-650 dark:text-slate-250 dark:hover:text-indigo-400 transition-colors"
          >
            Split PDF
          </span>
          <span 
            onClick={() => menuNavigate('/compress-pdf')} 
            className="cursor-pointer text-xs font-bold uppercase tracking-wider text-slate-700 hover:text-indigo-650 dark:text-slate-250 dark:hover:text-indigo-400 transition-colors"
          >
            Compress PDF
          </span>

          {/* CONVERT PDF DROPDOWN TRIGGER */}
          <div className="relative">
            <button 
              onClick={() => handleMenuClick('convert')}
              className={`flex items-center space-x-1 cursor-pointer text-xs font-bold uppercase tracking-wider transition-colors outline-none ${
                activeMenu === 'convert' ? 'text-indigo-600' : 'text-slate-700 hover:text-indigo-650 dark:text-slate-250 dark:hover:text-indigo-400'
              }`}
            >
              <span>Convert PDF</span>
              <Lucide.ChevronDown className={`h-3 w-3 mt-0.5 transition-transform ${activeMenu === 'convert' ? 'rotate-180 text-indigo-500' : ''}`} />
            </button>
            
            {/* CONVERT PDF DROPDOWN PANELS */}
            {activeMenu === 'convert' && (
              <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[480px] bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-2xl shadow-2xl z-50 p-6 grid grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2 duration-150">
                <div>
                  <div className="text-[10px] font-extrabold tracking-widest text-slate-400 dark:text-slate-500 uppercase pb-2 border-b dark:border-slate-800 mb-3 flex items-center gap-1.5">
                    <Lucide.FileUp className="h-3 w-3 text-indigo-500" />
                    Convert to PDF
                  </div>
                  <div className="flex flex-col space-y-2">
                    {[
                      { name: 'JPG to PDF', path: '/jpg-to-pdf' },
                      { name: 'Word to PDF', path: '/word-to-pdf' },
                      { name: 'PowerPoint to PDF', path: '/pptx-to-pdf' },
                      { name: 'Excel to PDF', path: '/xlsx-to-pdf' },
                      { name: 'TXT to PDF', path: '/txt-to-pdf' }
                    ].map((item) => (
                      <button 
                        key={item.path} 
                        onClick={() => menuNavigate(item.path)}
                        className="text-left text-xs font-semibold text-slate-650 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 pl-1 border-l-2 border-transparent hover:border-indigo-500 transition-all py-0.5"
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-extrabold tracking-widest text-slate-400 dark:text-slate-500 uppercase pb-2 border-b dark:border-slate-800 mb-3 flex items-center gap-1.5">
                    <Lucide.FileDown className="h-3 w-3 text-emerald-500" />
                    Convert from PDF
                  </div>
                  <div className="flex flex-col space-y-2">
                    {[
                      { name: 'PDF to JPG', path: '/pdf-to-jpg' },
                      { name: 'PDF to Word (DOCX)', path: '/pdf-to-word' },
                      { name: 'PDF to PowerPoint (PPTX)', path: '/pdf-to-pptx' },
                      { name: 'PDF to Excel (XLSX)', path: '/pdf-to-xlsx' },
                      { name: 'PDF to TXT', path: '/pdf-to-txt' }
                    ].map((item) => (
                      <button 
                        key={item.path} 
                        onClick={() => menuNavigate(item.path)}
                        className="text-left text-xs font-semibold text-slate-650 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 pl-1 border-l-2 border-transparent hover:border-indigo-500 transition-all py-0.5"
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ALL PDF TOOLS MEGAMENU TRIGGER */}
          <div className="relative">
            <button 
              onClick={() => handleMenuClick('all')}
              className={`flex items-center space-x-1 cursor-pointer text-xs font-bold uppercase tracking-wider transition-colors outline-none ${
                activeMenu === 'all' ? 'text-indigo-600' : 'text-slate-700 hover:text-indigo-650 dark:text-slate-350 dark:hover:text-indigo-400'
              }`}
            >
              <span>All PDF Tools</span>
              <Lucide.ChevronDown className={`h-3 w-3 mt-0.5 transition-transform ${activeMenu === 'all' ? 'rotate-180 text-indigo-500' : ''}`} />
            </button>
            
            {/* FULL ALL PDF TOOLS MEGAMENU ROW */}
            {activeMenu === 'all' && (
              <div className="absolute top-10 left-1/2 -translate-x-3/4 w-[840px] bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-3xl shadow-2xl z-50 p-8 grid grid-cols-4 gap-6 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="space-y-4">
                  <div>
                    <div className="text-[10px] font-extrabold tracking-widest text-orange-500 uppercase pb-1.5 border-b dark:border-slate-800 mb-2.5 flex items-center gap-1.5">
                      <Lucide.Layers className="h-3 w-3" />
                      Organize PDF
                    </div>
                    <div className="flex flex-col space-y-1.5">
                      {[
                        { name: 'Merge PDF', path: '/merge-pdf' },
                        { name: 'Split PDF', path: '/split-pdf' },
                        { name: 'Remove PDF Pages', path: '/remove-pages' },
                        { name: 'Rotate PDF', path: '/rotate-pdf' }
                      ].map((item) => (
                        <button 
                          key={item.path} 
                          onClick={() => menuNavigate(item.path)}
                          className="text-left text-xs font-bold text-slate-650 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 pl-1 border-l-2 border-transparent hover:border-indigo-500 transition-all py-0.5"
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-extrabold tracking-widest text-emerald-500 uppercase pb-1.5 border-b dark:border-slate-800 mb-2.5 flex items-center gap-1.5">
                      <Lucide.Activity className="h-3 w-3" />
                      Optimize PDF
                    </div>
                    <div className="flex flex-col space-y-1.5">
                      {[
                        { name: 'Compress PDF', path: '/compress-pdf' },
                        { name: 'Repair PDF', path: '/repair-pdf' },
                        { name: 'OCR scanned reader', path: '/ocr-pdf' }
                      ].map((item) => (
                        <button 
                          key={item.path} 
                          onClick={() => menuNavigate(item.path)}
                          className="text-left text-xs font-bold text-slate-650 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 pl-1 border-l-2 border-transparent hover:border-indigo-500 transition-all py-0.5"
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-extrabold tracking-widest text-indigo-500 uppercase pb-1.5 border-b dark:border-slate-800 mb-2.5 flex items-center gap-1.5">
                    <Lucide.FileUp className="h-3 w-3" />
                    Convert to PDF
                  </div>
                  <div className="flex flex-col space-y-1.5">
                    {[
                      { name: 'JPG to PDF', path: '/jpg-to-pdf' },
                      { name: 'Word to PDF', path: '/word-to-pdf' },
                      { name: 'PowerPoint to PDF', path: '/pptx-to-pdf' },
                      { name: 'Excel to PDF', path: '/xlsx-to-pdf' },
                      { name: 'TXT to PDF', path: '/txt-to-pdf' }
                    ].map((item) => (
                      <button 
                        key={item.path} 
                        onClick={() => menuNavigate(item.path)}
                        className="text-left text-xs font-bold text-slate-650 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 pl-1 border-l-2 border-transparent hover:border-indigo-500 transition-all py-0.5"
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-extrabold tracking-widest text-indigo-500 uppercase pb-1.5 border-b dark:border-slate-800 mb-2.5 flex items-center gap-1.5">
                    <Lucide.FileDown className="h-3 w-3" />
                    Convert from PDF
                  </div>
                  <div className="flex flex-col space-y-1.5">
                    {[
                      { name: 'PDF to JPG', path: '/pdf-to-jpg' },
                      { name: 'PDF to Word (DOCX)', path: '/pdf-to-word' },
                      { name: 'PDF to PowerPoint (PPTX)', path: '/pdf-to-pptx' },
                      { name: 'PDF to Excel (XLSX)', path: '/pdf-to-xlsx' },
                      { name: 'PDF to WebP image', path: '/pdf-to-webp' },
                      { name: 'PDF to TXT log file', path: '/pdf-to-txt' }
                    ].map((item) => (
                      <button 
                        key={item.path} 
                        onClick={() => menuNavigate(item.path)}
                        className="text-left text-xs font-bold text-slate-650 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 pl-1 border-l-2 border-transparent hover:border-indigo-500 transition-all py-0.5"
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="text-[10px] font-extrabold tracking-widest text-pink-500 uppercase pb-1.5 border-b dark:border-slate-800 mb-2.5 flex items-center gap-1.5">
                      <Lucide.Edit2 className="h-3 w-3" />
                      Edit PDF
                    </div>
                    <div className="flex flex-col space-y-1.5">
                      {[
                        { name: 'Rotate pages', path: '/rotate-pdf' },
                        { name: 'Add Watermark', path: '/add-watermark' },
                        { name: 'Add Page Numbers', path: '/add-page-numbers' }
                      ].map((item) => (
                        <button 
                          key={item.path} 
                          onClick={() => menuNavigate(item.path)}
                          className="text-left text-xs font-bold text-slate-650 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 pl-1 border-l-2 border-transparent hover:border-indigo-500 transition-all py-0.5"
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-gray-200 dark:bg-neutral-800" />

          {/* SYSTEM MODE SETTING BUTTON */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="rounded-xl border border-gray-100 bg-white p-2 text-neutral-600 shadow-sm outline-none transition-transform hover:scale-[1.03] dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
            title="Toggle theme mode"
            id="hdr-theme-toggle"
          >
            {darkMode ? <Lucide.Sun className="h-4.5 w-4.5 text-amber-500" /> : <Lucide.Moon className="h-4.5 w-4.5 text-neutral-600" />}
          </button>

          {/* COOPERATIVE AUTH SIGN-IN ACTIONS */}
          {user ? (
            <div className="flex items-center space-x-3">
              <div className="flex h-8 items-center space-x-2 rounded-full border border-gray-150 bg-gray-50 px-3 py-1 text-sm font-medium dark:border-neutral-800 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                <Lucide.User className="h-4 w-4 text-indigo-500" />
                <span className="line-clamp-1 max-w-[100px]">{user.name}</span>
              </div>
              <button
                onClick={onLogout}
                className="text-xs font-semibold text-neutral-500 hover:text-red-500 transition-colors cursor-pointer"
                id="hdr-logout-btn"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-4">
              <button
                onClick={onAuthTrigger}
                className="text-xs font-bold uppercase tracking-wider text-slate-650 dark:text-slate-350 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                id="hdr-signin-btn"
              >
                Log In
              </button>
              <button
                onClick={onAuthTrigger}
                className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider rounded-full hover:bg-indigo-700 transition-colors shadow-premium-sm shadow-indigo-600/20"
                id="hdr-signup-btn"
              >
                Sign Up Free
              </button>
            </div>
          )}
        </nav>

        {/* MOBILE MENU TRIGGER */}
        <div className="flex items-center space-x-2 lg:hidden">
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="rounded-xl p-2 text-neutral-500 dark:text-neutral-400"
          >
            {darkMode ? <Lucide.Sun className="h-4.5 w-4.5" /> : <Lucide.Moon className="h-4.5 w-4.5" />}
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded-xl p-2 text-neutral-600 dark:text-neutral-400"
          >
            {mobileMenuOpen ? <Lucide.X className="h-5 w-5" /> : <Lucide.Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* ROW 2: DESKTOP SEARCH BAR SPACED CENTERED BELOW MERGE, SPLIT, COMPRESS */}
      <div className="hidden border-t border-slate-100/60 dark:border-slate-800/50 pb-3 pt-2.5 lg:block">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex justify-center">
          <div ref={searchRef} className="relative w-full max-w-xl">
            <div className="relative">
              <Lucide.Search className="absolute top-2.5 left-3.5 h-4 w-4 text-neutral-405 dark:text-neutral-400" />
              <input
                type="text"
                placeholder="Search 30+ tools... (e.g., compress, split, AI summary)"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowResults(true);
                }}
                onFocus={() => setShowResults(true)}
                className="w-full rounded-full border border-gray-200 bg-gray-50/50 py-1.5 pr-4 pl-10.5 text-sm outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:focus:border-indigo-500 dark:focus:bg-neutral-900"
                id="hdr-search-input"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute top-2.5 right-3 text-neutral-400 hover:text-neutral-600"
                >
                  <Lucide.X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* AUTO-COMPLETE RESULTS DROP-DOWN */}
            {showResults && searchQuery && (
              <div className="absolute left-0 right-0 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-gray-100 bg-white p-2 shadow-2xl dark:border-neutral-850 dark:bg-neutral-900 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                {filteredTools.length > 0 ? (
                  <>
                    <div className="px-3 py-1.5 text-[11px] font-semibold tracking-wider text-neutral-400 uppercase">
                      Suggested PDF Tools
                    </div>
                    {filteredTools.map((tool) => (
                      <button
                        key={tool.id}
                        onClick={() => {
                          navigate(`/${tool.urlPath}`);
                          setSearchQuery('');
                          setShowResults(false);
                        }}
                        className="flex w-full items-center rounded-xl p-2.5 text-left text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800/60 transition-colors"
                      >
                        <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
                          <span className="text-xs font-semibold">★</span>
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-neutral-900 dark:text-white">
                            {tool.name}
                          </div>
                          <div className="line-clamp-1 text-xs text-neutral-500">
                            {tool.shortDesc}
                          </div>
                        </div>
                      </button>
                    ))}
                  </>
                ) : (
                  <div className="p-4 text-center text-sm text-neutral-500">
                    No matching tools found. Try "compress" or "word".
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MOBILE DROP-DOWN MENU */}
      {mobileMenuOpen && (
        <div className="border-t border-gray-100 bg-white py-4 px-4 shadow-xl dark:border-neutral-800 dark:bg-neutral-900 animate-in slide-in-from-top-4 duration-200 lg:hidden">
          {/* Mobile search bar */}
          <div className="relative mb-4">
            <Lucide.Search className="absolute top-2.5 left-3 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search 30+ tools..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowResults(true);
              }}
              className="w-full rounded-full border border-gray-150 py-1.5 pl-10 text-sm outline-none dark:border-neutral-800 dark:bg-neutral-800 dark:text-white"
            />
            {showResults && searchQuery && (
              <div className="absolute left-0 right-0 mt-2 max-h-48 overflow-y-auto rounded-xl border bg-white p-2 shadow-2xl dark:bg-neutral-850 z-55">
                {filteredTools.map((tool) => (
                  <button
                    key={tool.id}
                    onClick={() => {
                      navigate(`/${tool.urlPath}`);
                      setSearchQuery('');
                      setShowResults(false);
                      setMobileMenuOpen(false);
                    }}
                    className="flex w-full items-center rounded-lg p-2 text-left text-neutral-850 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  >
                    <span className="text-sm font-semibold">{tool.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col space-y-3.5 pt-2">
            <button
              onClick={() => { navigate('/blog'); setMobileMenuOpen(false); }}
              className="text-left font-medium text-neutral-600 hover:text-indigo-600 dark:text-neutral-300"
            >
              Blog Posts
            </button>
            <button
              onClick={() => { navigate('/about'); setMobileMenuOpen(false); }}
              className="text-left font-medium text-neutral-600 hover:text-indigo-600 dark:text-neutral-300"
            >
              About Company
            </button>
            <button
              onClick={() => { navigate('/contact'); setMobileMenuOpen(false); }}
              className="text-left font-medium text-neutral-600 hover:text-indigo-600 dark:text-neutral-300"
            >
              Support Center
            </button>

            <div className="h-px bg-gray-100 dark:bg-neutral-850 my-1" />

            {user ? (
              <div className="flex flex-col space-y-2">
                <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300 text-center pb-2">
                  Signed in as: <span className="font-semibold">{user.name}</span>
                </div>
                <button
                  onClick={() => { onLogout(); setMobileMenuOpen(false); }}
                  className="rounded-lg border border-red-250 py-2 text-center text-sm font-semibold text-red-500 hover:bg-red-50"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => { onAuthTrigger(); setMobileMenuOpen(false); }}
                  className="rounded-lg border border-gray-155 py-2 text-center text-sm font-medium text-neutral-700 hover:bg-gray-50 dark:border-neutral-800 dark:text-neutral-300"
                >
                  Sign In
                </button>
                <button
                  onClick={() => { onAuthTrigger(); setMobileMenuOpen(false); }}
                  className="rounded-lg bg-indigo-600 py-2 text-center text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  Sign Up
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
