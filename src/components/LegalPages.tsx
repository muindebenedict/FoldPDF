import React, { useState } from 'react';
import * as Lucide from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  const jsonStr = JSON.stringify(errInfo);
  console.error('Firestore Error: ', jsonStr);
  throw new Error(jsonStr);
}

interface LegalPagesProps {
  page: 'about' | 'contact' | 'privacy' | 'terms' | 'dmca';
  navigate: (path: string) => void;
}

export function LegalPages({ page, navigate }: LegalPagesProps) {
  const [contactForm, setContactForm] = useState({ name: '', email: '', subject: 'General Inquiry', message: '' });
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const nameVal = contactForm.name.trim();
    const emailVal = contactForm.email.trim();
    const messageVal = contactForm.message.trim();

    // 1. Validate all fields are filled in
    if (!nameVal || !emailVal || !messageVal) {
      setFormError('Please fill in all fields.');
      return;
    }

    // 2. Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailVal)) {
      setFormError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    try {
      const ticketData = {
        fullName: nameVal,
        email: emailVal,
        category: contactForm.subject,
        message: messageVal,
        submittedAt: serverTimestamp(),
        status: 'open'
      };

      let deliverySuccessful = false;

      // 1. Submit directly over API using FormSubmit securely in the background
      try {
        const res = await fetch("https://formsubmit.co/ajax/foldpdf.support@gmail.com", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            name: nameVal,
            email: emailVal,
            category: contactForm.subject,
            message: messageVal
          })
        });
        if (res.ok) {
          deliverySuccessful = true;
        }
      } catch (submitErr) {
        console.warn("Background API submission failed, fallback chosen:", submitErr);
      }

      // 2. Also log inside Firestore database
      try {
        await addDoc(collection(db, 'support_tickets'), ticketData);
        deliverySuccessful = true;
      } catch (dbErr) {
        console.error('Database logging status: ', dbErr);
      }

      // 3. Fallback to Mailto Redirection if background post fails entirely
      if (!deliverySuccessful) {
        const mailtoSubject = encodeURIComponent(`[FoldPDF Contact] ${contactForm.subject} - ${nameVal}`);
        const mailtoBody = encodeURIComponent(
          `Hello Benedict,\n\nI have submitted a support request via FoldPDF with the details below:\n\nSender Name: ${nameVal}\nSender Email: ${emailVal}\nInquiry Type: ${contactForm.subject}\n\nMessage:\n${messageVal}\n\n---\nProcessed securely by FoldPDF`
        );
        const mailtoUrl = `mailto:foldpdf.support@gmail.com?subject=${mailtoSubject}&body=${mailtoBody}`;
        window.location.href = mailtoUrl;
      }

      // Clear the form and show success message
      setContactForm({ name: '', email: '', subject: 'General Inquiry', message: '' });
      setFormSubmitted(true);
    } catch (error) {
      setFormError('Could not issue inquiry. Please email me directly at foldpdf.support@gmail.com');
    } finally {
      setIsLoading(false);
    }
  };

  // 1. ABOUT PAGE
  if (page === 'about') {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 dark:text-neutral-200">
        <span className="text-xs font-bold tracking-widest text-indigo-600 uppercase dark:text-indigo-400">
          Our Vision & Mission
        </span>
        <h1 className="mt-2 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-neutral-900 dark:text-white font-display mb-6">
          Meet FoldPDF Workspace
        </h1>
        <p className="text-lg text-neutral-600 dark:text-neutral-400 mb-8 leading-relaxed">
          FoldPDF was created in early 2026 by a team of software researchers and digital workspace design enthusiasts. We were tired of standard PDF websites that are clunky, loaded with ads, demand forced registration walls, and display zero modern AI intelligence.
        </p>

        <div className="grid gap-8 md:grid-cols-2 mb-12">
          <div className="rounded-2xl bg-neutral-50 p-6 dark:bg-neutral-900/60 border border-neutral-100 dark:border-neutral-800">
            <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-2 flex items-center">
              <Lucide.Zap className="h-5 w-5 text-indigo-500 mr-2" />
              1. The 3-Second Rule
            </h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
              We live by speed. You land, you drop, you download. We deliberately designed our layout so your requested tools are displayed immediately above the fold—no menus, no navigation mazes.
            </p>
          </div>

          <div className="rounded-2xl bg-neutral-50 p-6 dark:bg-neutral-900/60 border border-neutral-100 dark:border-neutral-800">
            <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-2 flex items-center">
              <Lucide.ShieldCheck className="h-5 w-5 text-indigo-500 mr-2" />
              2. Absolute Privacy-First
            </h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
              Your files belong to you. Files processed are securely handled in RAM and destroyed. FoldPDF never preserves client documents, ensuring reliable support for students, doctors, and lawyers.
            </p>
          </div>
        </div>

        <div className="border-t border-gray-150 dark:border-neutral-800 pt-8 mt-12">
          <h2 className="text-2.5xl font-extrabold text-neutral-950 dark:text-white mb-4">
            Legitimate SaaS Standards
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed mb-4">
            Unlike spammy online PDF farming scripts, FoldPDF runs on premium Node.js technology. We integrate direct server-side interfaces with Google Gemini AI models to give genuine assistance. Whether you are extracting notes, checking resume metrics, or locking contracts, the AI performs calculations instantly.
          </p>
          <button 
            onClick={() => navigate('/')}
            className="rounded-full bg-indigo-600 text-white font-semibold text-sm px-6 py-2.5 shadow-md shadow-indigo-600/15 hover:bg-indigo-700 transition"
          >
            Explore Tools Workspace
          </button>
        </div>
      </div>
    );
  }

  // 2. CONTACT US PAGE
  if (page === 'contact') {
    const isFormSent = formSubmitted || (typeof window !== 'undefined' && window.location.search.includes('sent=true'));
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 dark:text-neutral-200">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-neutral-900 dark:text-white font-display mb-4">
          Contact FoldPDF Support
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-8 max-w-xl">
          Have a question or found a bug? Send me a message and I'll get back to you within 24 hours.
        </p>

        {isFormSent ? (
          <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/25 p-8 border border-emerald-100 dark:border-emerald-900 text-center animate-in zoom-in duration-200">
            <Lucide.CheckCircle className="h-14 w-14 text-emerald-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">Message Received Successfully!</h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-450 mb-6 max-w-sm mx-auto font-medium">
              Thanks! Your message has been sent. I'll reply within 24 hours.
            </p>
            <button 
              onClick={() => { window.location.href = '/contact'; }}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-850 dark:text-indigo-455 hover:underline"
            >
              Submit Another Inquiry
            </button>
          </div>
        ) : (
          <form action="https://formspree.io/f/xredwjzj" method="POST" className="space-y-5 rounded-2xl border border-gray-150 p-6 dark:border-neutral-800 bg-white dark:bg-neutral-900/40">
            <input type="hidden" name="_next" value="https://www.foldpdf.online/contact?sent=true" />
            {formError && (
              <div className="rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900 p-4 text-xs font-semibold text-rose-600 dark:text-rose-400">
                {formError}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-350 uppercase mb-1.5">Your Full Name</label>
                <input 
                  type="text" 
                  name="name"
                  required
                  placeholder="e.g. Alexis Carter" 
                  value={contactForm.name}
                  onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 py-2.5 px-3 text-sm dark:border-neutral-800 dark:bg-neutral-900 focus:outline-indigo-500 text-neutral-950 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-350 uppercase mb-1.5">Your Email Address</label>
                <input 
                  type="email" 
                  name="email"
                  required
                  placeholder="alexis@domain.com" 
                  value={contactForm.email}
                  onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 py-2.5 px-3 text-sm dark:border-neutral-800 dark:bg-neutral-900 focus:outline-indigo-500 text-neutral-950 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-350 uppercase mb-1.5">Topic Category</label>
              <select 
                name="topic"
                value={contactForm.subject}
                onChange={(e) => setContactForm({ ...contactForm, subject: e.target.value })}
                className="w-full rounded-xl border border-gray-200 py-2.5 px-3 text-sm dark:border-neutral-800 dark:bg-neutral-900 text-neutral-950 dark:text-white"
              >
                <option>General Inquiry</option>
                <option>Bug Report</option>
                <option>Feature Request</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-350 uppercase mb-1.5">Inquiry Message</label>
              <textarea 
                name="message"
                required
                rows={5}
                placeholder="Explain instructions, bugs, or notes in full context..."
                value={contactForm.message}
                onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                className="w-full rounded-xl border border-gray-200 py-2.5 px-3 text-sm dark:border-neutral-800 dark:bg-neutral-900 focus:outline-indigo-500 text-neutral-950 dark:text-white"
              />
            </div>

            <button 
              type="submit"
              className="w-full rounded-xl bg-indigo-600 text-white font-semibold py-3 text-sm hover:bg-indigo-700 transition shadow-md flex items-center justify-center gap-2"
            >
              Send Support Ticket
            </button>
          </form>
        )}
        <p className="mt-6 text-sm text-center text-neutral-500 dark:text-neutral-400">
          Prefer email? Reach me directly at <a href="mailto:foldpdf.support@gmail.com" className="text-indigo-600 dark:text-indigo-400 hover:underline">foldpdf.support@gmail.com</a>
        </p>
      </div>
    );
  }

  // 3. PRIVACY POLICY
  if (page === 'privacy') {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 dark:text-neutral-200 leading-relaxed text-sm">
        <span className="text-xs font-bold tracking-widest text-indigo-600 uppercase dark:text-indigo-400">
          User Data Protection & Privacy
        </span>
        <h1 className="mt-2 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-neutral-900 dark:text-white font-display mb-6">
          Privacy Policy
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">Last Updated: May 31, 2026</p>

        <div className="space-y-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-10 shadow-sm text-slate-600 dark:text-slate-300">
          <p>
            At FoldPDF, we care about your privacy. This page explains what information we gather and how we use it.
          </p>

          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Lucide.ShieldCheck className="h-5 w-5 text-indigo-500 animate-pulse" />
            1. We Do Not Store Your Files
          </h2>
          <p>
            We do not store or save any uploaded files. Your documents are processed directly in-browser on your own computer. All files are deleted completely as soon as you close the website tab.
          </p>

          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Lucide.Cookie className="h-5 w-5 text-indigo-500" />
            2. Cookies and Ads
          </h2>
          <p>
            We use Google AdSense and Google Analytics on our website. These services use cookies to display relevant advertisements and analyze reader traffic patterns.
          </p>

          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Lucide.Settings className="h-5 w-5 text-indigo-500" />
            3. Disabling Cookies
          </h2>
          <p>
            You have complete control over cookies. You can choose to disable cookies through your browser settings at any time if you prefer not to use them.
          </p>

          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Lucide.Mail className="h-5 w-5 text-indigo-500" />
            4. Contact Us
          </h2>
          <p>
            If you have questions about our privacy practices, please contact us at:{" "}
            <a href="mailto:foldpdf.support@gmail.com" className="text-indigo-600 dark:text-indigo-400 hover:underline font-bold">
              foldpdf.support@gmail.com
            </a>
          </p>
        </div>
      </div>
    );
  }

  // 4. TERMS OF SERVICE
  if (page === 'terms') {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 dark:text-neutral-200 leading-relaxed text-sm">
        <span className="text-xs font-bold tracking-widest text-indigo-600 uppercase dark:text-indigo-400">
          Agreement of Usage
        </span>
        <h1 className="mt-2 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-neutral-900 dark:text-white font-display mb-6">
          Terms of Service
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">Last Updated: May 31, 2026</p>

        <div className="space-y-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-10 shadow-sm text-slate-600 dark:text-slate-300">
          <p>
            Welcome to FoldPDF. Please read these simple Terms of Service before using our website.
          </p>

          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Lucide.Scale className="h-5 w-5 text-indigo-500" />
            1. Allowed Use
          </h2>
          <p>
            You agree to use our tools for legal purposes only. You must not use our service to process illegal files or try to damage our website.
          </p>

          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Lucide.AlertTriangle className="h-5 w-5 text-indigo-500" />
            2. Provided As-Is
          </h2>
          <p>
            We provide all tools as-is with no warranty. We do our best to make sure the tools work, but we cannot promise they will always be perfect or available.
          </p>

          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Lucide.FileWarning className="h-5 w-5 text-indigo-500" />
            3. No Liability for Data Loss
          </h2>
          <p>
            We process files locally on your device. We are not liable for any data loss, file corruption, or issues that happen during file processing. Always keep backups of your originals.
          </p>

          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Lucide.RefreshCw className="h-5 w-5 text-indigo-500" />
            4. Updating These Terms
          </h2>
          <p>
            We can update these terms at any time. We will change the "Last Updated" date at the top of this page when we make modifications.
          </p>

          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Lucide.Info className="h-5 w-5 text-indigo-500" />
            5. Site Operation
          </h2>
          <p>
            This website is operated by Benedict Muinde in Nairobi, Kenya.
          </p>
        </div>
      </div>
    );
  }

  // 5. DMCA POLICY
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 dark:text-neutral-200 leading-relaxed text-sm">
      <span className="text-xs font-bold tracking-widest text-indigo-600 uppercase dark:text-indigo-400">
        Copyright Compliance Registry
      </span>
      <h1 className="mt-2 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-neutral-900 dark:text-white font-display mb-6">
        DMCA Takedown Procedures
      </h1>
      <p className="mb-8 text-sm text-neutral-500">Last Revised: May 21, 2026</p>
      <p className="mb-4">
        Since our system operates as an **on-the-fly, immediate file-handling service**, we do NOT store or compile archives of documents on our servers. As a result, there are no online copyright-infringing files maintained inside our domain registry.
      </p>
      <p className="mb-4">
        If you are a copyright owner and have inquiries regarding trademark uses, submit your detailed reports directly to support via our interactive <span onClick={() => navigate('/contact')} className="text-indigo-600 font-semibold cursor-pointer underline">Contact Form</span> and we will audit logs within 12 hours.
      </p>
    </div>
  );
}
