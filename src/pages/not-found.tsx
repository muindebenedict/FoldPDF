import React from "react";
import * as Lucide from "lucide-react";
import { TOOLS_DATA } from "../toolsData";
import { ToolIcon } from "../components/ToolIcon";

interface NotFoundProps {
  navigate: (path: string) => void;
}

const POPULAR = ["compress-pdf", "merge-pdf", "pdf-to-word", "word-to-pdf", "jpg-to-pdf", "split-pdf"];

// Shown for addresses that don't exist. The prerendered copy is served as 404.html with a real 404 status.
export default function NotFoundPage({ navigate }: NotFoundProps) {
  const go = (path: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navigate(path);
  };
  const popular = POPULAR.map((id) => TOOLS_DATA.find((t) => t.id === id)).filter((t): t is (typeof TOOLS_DATA)[number] => !!t);

  return (
    <div className="mx-auto max-w-3xl px-4 py-20 text-center animate-in fade-in duration-300">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 dark:bg-indigo-500">
        <Lucide.FileQuestion className="h-8 w-8" aria-hidden="true" />
      </div>
      <p className="text-sm font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">404</p>
      <h1 className="mt-2 font-display text-3xl font-extrabold text-slate-900 dark:text-white sm:text-4xl">
        Page not found
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm text-slate-500 dark:text-slate-400">
        The page you're looking for doesn't exist or has moved. Try one of our most-used tools instead.
      </p>

      <div className="mt-8 grid gap-3 text-left sm:grid-cols-2">
        {popular.map((tool) => (
          <a
            key={tool.id}
            href={`/${tool.urlPath}`}
            onClick={go(`/${tool.urlPath}`)}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-slate-300 hover:shadow-premium-sm dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700"
          >
            <ToolIcon toolId={tool.id} size="sm" />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{tool.name}</span>
          </a>
        ))}
      </div>

      <a
        href="/"
        onClick={go("/")}
        className="mt-8 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-md shadow-indigo-600/20 transition hover:-translate-y-0.5 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
      >
        <Lucide.Home className="h-4 w-4" aria-hidden="true" />
        See all tools
      </a>
    </div>
  );
}
