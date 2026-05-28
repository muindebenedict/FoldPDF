import React, { useState, useCallback } from "react";
import { readAB, readTxt, getPdfJs, getPdfLib, getMammoth, getXLSX, getPptxGen, extractText, fmt } from "./PdfScriptLoader";
import { Proc } from "./SharedComponents";

interface ToolProps {
  onSuccess?: (fileName: string, toolName: string) => void;
  toolName: string;
}

/* PDF→TXT */
export const PdfToTxtTool = ({ onSuccess, toolName }: ToolProps) => {
  const run = useCallback(async (files: File[], prog: (p: number, m?: string) => void) => {
    prog(15, "Opening PDF stream…");
    const ab = await readAB(files[0]);
    prog(40, "Parsing plain text streams…");
    const { text, numPages } = await extractText(ab);
    prog(90, "Assembling plain text document…");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    return {
      blob,
      name: `foldpdf-extracted-${Date.now()}.txt`,
      info: `Extracted ${numPages} page text layers`
    };
  }, []);

  return <Proc id="pdf-to-txt" label="Extract PDF Text" accept=".pdf" run={run} onSuccess={onSuccess} toolName={toolName} />;
};

/* TXT→PDF */
export const TxtToPdfTool = ({ onSuccess, toolName }: ToolProps) => {
  const [fs, setFs] = useState(12);

  const run = useCallback(async (files: File[], prog: (p: number, m?: string) => void) => {
    prog(10, "Opening plain text stream…");
    const text = await readTxt(files[0]);
    prog(35, "Spawning PDF page catalog…");
    const { PDFDocument, rgb } = await getPdfLib();
    const doc = await PDFDocument.create();

    const lh = fs * 1.45;
    const mg = 50;
    const pW = 595;
    const pH = 842;
    const cpl = Math.floor((pW - mg * 2) / (fs * 0.5));

    const lines: string[] = [];
    let cur = "";
    for (const w of text.split(/\s+/)) {
      if (w.includes("\n")) {
        const ps = w.split("\n");
        cur += ps[0];
        lines.push(cur);
        for (let i = 1; i < ps.length - 1; i++) lines.push(ps[i]);
        cur = ps[ps.length - 1];
      } else if ((cur + w).length > cpl) {
        lines.push(cur);
        cur = w;
      } else {
        cur += (cur ? " " : "") + w;
      }
    }
    if (cur) lines.push(cur);

    let pg = doc.addPage([pW, pH]);
    let y = pH - mg;
    prog(65, "Drawing character matrices on canvas…");
    for (const ln of lines) {
      if (y < mg + lh) {
        pg = doc.addPage([pW, pH]);
        y = pH - mg;
      }
      pg.drawText(ln || " ", {
        x: mg,
        y,
        size: fs,
        color: rgb(0.1, 0.1, 0.1)
      });
      y -= lh;
    }

    prog(90, "Compressing offset structures…");
    const bytes = await doc.save();
    return {
      blob: new Blob([bytes], { type: "application/pdf" }),
      name: `foldpdf-from-text-${Date.now()}.pdf`
    };
  }, [fs]);

  return (
    <Proc
      id="txt-to-pdf"
      label="Compile to PDF"
      accept=".txt"
      run={run}
      onSuccess={onSuccess}
      toolName={toolName}
      opts={
        <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <label className="block text-xs font-bold text-slate-705 dark:text-slate-350 mb-1.5 uppercase font-mono">
            Output Font Size: {fs}pt
          </label>
          <input
            type="range"
            min={10}
            max={18}
            value={fs}
            onChange={(e) => setFs(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-250 dark:bg-neutral-800 rounded-lg cursor-pointer"
          />
        </div>
      }
    />
  );
};

/* PDF→WORD */
export const PdfToWordTool = ({ onSuccess, toolName }: ToolProps) => {
  const run = useCallback(async (files: File[], prog: (p: number, m?: string) => void) => {
    prog(15, "Opening PDF layout structure…");
    const ab = await readAB(files[0]);
    const lib = await getPdfJs();
    const doc = await lib.getDocument({ data: new Uint8Array(ab) }).promise;
    
    let content = "";
    for (let i = 1; i <= doc.numPages; i++) {
      prog(20 + Math.round((i / doc.numPages) * 60), `Reading page frames ${i}/${doc.numPages}…`);
      const pg = await doc.getPage(i);
      const tc = await pg.getTextContent();
      let py: number | null = null;
      for (const item of tc.items) {
        if (!item || !('str' in item)) continue;
        const textItem = item as any;
        if (textItem.transform) {
          const yCoord = textItem.transform[5];
          if (py !== null && Math.abs(yCoord - py) > 5) content += "\n";
          py = yCoord;
        }
        content += textItem.str || "";
      }
      content += `\n\n--- Page ${i} ---\n\n`;
    }

    prog(85, "Serializing Word-compatible RTF streams…");
    const rtfEsc = (s: string) => s.replace(/[\\{}]/g, "\\$&").replace(/\n/g, "\\par\n");
    const rtf = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Times New Roman;}}{\\colortbl;\\red0\\green0\\blue0;}\\f0\\fs24 ${rtfEsc(content)} }`;
    return {
      blob: new Blob([rtf], { type: "application/rtf" }),
      name: `foldpdf-word-${Date.now()}.rtf`,
      info: `Exported ${doc.numPages} pages as Word RTF layer`
    };
  }, []);

  return <Proc id="pdf-to-word" label="Convert to RTF / Word" accept=".pdf" run={run} onSuccess={onSuccess} toolName={toolName} />;
};

/* WORD→PDF */
export const WordToPdfTool = ({ onSuccess, toolName }: ToolProps) => {
  const run = useCallback(async (files: File[], prog: (p: number, m?: string) => void) => {
    prog(10, "Fetching Mammoth DOCX compiler…");
    const m = await getMammoth();
    const ab = await readAB(files[0]);
    
    prog(35, "Decompressing DOCX package XMLs…");
    let html = "";
    try {
      const r = await m.convertToHtml({ arrayBuffer: ab });
      html = r.value;
    } catch {
      throw new Error("Could not parse DOCX package. File may have unsupported macros.");
    }

    prog(55, "Generating PDF layout layers…");
    const { PDFDocument, rgb } = await getPdfLib();
    const doc = await PDFDocument.create();

    const div = document.createElement("div");
    div.innerHTML = html;
    const txt = div.innerText || div.textContent || "";
    const lines = txt.split("\n").filter((l) => l.trim());

    const fs = 12;
    const lh = 18;
    const mg = 50;
    const pW = 595;
    const pH = 842;
    const mc = Math.floor((pW - mg * 2) / (fs * 0.5));

    let pg = doc.addPage([pW, pH]);
    let y = pH - mg;
    for (const ln of lines) {
      for (let i = 0; i < ln.length || i === 0; i += mc) {
        const chunky = ln.slice(i, i + mc) || " ";
        if (y < mg + lh) {
          pg = doc.addPage([pW, pH]);
          y = pH - mg;
        }
        pg.drawText(chunky, {
          x: mg,
          y,
          size: fs,
          color: rgb(0.08, 0.08, 0.08)
        });
        y -= lh;
      }
    }

    prog(90, "Normalizing offset vectors…");
    const bytes = await doc.save();
    return {
      blob: new Blob([bytes], { type: "application/pdf" }),
      name: `foldpdf-docx-to-pdf-${Date.now()}.pdf`
    };
  }, []);

  return <Proc id="word-to-pdf" label="Compile Word to PDF" accept=".docx" run={run} onSuccess={onSuccess} toolName={toolName} />;
};

/* PDF→EXCEL */
export const PdfToExcelTool = ({ onSuccess, toolName }: ToolProps) => {
  const run = useCallback(async (files: File[], prog: (p: number, m?: string) => void) => {
    prog(15, "Opening PDF grid matrix…");
    const ab = await readAB(files[0]);
    prog(40, "Scanning table segments…");
    const { text } = await extractText(ab);
    
    prog(65, "Spawning SheetJS Excel cells…");
    const X = await getXLSX();
    const rows = text.split("\n").map((l) => l.split(/\s{2,}|\t/).map((c) => c.trim()).filter(Boolean));
    const ws = X.utils.aoa_to_sheet(rows);
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws, "PDF Text Blocks");

    prog(90, "Writing spreadsheet bytes…");
    const buf = X.write(wb, { bookType: "xlsx", type: "array" });
    return {
      blob: new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      name: `foldpdf-dataset-${Date.now()}.xlsx`
    };
  }, []);

  return <Proc id="pdf-to-excel" label="Convert PDF to Spreadsheet" accept=".pdf" run={run} onSuccess={onSuccess} toolName={toolName} />;
};

/* EXCEL→PDF */
export const ExcelToPdfTool = ({ onSuccess, toolName }: ToolProps) => {
  const run = useCallback(async (files: File[], prog: (p: number, m?: string) => void) => {
    prog(10, "Loading SheetJS book reader…");
    const X = await getXLSX();
    const ab = await readAB(files[0]);
    const wb = X.read(ab, { type: "array" });
    
    prog(40, "Sizing landscape grid catalog…");
    const { PDFDocument, rgb } = await getPdfLib();
    const doc = await PDFDocument.create();

    for (const sn of wb.SheetNames) {
      const ws = wb.Sheets[sn];
      const data: any[][] = X.utils.sheet_to_json(ws, { header: 1, defval: "" });
      
      const cW = 85;
      const rH = 18;
      const mg = 30;
      const pW = 840; // Landscape bounds
      const pH = 595;
      
      let pg = doc.addPage([pW, pH]);
      let y = pH - mg;
      
      pg.drawText(`Sheet Grid Layer: ${sn}`, {
        x: mg,
        y,
        size: 13,
        color: rgb(0.2, 0.2, 0.6)
      });
      y -= 25;

      for (const row of data) {
        if (y < mg + rH) {
          pg = doc.addPage([pW, pH]);
          y = pH - mg;
        }
        row.slice(0, 9).forEach((c, idx) => {
          pg.drawText(String(c || "").slice(0, 15), {
            x: mg + idx * cW,
            y,
            size: 9,
            color: rgb(0.12, 0.12, 0.12)
          });
        });
        y -= rH;
      }
    }

    prog(90, "Assembling PDF document layers…");
    const bytes = await doc.save();
    return {
      blob: new Blob([bytes], { type: "application/pdf" }),
      name: `foldpdf-spreadsheet-${Date.now()}.pdf`
    };
  }, []);

  return <Proc id="excel-to-pdf" label="Convert Spreadsheet to PDF" accept=".xlsx,.xls,.csv" run={run} onSuccess={onSuccess} toolName={toolName} />;
};

/* PDF→PPT */
export const PdfToPptTool = ({ onSuccess, toolName }: ToolProps) => {
  const run = useCallback(async (files: File[], prog: (p: number, m?: string) => void) => {
    prog(15, "Opening PDF content…");
    const ab = await readAB(files[0]);
    const { text, numPages } = await extractText(ab);
    
    prog(45, "Loading PowerPoint compiler…");
    const P = await getPptxGen();
    const pptx = new P();

    const sents = text.split(/[.!?\n]+/).map((s) => s.trim()).filter((s) => s.length > 10);
    const ppSlide = Math.max(1, Math.ceil(sents.length / (numPages || 1)));

    prog(70, "Framing presentation slides layout…");
    for (let i = 0; i < numPages; i++) {
      const slide = pptx.addSlide();
      slide.addText(`Slide Section ${i + 1}`, { x: 0.5, y: 0.4, w: 9, h: 0.8, fontSize: 24, bold: true, color: "4F46E5" });
      const snippet = sents.slice(i * ppSlide, (i + 1) * ppSlide).join(". ").slice(0, 480) || "No extract text content found.";
      slide.addText(snippet, { x: 0.5, y: 1.5, w: 9, h: 4, fontSize: 13, color: "333333" });
    }

    prog(90, "Writing ZIP payload…");
    const buf = await pptx.write({ outputType: "arraybuffer" });
    return {
      blob: new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }),
      name: `foldpdf-slides-${Date.now()}.pptx`
    };
  }, []);

  return <Proc id="pdf-to-ppt" label="Convert PDF to slides (PPTX)" accept=".pdf" run={run} onSuccess={onSuccess} toolName={toolName} />;
};
