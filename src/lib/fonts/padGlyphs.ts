// Pads every glyph of a TrueType font to a 4-byte boundary.
//
// pdf-lib's font subsetter (fontkit) copies glyphs as they are and switches
// the subset to 2-byte glyph offsets when it is small, which silently drops
// a byte from every odd-length glyph. Carlito has many: viewers then draw
// letters wrongly or not at all. With padded glyphs every offset is even.
// The outlines are not changed.

export function padGlyphs(buf: ArrayBuffer): ArrayBuffer {
  try {
    return pad(buf);
  } catch {
    return buf;
  }
}

interface Table {
  tag: string;
  data: Uint8Array;
}

function pad(buf: ArrayBuffer): ArrayBuffer {
  const src = new Uint8Array(buf);
  const view = new DataView(buf);
  const sfnt = view.getUint32(0);
  if (sfnt !== 0x00010000 && sfnt !== 0x74727565) return buf; // TrueType outlines only
  const numTables = view.getUint16(4);
  const tables: Table[] = [];
  for (let i = 0; i < numTables; i++) {
    const r = 12 + i * 16;
    const tag = String.fromCharCode(src[r], src[r + 1], src[r + 2], src[r + 3]);
    const offset = view.getUint32(r + 8);
    const length = view.getUint32(r + 12);
    tables.push({ tag, data: src.subarray(offset, offset + length) });
  }
  const get = (tag: string) => tables.find((t) => t.tag === tag);
  const head = get("head");
  const maxp = get("maxp");
  const loca = get("loca");
  const glyf = get("glyf");
  if (!head || !maxp || !loca || !glyf) return buf;

  const hv = new DataView(head.data.buffer, head.data.byteOffset, head.data.byteLength);
  const longLoca = hv.getInt16(50) === 1;
  const numGlyphs = new DataView(maxp.data.buffer, maxp.data.byteOffset).getUint16(4);
  const lv = new DataView(loca.data.buffer, loca.data.byteOffset, loca.data.byteLength);
  const offsets: number[] = [];
  for (let g = 0; g <= numGlyphs; g++) offsets.push(longLoca ? lv.getUint32(g * 4) : lv.getUint16(g * 2) * 2);
  let odd = false;
  for (let g = 0; g < numGlyphs && !odd; g++) odd = (offsets[g + 1] - offsets[g]) % 2 === 1;
  if (!odd) return buf;

  // New glyph data with each glyph padded, and long offsets to it.
  const sizes: number[] = [];
  let total = 0;
  for (let g = 0; g < numGlyphs; g++) {
    const len = Math.max(0, offsets[g + 1] - offsets[g]);
    const padded = (len + 3) & ~3;
    sizes.push(padded);
    total += padded;
  }
  const newGlyf = new Uint8Array(total);
  const newLoca = new Uint8Array((numGlyphs + 1) * 4);
  const nl = new DataView(newLoca.buffer);
  let at = 0;
  for (let g = 0; g < numGlyphs; g++) {
    nl.setUint32(g * 4, at);
    const len = Math.max(0, offsets[g + 1] - offsets[g]);
    newGlyf.set(glyf.data.subarray(offsets[g], offsets[g] + len), at);
    at += sizes[g];
  }
  nl.setUint32(numGlyphs * 4, at);
  const newHead = head.data.slice();
  const nh = new DataView(newHead.buffer);
  nh.setInt16(50, 1); // long offsets
  nh.setUint32(8, 0); // checkSumAdjustment, set below
  glyf.data = newGlyf;
  loca.data = newLoca;
  head.data = newHead;

  // Reassemble, tables in tag order and 4-byte aligned.
  tables.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  const dirSize = 12 + tables.length * 16;
  let size = dirSize;
  for (const t of tables) size += (t.data.length + 3) & ~3;
  const out = new Uint8Array(size);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, sfnt);
  ov.setUint16(4, tables.length);
  let pow = 1;
  let log = 0;
  while (pow * 2 <= tables.length) {
    pow *= 2;
    log++;
  }
  ov.setUint16(6, pow * 16);
  ov.setUint16(8, log);
  ov.setUint16(10, tables.length * 16 - pow * 16);
  let offset = dirSize;
  let headOffset = 0;
  tables.forEach((t, i) => {
    const r = 12 + i * 16;
    for (let k = 0; k < 4; k++) out[r + k] = t.tag.charCodeAt(k);
    ov.setUint32(r + 4, checksum(t.data));
    ov.setUint32(r + 8, offset);
    ov.setUint32(r + 12, t.data.length);
    out.set(t.data, offset);
    if (t.tag === "head") headOffset = offset;
    offset += (t.data.length + 3) & ~3;
  });
  ov.setUint32(headOffset + 8, (0xb1b0afba - checksum(out)) >>> 0);
  return out.buffer;
}

function checksum(data: Uint8Array): number {
  let sum = 0;
  const n = data.length;
  for (let i = 0; i < n; i += 4) {
    const v = ((data[i] << 24) | ((data[i + 1] ?? 0) << 16) | ((data[i + 2] ?? 0) << 8) | (data[i + 3] ?? 0)) >>> 0;
    sum = (sum + v) >>> 0;
  }
  return sum;
}
