import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as Lucide from 'lucide-react';
import { useRouter } from './useRouter';
import { TOOLS_DATA, BLOG_POSTS } from './toolsData';
import { ToolDefinition, RecentFile } from './types';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { FoldPdfLogo } from './components/FoldPdfLogo';
import { LegalPages } from './components/LegalPages';
import { BlogSection } from './components/BlogSection';
import { ToolWorkspace } from './components/ToolWorkspace';

// Supabase auth
import { getSupabase, isSupabaseConfigured } from './lib/supabase';
import type { EmailOtpType, User as SupabaseUser } from '@supabase/supabase-js';

// Set just before the Google redirect so the welcome toast fires only when the
// user actually comes back from Google, not on every page load with a session.
const OAUTH_PENDING_KEY = 'foldpdf_oauth_pending';

// Parameters Supabase adds when it redirects back from an auth email or from
// Google: in the query string (token_hash links) or in the fragment (sessions
// and errors in the implicit flow). Stripped once handled so a refresh doesn't
// replay them.
const AUTH_URL_PARAMS = [
  'code', 'token_hash', 'type', 'error', 'error_code', 'error_description',
  'access_token', 'refresh_token', 'expires_at', 'expires_in', 'token_type',
  'provider_token', 'provider_refresh_token',
];

// A token_hash can only be verified once, and StrictMode runs effects twice in
// development: without this the second run reports a working link as expired.
const handledAuthLinks = new Set<string>();

// Same precedence as the Supabase client: the query string wins over the fragment.
function readAuthParams(): URLSearchParams {
  const merged = new URLSearchParams(window.location.hash.slice(1));
  new URLSearchParams(window.location.search).forEach((value, key) => merged.set(key, value));
  return merged;
}

function clearAuthParamsFromUrl() {
  const url = new URL(window.location.href);
  let changed = false;
  for (const key of AUTH_URL_PARAMS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  // Only touch the fragment if it holds auth parameters, so ordinary #anchors
  // survive. Also drop the bare "#" the Supabase client leaves after clearing it.
  const hash = new URLSearchParams(url.hash.slice(1));
  if (AUTH_URL_PARAMS.some((key) => hash.has(key))) {
    AUTH_URL_PARAMS.forEach((key) => hash.delete(key));
    url.hash = hash.toString();
    changed = true;
  } else if (!url.hash && window.location.href.endsWith('#')) {
    changed = true;
  }
  if (changed) window.history.replaceState(window.history.state, '', url.toString());
}

function toAppUser(u: SupabaseUser): { name: string; email: string } {
  const meta = u.user_metadata || {};
  return {
    name: meta.full_name || meta.name || u.email?.split('@')[0] || 'Member',
    email: u.email || '',
  };
}

// Custom designed high-performance pages
import BlogIndex from './pages/blog/index';
import BlogPostPage from './pages/blog/[slug]';
import SecurityHub from './pages/security/index';
import AboutPage from './pages/about';
import TransparencyPage from './pages/transparency';
import HowItWorksPage from './pages/how-it-works';
import SitemapPage from './pages/sitemap';
import { ToolSeoContent } from './components/ToolSeoContent';


// Dictionary mapping for dynamic icon components to prevent compilation crashes
const ICON_MAP: Record<string, keyof typeof Lucide> = {
  Sparkles: 'Sparkles',
  MessageSquareShare: 'MessageSquareShare',
  BookOpenText: 'BookOpenText',
  Scale: 'Scale',
  UserCheck: 'UserCheck',
  FileDown: 'FileDown',
  GitMerge: 'GitMerge',
  Scissors: 'Scissors',
  RotateCw: 'RotateCw',
  Trash2: 'Trash2',
  Layers: 'Layers',
  Bookmark: 'Bookmark',
  Hash: 'Hash',
  FileText: 'FileText',
  Image: 'Image',
  FileImage: 'FileImage',
  Smartphone: 'Smartphone',
  FileCode: 'FileCode',
  Presentation: 'Presentation',
  Calculator: 'Calculator',
  FileSpreadsheet: 'FileSpreadsheet',
  ImagePlay: 'ImagePlay',
  MonitorDot: 'MonitorDot',
  FileSlide: 'Presentation',
  Lock: 'Lock',
  Unlock: 'Unlock',
  HeartHandshake: 'HeartHandshake',
  Cpu: 'Cpu',
  PencilLine: 'PencilLine'
};

function SmartIcon({ name, className = "h-5 w-5 text-indigo-600 dark:text-indigo-400" }: { name: string; className?: string }) {
  const iconKey = ICON_MAP[name] || 'FileText';
  const IconComponent = (Lucide as any)[iconKey] || Lucide.FileText;
  return <IconComponent className={className} />;
}

const getToolColors = (id: string): { bg: string; icon: string; isAi?: boolean } => {
  const idLower = id.toLowerCase();
  
  // OCR Scanned PDF Reader
  if (idLower === 'ocr-pdf') {
    return {
      bg: 'bg-violet-100/80 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400 group-hover:bg-violet-600 group-hover:text-white dark:group-hover:bg-violet-600 dark:group-hover:text-white',
      icon: 'text-violet-600 dark:text-violet-400 group-hover:text-inherit transition-all duration-300'
    };
  }
  
  // Compress Tool
  if (idLower === 'compress-pdf') {
    return {
      bg: 'bg-sky-100/80 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400 group-hover:bg-sky-600 group-hover:text-white dark:group-hover:bg-sky-600 dark:group-hover:text-white',
      icon: 'text-sky-600 dark:text-sky-400 group-hover:text-inherit transition-all duration-300'
    };
  }

  // Merge / Page actions
  if (idLower === 'merge-pdf' || idLower === 'add-watermark' || idLower === 'add-page-numbers') {
    return {
      bg: 'bg-purple-100/80 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400 group-hover:bg-purple-600 group-hover:text-white dark:group-hover:bg-purple-600 dark:group-hover:text-white',
      icon: 'text-purple-600 dark:text-purple-400 group-hover:text-inherit transition-all duration-300'
    };
  }

  // Split / Delete
  if (idLower === 'split-pdf' || idLower === 'remove-pages') {
    return {
      bg: 'bg-orange-100/80 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400 group-hover:bg-orange-600 group-hover:text-white dark:group-hover:bg-orange-600 dark:group-hover:text-white',
      icon: 'text-orange-600 dark:text-orange-400 group-hover:text-inherit transition-all duration-300'
    };
  }

  // Security (Lock/Unlock/Sign)
  if (idLower === 'protect-pdf') {
    return {
      bg: 'bg-rose-100/80 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 group-hover:bg-rose-600 group-hover:text-white dark:group-hover:bg-rose-600 dark:group-hover:text-white',
      icon: 'text-rose-600 dark:text-rose-400 group-hover:text-inherit transition-all duration-300'
    };
  }
  if (idLower === 'unlock-pdf') {
    return {
      bg: 'bg-emerald-100/80 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white dark:group-hover:bg-emerald-600 dark:group-hover:text-white',
      icon: 'text-emerald-600 dark:text-emerald-400 group-hover:text-inherit transition-all duration-300'
    };
  }
  if (idLower === 'sign-pdf') {
    return {
      bg: 'bg-pink-100/80 text-pink-600 dark:bg-pink-950/40 dark:text-pink-400 group-hover:bg-pink-600 group-hover:text-white dark:group-hover:bg-pink-600 group-hover:text-white',
      icon: 'text-pink-600 dark:text-pink-400 group-hover:text-inherit transition-all duration-300'
    };
  }

  // Image inputs (to PDF)
  if (['jpg-to-pdf', 'jpeg-to-png', 'webp-to-pdf', 'heic-to-pdf'].includes(idLower)) {
    return {
      bg: 'bg-amber-100/80 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 group-hover:bg-amber-600 group-hover:text-white dark:group-hover:bg-amber-600 dark:group-hover:text-white',
      icon: 'text-amber-600 dark:text-amber-400 group-hover:text-inherit transition-all duration-300'
    };
  }

  // Image outputs (PDF to)
  if (['pdf-to-jpg', 'pdf-to-png', 'pdf-to-webp'].includes(idLower)) {
    return {
      bg: 'bg-emerald-100/80 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white dark:group-hover:bg-emerald-600 dark:group-hover:text-white',
      icon: 'text-emerald-600 dark:text-emerald-400 group-hover:text-inherit transition-all duration-300'
    };
  }

  // Office formats to PDF (*-to-pdf)
  if (['word-to-pdf', 'pptx-to-pdf', 'xlsx-to-pdf', 'txt-to-pdf'].includes(idLower)) {
    return {
      bg: 'bg-indigo-100/80 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white dark:group-hover:bg-indigo-600 dark:group-hover:text-white',
      icon: 'text-indigo-600 dark:text-indigo-400 group-hover:text-inherit transition-all duration-300'
    };
  }

  // PDF to office formats (pdf-to-*)
  if (['pdf-to-word', 'pdf-to-pptx', 'pdf-to-xlsx', 'pdf-to-txt'].includes(idLower)) {
    return {
      bg: 'bg-blue-100/80 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 group-hover:bg-blue-600 group-hover:text-white dark:group-hover:bg-blue-600 dark:group-hover:text-white',
      icon: 'text-blue-600 dark:text-blue-400 group-hover:text-inherit transition-all duration-300'
    };
  }

  // Default fallback
  return {
    bg: 'bg-slate-100/80 text-slate-600 dark:bg-slate-950/40 dark:text-slate-400 group-hover:bg-slate-600 group-hover:text-white dark:group-hover:bg-slate-600 dark:group-hover:text-white',
    icon: 'text-slate-600 dark:text-slate-400 group-hover:text-inherit transition-all duration-300'
  };
};

export default function App({ initialPath }: { initialPath?: string } = {}) {
  const { currentPath, navigate } = useRouter(initialPath);
  
  // Theme Toggle State
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem('theme') === 'dark';
    }
    return false;
  });

  // Authentication State
  const [user, setUser] = useState<{ name: string; email: string } | null>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem('user');
      return saved ? JSON.parse(saved) : null;
    }
    return null;
  });
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', repeatPassword: '', isRegister: false });
  const [showPassword, setShowPassword] = useState(false);
  const [showRepeatPassword, setShowRepeatPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetPasswordSentEmail, setResetPasswordSentEmail] = useState<string | null>(null);
  // True after following a password-reset link, while the user picks a new password.
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  // loading and Toast states represent the refined experience
  const [emailLoading, setEmailLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [inlineErrors, setInlineErrors] = useState<{ email?: string; password?: string; name?: string; repeatPassword?: string }>({});
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'info' }[]>([]);

  // Function to add a Toast dynamic notification
  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const getPasswordStrength = useCallback((pass: string) => {
    if (!pass) return null;
    if (pass.length < 6) return { level: 'short', color: 'bg-rose-500', label: 'Too short', textColor: 'text-rose-500' };
    const hasMix = /[0-9!@#$%^&*(),.?":{}|<>]/.test(pass);
    if (pass.length >= 8 && hasMix) {
      return { level: 'strong', color: 'bg-emerald-500', label: 'Strong', textColor: 'text-emerald-500' };
    }
    return { level: 'weak', color: 'bg-amber-500', label: 'Weak', textColor: 'text-amber-500' };
  }, []);

  // Supabase AuthError codes: https://supabase.com/docs/guides/auth/debugging/error-codes
  const mapAuthError = useCallback((err: any): string => {
    const code: string = err?.code || '';
    const message: string = (err?.message || '').toLowerCase();

    if (!isSupabaseConfigured) {
      return "Sign-in is temporarily unavailable. Please try again later.";
    }
    if (err?.name === 'AuthRetryableFetchError' || message.includes('failed to fetch') || message.includes('network')) {
      return "Connection lost. Check your internet and try again.";
    }
    if (code === 'invalid_credentials') {
      return "Incorrect email or password. Please try again.";
    }
    if (code === 'user_already_exists' || code === 'email_exists') {
      return "An account with this email already exists. Try signing in instead.";
    }
    if (code === 'weak_password') {
      return "Password is too weak. Use at least 6 characters, mixing letters and numbers.";
    }
    if (code === 'same_password') {
      return "Your new password must be different from the old one.";
    }
    if (code === 'email_address_invalid' || code === 'validation_failed') {
      return "Please enter a valid email address.";
    }
    if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || err?.status === 429) {
      return "Too many attempts. Please wait a few minutes and try again.";
    }
    if (code === 'signup_disabled') {
      return "New sign-ups are currently closed.";
    }
    return "Something went wrong. Please try again.";
  }, []);

  const validateForm = useCallback(() => {
    const errors: { email?: string; password?: string; name?: string; repeatPassword?: string } = {};
    
    if (authForm.isRegister && !authForm.name.trim()) {
      errors.name = 'Full Name is required.';
    }
    
    if (!authForm.email.trim()) {
      errors.email = 'Email Address is required.';
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(authForm.email)) {
        errors.email = 'Please enter a valid email address.';
      }
    }
    
    if (!authForm.password) {
      errors.password = 'Password is required.';
    } else if (authForm.isRegister && authForm.password.length < 6) {
      errors.password = 'Password must be at least 6 characters.';
    }
    
    if (authForm.isRegister && authForm.password !== authForm.repeatPassword) {
      errors.repeatPassword = 'Passwords do not match.';
    }
    
    setInlineErrors(errors);
    return Object.keys(errors).length === 0;
  }, [authForm]);

  // Observe the Supabase session, and finish whichever auth flow the URL is
  // carrying: a Google redirect, an email confirmation, or a password reset.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      console.error('Supabase is not configured; sign-in is disabled.');
      setUser(null);
      localStorage.removeItem('user');
      return;
    }
    const supabase = getSupabase();

    // Read before subscribing: INITIAL_SESSION strips these from the URL.
    const params = readAuthParams();
    const tokenHash = params.get('token_hash');
    const linkType = params.get('type') as EmailOtpType | null;
    const linkError = params.get('error_description');
    // A default "confirm your email" link lands here already signed in, with
    // the session in the fragment; say so rather than silently signing them in.
    let announceConfirmation =
      !tokenHash && params.has('access_token') && (linkType === 'signup' || linkType === 'email');

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true);
        setAuthModalOpen(true);
      }

      const sessionUser = session?.user;
      // Kept from the Firebase version: an unconfirmed email/password account is
      // not signed in, even if "Confirm email" is ever switched off in Supabase.
      const unconfirmed = sessionUser?.app_metadata?.provider === 'email' && !sessionUser.email_confirmed_at;
      if (sessionUser && !unconfirmed) {
        const u = toAppUser(sessionUser);
        setUser(u);
        localStorage.setItem('user', JSON.stringify(u));

        if (sessionStorage.getItem(OAUTH_PENDING_KEY)) {
          sessionStorage.removeItem(OAUTH_PENDING_KEY);
          addToast(`Welcome back, ${u.name.split(' ')[0]}! 👋`, 'info');
        } else if (announceConfirmation) {
          announceConfirmation = false;
          addToast('Email confirmed. Welcome to FoldPDF! 🎉', 'success');
        }
      } else {
        setUser(null);
        localStorage.removeItem('user');
      }

      // By INITIAL_SESSION the Supabase client has read any session out of the
      // URL (from Google or an email link), so the parameters are safe to drop.
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
        clearAuthParamsFromUrl();
      }
    });

    const linkKey = tokenHash ?? (linkError ? `error:${linkError}` : null);
    const firstVisit = linkKey !== null && !handledAuthLinks.has(linkKey);
    if (linkKey) handledAuthLinks.add(linkKey);

    if (linkError && firstVisit) {
      sessionStorage.removeItem(OAUTH_PENDING_KEY);
      addToast(
        params.get('error_code') === 'otp_expired'
          ? 'That link has expired. Please request a new one.'
          : 'Sign-in could not be completed. Please try again.',
        'error'
      );
      clearAuthParamsFromUrl();
    } else if (tokenHash && linkType && firstVisit) {
      // token_hash links come from the optional custom email templates in
      // supabase/README.md; the default links are handled by the Supabase client.
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: linkType }).then(({ error }) => {
        if (error) {
          addToast('That link has expired or was already used. Please request a new one.', 'error');
        } else if (linkType === 'recovery') {
          setPasswordRecovery(true);
          setAuthModalOpen(true);
        } else {
          addToast('Email confirmed. Welcome to FoldPDF! 🎉', 'success');
        }
        clearAuthParamsFromUrl();
      });
    }

    return () => subscription.unsubscribe();
  }, [addToast]);

  // Reset stuck Google sign-in loading state if user returns focus to this parent window (e.g. cancelled/closed popup)
  useEffect(() => {
    const handleFocus = () => {
      setGoogleLoading(false);
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // Cookie Consent State for AdSense compliance
  const [cookieConsentAccepted, setCookieConsentAccepted] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem('cookie-consent') === 'true';
    }
    return false;
  });

  // Active Tools Categorization State
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Historical Processed Files list for returning users
  const [history, setHistory] = useState<RecentFile[]>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem('foldpdf_history');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  // Track last logged actions to strictly prevent duplicate entries caused by React StrictMode mounts or rendering updates
  const lastLoggedRef = useRef<{ key: string; time: number } | null>(null);

  // Favorites Tools state
  const [favorites, setFavorites] = useState<string[]>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem('foldpdf_favorites');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  // Apply dark mode theme on html tags
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Update dynamic page headers (SEO parameters) based on paths
  useEffect(() => {
    const path = currentPath.replace('/', '');
    
    // Check if it's a specific tool
    const matchingTool = TOOLS_DATA.find((t) => t.urlPath === path);
    if (matchingTool) {
      document.title = matchingTool.metaTitle || 'FoldPDF';
      const meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', matchingTool.metaDesc || 'FoldPDF');
      return;
    }

    // Check if it's a blog post
    if (currentPath.startsWith('/blog/')) {
      const slug = currentPath.split('/blog/')[1];
      const matchingPost = BLOG_POSTS.find((p) => p.slug === slug);
      if (matchingPost) {
        document.title = `${matchingPost.title || 'FoldPDF'} | FoldPDF Blog`;
        return;
      }
    }

    // Standard static routes
    const titles: Record<string, string> = {
      '/': 'FoldPDF | Free Secure PDF Tools',
      '/about': 'About Our Workspace & Mission | FoldPDF',
      '/contact': 'Contact FoldPDF Support | FoldPDF',
      '/privacy': 'Privacy, AdSense & Cookies Policy | FoldPDF',
      '/terms': 'Terms of Service Policies | FoldPDF',
      '/dmca': 'DMCA Policy & Procedure | FoldPDF',
      '/blog': 'Document Architecture Learning Blog | FoldPDF'
    };

    document.title = titles[currentPath] || 'FoldPDF';
  }, [currentPath]);

  // Handle Dynamic Upload Action Log histories
  const handleActionLogged = useCallback((fileName: string, toolName: string) => {
    const key = `${fileName}::${toolName}`;
    const now = Date.now();
    if (lastLoggedRef.current && lastLoggedRef.current.key === key && now - lastLoggedRef.current.time < 1500) {
      // Duplicate entry detected (often due to React StrictMode or double-rendering), skip logging
      return;
    }
    lastLoggedRef.current = { key, time: now };

    const newItem: RecentFile = {
      id: Math.random().toString(36).substr(2, 9),
      name: fileName,
      size: `${(Math.random() * 4 + 0.5).toFixed(2)} MB`,
      timestamp: new Date().toLocaleTimeString(),
      toolUsed: toolName,
      downloadUrl: '#'
    };

    setHistory((prev) => {
      const updated = [newItem, ...prev].slice(0, 10);
      localStorage.setItem('foldpdf_history', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const handleToggleFavorite = (toolId: string) => {
    setFavorites((prev) => {
      const updated = prev.includes(toolId) ? prev.filter((id) => id !== toolId) : [...prev, toolId];
      localStorage.setItem('foldpdf_favorites', JSON.stringify(updated));
      return updated;
    });
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!authForm.email) {
      setAuthError('Email Address is required.');
      return;
    }
    setForgotLoading(true);
    try {
      // Supabase reports success for unknown addresses too, so nobody can use
      // this form to find out who has an account.
      const { error } = await getSupabase().auth.resetPasswordForEmail(authForm.email, {
        redirectTo: `${window.location.origin}/`,
      });
      if (error) throw error;
      setResetPasswordSentEmail(authForm.email);
      addToast("Password reset email sent! Check your inbox.", "success");
    } catch (err: any) {
      console.error("Password reset failure:", err);
      setAuthError(mapAuthError(err));
    } finally {
      setForgotLoading(false);
    }
  };

  // Second half of a password reset: the user arrived from the emailed link
  // with a recovery session and now chooses the new password.
  const handleNewPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const errors: { password?: string; repeatPassword?: string } = {};
    if (authForm.password.length < 6) {
      errors.password = 'Password must be at least 6 characters.';
    }
    if (authForm.password !== authForm.repeatPassword) {
      errors.repeatPassword = 'Passwords do not match.';
    }
    setInlineErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setEmailLoading(true);
    try {
      const { error } = await getSupabase().auth.updateUser({ password: authForm.password });
      if (error) throw error;
      addToast("Password updated. You're signed in.", "success");
      setPasswordRecovery(false);
      setAuthModalOpen(false);
      setAuthForm({ name: '', email: '', password: '', repeatPassword: '', isRegister: false });
    } catch (err: any) {
      console.error("Password update failure:", err);
      setAuthError(mapAuthError(err));
    } finally {
      setEmailLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError('');
    setGoogleLoading(true);
    try {
      sessionStorage.setItem(OAUTH_PENDING_KEY, '1');
      // Full-page redirect to Google and back; the session is picked up by the
      // onAuthStateChange listener when this page loads again.
      const { error } = await getSupabase().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
      });
      if (error) throw error;
      // Leave the button in its loading state while the browser navigates away.
    } catch (err: any) {
      console.error("Google sign in failure:", err);
      sessionStorage.removeItem(OAUTH_PENDING_KEY);
      setAuthError(mapAuthError(err));
      setGoogleLoading(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setInlineErrors({});

    if (!validateForm()) {
      return;
    }

    const supabase = (() => {
      try {
        return getSupabase();
      } catch (err) {
        setAuthError(mapAuthError(err));
        return null;
      }
    })();
    if (!supabase) return;

    if (authForm.isRegister) {
      try {
        setEmailLoading(true);
        const { data, error } = await supabase.auth.signUp({
          email: authForm.email,
          password: authForm.password,
          options: {
            data: { full_name: authForm.name.trim() },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) throw error;

        // For an address that is already registered, Supabase returns a user
        // with no identities instead of an error, so it can't be used to probe
        // which emails have accounts.
        if (data.user && data.user.identities?.length === 0) {
          setAuthError("An account with this email already exists. Try signing in instead.");
          return;
        }

        // A session only comes back if "Confirm email" is off in Supabase.
        if (data.session) {
          addToast("Account created! Welcome to FoldPDF 🎉", "success");
          setAuthModalOpen(false);
          setAuthForm({ name: '', email: '', password: '', repeatPassword: '', isRegister: false });
          return;
        }

        addToast("Account created! Welcome to FoldPDF 🎉", "success");
        setVerificationEmail(authForm.email);

        // Auto-close modal after 2 seconds
        setTimeout(() => {
          setAuthModalOpen(false);
          setVerificationEmail(null);
        }, 2000);

        setAuthForm({ name: '', email: '', password: '', repeatPassword: '', isRegister: false });
      } catch (err: any) {
        console.error("Registration failure:", err);
        setAuthError(mapAuthError(err));
      } finally {
        setEmailLoading(false);
      }
    } else {
      try {
        setEmailLoading(true);
        sessionStorage.removeItem(OAUTH_PENDING_KEY);
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authForm.email,
          password: authForm.password,
        });

        if (error?.code === 'email_not_confirmed') {
          const { error: resendError } = await supabase.auth.resend({
            type: 'signup',
            email: authForm.email,
            options: { emailRedirectTo: `${window.location.origin}/` },
          });
          if (resendError) {
            console.warn("Could not resend email verification:", resendError);
          }
          setVerificationEmail(authForm.email);
          return;
        }
        if (error) throw error;

        const firstName = toAppUser(data.user).name.split(' ')[0];
        addToast(`Welcome back, ${firstName}! 👋`, 'info');

        setAuthModalOpen(false);
        setAuthForm({ name: '', email: '', password: '', repeatPassword: '', isRegister: false });
      } catch (err: any) {
        console.error("Login failure:", err);
        setAuthError(mapAuthError(err));
      } finally {
        setEmailLoading(false);
      }
    }
  };

  const handleLogout = async () => {
    try {
      const { error } = await getSupabase().auth.signOut();
      if (error) throw error;
      setUser(null);
      localStorage.removeItem('user');
    } catch (err) {
      console.error('Sign out failure:', err);
    }
  };

  // Helper mapping for granular categories mirroring competitor layout
  const getToolCategory = (tool: ToolDefinition): string => {
    if (['merge-pdf', 'split-pdf', 'remove-pages', 'rotate-pdf'].includes(tool.id)) return 'organize';
    if (['compress-pdf', 'repair-pdf', 'ocr-pdf'].includes(tool.id)) return 'optimize';
    if (tool.id.includes('to-pdf') || tool.id.startsWith('pdf-to-') || tool.id.includes('-to-png') || tool.id.includes('-to-jpg')) {
      return 'convert';
    }
    if (['add-watermark', 'add-page-numbers'].includes(tool.id)) return 'edit';
    if (['protect-pdf', 'unlock-pdf', 'sign-pdf'].includes(tool.id)) return 'security';
    return tool.category;
  };

  // Helper lists: filtered tools for home bento grid
  const filteredToolsForGrid = TOOLS_DATA.filter((tool) => {
    const computedCategory = getToolCategory(tool);
    const categoryMatches = selectedCategory === 'all' || computedCategory === selectedCategory;
    const searchMatches = tool.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          tool.shortDesc.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          tool.longDesc.toLowerCase().includes(searchQuery.toLowerCase());
    return categoryMatches && searchMatches;
  });

  const path = currentPath.replace('/', '');
  const activeTool = TOOLS_DATA.find((t) => t.urlPath === path);

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-slate-900 dark:bg-[#0b0f19] dark:text-slate-100 flex flex-col transition-all duration-200" id="main-foldpdf-viewport">
      
      {/* HEADER COMPONENT */}
      <Header
        currentPath={currentPath}
        navigate={navigate}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        user={user}
        onAuthTrigger={() => {setAuthError(''); setVerificationEmail(null); setIsForgotPassword(false); setResetPasswordSentEmail(null); setAuthModalOpen(true);}}
        onLogout={() => setLogoutConfirmOpen(true)}
      />

      {/* PRIMARY VIEWER PORTAL */}
      <main className="flex-grow">
        
        {/* VIEW 1: LANDING HOMEPAGE GRID LIST */}
        {currentPath === '/' && (
          <div className="animate-in fade-in duration-300">
            
            {/* HERO SECTION - REDESIGNED PRIVATE PDF TOOLS CANVAS */}
            <div className="relative overflow-hidden pt-16 pb-14 sm:pt-20 sm:pb-16 text-center border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-905 animated-gradient-hero" id="homepage-hero-portal">
              <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 animate-in fade-in zoom-in-95 duration-500">
                
                <h1 className="mt-5 font-display text-4xl font-extrabold tracking-tight text-slate-850 dark:text-white sm:text-5.5xl lg:text-6xl leading-[1.15]">
                  Private PDF Tools <span className="text-indigo-600 dark:text-indigo-400">That Never Upload Your Files</span>
                </h1>
                
                <p className="mx-auto mt-5 max-w-3xl text-sm sm:text-base md:text-lg text-slate-650 dark:text-slate-300 leading-relaxed font-body">
                  Process medical records, financial files, legal certificates, and personal documents completely inside your browser. Your files stay on your device for absolute privacy and safety.
                </p>


                {/* 2 COMPLEMENTARY CTAs */}
                <div className="mt-8 flex flex-wrap justify-center gap-4">
                  <button 
                    onClick={() => navigate('/compress-pdf')}
                    className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-6 py-3 text-xs sm:text-sm font-bold text-white shadow-premium-sm hover:shadow-premium-md hover:bg-indigo-750 hover:-translate-y-0.5 transition duration-200 cursor-pointer"
                  >
                    <Lucide.FileDown className="h-4 w-4" />
                    Compress PDF
                  </button>
                  <button 
                    onClick={() => navigate('/security')}
                    className="inline-flex items-center gap-2 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-6 py-3 text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-slate-750 hover:-translate-y-0.5 transition duration-200 cursor-pointer"
                  >
                    <Lucide.ShieldCheck className="h-4.5 w-4.5 text-indigo-505" />
                    Learn About Privacy
                  </button>
                </div>

                {/* 4 REFINED TRUST BADGES */}
                <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
                  
                  <div className="flex items-center gap-2 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm p-3 rounded-2xl border border-slate-100 dark:border-slate-800 text-left shadow-premium-sm">
                    <Lucide.ShieldCheck className="h-5 w-5 text-emerald-500 shrink-0" />
                    <div>
                      <h4 className="text-[11px] font-extrabold text-slate-900 dark:text-white leading-tight uppercase tracking-wider">Zero-Knowledge</h4>
                      <p className="text-[9px] text-slate-450 leading-none mt-0.5">Absolute privacy</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm p-3 rounded-2xl border border-slate-100 dark:border-slate-800 text-left shadow-premium-sm">
                    <Lucide.Cpu className="h-5 w-5 text-indigo-500 shrink-0" />
                    <div>
                      <h4 className="text-[11px] font-extrabold text-slate-900 dark:text-white leading-tight uppercase tracking-wider">Browser Processing</h4>
                      <p className="text-[9px] text-slate-450 leading-none mt-0.5">Local WASM sandboxing</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm p-3 rounded-2xl border border-slate-100 dark:border-slate-800 text-left shadow-premium-sm">
                    <Lucide.Trash2 className="h-5 w-5 text-rose-500 shrink-0" />
                    <div>
                      <h4 className="text-[11px] font-extrabold text-slate-900 dark:text-white leading-tight uppercase tracking-wider">Auto File Deletion</h4>
                      <p className="text-[9px] text-slate-450 leading-none mt-0.5">Purges from RAM instantly</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm p-3 rounded-2xl border border-slate-100 dark:border-slate-800 text-left shadow-premium-sm">
                    <Lucide.CloudOff className="h-5 w-5 text-amber-500 shrink-0" />
                    <div>
                      <h4 className="text-[11px] font-extrabold text-slate-900 dark:text-white leading-tight uppercase tracking-wider">No Cloud Storage</h4>
                      <p className="text-[9px] text-slate-450 leading-none mt-0.5">Zero file retains</p>
                    </div>
                  </div>

                </div>

              </div>
            </div>

            {/* MAIN TOOLS DIRECTORY WORKSPACE */}
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8" id="tools-catalog">
              
              {/* BENTO FILTER SEARCH AND TABS */}
              <div className="pb-8 border-b border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center w-full">
                
                {/* Visual Category Filters list */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3 w-full">
                  {[
                    { id: 'all', label: 'All Tools' },
                    { id: 'organize', label: 'Organize PDF' },
                    { id: 'optimize', label: 'Optimize PDF' },
                    { id: 'convert', label: 'Convert PDF' },
                    { id: 'edit', label: 'Edit PDF' },
                    { id: 'security', label: 'PDF Security' }
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`inline-flex items-center justify-center rounded-full py-3.5 px-4 text-xs font-bold tracking-tight transition duration-200 text-center w-full ${
                        selectedCategory === cat.id
                          ? 'bg-indigo-600 text-white shadow-premium-sm'
                          : 'bg-white border border-slate-250 text-slate-650 hover:text-indigo-600 hover:border-indigo-300 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-305 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>{cat.label}</span>
                    </button>
                  ))}
                </div>

              </div>



              {/* THE CORE 30+ BENTO TOOLS GRID */}
              <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" id="tools-bento-grid">
                {filteredToolsForGrid.map((tool) => {
                  const isFav = favorites.includes(tool.id);
                  const DESC_OVERWRITE_MAP: Record<string, string> = {
                    'compress-pdf': 'Deep server-side optimization to aggressively drop file payloads and storage weights while protecting visual text crispness.',
                    'merge-pdf': 'Snap scattered pages or document chapters together into one seamless continuous file.',
                    'split-pdf': 'Divide a single document into customized page ranges or separate individual sheets.',
                    'pdf-to-word': 'Decompile document layout records back into fully editable text-flowing structures.',
                    'word-to-pdf': 'Lock your Microsoft Word formatting templates safely into cross-platform readable form.',
                    'protect-pdf': 'Formulate strict access conditions with AES-grade passwords and print restrictions.',
                    'jpg-to-pdf': 'Convert and compile multiple JPG snapshots cleanly into unified vector pages.',
                    'pdf-to-jpg': 'Isolate or extract layout images from PDF containers into high-definition JPEG blocks.',
                    'png-to-pdf': 'Render transparent PNG files beautifully onto standard print layout grids.',
                    'pdf-to-png': 'Export pixel-perfect PNG mockups with web alpha and clear visibility.',
                    'jpeg-to-png': 'Translate lossy JPEG blocks into high-density lossless PNG frames.',
                    'png-to-jpg': 'Downscale raw PNG elements into fast compressed light JPEGs.',
                    'webp-to-pdf': 'Pack next-gen .webp graphics onto standard printable documents.',
                    'pdf-to-webp': 'Convert slides to highly optimized .webp assets for direct web integration.',
                    'heic-to-pdf': 'Turn iPhone HEIC photographic layouts into printable PDF catalogs.',
                    'pdf-to-pptx': 'Reposition static presentation pages into customizable PowerPoint slideshow templates.',
                    'pptx-to-pdf': 'Format PPTX graphics grids perfectly so slides do not shift or distort.',
                    'pdf-to-xlsx': 'Scrape financial rows and tables cleanly into structured spreadsheet matrices.',
                    'xlsx-to-pdf': 'Set printable margins to fit wide Excel cell logs neatly onto single PDF pages.',
                    'pdf-to-txt': 'Export bare ASCII textual assets out of multi-layer documents.',
                    'txt-to-pdf': 'Format raw text summaries with premium typography into sleek readable ebooks.',
                    'add-watermark': 'Settle authority markers and custom graphics overlays on all slide grids.',
                    'add-page-numbers': 'Inject sequential page totals and standard index pagination safely.',
                    'rotate-pdf': 'Twist and turn your upside-down document scans into upright, legible alignments.',
                    'remove-pages': 'Prune out unnecessary pages or blank worksheets visually.',
                    'sign-pdf': 'Inscribe your legal signature drawing right onto document contract lines.',
                    'unlock-pdf': 'Permit secure recovery of document print features by sweeping passkeys and restrictions away.',
                    'repair-pdf': 'Mend catalog indices and rebuild corrupted binary structures of broken PDF drafts.',
                    'ocr-pdf': 'Transcribe graphic-only photo sheets into searchable editable textual nodes.'
                  };
                  const displayedDesc = DESC_OVERWRITE_MAP[tool.id] || tool.shortDesc;
                  const colors = getToolColors(tool.id);

                  return (
                    <div
                      key={tool.id}
                      className="group relative flex flex-col justify-between rounded-2xl border border-slate-100 dark:border-slate-850/70 bg-white dark:bg-slate-900/40 p-5 shadow-premium-sm hover:-translate-y-1.5 hover:shadow-premium-lg transition-all duration-300 animate-in fade-in"
                    >
                      {/* Favorites Toggle Star */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleFavorite(tool.id); }}
                        className="absolute top-4.5 right-4.5 text-slate-300 hover:text-amber-400 dark:text-slate-600 transition"
                        title="Mark as favorite"
                      >
                        <Lucide.Star className={`h-4.5 w-4.5 ${isFav ? 'fill-amber-400 text-amber-500' : ''}`} />
                      </button>

                      {/* Icon & Title */}
                      <div onClick={() => navigate(`/${tool.urlPath}`)} className="cursor-pointer">
                        <div className={`flex h-11 w-11 items-center justify-center rounded-xl mb-4 transition-all duration-300 shadow-premium-sm ${colors.bg}`}>
                          <SmartIcon name={tool.iconName} className={`h-5 w-5 ${colors.icon}`} />
                        </div>
                        
                        <div className="flex items-center space-x-1.5">
                          <h3 className="text-base font-extrabold text-slate-900 dark:text-white font-display group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {tool.name}
                          </h3>
                        </div>

                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                          {displayedDesc}
                        </p>
                      </div>

                      {/* Quick access footer CTA */}
                      <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] font-semibold">
                        <span className="text-slate-450 dark:text-slate-500 uppercase tracking-widest text-[9px]">
                          {getToolCategory(tool).replace('-', ' ')}
                        </span>
                        <span 
                          onClick={() => navigate(`/${tool.urlPath}`)} 
                          className="text-indigo-650 dark:text-indigo-400 group-hover:underline cursor-pointer flex items-center"
                        >
                          Use Tool <Lucide.ChevronRight className="h-3 w-3 ml-0.5" />
                        </span>
                      </div>
                    </div>
                  );
                })}

                {filteredToolsForGrid.length === 0 && (
                  <div className="col-span-full py-16 text-center text-sm text-neutral-500">
                    No matching PDF tools found inside FoldPDF registry. Try searching "compress" or "Word".
                  </div>
                )}
              </div>

              {/* WORK YOUR WAY SECTION - FULLY FUNCTIONAL CORE PLATFORM BENEFITS */}
              <div className="mt-20 border-t border-slate-150 dark:border-slate-800 space-y-12 pt-16">
                <div className="text-center max-w-2xl mx-auto">
                  <h2 className="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-white font-display">
                    FoldPDF Core Platform Capabilities
                  </h2>
                  <p className="mt-3 text-sm text-slate-555 dark:text-slate-400">
                    Interact with your files securely on any browser sandbox. FoldPDF maintains supreme layout fidelity and rapid in-memory processing, keeping operations unified.
                  </p>
                </div>
                
                <div className="grid gap-8 md:grid-cols-2 max-w-4xl mx-auto">
                  {/* Card 1 */}
                  <div className="bg-white dark:bg-slate-900/40 rounded-3xl border border-slate-150 dark:border-slate-800/80 p-6 shadow-premium-sm relative flex flex-col justify-between">
                    <div>
                      <div className="h-10 w-10 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-650 dark:text-indigo-400 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                        <Lucide.RefreshCw className="h-5 w-5 animate-spin-slow" />
                      </div>
                      <h3 className="text-base font-bold text-slate-800 dark:text-white font-display">
                        Precision Layout Conversion
                      </h3>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        Convert PDF pages to/from Microsoft Word, PowerPoint, Excel tables, and next-gen images (JPGs, PNGs, WebP, HEIC). We preserve original margins, alignments, and font records inside secure sandbox memory.
                      </p>
                    </div>
                    <div className="mt-6">
                      <button 
                        onClick={() => {
                          setSelectedCategory('convert');
                          document.getElementById('tools-catalog')?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="text-indigo-650 dark:text-indigo-400 text-xs font-bold hover:underline cursor-pointer flex items-center bg-transparent border-none p-0 outline-none"
                      >
                        Explore Conversion Tools <Lucide.ChevronRight className="h-3 w-3 ml-0.5" />
                      </button>
                    </div>
                  </div>

                  {/* Card 3 */}
                  <div className="bg-white dark:bg-slate-900/40 rounded-3xl border border-slate-150 dark:border-slate-800/80 p-6 shadow-premium-sm relative flex flex-col justify-between">
                    <div>
                      <div className="h-10 w-10 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-650 dark:text-indigo-400 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                        <Lucide.ShieldCheck className="h-5 w-5" />
                      </div>
                      <h3 className="text-base font-bold text-slate-800 dark:text-white font-display">
                        Secure Editing & Security
                      </h3>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        Add watermarks, page numbers, and signatures, and shrink your files easily while keeping all your documents private.
                      </p>
                    </div>
                    <div className="mt-6">
                      <button 
                        onClick={() => {
                          setSelectedCategory('edit');
                          document.getElementById('tools-catalog')?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="text-indigo-650 dark:text-indigo-400 text-xs font-bold hover:underline cursor-pointer flex items-center bg-transparent border-none p-0 outline-none"
                      >
                        Explore Editing Tools <Lucide.ChevronRight className="h-3 w-3 ml-0.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* FEATURE 2: HOMEPAGE SEO CONTENT SECTIONS */}
              <div className="mt-24 border-t border-slate-150 dark:border-slate-800/80 pt-16 space-y-16 max-w-6xl mx-auto" id="homepage-seo-features">
                
                <div className="text-center max-w-2xl mx-auto">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-100/30">
                    <Lucide.CheckCircle2 className="h-3.5 w-3.5" />
                    Educational Privacy Library
                  </span>
                  <h2 className="mt-4 font-display text-3xl sm:text-4.5xl font-extrabold tracking-tight text-slate-800 dark:text-white leading-tight">
                    Understanding Browser Document Security
                  </h2>
                  <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                    Discover why shifting converters directly inside client runtimes delivers absolute security assurances.
                  </p>
                </div>

                <div className="grid gap-10 md:grid-cols-2 mt-12 text-left">
                  
                  {/* Section 1 */}
                  <section className="bg-white dark:bg-slate-900/60 rounded-3xl border border-slate-150 dark:border-slate-800 p-6 sm:p-8 shadow-premium-sm flex flex-col justify-between">
                    <div>
                      <div className="h-11 w-11 bg-indigo-50 dark:bg-indigo-955/40 text-indigo-600 dark:text-indigo-450 rounded-2xl flex items-center justify-center mb-5 shadow-sm">
                        <Lucide.ShieldCheck className="h-5.5 w-5.5" />
                      </div>
                      <h2 className="font-display text-xl sm:text-2xl font-black text-slate-850 dark:text-white mb-4">
                        Why Browser-Based PDF Tools Are More Secure
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-555 dark:text-slate-400 leading-relaxed font-body">
                        Most online PDF tools copy every file you upload onto their servers, keeping them on someone else's computer. Our browser-based tools work differently, running completely inside your computer's temporary memory (RAM). We never store, read, or share your documents under any circumstances. You can even check your browser's inspect menu on our native browser tools to prove that zero files leave your machine.
                      </p>
                    </div>
                  </section>

                  {/* Section 2 */}
                  <section className="bg-white dark:bg-slate-900/60 rounded-3xl border border-slate-150 dark:border-slate-800 p-6 sm:p-8 shadow-premium-sm flex flex-col justify-between">
                    <div>
                      <div className="h-11 w-11 bg-indigo-50 dark:bg-indigo-955/40 text-indigo-600 dark:text-indigo-45s rounded-2xl flex items-center justify-center mb-5 shadow-sm">
                        <Lucide.EyeOff className="h-5.5 w-5.5" />
                      </div>
                      <h2 className="font-display text-xl sm:text-2xl font-black text-slate-850 dark:text-white mb-4">
                        What Is Secure Browser-Based File Processing?
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-555 dark:text-slate-400 leading-relaxed font-body">
                        Secure browser-based processing means our system cannot see, keep, or access the files you edit. Ordinary online tools force you to upload your files to their servers. This means they can read your file names and private documents. Our website is completely different. All the actions you take run right inside your own internet browser window. We never see your text, sheets, or photos. No logs or backups are ever made. It is a much safer option than public converters that require data uploads. Your files stay perfectly secure on your own computer.
                      </p>
                    </div>
                  </section>

                  {/* Section 3 */}
                  <section className="bg-white dark:bg-slate-900/60 rounded-3xl border border-slate-150 dark:border-slate-800 p-6 sm:p-8 shadow-premium-sm flex flex-col justify-between">
                    <div>
                      <div className="h-11 w-11 bg-indigo-50 dark:bg-indigo-955/40 text-indigo-600 dark:text-indigo-45s rounded-2xl flex items-center justify-center mb-5 shadow-sm">
                        <Lucide.Briefcase className="h-5.5 w-5.5" />
                      </div>
                      <h2 className="font-display text-xl sm:text-2xl font-black text-slate-850 dark:text-white mb-4">
                        PDF Security Best Practices for Businesses
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-555 dark:text-slate-400 leading-relaxed font-body">
                        Keeping your company files secure is simple if you follow a few guidelines. First, do not upload private tax receipts or contract documents to open-source websites that store files in cloud databases. Second, use friendly utilities like FoldPDF that process files directly inside your browser so nothing is sent over the internet. Third, remove hidden layers and authors from your PDFs before sending them. Fourth, close your browser tabs when you finish editing to completely clear local memory. Finally, avoid using public Wi-Fi networks when editing files on remote server pages. Simple actions like these keep your business data private and compliant.
                      </p>
                    </div>
                  </section>

                  {/* Section 4 */}
                  <section className="bg-white dark:bg-slate-900/60 rounded-3xl border border-slate-150 dark:border-slate-800 p-6 sm:p-8 shadow-premium-sm flex flex-col justify-between">
                    <div>
                      <div className="h-11 w-11 bg-indigo-50 dark:bg-indigo-955/40 text-indigo-600 dark:text-indigo-45s rounded-2xl flex items-center justify-center mb-5 shadow-sm">
                        <Lucide.Briefcase className="h-5.5 w-5.5" />
                      </div>
                      <h2 className="font-display text-xl sm:text-2xl font-black text-slate-850 dark:text-white mb-4">
                        Why Privacy Matters for Legal and Medical Documents
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-555 dark:text-slate-400 leading-relaxed font-body">
                        Medical files and legal contracts contain highly private details. Doctors must safeguard patient health records to comply with privacy laws. Normal online converters that send papers to unknown databases violate these safety standards. Similarly, legal assistants handle patent filings or contracts that must remain secret. Shifting your work to on-device browser applications keeps patient files and company secrets safe from data leaks. Since everything runs right in your browser, no tracking databases exist to hold your records, and regulatory frameworks are fully satisfied. Keep your files guarded from day one.
                      </p>
                    </div>
                  </section>

                </div>

              </div>

              {/* HUMAN TRUST & AUTHORITY - PARTNER PORT REINFORCEMENTS */}
              <div className="mt-24 border-t border-slate-150 dark:border-slate-800/80 pt-16 space-y-20 max-w-6xl mx-auto" id="trust-authority-portal">
                
                {/* 1. Founder Note & Mission Statement */}
                <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-855 rounded-3xl p-6 sm:p-10 shadow-premium-md relative overflow-hidden">
                  <div className="absolute top-2 right-2 sm:top-4 sm:right-6 text-slate-100/50 dark:text-slate-800/20 font-display text-[14vw] sm:text-7xl md:text-8xl lg:text-[10rem] font-black select-none pointer-events-none z-0">
                    WHY
                  </div>
                  <div className="max-w-3xl relative z-10">
                    <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-650 dark:bg-indigo-950/40 dark:text-indigo-400 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider">
                      Message from our Founders
                    </span>
                    <h3 className="font-display text-2xl sm:text-3.5xl font-extrabold text-slate-850 dark:text-white mt-4 mb-6 leading-tight">
                      Why FoldPDF Exists: Choosing Integrity Over Caching
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-555 dark:text-slate-355 leading-relaxed font-body">
                      We developed FoldPDF because we believe document utilities should never act as middlemen. Every other popular PDF software online operates by forcing raw document structures onto private servers. This creates unnecessary operational liabilities, network vulnerabilities, and regulatory exposure for clinicians, paralegals, and financial analysts alike.
                      <br /><br />
                      Under the hood, we saw that modern browser sandboxes had evolved to a state that could easily shoulder heavy compilation math. By compiling high-speed layouts and raster engines into localized WebAssembly binaries, we decoupled document processing from server storage entirely. Your files remain where they belong: inside your sovereign machine terminal, deleted from volatile memory the microsecond you close the viewport.
                    </p>

                    
                    <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-indigo-600 dark:text-indigo-400 text-xs">
                        FP
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-855 dark:text-white leading-none">The FoldPDF Core Architecture Team</p>
                        <p className="text-[10px] text-slate-450 uppercase tracking-widest mt-1">Sovereign Web Engineering Group</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Visual "How We Protect Your Files" Sandbox Diagram */}
                <div className="space-y-8">
                  <div className="text-center max-w-2xl mx-auto">
                    <h3 className="font-display text-2xl sm:text-3xl font-black text-slate-850 dark:text-white">
                      The Browser Memory Lifecycle
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-450 mt-2">
                      Track the dynamic journey of your files to verify that zero elements exist on the cloud.
                    </p>
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="bg-white dark:bg-slate-900 border border-slate-155 dark:border-slate-855 p-5 rounded-2xl shadow-premium-sm text-left relative flex flex-col justify-between">
                      <div>
                        <div className="h-8 w-8 bg-indigo-50 dark:bg-indigo-955/40 text-indigo-605 rounded-xl flex items-center justify-center mb-4 text-xs font-bold shadow-sm">
                          01
                        </div>
                        <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider mb-2">Local Allocation</h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          Your PDF files dissolve into a localized virtual Javascript ArrayBuffer. Files remain fully local, unlinked from external channels.
                        </p>
                      </div>
                    </div>
                    
                    <div className="bg-white dark:bg-slate-900 border border-slate-155 dark:border-slate-855 p-5 rounded-2xl shadow-premium-sm text-left relative flex flex-col justify-between">
                      <div>
                        <div className="h-8 w-8 bg-indigo-50 dark:bg-indigo-955/40 text-indigo-605 rounded-xl flex items-center justify-center mb-4 text-xs font-bold shadow-sm">
                          02
                        </div>
                        <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider mb-2">Local Browser Engine</h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          Our isolated code runs all formatting calculations directly on your own computer.
                        </p>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 border border-slate-15s dark:border-slate-855 p-5 rounded-2xl shadow-premium-sm text-left relative flex flex-col justify-between">
                      <div>
                        <div className="h-8 w-8 bg-indigo-50 dark:bg-indigo-955/40 text-indigo-605 rounded-xl flex items-center justify-center mb-4 text-xs font-bold shadow-sm">
                          03
                        </div>
                        <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider mb-2">Instant Download</h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          The browser triggers standard localized buffer downloads, outputting high-fidelity PDF objects directly.
                        </p>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 border border-slate-15s dark:border-slate-855 p-5 rounded-2xl shadow-premium-sm text-left relative flex flex-col justify-between">
                      <div>
                        <div className="h-8 w-8 bg-indigo-50 dark:bg-indigo-955/40 text-indigo-605 rounded-xl flex items-center justify-center mb-4 text-xs font-bold shadow-sm">
                          04
                        </div>
                        <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider mb-2">Garbage Purge</h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-404 leading-relaxed">
                          Upon task termination or viewport close, the active tab purges the allocated blocks, recycling RAM securely.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. "Built for Sensitive Documents" (HIPAA, GDPR, SOC-2) */}
                <div className="grid gap-10 lg:grid-cols-12 items-center bg-slate-55/50 dark:bg-slate-900/40 border border-slate-105 dark:border-slate-850 p-6 sm:p-10 rounded-3xl">
                  <div className="lg:col-span-7">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-100/30">
                      <Lucide.ShieldCheck className="h-3.5 w-3.5" />
                      Compliance Verified
                    </span>
                    <h3 className="font-display text-2xl sm:text-3.5xl font-black text-slate-850 dark:text-white mt-4 mb-4 leading-tight">
                      Designed for Regulated Organizations
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-505 dark:text-slate-400 leading-relaxed mb-6 font-body">
                      We protect healthcare environments, financial advisory offices, and defense counsels from structural data leaks. Since your processing operates natively inside the boundaries of clients, FoldPDF matches the absolute secure requirements listed under major certifications:
                    </p>
                    <ul className="space-y-3.5 text-xs text-slate-700 dark:text-slate-300">
                      <li className="flex items-start gap-2.5">
                        <Lucide.CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 shrink-0 mt-0.5" />
                        <div>
                          <strong>GDPR Sovereignty:</strong> No tracking scripts, no persistent third-party cookies, and complete personal data deletion by default.
                        </div>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <Lucide.CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 shrink-0 mt-0.5" />
                        <div>
                          <strong>HIPAA Privacy:</strong> Meets standard Safeguard checklists by never caching Protected Health Information (PHI) onto permanent external targets.
                        </div>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <Lucide.CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 shrink-0 mt-0.5" />
                        <div>
                          <strong>SOC-2 Frameworks:</strong> Stateless calculations guarantee absolute data segregation, keeping client assets completely secure.
                        </div>
                      </li>
                    </ul>
                  </div>
                  
                  <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 rounded-2xl p-6 shadow-premium-sm text-left">
                    <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                      <Lucide.History className="h-4 w-4" /> Integrity Milestones
                    </h4>
                    <div className="space-y-4 text-xs font-body">
                      <div className="flex gap-3">
                        <span className="font-mono text-indigo-500 pr-2 shrink-0">WASM v1</span>
                        <p className="text-slate-500 dark:text-slate-400">Successfully shifted core layout and formatting math over to sandboxed modules.</p>
                      </div>
                      <div className="flex gap-3">
                        <span className="font-mono text-indigo-500 pr-2 shrink-0">ZERO v2</span>
                        <p className="text-slate-500 dark:text-slate-400">Eliminated backend temporary storage caches for completely stateless processing pipelines.</p>
                      </div>
                      <div className="flex gap-3">
                        <span className="font-mono text-indigo-500 pr-2 shrink-0">RAM v3</span>
                        <p className="text-slate-500 dark:text-slate-400">Optimized client-side memory buffers so you can handle very large documents directly in your browser.</p>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}

        {/* VIEW 2: DYNAMIC INDIVIDUAL MULTI-STEP WORKSPACE PAGES */}
        {activeTool && (
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <ToolWorkspace
              tool={activeTool}
              navigate={navigate}
              onActionLogged={handleActionLogged}
            />
            <ToolSeoContent toolId={activeTool.id} />
          </div>
        )}

        {/* VIEW 3: DYNAMIC CHOSEN BLOG SUB-SECTOR PAGES */}
        {currentPath === '/blog' && (
          <BlogIndex navigate={navigate} />
        )}
        {currentPath.startsWith('/blog/') && (
          <BlogPostPage 
            slug={currentPath.split('/blog/')[1]} 
            navigate={navigate} 
          />
        )}

        {/* VIEW 4: DYNAMIC COMPLIANCIES LEGAL PAGES */}
        {currentPath === '/about' && <AboutPage navigate={navigate} />}
        {currentPath === '/security' && <SecurityHub navigate={navigate} />}
        {currentPath === '/transparency' && <TransparencyPage navigate={navigate} />}
        {currentPath === '/how-it-works' && <HowItWorksPage navigate={navigate} />}
        {currentPath === '/sitemap' && <SitemapPage navigate={navigate} />}
        {currentPath === '/contact' && <LegalPages page="contact" navigate={navigate} />}
        {currentPath === '/privacy' && <LegalPages page="privacy" navigate={navigate} />}
        {currentPath === '/terms' && <LegalPages page="terms" navigate={navigate} />}
        {currentPath === '/dmca' && <LegalPages page="dmca" navigate={navigate} />}



      </main>

      {/* FOOTER COMPONENTS */}
      <Footer navigate={navigate} />



      {/* AUTHENTICATION POPUP DIALOG TRIGGER */}
      {authModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-3xl border bg-white p-6 shadow-2xl dark:bg-neutral-900 animate-in zoom-in-95 duration-200 text-left">
            <button
              onClick={() => {
                setAuthError('');
                setVerificationEmail(null);
                setIsForgotPassword(false);
                setResetPasswordSentEmail(null);
                setPasswordRecovery(false);
                setInlineErrors({});
                setGoogleLoading(false);
                setEmailLoading(false);
                setAuthModalOpen(false);
              }}
              className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600"
            >
              <Lucide.X className="h-5 w-5" />
            </button>

            {passwordRecovery ? (
              <>
                <h2 className="text-2xl font-extrabold tracking-tight text-neutral-950 dark:text-white font-sans">
                  Choose a New Password
                </h2>
                <p className="text-xs text-neutral-500 mt-1 mb-5">
                  Your reset link worked. Pick a new password for your FoldPDF account.
                </p>

                {authError && (
                  <p className="text-xs font-semibold text-rose-500 bg-rose-50/50 dark:bg-rose-950/20 p-2.5 rounded-xl mb-4 border border-rose-100 dark:border-rose-900/30">
                    {authError}
                  </p>
                )}

                <form onSubmit={handleNewPasswordSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1">New Password</label>
                    <input
                      type="password"
                      required
                      autoComplete="new-password"
                      value={authForm.password}
                      onChange={(e) => {
                        setAuthForm({ ...authForm, password: e.target.value });
                        setInlineErrors(prev => ({ ...prev, password: undefined }));
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 px-3 text-sm text-neutral-900 placeholder-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:focus:bg-neutral-900 transition-all cursor-text"
                    />
                    {inlineErrors.password && (
                      <p className="text-rose-500 text-[11px] mt-1 font-semibold">{inlineErrors.password}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1">Repeat New Password</label>
                    <input
                      type="password"
                      required
                      autoComplete="new-password"
                      value={authForm.repeatPassword}
                      onChange={(e) => {
                        setAuthForm({ ...authForm, repeatPassword: e.target.value });
                        setInlineErrors(prev => ({ ...prev, repeatPassword: undefined }));
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 px-3 text-sm text-neutral-900 placeholder-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:focus:bg-neutral-900 transition-all cursor-text"
                    />
                    {inlineErrors.repeatPassword && (
                      <p className="text-rose-500 text-[11px] mt-1 font-semibold">{inlineErrors.repeatPassword}</p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={emailLoading}
                    className="w-full rounded-xl bg-indigo-600 text-white font-semibold py-2.5 text-sm hover:bg-indigo-700 active:bg-indigo-800 transition mt-4 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {emailLoading ? 'Saving...' : 'Save New Password'}
                  </button>
                </form>
              </>
            ) : resetPasswordSentEmail ? (
              <div className="py-2 text-center">
                <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/25 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Lucide.KeyRound className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 className="text-xl font-extrabold tracking-tight text-neutral-950 dark:text-white font-sans mb-3">
                  Password Link Sent
                </h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed mb-6 font-body col-span-2">
                  We sent you a password change link to <span className="font-bold text-neutral-950 dark:text-white">{resetPasswordSentEmail}</span>
                </p>
                <button
                  onClick={() => {
                    setResetPasswordSentEmail(null);
                    setIsForgotPassword(false);
                  }}
                  className="w-full rounded-xl bg-indigo-600 text-white font-semibold py-2.5 text-sm hover:bg-indigo-700 active:bg-indigo-800 transition shadow-lg shadow-indigo-500/10 cursor-pointer"
                >
                  Sign In
                </button>
              </div>
            ) : verificationEmail ? (
              <div className="py-2 text-center">
                <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-950/25 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Lucide.MailOpen className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="text-xl font-extrabold tracking-tight text-neutral-950 dark:text-white font-sans mb-3">
                  Please Verify Your Email
                </h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed mb-6 font-body col-span-2">
                  We have sent you a verification email to <span className="font-bold text-neutral-950 dark:text-white">{verificationEmail}</span>. Verify it and log in
                </p>
                <button
                  onClick={() => {
                    setVerificationEmail(null);
                    setAuthForm({ ...authForm, isRegister: false, name: '', password: '', repeatPassword: '' });
                  }}
                  className="w-full rounded-xl bg-indigo-600 text-white font-semibold py-2.5 text-sm hover:bg-indigo-700 active:bg-indigo-800 transition shadow-lg shadow-indigo-500/10 cursor-pointer"
                >
                  Login
                </button>
              </div>
            ) : isForgotPassword ? (
              <>
                <h2 className="text-2xl font-extrabold tracking-tight text-neutral-950 dark:text-white font-sans">
                  Reset Password
                </h2>
                <p className="text-xs text-neutral-500 mt-1 mb-5">
                  Enter your email address to receive a secure password change link.
                </p>

                {authError && (
                  <p className="text-xs font-semibold text-rose-500 bg-rose-50/50 dark:bg-rose-950/20 p-2.5 rounded-xl mb-4 border border-rose-100 dark:border-rose-900/30">
                    {authError}
                  </p>
                )}

                <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      placeholder="alexis@domain.com"
                      value={authForm.email}
                      onChange={(e) => {
                        setAuthForm({ ...authForm, email: e.target.value });
                        setInlineErrors(prev => ({ ...prev, email: undefined }));
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 px-3 text-sm text-neutral-900 placeholder-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:focus:bg-neutral-900 transition-all cursor-text"
                    />
                    {inlineErrors.email && (
                      <p className="text-rose-500 text-[11px] mt-1 font-semibold">{inlineErrors.email}</p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="w-full rounded-xl bg-indigo-600 text-white font-semibold py-2.5 text-sm hover:bg-indigo-700 active:bg-indigo-800 transition mt-4 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {forgotLoading ? 'Sending...' : 'Get Reset Link'}
                  </button>
                </form>

                <div className="mt-6 text-center text-xs">
                  <button
                    onClick={() => {
                      setAuthError('');
                      setInlineErrors({});
                      setIsForgotPassword(false);
                    }}
                    className="text-indigo-600 hover:underline font-semibold cursor-pointer"
                  >
                    Back to Sign In
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-extrabold tracking-tight text-neutral-950 dark:text-white font-sans">
                  {authForm.isRegister ? 'Create FoldPDF Account' : 'Sign in to FoldPDF'}
                </h2>
                <p className="text-xs text-neutral-500 mt-1 mb-5">
                  Sync files history, cloud sync and save favorite converters. No signup required for core tools usage.
                </p>

                {authError && authError !== 'User already exists. Sign in?' && (
                  <p className="text-xs font-semibold text-rose-500 bg-rose-50/50 dark:bg-rose-950/20 p-2.5 rounded-xl mb-4 border border-rose-100 dark:border-rose-900/30">
                    {authError}
                  </p>
                )}

                <form onSubmit={handleAuthSubmit} className="space-y-4">
                  {authForm.isRegister && (
                    <div>
                      <label className="block text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1">Full Name</label>
                      <input
                        type="text"
                        required
                        placeholder="Alexis Carter"
                        value={authForm.name}
                        onChange={(e) => {
                          setAuthForm({ ...authForm, name: e.target.value });
                          setInlineErrors(prev => ({ ...prev, name: undefined }));
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 px-3 text-sm text-neutral-900 placeholder-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:focus:bg-neutral-900 transition-all cursor-text"
                      />
                      {inlineErrors.name && (
                        <p className="text-rose-500 text-[11px] mt-1 font-semibold">{inlineErrors.name}</p>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      placeholder="alexis@domain.com"
                      value={authForm.email}
                      onChange={(e) => {
                        setAuthForm({ ...authForm, email: e.target.value });
                        setInlineErrors(prev => ({ ...prev, email: undefined }));
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 px-3 text-sm text-neutral-900 placeholder-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:focus:bg-neutral-900 transition-all cursor-text"
                    />
                    {inlineErrors.email && (
                      <p className="text-rose-500 text-[11px] mt-1 font-semibold">{inlineErrors.email}</p>
                    )}
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Security Password</label>
                      {!authForm.isRegister && (
                        <button
                          type="button"
                          onClick={() => {
                            setAuthError('');
                            setInlineErrors({});
                            setIsForgotPassword(true);
                          }}
                          className="text-[10px] font-semibold text-indigo-600 hover:underline cursor-pointer"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        placeholder="••••••••"
                        value={authForm.password}
                        onChange={(e) => {
                          setAuthForm({ ...authForm, password: e.target.value });
                          setInlineErrors(prev => ({ ...prev, password: undefined }));
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-3 pr-10 text-sm text-neutral-900 placeholder-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:focus:bg-neutral-900 transition-all cursor-text animate-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer p-0.5 focus:outline-none select-none"
                        title={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? (
                          <Lucide.EyeOff className="h-4 w-4" />
                        ) : (
                          <Lucide.Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    {inlineErrors.password && (
                      <p className="text-rose-500 text-[11px] mt-1 font-semibold">{inlineErrors.password}</p>
                    )}

                    {authForm.isRegister && authForm.password && (() => {
                      const strength = getPasswordStrength(authForm.password);
                      if (!strength) return null;
                      return (
                        <div className="mt-2 space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Password Strength:</span>
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${strength.textColor}`}>{strength.label}</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${strength.color} transition-all duration-300`} 
                              style={{ 
                                width: strength.level === 'short' ? '33%' : strength.level === 'weak' ? '66%' : '100%' 
                              }}
                            />
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {authForm.isRegister && (
                    <div>
                      <label className="block text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1">Repeat Password</label>
                      <div className="relative">
                        <input
                          type={showRepeatPassword ? "text" : "password"}
                          required
                          placeholder="••••••••"
                          value={authForm.repeatPassword}
                          onChange={(e) => {
                            setAuthForm({ ...authForm, repeatPassword: e.target.value });
                            setInlineErrors(prev => ({ ...prev, repeatPassword: undefined }));
                          }}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-3 pr-10 text-sm text-neutral-900 placeholder-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:focus:bg-neutral-900 transition-all cursor-text animate-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowRepeatPassword(!showRepeatPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer p-0.5 focus:outline-none select-none"
                          title={showRepeatPassword ? "Hide password" : "Show password"}
                        >
                          {showRepeatPassword ? (
                            <Lucide.EyeOff className="h-4 w-4" />
                          ) : (
                            <Lucide.Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      {inlineErrors.repeatPassword && (
                        <p className="text-rose-500 text-[11px] mt-1 font-semibold">{inlineErrors.repeatPassword}</p>
                      )}
                    </div>
                  )}

                  {authForm.isRegister && authError === 'User already exists. Sign in?' && (
                    <div 
                      onClick={() => {
                        setAuthError('');
                        setInlineErrors({});
                        setGoogleLoading(false);
                        setEmailLoading(false);
                        setAuthForm({ ...authForm, isRegister: false, name: '', password: '', repeatPassword: '' });
                      }}
                      className="text-xs font-semibold p-2.5 rounded-xl border border-rose-100/50 dark:border-rose-950/40 bg-rose-50/50 dark:bg-rose-950/15 text-rose-500 dark:text-rose-400 text-center hover:bg-rose-100/30 cursor-pointer select-none transition-all mt-2"
                    >
                      {authError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={emailLoading || googleLoading}
                    className="w-full rounded-xl bg-indigo-600 text-white font-semibold py-2.5 text-sm hover:bg-indigo-700 active:bg-indigo-800 transition mt-4 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {emailLoading 
                      ? (authForm.isRegister ? 'Creating account...' : 'Signing in...') 
                      : (authForm.isRegister ? 'Register Free' : 'Access Account')}
                  </button>
                </form>

                <div className="relative my-4 flex py-1 items-center">
                  <div className="flex-grow border-t border-slate-200 dark:border-neutral-800"></div>
                  <span className="flex-shrink mx-4 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">or connect with</span>
                  <div className="flex-grow border-t border-slate-200 dark:border-neutral-800"></div>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={emailLoading || googleLoading}
                  className="w-full flex items-center justify-center bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 hover:bg-slate-50 dark:hover:bg-neutral-700/80 text-neutral-800 dark:text-neutral-100 font-bold py-2.5 px-4 rounded-full transition shadow-sm hover:shadow-md cursor-pointer select-none text-sm font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4 mr-3 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.63-.61-1.04-1.37-1.04-2.63z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  {googleLoading ? 'Connecting...' : (authForm.isRegister ? 'Sign up with Google' : 'Sign in with Google')}
                </button>

                <div className="mt-6 text-center text-xs">
                  <button
                    onClick={() => {
                      setAuthError('');
                      setInlineErrors({});
                      setGoogleLoading(false);
                      setEmailLoading(false);
                      setAuthForm({ ...authForm, isRegister: !authForm.isRegister, name: '', password: '', repeatPassword: '' });
                    }}
                    className="text-indigo-600 hover:underline font-semibold cursor-pointer"
                  >
                    {authForm.isRegister ? 'Already possess an account? Login here' : 'New to FoldPDF? Register free today'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* FRIENDLY SIGN OUT CONFIRMATION MODAL */}
      {logoutConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm rounded-3xl border border-slate-100 dark:border-neutral-800 bg-white p-6 shadow-2xl dark:bg-neutral-900 animate-in zoom-in-95 duration-200 text-center">
            
            <button
              onClick={() => setLogoutConfirmOpen(false)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
              id="close-logout-modal-btn"
            >
              <Lucide.X className="h-5 w-5" />
            </button>

            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400" id="logout-icon-container">
              <Lucide.LogOut className="h-6 w-6 ml-0.5" />
            </div>

            <h3 className="text-xl font-extrabold tracking-tight text-neutral-950 dark:text-white font-sans mb-2" id="logout-modal-title">
              Sign Out Confirmation
            </h3>
            
            <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed font-body mb-6" id="logout-modal-description">
              Are you sure you want to sign out? Your files will remain highly secure and will not be affected.
            </p>

            <div className="flex flex-col sm:flex-row-reverse gap-2">
              <button
                onClick={async () => {
                  setLogoutConfirmOpen(false);
                  await handleLogout();
                  addToast("Successfully signed out.", "info");
                }}
                className="w-full sm:w-1/2 rounded-xl bg-indigo-600 text-white font-semibold py-2.5 text-sm hover:bg-indigo-700 active:bg-indigo-800 transition shadow-lg shadow-indigo-500/10 cursor-pointer"
                id="confirm-logout-btn"
              >
                Yes, Sign Out
              </button>
              <button
                onClick={() => setLogoutConfirmOpen(false)}
                className="w-full sm:w-1/2 rounded-xl border border-slate-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-semibold py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-neutral-800 transition cursor-pointer"
                id="cancel-logout-btn"
              >
                Cancel
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Dynamic Cookie Consent Banner */}
      {!cookieConsentAccepted && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-5 duration-300 text-left font-body">
          <div className="flex items-start gap-3">
            <Lucide.Cookie className="h-6 w-6 text-indigo-500 mt-0.5 shrink-0 animate-bounce" />
            <div>
              <p className="text-xs font-bold text-slate-850 dark:text-white">Cookie & Privacy Consent</p>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                FoldPDF uses cookies and Google AdSense to deliver personalized ads and analyze secure traffic patterns. By continuing, you agree to our <span onClick={() => navigate('/privacy')} className="text-indigo-600 underline font-bold cursor-pointer hover:text-indigo-750">Privacy & Cookie Policies</span>.
              </p>
              <div className="mt-3.5 flex gap-2">
                <button
                  onClick={() => {
                    localStorage.setItem('cookie-consent', 'true');
                    setCookieConsentAccepted(true);
                  }}
                  className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-[10px] font-bold text-white hover:bg-indigo-750 transition cursor-pointer"
                >
                  Accept Consent
                </button>
                <button
                  onClick={() => setCookieConsentAccepted(true)}
                  className="rounded-lg bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-750 px-3 py-1.5 text-[10px] font-semibold transition cursor-pointer"
                >
                  Decline
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reusable Toast Notifications Container */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between p-4 rounded-2xl shadow-2xl transition-all duration-300 animate-in slide-in-from-top-4 ${
              toast.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/90 border border-emerald-100 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200'
                : toast.type === 'error'
                ? 'bg-rose-50 dark:bg-rose-950/90 border border-rose-100 dark:border-rose-900 text-rose-805 dark:text-rose-200'
                : 'bg-indigo-50 dark:bg-indigo-950/90 border border-indigo-100 dark:border-indigo-900 text-indigo-800 dark:text-indigo-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {toast.type === 'success' && <Lucide.CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />}
              {toast.type === 'error' && <Lucide.AlertCircle className="h-5 w-5 text-rose-500 shrink-0" />}
              {toast.type === 'info' && <Lucide.Info className="h-5 w-5 text-indigo-500 shrink-0" />}
              <span className="text-xs font-semibold">{toast.message}</span>
            </div>
            <button
              onClick={() => {
                setToasts((prev) => prev.filter((t) => t.id !== toast.id));
              }}
              className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 ml-4 shrink-0 transition"
            >
              <Lucide.X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

    </div>
  );
}