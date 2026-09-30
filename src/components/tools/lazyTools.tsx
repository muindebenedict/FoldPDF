import React, { Component, lazy, useState, type ComponentProps, type ComponentType, type ReactNode } from "react";
import { TOOLS_DATA } from "../../toolsData";

// Each group of tools, with the libraries only it needs (pdf-lib, crypto-js and
// pako for the security tools), is downloaded when one of its tools is opened
// instead of with every page.
const MODULES = {
  doc: () => import("./PdfDocConverters"),
  img: () => import("./ImgConverters"),
  edit: () => import("./PdfEditTools"),
  security: () => import("./PdfSecurityTools"),
};
type ModuleKey = keyof typeof MODULES;
type ModuleOf<K extends ModuleKey> = Awaited<ReturnType<(typeof MODULES)[K]>>;

const TOOL_MODULES: Record<string, ModuleKey> = {
  "pdf-to-txt": "doc",
  "txt-to-pdf": "doc",
  "pdf-to-word": "doc",
  "word-to-pdf": "doc",
  "pdf-to-xlsx": "doc",
  "xlsx-to-pdf": "doc",
  "pdf-to-pptx": "doc",
  "pptx-to-pdf": "doc",
  "pdf-to-jpg": "img",
  "pdf-to-png": "img",
  "pdf-to-webp": "img",
  "jpg-to-pdf": "img",
  "png-to-pdf": "img",
  "webp-to-pdf": "img",
  "heic-to-pdf": "img",
  "compress-pdf": "edit",
  "merge-pdf": "edit",
  "split-pdf": "edit",
  "add-watermark": "edit",
  "add-page-numbers": "edit",
  "rotate-pdf": "edit",
  "remove-pages": "edit",
  "sign-pdf": "security",
  "protect-pdf": "security",
  "unlock-pdf": "security",
  "repair-pdf": "security",
  "ocr-pdf": "security",
};

const loaded: Partial<Record<ModuleKey, unknown>> = {};
const pending: Partial<Record<ModuleKey, Promise<unknown>>> = {};

function loadModule<K extends ModuleKey>(key: K): Promise<ModuleOf<K>> {
  pending[key] ??= MODULES[key]().then(
    (mod) => {
      loaded[key] = mod;
      return mod;
    },
    (err) => {
      delete pending[key]; // allow a retry
      throw err;
    }
  );
  return pending[key] as Promise<ModuleOf<K>>;
}

function lazyTool<K extends ModuleKey, N extends keyof ModuleOf<K>>(key: K, name: N) {
  type Props = ComponentProps<ModuleOf<K>[N] & ComponentType<any>>;
  const pick = (mod: ModuleOf<K>) => mod[name] as unknown as ComponentType<Props>;
  const Lazy = lazy(() => loadModule(key).then((mod) => ({ default: pick(mod) })));

  function Tool(props: Props) {
    // Already downloaded (the open page's tool, or during the prerender): render
    // it directly so there is no loading placeholder. Decided once per mount so
    // the component under a tool in use never changes.
    const [Direct] = useState(() => {
      const mod = loaded[key] as ModuleOf<K> | undefined;
      return mod ? pick(mod) : null;
    });
    return Direct ? <Direct {...props} /> : <Lazy {...props} />;
  }
  return Tool;
}

// Fetches the code for the tool at this address, if it is a tool page.
export function preloadToolForPath(pathname: string): Promise<unknown> {
  const path = pathname.replace(/\/+$/, "");
  const tool = TOOLS_DATA.find((t) => `/${t.urlPath}` === path);
  const key = tool && TOOL_MODULES[tool.id];
  return key ? loadModule(key) : Promise.resolve();
}

// The prerender needs every tool in the HTML it writes.
export function preloadAllTools(): Promise<unknown> {
  return Promise.all((Object.keys(MODULES) as ModuleKey[]).map((key) => loadModule(key)));
}

export const PdfToTxtTool = lazyTool("doc", "PdfToTxtTool");
export const TxtToPdfTool = lazyTool("doc", "TxtToPdfTool");
export const PdfToWordTool = lazyTool("doc", "PdfToWordTool");
export const WordToPdfTool = lazyTool("doc", "WordToPdfTool");
export const PdfToExcelTool = lazyTool("doc", "PdfToExcelTool");
export const ExcelToPdfTool = lazyTool("doc", "ExcelToPdfTool");
export const PdfToPptTool = lazyTool("doc", "PdfToPptTool");
export const PptToPdfTool = lazyTool("doc", "PptToPdfTool");
export const PdfToImgTool = lazyTool("img", "PdfToImgTool");
export const ImgToPdfTool = lazyTool("img", "ImgToPdfTool");
export const CompressTool = lazyTool("edit", "CompressTool");
export const MergeTool = lazyTool("edit", "MergeTool");
export const SplitTool = lazyTool("edit", "SplitTool");
export const RotateTool = lazyTool("edit", "RotateTool");
export const RemoveTool = lazyTool("edit", "RemoveTool");
export const WatermarkTool = lazyTool("edit", "WatermarkTool");
export const PageNumTool = lazyTool("edit", "PageNumTool");
export const ProtectTool = lazyTool("security", "ProtectTool");
export const UnlockTool = lazyTool("security", "UnlockTool");
export const RepairTool = lazyTool("security", "RepairTool");
export const OcrTool = lazyTool("security", "OcrTool");
export const SigTool = lazyTool("security", "SigTool");

// Shown for the moment a tool's code is downloading; about the height of a drop zone.
export function ToolLoading() {
  return (
    <div
      role="status"
      className="flex min-h-72 items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800"
    >
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" aria-hidden="true" />
      <span className="sr-only">Loading tool</span>
    </div>
  );
}

// If a tool's code can't be downloaded (offline, or a very old tab after an
// update), say so instead of leaving a blank page.
export class ToolLoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  declare props: { children: ReactNode }; // this project has no React type definitions installed
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 p-6 text-center dark:border-slate-800">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">This tool didn't load.</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">Check your internet connection, then reload the page.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Reload page
        </button>
      </div>
    );
  }
}
