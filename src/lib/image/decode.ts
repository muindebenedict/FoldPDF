// Turns any supported photo into bytes pdf-lib can embed, without losing
// quality where it can be avoided:
// - JPEG and PNG are embedded as they are (no re-encoding).
// - HEIC/HEIF (iPhone photos), which browsers other than Safari can't decode,
//   goes through heic2any (libheif compiled to WebAssembly).
// - WebP, GIF, BMP and the rest are decoded by the browser, then stored as PNG
//   when they have transparency (so it isn't turned black) or JPEG otherwise.
// JPEG EXIF orientation is reported so the caller can rotate the page instead
// of showing phone photos sideways.

export interface EmbeddableImage {
  kind: "jpg" | "png";
  bytes: ArrayBuffer;
  // EXIF orientation 1-8 for JPEGs; 1 means upright.
  orientation: number;
}

const isHeic = (f: File) => /image\/hei[cf]/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);
const isJpeg = (f: File) => /image\/jpe?g/i.test(f.type) || /\.(jpe?g|jfif)$/i.test(f.name);
const isPng = (f: File) => f.type === "image/png" || /\.png$/i.test(f.name);

// Reads the EXIF Orientation tag (0x0112) from a JPEG's APP1 segment.
export function jpegOrientation(buf: ArrayBuffer): number {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return 1;
  let off = 2;
  while (off + 4 < v.byteLength) {
    const marker = v.getUint16(off);
    const len = v.getUint16(off + 2);
    if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) {
      const tiff = off + 10;
      const little = v.getUint16(tiff) === 0x4949;
      const ifd = tiff + v.getUint32(tiff + 4, little);
      const n = v.getUint16(ifd, little);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (e + 10 > v.byteLength) break;
        if (v.getUint16(e, little) === 0x0112) {
          const o = v.getUint16(e + 8, little);
          return o >= 1 && o <= 8 ? o : 1;
        }
      }
      return 1;
    }
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
    off += 2 + len;
  }
  return 1;
}

async function rasterToEmbeddable(blob: Blob): Promise<EmbeddableImage> {
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();

  // Keep transparency when the image actually uses it.
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let hasAlpha = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) {
      hasAlpha = true;
      break;
    }
  }
  const type = hasAlpha ? "image/png" : "image/jpeg";
  const out = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image"))), type, 0.92)
  );
  return { kind: hasAlpha ? "png" : "jpg", bytes: await out.arrayBuffer(), orientation: 1 };
}

export async function toEmbeddable(file: File): Promise<EmbeddableImage[]> {
  if (isHeic(file)) {
    const { default: heic2any } = await import("heic2any");
    // A HEIC can hold several images (bursts, live photos); keep them all.
    const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92, multiple: true });
    const blobs = Array.isArray(result) ? result : [result];
    // heic2any already applies the HEIC rotation, so these are upright.
    return Promise.all(blobs.map(async (b) => ({ kind: "jpg" as const, bytes: await b.arrayBuffer(), orientation: 1 })));
  }
  const bytes = await file.arrayBuffer();
  if (isJpeg(file)) return [{ kind: "jpg", bytes, orientation: jpegOrientation(bytes) }];
  if (isPng(file)) return [{ kind: "png", bytes, orientation: 1 }];
  return [await rasterToEmbeddable(file)];
}
