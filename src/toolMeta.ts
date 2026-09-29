import type { ToolDefinition } from './types';
import { SERVER_TOOL_IDS } from './components/tools/serverApi';

// Page title and meta description for a tool page. Used by the prerender (routes.ts) and at runtime (App.tsx),
// so search engines and the browser tab see the same text. Server tools must not claim to run in the browser.
export function getToolMeta(tool: ToolDefinition): { title: string; description: string } {
  const usesServer = SERVER_TOOL_IDS.includes(tool.id);

  const title = tool.metaTitle
    ? tool.metaTitle
    : usesServer
      ? `${tool.name} Online Free - Secure PDF Tool | FoldPDF`
      : `${tool.name} Online Free - 100% Private & Secure PDF Tool | FoldPDF`;

  const description = tool.metaDesc
    ? tool.metaDesc
    : usesServer
      ? `${tool.shortDesc} Your file is processed on our secure server and deleted right after conversion.`
      : `${tool.shortDesc} Process PDF files 100% locally in your browser with complete privacy on FoldPDF.`;

  return { title, description };
}
