import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs/promises";
import multer from "multer";
import os from "os";

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

  // --- COMPRESS PDF CONFIGRATION, CONCURRENCY LIMITS, RATE LIMITS, AND QUEUING ---
  const ipRequests: Record<string, number[]> = {};
  const compressionQueue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];
  let activeCompressions = 0;

  function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    if (!ipRequests[ip]) {
      ipRequests[ip] = [];
    }
    ipRequests[ip] = ipRequests[ip].filter(t => t > oneMinuteAgo);
    if (ipRequests[ip].length >= 5) {
      return true;
    }
    ipRequests[ip].push(now);
    return false;
  }

  function releaseCompressionSlot() {
    activeCompressions--;
    const next = compressionQueue.shift();
    if (next) {
      activeCompressions++;
      next.resolve();
    }
  }

  const upload = multer({
    dest: os.tmpdir(),
    limits: { fileSize: 50 * 1024 * 1024 }
  });

  const uploadMiddleware = upload.single("file");

  app.post("/api/compress", (req, res, next) => {
    const ip = req.ip || "unknown";
    if (isRateLimited(ip)) {
      return res.status(429).json({ error: "Rate limit exceeded. Max 5 requests per minute." });
    }

    uploadMiddleware(req, res, (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ error: "File too large. Maximum size is 50MB." });
        }
        return res.status(400).json({ error: err.message || "Failed uploading file." });
      }
      next();
    });
  }, async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    // Double check size
    if (req.file.size > 50 * 1024 * 1024) {
      if (req.file.path) {
        try { await fs.unlink(req.file.path); } catch {}
      }
      return res.status(400).json({ error: "File too large. Maximum size is 50MB." });
    }

    let isSlotAcquired = false;
    let queueObj: { resolve: () => void; reject: (err: Error) => void } | undefined;

    try {
      // 55-second request timeout
      const requestTimeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("GATEWAY_TIMEOUT")), 55000);
      });

      const processPromise = (async () => {
        // Acquire slot
        await new Promise<void>((resolve, reject) => {
          if (activeCompressions < 10) {
            activeCompressions++;
            isSlotAcquired = true;
            resolve();
            return;
          }
          if (compressionQueue.length >= 20) {
            return reject(new Error("QUEUE_FULL"));
          }
          queueObj = {
            resolve: () => {
              isSlotAcquired = true;
              resolve();
            },
            reject,
          };
          compressionQueue.push(queueObj);
        });

        // Forward to the compressor service
        const file = req.file!;
        const fileBuffer = await fs.readFile(file.path);
        const forwardFormData = new FormData();
        const fileBlob = new Blob([fileBuffer], { type: file.mimetype });
        forwardFormData.append("file", fileBlob, file.originalname);
        forwardFormData.append("mode", req.body.mode || "smart");

        const apiResponse = await fetch("https://foldpdf-api-1.onrender.com/api/compress", {
          method: "POST",
          body: forwardFormData,
        });

        if (!apiResponse.ok) {
          const errText = await apiResponse.text();
          throw new Error(errText || `Upstream error HTTP ${apiResponse.status}`);
        }

        const origSizeHeader = apiResponse.headers.get("x-original-size") || apiResponse.headers.get("X-Original-Size");
        const newSizeHeader = apiResponse.headers.get("x-new-size") || apiResponse.headers.get("X-New-Size");

        if (origSizeHeader) res.setHeader("X-Original-Size", origSizeHeader);
        if (newSizeHeader) res.setHeader("X-New-Size", newSizeHeader);

        const ab = await apiResponse.arrayBuffer();
        return Buffer.from(ab);
      })();

      const compressedBuffer = await Promise.race([processPromise, requestTimeoutPromise]);

      res.setHeader("Content-Type", "application/pdf");
      res.send(compressedBuffer);

    } catch (err: any) {
      if (queueObj) {
        const idx = compressionQueue.indexOf(queueObj);
        if (idx !== -1) {
          compressionQueue.splice(idx, 1);
        }
      }

      const errMsg = err?.message || String(err);
      if (errMsg === "QUEUE_FULL") {
        res.status(429).json({ error: "Queue is full. Too many simultaneous compressions. Please try again later." });
      } else if (errMsg === "GATEWAY_TIMEOUT") {
        res.status(504).json({ error: "Request timed out after 55 seconds." });
      } else {
        console.error("Compression route error:", err);
        res.status(500).json({ error: err.message || "Compression failed. Please try a smaller file or try again." });
      }
    } finally {
      if (req.file && req.file.path) {
        try {
          await fs.unlink(req.file.path);
        } catch (unlinkErr) {
          console.error("Cleanup of temp file failed:", unlinkErr);
        }
      }
      if (isSlotAcquired) {
        releaseCompressionSlot();
      }
    }
  });

  // --- API ROUTE FOR CONVERTING PDF TO WORD (DELEGATES TO PYTHON FLASK SERVER ON PORT 5000) ---
  app.post("/api/convert-to-word", (req, res, next) => {
    uploadMiddleware(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || "Failed uploading file." });
      }
      next();
    });
  }, async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    try {
      const file = req.file;
      const fileBuffer = await fs.readFile(file.path);
      const forwardFormData = new FormData();
      const fileBlob = new Blob([fileBuffer], { type: file.mimetype });
      forwardFormData.append("file", fileBlob, file.originalname);

      // Fetch from local Python Flask server with a 120-second timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      const apiResponse = await fetch("http://127.0.0.1:5000/api/convert-to-word", {
        method: "POST",
        body: forwardFormData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!apiResponse.ok) {
        const errText = await apiResponse.text();
        throw new Error(errText || "Conversion failed. Please try again.");
      }

      const ab = await apiResponse.arrayBuffer();
      const responseBuffer = Buffer.from(ab);

      res.setHeader("Content-Type", apiResponse.headers.get("content-type") || "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", apiResponse.headers.get("content-disposition") || `attachment; filename="${file.originalname.replace(/\.pdf$/i, "")}.docx"`);
      res.send(responseBuffer);

    } catch (err: any) {
      console.error("Conversion proxy error:", err);
      res.status(500).json({ error: "Conversion failed. Please try again." });
    } finally {
      if (req.file && req.file.path) {
        try {
          await fs.unlink(req.file.path);
        } catch (unlinkErr) {
          console.error("Cleanup of upload file failed:", unlinkErr);
        }
      }
    }
  });

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

  // --- PROXY FOR FIREBASE AUTH CUSTOM DOMAIN ---
  app.all("/__/auth/*", async (req, res) => {
    const targetUrl = `https://foldpdf.firebaseapp.com${req.originalUrl}`;
    try {
      const headers = new Headers();
      for (const [key, val] of Object.entries(req.headers)) {
        if (key.toLowerCase() !== "host" && val !== undefined) {
          if (Array.isArray(val)) {
            val.forEach(v => headers.append(key, v));
          } else {
            headers.set(key, String(val));
          }
        }
      }

      const options: RequestInit = {
        method: req.method,
        headers: headers,
      };

      if (req.method !== "GET" && req.method !== "HEAD") {
        if (req.headers["content-type"]?.includes("application/json") && req.body) {
          options.body = JSON.stringify(req.body);
        } else if (req.headers["content-type"]?.includes("application/x-www-form-urlencoded") && req.body) {
          options.body = new URLSearchParams(req.body).toString();
        }
      }

      const response = await fetch(targetUrl, options);
      res.status(response.status);

      response.headers.forEach((value, name) => {
        if (name.toLowerCase() !== "transfer-encoding" && name.toLowerCase() !== "content-encoding") {
          res.setHeader(name, value);
        }
      });

      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    } catch (err) {
      console.error("Firebase auth proxy error:", err);
      res.status(500).send("Authentication proxy error");
    }
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
