import React, { useState } from 'react';

interface FoldPdfLogoProps {
  className?: string;
  showText?: boolean;
  showTagline?: boolean;
}

export function FoldPdfLogo({ className = "h-9 w-9", showText = false, showTagline = true }: FoldPdfLogoProps) {
  return (
    <div className="flex items-center space-x-3 select-none group">
      {/* 38px Icon Height wrapper with transparent background */}
      <div className="h-[38px] flex-shrink-0 flex items-center justify-center">
        <img 
          src="/FOLDPDF_icon_crisp.png" 
          alt="" 
          referrerPolicy="no-referrer"
          style={{ height: "38px", width: "auto", objectFit: "contain", display: "block" }}
          className="h-[38px] w-auto object-contain transition-all duration-300 transform group-hover:scale-105"
        />
      </div>

      {showText && (
        <div className="flex flex-col items-start leading-none justify-center">
          {/* FOLD PDF BRAND NAME (Large, prominent) */}
          <span className="font-display text-[19px] sm:text-[21px] font-extrabold tracking-tight text-slate-800 dark:text-white leading-none">
            Fold<span className="text-indigo-600 dark:text-indigo-400">PDF</span>
          </span>
          {/* THE BRAND TAGLINE DEFINED IN THE PROMPT (Small, metadata, non-wrapping) */}
          {showTagline && (
            <span className="text-[10px] font-bold text-slate-400 dark:text-neutral-500 tracking-[0.06em] uppercase whitespace-nowrap mt-1 leading-none block">
              ALL PDF TOOLS. ONE FOLD.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
