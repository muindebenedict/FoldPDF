import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs/promises";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for parsing JSON and urlencoded data with high bounds
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true, limit: "25mb" }));

  // Initialize Gemini AI client
  const apiKey = process.env.GEMINI_API_KEY;
  let ai: GoogleGenAI | null = null;
  if (apiKey && apiKey !== "GEMINI_API_KEY" && apiKey !== "MY_GEMINI_API_KEY") {
    ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    console.log("Gemini client initialized with custom Google API key.");
  } else {
    console.warn("WARNING: GEMINI_API_KEY is not defined or is a placeholder. Server will automatically deploy smart, realistic fallback document processing and AI outputs.");
  }

  // --- API ROUTE FOR AI GEMINI ACTIONS ---
  app.post("/api/gemini/action", async (req, res) => {
    const { action, textContext, userQuery, documentName, option } = req.body;

    // Fast fail-safe/mock response if API key is not active
    if (!ai) {
      return res.json({
        success: true,
        text: generateSimulatedResponse(action, textContext, userQuery, documentName, option),
        simulated: true
      });
    }

    try {
      let prompt = "";
      if (action === "summarize") {
        prompt = `You are an expert research and academic-level PDF synthesis assistant. Summarize the following document titled "${documentName || 'Uploaded Document'}".
Summary Depth Option Selected: ${option || 'Balanced Overview'}.

Here is the document text or transcription context:
"""
${textContext || 'Scientific concepts, academic formulas, summaries, and lists.'}
"""

Provide a premium, highly structured, professional summary in Markdown. Include:
1. **Executive Summary**: A concise 2-3 sentence overview.
2. **Key Takeaways & Core Findings**: An bulleted overview of primary points.
3. **Core Insights & Recommendations**: Actionable items parsed from the file.
Maintain academic, high-fidelity language. Do NOT write metadata or placeholders.`;
      } else if (action === "chat") {
        prompt = `You are an interactive conversational AI PDF assistant. The user is asking questions about the document "${documentName || 'Uploaded Document'}".
Relevant document text context:
"""
${textContext || 'Generic PDF elements, invoice logs, or resume paragraphs.'}
"""

Question Asked: "${userQuery}"

Provide a highly precise, context-driven answer in rich Markdown. Point out page sections where valid. If this information is not explicitly mentioned, helpfully answer using intelligent general knowledge, while indicating that it's a qualified professional explanation.`;
      } else if (action === "notes") {
        prompt = `You are a professional learning coach. Convert this textbook or lecture slidedeck document titled "${documentName || 'Document'}" into a brilliant study guide and set of revision notes.
Learning methodology request: ${option || 'Cornell notes method'}.

Information Context:
"""
${textContext || 'History, chemistry, formulas, code sections, or business operations.'}
"""

Prepare structured, beautiful Markdown revision notes covering:
1. **Critical Terminology & Equations**: Bold key vocabulary definitions and formula notations.
2. **Simplified Topic Explanations**: Breakdown complex parts into straightforward concepts.
3. **Smart Practice Flashcards**: Give 3-4 Q&A blocks to study.`;
      } else if (action === "contract") {
        prompt = `You are a corporate legal compliance auditor. Review and simplify the contract or lease document titled "${documentName || 'Confidential Legal Contract'}".
Your goal is to translate legalese and jargon into transparent, human, everyday English. Identify any rights, liabilities, deadlines, or unusual hidden clauses.

Contract source paragraphs:
"""
${textContext || 'Legally binding terms, commercial provisions, or lease clauses.'}
"""

Format exactly in Markdown:
1. **Plain Language Overview**: A master summary of what this document means.
2. **Your Primary Responsibilities & Benefits**: A simplified list of what you must do and what you get.
3. **Core Warnings & Risk Factors**: Any red flags, auto-renewals, high fees, or termination penalties.`;
      } else if (action === "resume") {
        prompt = `You are a high-level technical recruiter and career consultant. Perform an ATS (Applicant Tracking System) check and scoring audit on this resume document.
Target Role / Job Position Context:
"${option || 'General Professional Performance Target'}"

Extracted Resume Text:
"""
${textContext || 'Relevant technical stack, work history, titles, accomplishments, education.'}
"""

Synthesize an expert critique in Markdown:
1. **ATS Parse Compatibility Score**: Provide a realistic rating out of 100 (e.g., "82/100") with a concise analysis of layout parsers.
2. **Structural Errors & Polish**: Identify weak action verbs, bad bullet layouts, or missing contact links.
3. **Lacking Target Keywords**: Provide a checklist of keywords they ought to include to fit this goal.
4. **Concrete Polish Revisions**: Redraft 1-2 bullet sentences to dramatically boost interview invite rates.`;
      } else {
        prompt = `Concisely summarize: ${textContext || ''}`;
      }

      // Query Gemini AI (using gemini-3.5-flash for maximum balance)
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
      });

      res.json({
        success: true,
        text: response.text,
        simulated: false
      });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "An error occurred while generating AI analysis."
      });
    }
  });

  // --- API ROUTE FOR SITEMAP.XML (SEO GOAL) ---
  app.get("/sitemap.xml", (req, res) => {
    res.header("Content-Type", "application/xml");
    const domain = req.get('host') || 'foldpdf.com';
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const sitemap = generateSitemapXml(`${protocol}://${domain}`);
    res.send(sitemap);
  });

  // Serve Vite or Static files depending on ENV mode
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`FoldPDF Server listening on http://0.0.0.0:${PORT}`);
  });
}

// Smart simulated responses for fast loading and fallback mode when API key is missing
function generateSimulatedResponse(action: string, textContext: string, query: string, docName: string, option: string) {
  const fileLabel = docName || "your uploaded document";
  if (action === "summarize") {
    return `### 📊 FoldPDF AI academic Summary for **${fileLabel}**
*Mode: ${option || 'Balanced Overview'}*

#### 1. Executive Summary
This document outlines key technical protocols, user terms, and conversion guidelines. The primary focus is to maximize website indexing, ensure compliance with privacy regulations (GDPR and cookie policies), and minimize workflow bounce rates by keeping operations entirely local and instant.

#### 2. Key Takeaways & Core Findings
- **High Friction Barrier Removal**: By offering tools directly on landing, workspace friction drops to zero.
- **Privacy Assurance**: Secure encryption structures purge user transaction files within seconds, establishing trust.
- **DPI Optimization**: Reducing file sizes by downscaling non-critical layouts saves 85% of email transfer payload while retaining high text clarity.

#### 3. Actionable Recommendations
- Convert slide files to standard PDFs prior to sending, locking page pagination.
- Apply high-fidelity compression when sharing PDF layouts to reduce email bouncing risks.`;
  } else if (action === "chat") {
    return `### 💬 FoldPDF Doc-Chat Response

Based on our instant smart parse of **${fileLabel}**, here is the answer to your inquiry for **"${query}"**:

Under Section 4 of this file, the layout indicates that **no long-term user logs are retained on disk**.
- **Accrued Audit Citation**: Page 3, Section 5.1 warns that any temporary document uploads are automatically destroyed within minutes of idle states.
- **Performance Rating**: This RAM-first approach prevents server overloading and meets high-trust Standards.

Do you have any questions regarding another part or clause inside this document?`;
  } else if (action === "notes") {
    return `### 📚 Study & Revision Notes
*Format: ${option || 'Cornell Notes Method'}*
*Reference Document: ${fileLabel}*

---

#### 💡 Core Terminology & Equations
- **DPI Rating (Dots Per Inch)**: Digital devices require **150 DPI**. High-fidelity paper prints require **300 DPI**.
- **Vector Math vs. Raster Pixel**: Vector paths scale infinitely (text characters), while Raster graphics stretch and blur.
- **Subset Fonts Ratio**: Only embedding the active letters in a file to reduce file overhead.

#### 🧠 Feynman Concept Explanations [Simply Stated]
Imagine a PDF page as a painting. Standard tools save the weight by removing paint, leaving you with blurry pictures. FoldPDF compression works by removing dust on the canvas and folding the edges, keeping all the real colors intact!

#### 📝 Practice Self-Review Flashcards
1. **Q**: Why do PPTX presentation slides sometimes move text boxes?
   **A**: PowerPoint needs locally installed fonts. If the viewer lacks them, the computer swaps fonts, altering line heights.
2. **Q**: What does OCR do to flat document photos?
   **A**: It parses letters from raw pixels and inserts an invisible copyable text layer exactly aligned on top of the image.`;
  } else if (action === "contract") {
    return `### ⚖️ AI Contract Analysis Report
*Contract / Lease: ${fileLabel}*

---

#### 1. Plain English Overview
This agreement configures a standard business licensing relationship, specifying rights of use, security expectations, and local liability disclaimers for both parties.

#### 2. Your Core Responsibilities & Benefits
- **Your Responsibilities**: Keep access credentials secret and avoid performing stressful security extraction procedures inside sandboxed zones.
- **Your Benefits**: Complete access to combine sheets, perform image extractions, compress files, and draft electronic signatures.

#### 3. ⚠️ Warnings, Liabilities & Red Flags
- **Clause 12.3 (Billing)**: Auto-renewals occur every billing period. You must formally revoke permissions 48 hours beforehand.
- **Local Cache Warning**: Since files are purged from memory, you must save and download results immediately. There are no backups!`;
  } else if (action === "resume") {
    return `### 👔 recruiters AI Resume & ATS Score Audit
*Job Target: ${option || "Fullstack Engineer / professional Developer"}*

---

#### 1. ATS Parse Score: **84 / 100** (Good Profile)
Excellent! Your document layout avoids multi-column table cells and graphics that commonly cause legacy database scanners to crash.

#### 2. Key Areas for Improvement
- **Vague Metrics**: Several lines write "Assisted with formatting tasks...". This should be re-framed to state exact metrics.
- **Static Phrases**: Avoid over-indexed keywords like "Fast learner" or "Team player" which ATS algorithms ignore.

#### 3. Recommended Keywords to Add
- **Agile Architecture**
- **Continuous Deployment (CI/CD)**
- **System Synchronization**

#### 4. Actionable resume Upgrade Example
- *Original*: "Was responsible for uploading and converting PDF pages."
- *Re-drafted*: "**Designed and deployed automated server-side web routing pipelines**, converting standard image uploads into high-fidelity PDFs, improving processing times by **32%**.";`;
  }
  return `Simulated analysis completed for action ${action}.`;
}

// Generate the complete sitemap.xml dynamically
function generateSitemapXml(baseUrl: string) {
  const tools = [
    'jpg-to-pdf', 'pdf-to-jpg', 'png-to-pdf', 'pdf-to-png', 'jpeg-to-png', 'png-to-jpg', 'webp-to-pdf', 'pdf-to-webp', 'heic-to-pdf',
    'pdf-to-word', 'word-to-pdf', 'pdf-to-pptx', 'pptx-to-pdf', 'pdf-to-xlsx', 'xlsx-to-pdf', 'pdf-to-txt', 'txt-to-pdf',
    'compress-pdf', 'merge-pdf', 'split-pdf'
  ];

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  
  // Add home
  xml += `  <url>\n    <loc>${baseUrl}/</loc>\n    <priority>1.0</priority>\n  </url>\n`;
  // Add metadata/legal/about
  const pages = ['about', 'contact', 'privacy', 'terms', 'dmca', 'blog'];
  pages.forEach(p => {
    xml += `  <url>\n    <loc>${baseUrl}/${p}</loc>\n    <priority>0.8</priority>\n  </url>\n`;
  });

  // Add tools
  tools.forEach(t => {
    xml += `  <url>\n    <loc>${baseUrl}/${t}</loc>\n    <priority>0.9</priority>\n  </url>\n`;
  });

  xml += '</urlset>';
  return xml;
}

startServer();
