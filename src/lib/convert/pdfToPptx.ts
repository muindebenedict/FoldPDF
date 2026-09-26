// PDF → PowerPoint (.pptx), entirely in the browser.
//
// Each page becomes a slide that looks the same: the text-free render of the
// page sits behind editable text boxes placed at the PDF's exact positions,
// in the same font, size and colour.
//
// Placement follows two measured PowerPoint rules (PowerPoint 16, fonts
// Calibri/Arial/Times New Roman/Cambria/Segoe UI/Verdana, 9–24 pt):
//   - exact line spacing is rounded to whole points;
//   - in a top-anchored box with no insets, the first baseline sits about
//     0.75 × that spacing below the box's top.
// Because of the rounding, lines whose spacing isn't a whole number of points
// are split into shorter boxes so the error can't add up down the page.

import { extractPageModels, type Block, type Line, type PageModel, type TextRun } from "../pdf/pageModel";
import { measureText } from "../fonts/metricFonts";
import { getJSZip, getPptxGen } from "../../components/tools/PdfScriptLoader";

type Progress = (pct: number, msg: string) => void;

const PPT_BASELINE_RATIO = 0.75;
const inch = (pt: number) => pt / 72;

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// PowerPoint font sizes are in hundredths of a point; keep two decimals.
const pptSize = (size: number) => Math.round(size * 100) / 100;

async function runObjects(run: TextRun, isLastInLine: boolean, scale: number, breakAfter: boolean) {
  let text = run.text;
  if (isLastInLine) text = text.replace(/\s+$/, "");
  const size = pptSize(run.size * scale);
  const base = {
    fontFace: run.family,
    fontSize: size,
    bold: run.bold,
    italic: run.italic,
    color: run.color,
  };
  const out: { text: string; options: Record<string, any> }[] = [];
  if (!text) {
    if (breakAfter) out.push({ text: "", options: { ...base, breakLine: true } });
    return out;
  }
  const natural = await measureText(run.text, run.family, size, run.bold, run.italic);
  const delta = natural === null ? 0 : run.width * scale - natural;
  const spaces = (text.match(/ /g) || []).length;
  if (Math.abs(delta) >= 0.3 && !run.substituted && spaces > 0 && delta > 0.5 && delta / spaces > 0.3) {
    const perSpace = Math.min(40, delta / spaces);
    const parts = text.split(/( )/).filter(Boolean);
    parts.forEach((part, i) =>
      out.push({ text: part, options: { ...base, charSpacing: part === " " ? perSpace : undefined } })
    );
  } else {
    const perChar = Math.abs(delta) >= 0.3 ? Math.max(-2, Math.min(4, delta / Math.max(1, text.length))) : 0;
    out.push({ text, options: { ...base, charSpacing: perChar || undefined } });
  }
  if (breakAfter) out[out.length - 1].options.breakLine = true;
  return out;
}

// Splits a block into pieces short enough that rounding the line spacing to
// whole points drifts by less than a point.
function chunks(block: Block): Line[][] {
  if (block.lines.length === 1) return [block.lines];
  const err = Math.abs(block.leading - Math.round(block.leading));
  const max = err < 0.01 ? block.lines.length : Math.max(1, Math.floor(1 / err));
  const out: Line[][] = [];
  for (let i = 0; i < block.lines.length; i += max) out.push(block.lines.slice(i, i + max));
  return out;
}

async function addPage(pptx: any, model: PageModel, slideW: number, slideH: number) {
  const slide = pptx.addSlide();
  // Pages of a different size than the deck are scaled to fit and centred.
  const scale = Math.min(slideW / model.width, slideH / model.height);
  const ox = (slideW - model.width * scale) / 2;
  const oy = (slideH - model.height * scale) / 2;

  for (const piece of model.background) {
    slide.addImage({
      data: `data:image/${piece.type === "jpg" ? "jpeg" : "png"};base64,${toBase64(piece.data)}`,
      x: inch(ox + piece.x * scale),
      y: inch(oy + piece.y * scale),
      w: inch(piece.width * scale),
      h: inch(piece.height * scale),
    });
  }

  for (const block of model.blocks) {
    for (const lines of chunks(block)) {
      const first = lines[0];
      const L = lines.length > 1 ? Math.round(block.leading * scale) : Math.round(first.size * scale * 1.2);
      const width = Math.min(slideW - (ox + block.x * scale), block.width * scale * 1.15 + 12);
      let top = oy + first.baseline * scale - PPT_BASELINE_RATIO * L;
      top = Math.max(0, Math.min(top, slideH - L * lines.length));
      const runs: any[] = [];
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        for (let ri = 0; ri < line.runs.length; ri++) {
          const last = ri === line.runs.length - 1;
          runs.push(...(await runObjects(line.runs[ri], last, scale, last && li < lines.length - 1)));
        }
      }
      if (!runs.length) continue;
      slide.addText(runs, {
        x: inch(ox + block.x * scale),
        y: inch(top),
        w: inch(Math.max(width, 6)),
        h: inch(L * lines.length),
        margin: 0,
        valign: "top",
        align: "left",
        lineSpacing: L,
        paraSpaceBefore: 0,
        paraSpaceAfter: 0,
        fit: "none",
        wrap: false,
      });
    }
  }
}

export async function pdfToPptx(bytes: ArrayBuffer, title: string, onProgress: Progress): Promise<{ blob: Blob; slides: number }> {
  const models = await extractPageModels(bytes, onProgress);
  if (!models.length) throw new Error("This PDF has no pages.");
  onProgress(88, "Building your slides...");
  const PptxGenJS = await getPptxGen();
  const pptx = new PptxGenJS();
  // PowerPoint allows slides between 1 and 56 inches on each side.
  const clamp = (pt: number) => Math.min(56 * 72, Math.max(72, pt));
  const slideW = clamp(models[0].width);
  const slideH = clamp(models[0].height);
  pptx.defineLayout({ name: "FOLDPDF", width: inch(slideW), height: inch(slideH) });
  pptx.layout = "FOLDPDF";
  pptx.title = title;
  pptx.author = "FoldPDF";
  for (let i = 0; i < models.length; i++) {
    onProgress(88 + Math.round((i / models.length) * 8), `Building slide ${i + 1} of ${models.length}...`);
    await addPage(pptx, models[i], slideW, slideH);
  }
  onProgress(97, "Saving your presentation...");
  const stored: Blob = await pptx.write({ outputType: "blob" });
  // pptxgenjs 3.12 writes every part uncompressed; re-zip it (about 4x smaller).
  const JSZip = await getJSZip();
  const zip = await JSZip.loadAsync(stored);
  const blob: Blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
  return { blob, slides: models.length };
}
