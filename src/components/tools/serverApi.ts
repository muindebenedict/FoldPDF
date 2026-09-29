// The FoldPDF API on Render runs the tools that can't work in the browser (Adobe, Ghostscript, LibreOffice).
export const API_BASE = import.meta.env.VITE_FOLDPDF_API_URL?.trim() || "https://foldpdf-api-1.onrender.com";

// Tools that send the file to that server. Every other tool runs entirely in the browser.
export const SERVER_TOOL_IDS = ["compress-pdf", "pdf-to-word", "word-to-pdf", "pdf-to-pptx", "pptx-to-pdf"];

export type ServerErrorCode = "QUOTA_EXCEEDED" | "RATE_LIMITED" | "FILE_TOO_LARGE" | "UNREACHABLE" | "FAILED";

// Messages avoid the words Proc's error handler rewrites ("network", "connect", "memory", "unsupported"…).
export class ServerToolError extends Error {
  code: ServerErrorCode;

  constructor(message: string, code: ServerErrorCode) {
    super(message);
    this.name = "ServerToolError";
    this.code = code;
  }
}

export async function serverError(response: Response): Promise<ServerToolError> {
  let body: { error?: string; code?: string; retry_after?: number } = {};
  try {
    body = await response.json();
  } catch {
    // Not a JSON error body (e.g. a proxy error page).
  }

  if (body.code === "QUOTA_EXCEEDED") {
    return new ServerToolError(
      "This converter has used all its free conversions for this month. Please try again next month.",
      "QUOTA_EXCEEDED"
    );
  }
  if (body.code === "RATE_LIMITED" || response.status === 429) {
    const minutes = Math.max(1, Math.ceil((body.retry_after ?? 3600) / 60));
    return new ServerToolError(
      `You've reached the limit for this tool for now. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      "RATE_LIMITED"
    );
  }
  if (body.code === "FILE_TOO_LARGE" || response.status === 413) {
    return new ServerToolError("File too large. Maximum size is 50MB.", "FILE_TOO_LARGE");
  }
  if (body.code === "BAD_REQUEST" && body.error) {
    return new ServerToolError(body.error, "FAILED");
  }
  return new ServerToolError("Conversion failed. Please try again.", "FAILED");
}

export async function postToServer(path: string, file: File): Promise<Response> {
  const formData = new FormData();
  formData.append("file", file);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { method: "POST", body: formData });
  } catch {
    throw new ServerToolError(
      "Couldn't reach the conversion server. Please check your internet and try again.",
      "UNREACHABLE"
    );
  }

  if (!response.ok) throw await serverError(response);
  return response;
}

// The server says which service converted the file, so the result screen can credit it.
export function convertedByNote(response: Response): string | undefined {
  const convertedBy = response.headers.get("X-Converted-By");
  if (convertedBy === "adobe") return "Converted using Adobe PDF Services — structure preserved";
  if (convertedBy === "compdf") return "Converted using ComPDF — structure preserved";
  return undefined;
}
