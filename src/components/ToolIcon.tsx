import React from "react";
import {
  IconArrowMerge,
  IconArrowsMinimize,
  IconArrowsSplit2,
  IconDeviceMobile,
  IconFileMinus,
  IconFileTypeDoc,
  IconFileTypeJpg,
  IconFileTypePdf,
  IconFileTypePng,
  IconFileTypePpt,
  IconFileTypeTxt,
  IconFileTypeXls,
  IconListNumbers,
  IconLock,
  IconLockOpen,
  IconPhoto,
  IconRotateClockwise2,
  IconRubberStamp,
  IconSignature,
  IconTextScan2,
  IconTool,
  type Icon,
} from "@tabler/icons-react";

// Tile colour follows the file format a tool starts from (Word blue, PowerPoint orange, Excel green,
// images amber). Tools that work on a PDF use the family of the job: organise = PDF red,
// optimise = teal, edit = violet, security = slate. Converters add a badge naming the other format.
type Family = "pdf" | "word" | "powerpoint" | "excel" | "image" | "text" | "optimize" | "edit" | "security";
type Format = "PDF" | "DOC" | "PPT" | "XLS" | "TXT" | "JPG" | "PNG" | "WEBP";

const TILE: Record<Family, string> = {
  pdf: "bg-tool-pdf",
  word: "bg-tool-word",
  powerpoint: "bg-tool-powerpoint",
  excel: "bg-tool-excel",
  image: "bg-tool-image",
  text: "bg-tool-text",
  optimize: "bg-tool-optimize",
  edit: "bg-tool-edit",
  security: "bg-tool-security",
};

const BADGE: Record<Format, string> = {
  PDF: "bg-tool-pdf",
  DOC: "bg-tool-word",
  PPT: "bg-tool-powerpoint-strong",
  XLS: "bg-tool-excel",
  TXT: "bg-tool-text",
  JPG: "bg-tool-image-strong",
  PNG: "bg-tool-image-strong",
  WEBP: "bg-tool-image-strong",
};

const SPECS: Record<string, { family: Family; glyph: Icon; badge?: Format }> = {
  "merge-pdf": { family: "pdf", glyph: IconArrowMerge },
  "split-pdf": { family: "pdf", glyph: IconArrowsSplit2 },
  "remove-pages": { family: "pdf", glyph: IconFileMinus },
  "rotate-pdf": { family: "pdf", glyph: IconRotateClockwise2 },
  "compress-pdf": { family: "optimize", glyph: IconArrowsMinimize },
  "repair-pdf": { family: "optimize", glyph: IconTool },
  "ocr-pdf": { family: "optimize", glyph: IconTextScan2 },
  "add-watermark": { family: "edit", glyph: IconRubberStamp },
  "add-page-numbers": { family: "edit", glyph: IconListNumbers },
  "sign-pdf": { family: "edit", glyph: IconSignature },
  "protect-pdf": { family: "security", glyph: IconLock },
  "unlock-pdf": { family: "security", glyph: IconLockOpen },
  "word-to-pdf": { family: "word", glyph: IconFileTypeDoc, badge: "PDF" },
  "pdf-to-word": { family: "pdf", glyph: IconFileTypePdf, badge: "DOC" },
  "pptx-to-pdf": { family: "powerpoint", glyph: IconFileTypePpt, badge: "PDF" },
  "pdf-to-pptx": { family: "pdf", glyph: IconFileTypePdf, badge: "PPT" },
  "xlsx-to-pdf": { family: "excel", glyph: IconFileTypeXls, badge: "PDF" },
  "pdf-to-xlsx": { family: "pdf", glyph: IconFileTypePdf, badge: "XLS" },
  "txt-to-pdf": { family: "text", glyph: IconFileTypeTxt, badge: "PDF" },
  "pdf-to-txt": { family: "pdf", glyph: IconFileTypePdf, badge: "TXT" },
  "jpg-to-pdf": { family: "image", glyph: IconFileTypeJpg, badge: "PDF" },
  "pdf-to-jpg": { family: "pdf", glyph: IconFileTypePdf, badge: "JPG" },
  "png-to-pdf": { family: "image", glyph: IconFileTypePng, badge: "PDF" },
  "pdf-to-png": { family: "pdf", glyph: IconFileTypePdf, badge: "PNG" },
  "webp-to-pdf": { family: "image", glyph: IconPhoto, badge: "PDF" },
  "pdf-to-webp": { family: "pdf", glyph: IconFileTypePdf, badge: "WEBP" },
  "heic-to-pdf": { family: "image", glyph: IconDeviceMobile, badge: "PDF" },
  "jpeg-to-png": { family: "image", glyph: IconFileTypeJpg, badge: "PNG" },
  "png-to-jpg": { family: "image", glyph: IconFileTypePng, badge: "JPG" },
};

const SIZES = {
  sm: { tile: "h-9 w-9 rounded-lg", glyph: 20, badge: "text-[8px] px-1 leading-[13px] -right-1.5 -bottom-1.5" },
  md: { tile: "h-11 w-11 rounded-xl", glyph: 24, badge: "text-[10px] px-1 leading-[15px] -right-2 -bottom-2" },
  lg: { tile: "h-14 w-14 rounded-2xl", glyph: 30, badge: "text-[11px] px-1.5 leading-[17px] -right-2 -bottom-2" },
};

interface ToolIconProps {
  toolId: string;
  size?: keyof typeof SIZES;
  className?: string;
}

// Decorative: the tool's name is always shown next to it, so screen readers skip the icon.
export function ToolIcon({ toolId, size = "md", className = "" }: ToolIconProps) {
  const spec = SPECS[toolId] ?? { family: "pdf" as Family, glyph: IconFileTypePdf };
  const s = SIZES[size];
  const Glyph = spec.glyph;

  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10 ${TILE[spec.family]} ${s.tile} ${className}`}
    >
      <Glyph size={s.glyph} stroke={1.75} />
      {spec.badge && (
        <span
          className={`absolute rounded font-bold tracking-wide text-white ring-2 ring-white dark:ring-slate-900 ${BADGE[spec.badge]} ${s.badge}`}
        >
          {spec.badge}
        </span>
      )}
    </span>
  );
}
