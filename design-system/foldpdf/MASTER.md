# FoldPDF design system (master)

The source of truth for how FoldPDF looks and moves. Page-specific rules go in `pages/<page>.md` and override this file.

Direction chosen with the ui-ux-pro-max skill for a "file converter / document manager" product: **flat, minimal Swiss style with file-type colour coding** (the convention users know from iLovePDF and Smallpdf).

## Style

- Flat surfaces, generous white space, clear type hierarchy.
- Soft shadows only (`shadow-premium-*`); no 3D, no neon, no heavy gradients.
- Dark mode is the default for first-time visitors; light mode must look equally finished.
- No emoji as icons. Use SVG icons: Tabler for tool and file icons, Lucide elsewhere.

## Colour

- **Brand / primary actions:** indigo (`indigo-600`, `dark:indigo-500`). One primary button per view.
- **Neutrals:** the slate scale defined in `src/index.css`.
- **Tool colours** (tokens in `src/index.css`, used as `bg-tool-*`):

| Token | Hex | Used for |
|---|---|---|
| `tool-pdf` | #dc2626 | PDF, and organise tools (merge, split, rotate, remove) |
| `tool-word` | #2563eb | Word |
| `tool-powerpoint` / `-strong` | #ea580c / #c2410c | PowerPoint (strong = badge text background) |
| `tool-excel` | #15803d | Excel |
| `tool-image` / `-strong` | #d97706 / #b45309 | JPG, PNG, WebP, HEIC |
| `tool-text` | #475569 | TXT |
| `tool-optimize` | #0d9488 | Compress, repair, OCR |
| `tool-edit` | #7c3aed | Watermark, page numbers, sign |
| `tool-security` | #334155 | Protect, unlock |

White glyphs on these tiles keep at least 3:1 contrast; badge text uses the `-strong` shade where needed to reach 4.5:1.

## Typography

- Headings: **Outfit Variable**; body: **Inter Variable**. Both self-hosted (`@fontsource-variable/*`), never loaded from Google.
- Body text at least 14px in UI, 16px for reading content; labels and chips at least 11px.

## Tool icons

`src/components/ToolIcon.tsx` is the only way to show a tool's icon (`size="sm" | "md" | "lg"`).

- The tile colour is the format the tool starts from; tools that act on a PDF use their family colour.
- Converters add a badge naming the other format (for example a blue DOC tile with a red PDF badge for Word to PDF).
- Icons are decorative (`aria-hidden`); the tool name is always shown next to them.

## Upload and results

`src/components/tools/SharedComponents.tsx`:

- `DropZone`: the only upload area. It is keyboard accessible (Enter or Space opens the picker), highlights and lifts its icon while a file is dragged over it, and shows the accepted formats, the 50 MB limit and a privacy note ("Deleted right after processing" for the five server tools, "Stays on your device" for the rest).
- `FileList` and `FileTypeTile`: chosen files slide in one after another with a colour-coded file tile, their size, a ready tick and a remove button.
- `Bar`: progress with a spinner, percentage and a soft sheen.
- `Done`: a tick that pops in and draws itself, a single primary "Download file" button and a secondary "Process another file".
- `Err`: an alert with an icon and a labelled dismiss button.

## Motion

- Entrance animations come from `tw-animate-css` (`animate-in fade-in slide-in-from-* zoom-in-*`).
- Custom motion tokens in `src/index.css`: `animate-float-up`, `animate-soft-ping`, `animate-shimmer`, `animate-pop-in`, `animate-draw-check`.
- 150–300 ms for hover and state changes; nothing loops while idle (loops run only while dragging or processing).
- `prefers-reduced-motion: reduce` turns all animation and transitions off (global rule at the end of `src/index.css`).

## Interaction and accessibility

- Every clickable card is a real `<a href>` (a stretched link), so it works from the keyboard and search engines can follow it.
- Visible focus rings (`focus-visible:ring-2 ring-indigo-500`) on every interactive element.
- Icon-only buttons have an `aria-label`.
- Text contrast at least 4.5:1 in both themes.

## Avoid

- Emoji used as icons, and `animate-bounce` on idle elements.
- New hard-coded colours for tools; add a token instead.
- A second upload component; extend `DropZone`.
