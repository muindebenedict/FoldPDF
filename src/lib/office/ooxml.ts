// Small helpers for reading Office Open XML packages (.docx/.pptx/.xlsx):
// a zip-backed part reader with relationship lookup, and namespace-agnostic
// element access by local name.

export type El = Element;

export const kids = (el: El | null | undefined, name: string): El[] =>
  el ? Array.from(el.children).filter((c) => c.localName === name) : [];

export const kid = (el: El | null | undefined, name: string): El | null =>
  el ? Array.from(el.children).find((c) => c.localName === name) || null : null;

export const path = (el: El | null | undefined, ...names: string[]): El | null => {
  let cur: El | null = el || null;
  for (const n of names) cur = kid(cur, n);
  return cur;
};

// Attribute by local name, so "w:val" and "val" both match.
export const attr = (el: El | null | undefined, name: string): string | null => {
  if (!el) return null;
  const direct = el.getAttribute(name);
  if (direct != null) return direct;
  const local = name.includes(":") ? name.split(":")[1] : name;
  for (const a of Array.from(el.attributes)) if (a.localName === local) return a.value;
  return null;
};

export const num = (el: El | null | undefined, name: string, dflt: number): number => {
  const v = attr(el, name);
  if (v == null || v === "") return dflt;
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
};

// All descendants with a given local name.
export const descendants = (el: El | null | undefined, name: string): El[] =>
  el ? Array.from(el.getElementsByTagName("*")).filter((e) => e.localName === name) : [];

export function resolvePath(dir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = dir.split("/").filter(Boolean);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

export interface Rel {
  target: string;
  type: string;
  external: boolean;
}

export class Package {
  private cache = new Map<string, Promise<Document | null>>();
  constructor(public zip: any) {}

  async xml(p: string): Promise<Document | null> {
    if (!this.cache.has(p)) {
      this.cache.set(
        p,
        (async () => {
          const f = this.zip.file(p);
          if (!f) return null;
          return new DOMParser().parseFromString(await f.async("string"), "application/xml");
        })()
      );
    }
    return this.cache.get(p)!;
  }

  async rels(p: string): Promise<Map<string, Rel>> {
    const dir = p.substring(0, p.lastIndexOf("/"));
    const file = p.substring(p.lastIndexOf("/") + 1);
    const doc = await this.xml(`${dir}/_rels/${file}.rels`);
    const map = new Map<string, Rel>();
    if (!doc) return map;
    for (const r of Array.from(doc.getElementsByTagName("Relationship"))) {
      const target = r.getAttribute("Target") || "";
      const external = r.getAttribute("TargetMode") === "External";
      map.set(r.getAttribute("Id") || "", {
        target: external ? target : resolvePath(dir, target),
        type: (r.getAttribute("Type") || "").split("/").pop() || "",
        external,
      });
    }
    return map;
  }

  async bytes(p: string): Promise<Uint8Array | null> {
    const f = this.zip.file(p);
    return f ? f.async("uint8array") : null;
  }
}

// Bullets set in symbol fonts use ordinary letters that the font draws as
// shapes (Wingdings "l" is a filled circle). Maps the common ones to Unicode.
const WINGDINGS: Record<string, string> = {
  l: "●", n: "■", q: "❑", u: "◆", v: "❖", w: "⬥", o: "□", p: "◻", "§": "▪", "¨": "□", "Ø": "➢", "ü": "✓", "ð": "➔", "à": "➔", "Ÿ": "•",
  "": "●", "": "■", "": "▪", "": "➢", "": "✓", "": "❖", "": "❑", "": "•",
};
const SYMBOL: Record<string, string> = { "·": "•", "": "•", "Ø": "➢", o: "○", "§": "■", "": "▪" };

export function symbolChar(ch: string, font?: string | null): string {
  const f = (font || "").toLowerCase();
  if (f.startsWith("wingdings")) return WINGDINGS[ch] || "•";
  if (f === "symbol") return SYMBOL[ch] || (ch.charCodeAt(0) >= 0xf000 ? "•" : ch);
  // Private-use characters are symbol-font codes even without a font name.
  if (ch.length === 1 && ch.charCodeAt(0) >= 0xf000 && ch.charCodeAt(0) <= 0xf0ff) return WINGDINGS[ch] || SYMBOL[ch] || "•";
  return ch;
}
