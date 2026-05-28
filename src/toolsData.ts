import { ToolDefinition, BlogPost } from './types';

export const TOOLS_DATA: ToolDefinition[] = [
  // ========================
  // IMAGE CONVERSIONS
  // ========================
  {
    id: 'jpg-to-pdf',
    urlPath: 'jpg-to-pdf',
    name: 'JPG to PDF',
    category: 'image-conversions',
    shortDesc: 'Convert and merge JPEG photos into a single, clean PDF document layout.',
    longDesc: 'The simplest way to compile scanned receipts or photo records. Pack individual JPG files neatly onto unified page sizes (A4, Letter) with optional spacing margins.',
    iconName: 'Image',
    isPopular: true,
    stepInstructions: [
      'Upload JPEG or JPG images.',
      'Arrange the photo sequencing visually inside your layout board.',
      'Adjust margins, sizing orientation, and page size presets.',
      'Merge and download your compiled PDF.'
    ],
    faqs: [
      { question: 'Will my image quality drop?', answer: 'Our converter keeps the pristine quality of your original JPG pixels while bundling them safely into pages.' }
    ],
    benefits: ['Compresses photo sizes inside the target PDF', 'Supports drag-and-drop order sorting', 'Perfect for compiling receipts and scanned bills']
  },
  {
    id: 'pdf-to-jpg',
    urlPath: 'pdf-to-jpg',
    name: 'PDF to JPG',
    category: 'image-conversions',
    shortDesc: 'Extract individual pages of your PDF document as high-resolution JPEG files.',
    longDesc: 'Turn text pages into clean marketing graphics. Extract every page of your PDF into separate high-quality JPG images, or crop specific graphics out of text packages.',
    iconName: 'ImagePlay',
    isPopular: true,
    stepInstructions: [
      'Upload the target PDF.',
      'Select "Convert Entire Page" or "Extract Images Only".',
      'Generate image slices.',
      'Download a tidy ZIP package of JPG graphics.'
    ],
    faqs: [
      { question: 'What is the DPI of the output images?', answer: 'Our generator renders high-definition JPG slices at 300 DPI for ultra-crisp output.' }
    ],
    benefits: ['Crisp 300 DPI crop rendering', 'Option to isolate embedded illustrations', 'Superb for high-resolution graphics']
  },
  {
    id: 'png-to-pdf',
    urlPath: 'png-to-pdf',
    name: 'PNG to PDF',
    category: 'image-conversions',
    shortDesc: 'Save transparent PNG snapshots and graphics as a high-fidelity vector PDF format.',
    longDesc: 'Keep your asset quality intact. Turn PNG screenshot files and raw graphics into accessible PDFs while maintaining transparent segments and clean layout structures.',
    iconName: 'FileImage',
    stepInstructions: [
      'Load your transparent PNG graphics files.',
      'Choose screen orientation (Auto, Portrait, or Landscape) and margins.',
      'Click "Render PDF Options".',
      'Download your vector rendering.'
    ],
    faqs: [
      { question: 'Is transparency supported?', answer: 'Yes, PNG transparent alpha channels are fully handled and rendered relative to the PDF grid page background.' }
    ],
    benefits: ['Keeps visual edge-crispness intact', 'Option to scale to standard physical pages', 'High graphic output']
  },
  {
    id: 'pdf-to-png',
    urlPath: 'pdf-to-png',
    name: 'PDF to PNG',
    category: 'image-conversions',
    shortDesc: 'Generate transparent, high-quality PNG screenshots out of PDF slides or layout sheets.',
    longDesc: 'Perfect for layouts and digital design. Convert pages into portable network graphics (PNG) files with premium pixel density and support for transparent layouts.',
    iconName: 'FileImage',
    stepInstructions: [
      'Provide your PDF document.',
      'Adjust PNG scaling levels.',
      'Render pages to canvas elements.',
      'Download processed PNG layouts.'
    ],
    faqs: [
      { question: 'Does it support transparent backgrounds?', answer: 'Yes! It exports pages with lossless transparent backing option perfect for digital overlay graphics.' }
    ],
    benefits: ['Lossless pixel rendering configurations', 'Extracts standalone objects', 'Perfect Web transparency support']
  },
  {
    id: 'jpeg-to-png',
    urlPath: 'jpeg-to-png',
    name: 'JPEG to PNG',
    category: 'image-conversions',
    shortDesc: 'Convert JPEG/JPG images to lossless PNG images with high pixel fidelity.',
    longDesc: 'Easily change compressed JPEG photos into high quality PNG graphics. Safe, extremely fast secure translation directly inside your browser container.',
    iconName: 'FileImage',
    stepInstructions: [
      'Select or drag and drop JPEG/JPG pictures.',
      'Set any transparency keying, if required.',
      'Click "Convert Image".',
      'Download your lossless PNG files.'
    ],
    faqs: [
      { question: 'Why convert JPG to PNG?', answer: 'PNG utilizes lossless compression which prevents any subsequent generation loss if you plan on editing the design later.' }
    ],
    benefits: ['100% secure in-memory conversion stability', 'Preserves original color gamuts', 'Batch convert multiple files seamlessly']
  },
  {
    id: 'png-to-jpg',
    urlPath: 'png-to-jpg',
    name: 'PNG to JPG',
    category: 'image-conversions',
    shortDesc: 'Convert PNG images to highly compressed, lightweight JPG photo formats.',
    longDesc: 'Compress heavy PNG pictures down to standard web-friendly JPEGs. Choose your visual compression quality to shrink size for speedy uploads and email attachments.',
    iconName: 'Image',
    stepInstructions: [
      'Upload your PNG files.',
      'Choose your graphic compression ratio slider.',
      'Press "Parse images".',
      'Grab your optimized JPG file.'
    ],
    faqs: [
      { question: 'What happens to transparent regions?', answer: 'Our converter automatically fills transparent pixels with a clean solid white background for the JPEG output.' }
    ],
    benefits: ['Significantly shrinks photo storage footprint', 'Custom compression level adjustment', 'High speed browser processing']
  },
  {
    id: 'webp-to-pdf',
    urlPath: 'webp-to-pdf',
    name: 'WEBP to PDF',
    category: 'image-conversions',
    shortDesc: 'Convert modern lightweight web design screenshots (.webp) into standard PDF sheets.',
    longDesc: 'Ideal for web developers and UI designers. Export mockups and site capture cards straight into standard PDF packets to simplify reviews.',
    iconName: 'FileImage',
    stepInstructions: [
      'Select WEBP graphic assets from local storage.',
      'Set target layout sheet boundaries.',
      'Click translate to compile files.',
      'Download page output.'
    ],
    faqs: [],
    benefits: ['Fast web rendering translations', 'Streamlined design layout reviews', 'No compression losses']
  },
  {
    id: 'pdf-to-webp',
    urlPath: 'pdf-to-webp',
    name: 'PDF to WEBP',
    category: 'image-conversions',
    shortDesc: 'Export PDF slides directly into highly optimized WEBP formats for quick web browser loading.',
    longDesc: 'The modern web developer standard. Save pages into next-gen lightweight WEBP images to upload directly to site galleries and speed up loading speeds.',
    iconName: 'MonitorDot',
    stepInstructions: [
      'Input the target PDF portfolio document.',
      'Choose image density presets.',
      'Download optimized WEBP assets.'
    ],
    faqs: [],
    benefits: ['Extremely compact graphics sizes', 'Boosts Google PageSpeed indicators', 'No web conversion delays']
  },
  {
    id: 'heic-to-pdf',
    urlPath: 'heic-to-pdf',
    name: 'HEIC to PDF',
    category: 'image-conversions',
    shortDesc: 'Convert iPhone and iPad raw HEIC camera uploads directly into accessible PDFs.',
    longDesc: 'Ditch the formatting lock. Turn raw Apple HEIC photos and image packets into standard, cross-platform PDF files readable on any desktop pc.',
    iconName: 'Smartphone',
    stepInstructions: [
      'Upload iPhone camera HEIC files.',
      'Convert individual sheets or combine them as single sheets.',
      'Download converted files instantly.'
    ],
    faqs: [],
    benefits: ['Excellent formatting compatibility', 'Compresses Apple camera payload sizes', 'No cloud storage delays']
  },

  // ========================
  // DOCUMENT CONVERSIONS
  // ========================
  {
    id: 'pdf-to-word',
    urlPath: 'pdf-to-word',
    name: 'PDF to Word (DOCX)',
    category: 'document-conversions',
    shortDesc: 'Decompile secure PDF pages back into fully editable Microsoft Word (.docx) text records.',
    longDesc: 'Ditch the retyping chore. Our precise extraction algorithms identify paragraphs, formatting structures, nested tables, and styling options, returning fully editable DOCX document structures.',
    iconName: 'FileText',
    isPopular: true,
    stepInstructions: [
      'Select the PDF to decompile.',
      'Our analyzer maps text segments, flow elements, and grid sections.',
      'Generate word XML nodes.',
      'Download your executable DOCX word document.'
    ],
    faqs: [
      { question: 'Will the generated Word document look identical?', answer: 'Yes, we map font classifications and placement parameters closely to ensure formatting scales seamlessly back to office packages.' }
    ],
    benefits: ['Re-editable text paragraphs', 'Stretches tables to standard tables', 'Unlocks scanned tables cleanly']
  },
  {
    id: 'word-to-pdf',
    urlPath: 'word-to-pdf',
    name: 'Word to PDF',
    category: 'document-conversions',
    shortDesc: 'Transform Microsoft Word (.doc, .docx) templates into clean, standardized PDFs.',
    longDesc: 'Protect your text and layout positioning. Convert unstable Word files into standard PDFs to ensure fonts, photos, and margins look identical on every phone, tablet, or laptop screen.',
    iconName: 'FileText',
    isPopular: true,
    stepInstructions: [
      'Pick a .docx or .doc file to convert.',
      'Wait as FoldPDF compiles text hierarchies, elements, and styles.',
      'Preview the preview file structure.',
      'Download your pristine PDF report.'
    ],
    faqs: [],
    benefits: ['Locks original formatting and text styles', 'Supports complex nested layouts', 'Includes active hyperlink support']
  },
  {
    id: 'pdf-to-pptx',
    urlPath: 'pdf-to-pptx',
    name: 'PDF to PowerPoint (PPTX)',
    category: 'document-conversions',
    shortDesc: 'Restore read-only slides back into fully customizable and editable PowerPoint slides.',
    longDesc: 'Got an outdated presentation PDF? Convert vector blocks back into moveable PowerPoint text layouts and elements, allowing you to edit titles, colors and layout elements.',
    iconName: 'Presentation',
    stepInstructions: [
      'Add the legacy presentation PDF.',
      'Extract slide containers, images, and texts.',
      'Assemble editable PPTX presentations.',
      'Save the slideshow document.'
    ],
    faqs: [],
    benefits: ['Convert back to editable timeline text', 'Repurposes graphics and diagrams easily', 'Fits standard laptop aspect ratios']
  },
  {
    id: 'pptx-to-pdf',
    urlPath: 'pptx-to-pdf',
    name: 'PowerPoint to PDF',
    category: 'document-conversions',
    shortDesc: 'Stave off slide visual movements by exporting PPTX slides into standard PDF manuals.',
    longDesc: 'Submit your homework and pitch slides confidently. Lock PowerPoint presentations into standard PDFs to prevent format misalignment or fonts missing errors during presentations.',
    iconName: 'Presentation',
    stepInstructions: [
      'Load .pptx slideshow files.',
      'Let FoldPDF map vector layouts and slide nodes.',
      'Download standardized high-resolution PDF handouts.'
    ],
    faqs: [],
    benefits: ['Keeps precise slide dimensions intact', 'Excellent vector element rendering', 'Compact presentation files']
  },
  {
    id: 'pdf-to-xlsx',
    urlPath: 'pdf-to-xlsx',
    name: 'PDF to Excel (XLSX)',
    category: 'document-conversions',
    shortDesc: 'Scrape rows and data grids from business reports into neat, executable Microsoft Excel sheets.',
    longDesc: 'Eliminate manual financial copying. Move invoicing lists, tax files, and spreadsheet data columns safely out of PDF tables and directly into editable spreadsheet (.xlsx) columns.',
    iconName: 'FileSpreadsheet',
    stepInstructions: [
      'Select PDF invoicing or tabular worksheets.',
      'Our scraper maps cell fields, lines, and rows.',
      'Compile table matrices.',
      'Download your clean XLSX file.'
    ],
    faqs: [],
    benefits: ['Keeps tabular rows aligned perfectly', 'Converts currency values correctly', 'Aids rapid accounting workflows']
  },
  {
    id: 'xlsx-to-pdf',
    urlPath: 'xlsx-to-pdf',
    name: 'Excel to PDF',
    category: 'document-conversions',
    shortDesc: 'Format Excel tables, accounting ledger sheets, and cell grids neatly onto print-friendly PDF pages.',
    longDesc: 'No more truncated graphs or messy tables. Fit wide Excel tables (.xlsx, .xls) beautifully onto portrait or landscape pages with cells and grids aligned perfectly.',
    iconName: 'Calculator',
    stepInstructions: [
      'Provide your XLS/XLSX spreadsheets.',
      'Select layout scales (Fit all columns to 1 page, or keep original dimensions).',
      'Generate grid previews.',
      'Download your structured PDF financial report.'
    ],
    faqs: [],
    benefits: ['Prevents cell columns cutting off', 'Renders formulas and charts cleanly', 'Perfect for business accounting statements']
  },
  {
    id: 'pdf-to-txt',
    urlPath: 'pdf-to-txt',
    name: 'PDF to TXT',
    category: 'document-conversions',
    shortDesc: 'Scrape raw ASCII text cleanly from any PDF, stripping away heavy images and layouts.',
    longDesc: 'Great for clean text scraping, system logs, and code scripts. Extract text strings out of layout boundaries and save them as straightforward notepad TXT documents.',
    iconName: 'FileText',
    stepInstructions: [
      'Upload the text-rich PDF.',
      'Check "Ignore layout formatting headers".',
      'Extract text layers.',
      'Save clean text files.'
    ],
    faqs: [],
    benefits: ['Ultra-lightweight text extraction file sizes', 'Removes annoying alignment artifacts', 'Superb for pasting into local models']
  },
  {
    id: 'txt-to-pdf',
    urlPath: 'txt-to-pdf',
    name: 'TXT to PDF',
    category: 'document-conversions',
    shortDesc: 'Format plain, unformatted TEXT logs or code into elegant reader-ready PDF ebooks.',
    longDesc: 'Upgrade your plain reading blocks. Style boring notepad text files with beautiful typography, margins, and code block formatting inside standard PDF headers.',
    iconName: 'FileText',
    stepInstructions: [
      'Upload your plain text or logs .txt file.',
      'Customize typography (Sans, Serif, or Monospace) and margin size.',
      'Generate visual page sheets.',
      'Save the parsed ebook.'
    ],
    faqs: [],
    benefits: ['Adds elegant formatting layouts on raw text', 'Option to insert layout headings', 'Ideal for software dev text logs']
  },

  // ========================
  // PDF EDITING TOOLS
  // ========================
  {
    id: 'compress-pdf',
    urlPath: 'compress-pdf',
    name: 'Compress PDF',
    category: 'pdf-editing',
    shortDesc: 'Reduce file size without losing premium visual quality.',
    longDesc: 'Easily shrink larger PDFs down to web-friendly sizes. Our hybrid resizing algorithms compress internal high-res images, drop unused fonts, and deflate files so you get smaller attachments with pristine resolution.',
    iconName: 'FileDown',
    isPopular: true,
    stepInstructions: [
      'Select or drop your heavy PDF file onto the upload workspace.',
      'Choose your compression tier: Extreme, Recommended, or High Graphic Fidelity.',
      'Click "Compress PDF" and look at the real-time space saving counter.',
      'Download your brand new lightweight PDF file instantly!'
    ],
    faqs: [
      { question: 'Will my compressed images look pixelated?', answer: 'Our "Recommended" setting safely scales DPI and compresses JPG segments to maintain maximum crispness for human readers while deflating storage footprint.' }
    ],
    benefits: ['Drastically saves email storage space', 'Extremely quick processing speed', 'Maintains visual page clarity']
  },
  {
    id: 'merge-pdf',
    urlPath: 'merge-pdf',
    name: 'Merge PDF',
    category: 'pdf-editing',
    shortDesc: 'Combine multiple PDF documents, reports, and spreadsheets into one tidy structured file.',
    longDesc: 'The fastest online PDF combiner tool. Seamlessly stitch separate pages, presentation sheets, invoices, and scans together in any order you choose with our clear drag-and-drop workspace layout.',
    iconName: 'GitMerge',
    isPopular: true,
    stepInstructions: [
      'Select and upload two or more PDF files.',
      'Drag, drop, and rearrange the file thumbnails to correct your page order.',
      'Hit the "Merge Files" button.',
      'Grab your unified single PDF file with one press.'
    ],
    faqs: [
      { question: 'Is there a limit on how many PDFs I can combine?', answer: 'You can merge up to 50 PDF files simultaneously completely for free on FoldPDF.' }
    ],
    benefits: ['Tidy, interactive slide rearrangement view', 'Keeps original links intact', 'Fast 1-click execution']
  },
  {
    id: 'split-pdf',
    urlPath: 'split-pdf',
    name: 'Split PDF',
    category: 'pdf-editing',
    shortDesc: 'Extract individual pages or decompose a multi-page PDF document into several smaller files.',
    longDesc: 'Need only pages 4 through 9? Split any large textbook, contract, or form into precise page ranges, or isolate every single page into its own individual PDF document in one click.',
    iconName: 'Scissors',
    isPopular: true,
    stepInstructions: [
      'Upload your PDF file.',
      'Select your custom page ranges or choose "Extract All Pages".',
      'Press "Split PDF".',
      'Download your requested custom page segments.'
    ],
    faqs: [
      { question: 'Can I split password locked PDFs?', answer: 'Yes! Just provide your document passkey first, then proceed to extract pages.' }
    ],
    benefits: ['Zero-friction page range selection', 'Export to separate single-page files', 'Maintains internal fonts and styles'],
    metaTitle: 'Split PDF Free Online | FoldPDF',
    metaDesc: 'Extract individual pages or split multi-page PDFs in seconds.'
  },
  {
    id: 'add-watermark',
    urlPath: 'add-watermark',
    name: 'Add Watermark',
    category: 'pdf-editing',
    shortDesc: 'Embed customizable diagonal stamps and text overlays into your PDF pages.',
    longDesc: 'Stamp "CONFIDENTIAL" or custom text cleanly on your documents. Control color, font size, and opacities directly inside the browser sandbox.',
    iconName: 'PencilLine',
    stepInstructions: [
      'Choose your PDF document.',
      'Configure stamp label text, color, alignment and opacity.',
      'Click Inject Watermark.',
      'Download your customized stamped PDF.'
    ],
    benefits: ['Supports custom text styling', 'Adjust opacity to protect text clarity', 'Runs completely in-memory']
  },
  {
    id: 'add-page-numbers',
    urlPath: 'add-page-numbers',
    name: 'Add Page Numbers',
    category: 'pdf-editing',
    shortDesc: 'Enstamp custom sequential page numbering onto PDF layouts easily.',
    longDesc: 'Add "Page N of T" or customized indexes. Customize top/bottom corners, bypass cover slides, and style font indexes perfectly.',
    iconName: 'Hash',
    stepInstructions: [
      'Select your PDF document.',
      'Choose numbering layout presets and corner positions.',
      'Mark skipping of the first title page if desired.',
      'Download your numbered document.'
    ],
    benefits: ['Bypass title pages easily', 'Support multiple layouts like N/T', 'Instant visual alignment']
  },
  {
    id: 'rotate-pdf',
    urlPath: 'rotate-pdf',
    name: 'Rotate PDF',
    category: 'pdf-editing',
    shortDesc: 'Visually rotate single pages or entire PDF matrices in seconds.',
    longDesc: 'Correct upsidedown scans. Our visual selector lets you preview each page and rotate them 90, 180, or 270 degrees clockwise or counterclockwise.',
    iconName: 'RotateCw',
    stepInstructions: [
      'Upload the target PDF document.',
      'Visually click rotate controls on specific page cards.',
      'Hit Apply Rotation.',
      'Download your perfectly oriented PDF file.'
    ],
    benefits: ['Dynamic visual page previews', 'Bulk rotate option for all pages', 'Zero compression loss']
  },
  {
    id: 'remove-pages',
    urlPath: 'remove-pages',
    name: 'Remove PDF Pages',
    category: 'pdf-editing',
    shortDesc: 'Visually select and permanently delete unwanted pages from your PDF.',
    longDesc: 'Discard empty or unnecessary pages from larger reports. Click on page cards visually to mark them for deletion, keeping only the important contents.',
    iconName: 'Trash2',
    stepInstructions: [
      'Upload your PDF file.',
      'Tap on pages instantly to mark them for removal.',
      'Click Erase Pages to compile.',
      'Download your clean pruned PDF.'
    ],
    benefits: ['Visual trash can overlays', 'Verify selections easily', 'Prunes files perfectly']
  },
  {
    id: 'sign-pdf',
    urlPath: 'sign-pdf',
    name: 'Sign PDF',
    category: 'pdf-editing',
    shortDesc: 'Draw secure ink signatures and stamp them visually onto pages.',
    longDesc: 'An interactive digital signature board. Draw your custom signature, scale its dimensions, and drag-and-drop the resulting stamp visual exactly where it belongs on your PDF slides.',
    iconName: 'Bookmark',
    isPopular: true,
    stepInstructions: [
      'Draw your custom signature on our interactive board.',
      'Decompress and upload your destination PDF document.',
      'Drag, drop, and resize your signature template on the A4 page preview.',
      'Stamp and download your signed document.'
    ],
    benefits: ['Smooth interactive vector drawing board', 'Drag & drop signature visual positioning', 'Certified look & feel stamp seals']
  },
  {
    id: 'protect-pdf',
    urlPath: 'protect-pdf',
    name: 'Protect PDF',
    category: 'pdf-editing',
    shortDesc: 'Secure documents with AES password protection and restricting permissions.',
    longDesc: 'Enforce security. Encrypt outbound PDF archives with secure user keys and control printing/copying permissions perfectly.',
    iconName: 'Lock',
    stepInstructions: [
      'Select your PDF document.',
      'Type and confirm your password key indicator.',
      'Adjust printing and clipboard copy rights.',
      'Encrypt and download your protected PDF.'
    ],
    benefits: ['Sovereign AES-128 bit protection standard', 'Optional restriction permissions toggle', 'Runs strictly inside your local browser']
  },
  {
    id: 'unlock-pdf',
    urlPath: 'unlock-pdf',
    name: 'Unlock PDF',
    category: 'pdf-editing',
    shortDesc: 'Remove secure passwords and standard restrictions from your PDFs.',
    longDesc: 'Unlock copy and print capabilities. Provide the document password once, and download a permanently decrypted, restriction-free version of your PDF.',
    iconName: 'Unlock',
    stepInstructions: [
      'Upload key password-restricted PDF files.',
      'Provide your correct document passcode key.',
      'Strip standard security tables.',
      'Save clean unlocked document drafts.'
    ],
    benefits: ['Quickly strips user constraints', '100% compliant with standard reader suites', 'Restores copy and paste capability']
  },
  {
    id: 'repair-pdf',
    urlPath: 'repair-pdf',
    name: 'Repair PDF',
    category: 'pdf-editing',
    shortDesc: 'Rebuild corrupted cross-references or broken offset tables.',
    longDesc: 'Fix PDFs that crash your readers or fail during emails. Regenerate catalog indices and repair binary offset trees cleanly inside the sandbox.',
    iconName: 'HeartHandshake',
    stepInstructions: [
      'Provide your damaged PDF document.',
      'Let FoldPDF rebuild broken dictionary branches and references.',
      'Compile corrected pages.',
      'Download restored file copies.'
    ],
    benefits: ['Cleans offset stream tables', 'Prevents reader crashes', 'Free diagnostic parse']
  },
  {
    id: 'ocr-pdf',
    urlPath: 'ocr-pdf',
    name: 'OCR Scanned PDF Reader',
    category: 'pdf-editing',
    shortDesc: 'Read and extract printed text blocks from photo-only scanned documents.',
    longDesc: 'Don\'t let scans lock your productivity. Compile pixel matrices from photo sheets using local OCR neural nodes and export clean text lists.',
    iconName: 'Cpu',
    stepInstructions: [
      'Load scanned, graphic-only PDF files.',
      'Tesseract OCR analyzes pixel matrices directly in browser grids.',
      'Check page text highlights.',
      'Download converted TXT file outputs.'
    ],
    benefits: ['Runs local neural OCR scans', 'No data leaks over external networks', 'Crisp text results']
  },
  {
    id: 'ai-summarize',
    urlPath: 'ai-summarize',
    name: 'AI Summarizer Reader',
    category: 'pdf-editing',
    shortDesc: 'Generate intelligent abstract outlines and key point lists.',
    longDesc: 'Understand massive textbooks and contracts instantly. Our local intelligence model scores textual sentences, predicts document categories, and delivers scannable bullet summaries.',
    iconName: 'Sparkles',
    isPopular: true,
    stepInstructions: [
      'Upload reports, textbooks, or documents.',
      'Our analyzer models abstract weights and term counts.',
      'Review Executive Abstract and keyword lists.',
      'Download comprehensive TXT summary logs.'
    ],
    benefits: ['Categorizes documents automatically', 'Calculates weighted summary highlights', 'Saves hours of reading time']
  },
  {
    id: 'ai-chat',
    urlPath: 'ai-chat',
    name: 'AI Chat with PDF',
    category: 'pdf-editing',
    shortDesc: 'Interactive chat session querying any local document content blocks.',
    longDesc: 'Talk directly to your PDF sheets! Ask specific questions, locate parameters, and check formulas with our local secure sandbox dialog layout.',
    iconName: 'MessageSquareShare',
    isPopular: true,
    stepInstructions: [
      'Upload the target PDF portfolio.',
      'Let FoldPDF index structural content cells.',
      'Type and ask your questions directly in the sandbox.',
      'Get precise mapped answers.'
    ],
    benefits: ['Fully secure in-memory sandbox execution', 'Instantly query huge user guides', 'Simple scannable chat controls']
  },
  {
    id: 'ai-resume',
    urlPath: 'ai-resume',
    name: 'AI Resume ATS Optimizer',
    category: 'pdf-editing',
    shortDesc: 'An ATS analyzer grading format headers, phrasing impact, and word count.',
    longDesc: 'Score your CV against standard ATS parser patterns. Get actionable points, check action verbs, find missing sections, and optimize length.',
    iconName: 'UserCheck',
    isPopular: true,
    stepInstructions: [
      'Upload your Resume or CV PDF.',
      'Let ATS algorithms score layout headers and terms.',
      'Review suggestions and score progress.',
      'Adjust sections to land your interview.'
    ],
    benefits: ['Grade action verb impact counts', 'Check optimal length targets', 'Find missing essential sections']
  },
  {
    id: 'ai-contract',
    urlPath: 'ai-contract',
    name: 'AI Legal Simplifier',
    category: 'pdf-editing',
    shortDesc: 'Scans contracts and translates complex legalese jargon into friendly English.',
    longDesc: 'Ditch the legal anxiety. We map complex contract clauses, highlight difficult keywords, and show intuitive, clear human explanations on hover.',
    iconName: 'Scale',
    stepInstructions: [
      'Upload contract or license PDF documents.',
      'Our simplified database parses legal clauses.',
      'Hover over marked jargon keywords.',
      'Download plain English simplified agreements.'
    ],
    benefits: ['Highlights heavy legalese terms', 'Shows explanations on visual tooltips', 'Maintains contract context']
  }
];

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'how-to-compress-pdfs-without-losing-quality',
    title: 'How to Compress PDFs Without Losing Quality (The Ultimate Guide)',
    excerpt: 'Shrinking document file sizes often leads to pixelated text and low-res graphics. Learn the industry-standard rules to balance compression ratios with high-definition clarity.',
    date: 'May 18, 2026',
    readTime: '4 min read',
    category: 'Document Optimization',
    content: `
### Understanding the PDF Compression Trade-off
When you run a file through a standard compressor, the system attempts to deflate storage footprint across three main layers: **images**, **fonts**, and **metadata**. 

If the tool is overly aggressive, it reduces image resolution down to 72 DPI, rendering charts and signatures extremely blurry.

#### 1. Choose the Right Dpi Settings
For digital screens (email, web layouts), target an image density of **150 DPI**. It preserves crisp vector text and guarantees diagrams look superb while reducing size by up to 80%.

#### 2. Vectorize vs. Rasterize
Always preserve vector structures when compressing. Standard digital PDFs contain text and lines as vector math. Never use tools that rasterize the whole page down to a JPEG first before compressing, as this deletes text selectability.

#### 3. Subset your Fonts
Only bundle the individual font characters utilized in your pages rather than shipping entire multi-megabyte font families inside the PDF catalog. FoldPDF automatic font subsetting deflates pages cleanly.
    `
  },
  {
    slug: 'how-to-merge-pdfs-online',
    title: 'How to Merge PDFs Online in Any Custom Sequence Safely',
    excerpt: 'Combining invoices, tax reports, and scanned paper receipts is a daily task in modern offices. Learn how to rearrange documents visually prior to committing merges.',
    date: 'May 10, 2026',
    readTime: '3 min read',
    category: 'Business Guides',
    content: `
### Combining Multi-source PDFs Neatly
We have all been there: you have an invoice page in one PDF, a cover letter in a Word document, and a receipt image as a JPEG. How do you combine them cleanly?

#### Step 1: Standardize Converted Layouts
First, convert your alternate source elements (JPGs, DOCX files) into standard PDF grids using FoldPDF convert pages.

#### Step 2: visual Rearranging
Use a visual drag-and-drop workspace layout to check thumbnails visually. It is highly frustrating to merge first only to find your pages loaded upside-down or in reverse order. Rearrange first, then execute.

#### Step 3: Fast stitch
Click merge to combine documents without losing active hyperlinks or outline structures. Save the resulting PDF securely.
    `
  },
  {
    slug: 'how-to-convert-pdf-to-word',
    title: 'Convert Document layout from PDF to Editable DOCX: Top Tips',
    excerpt: 'Avoid annoying formatting errors and overlapping text boxes when changing read-only sheets back to Microsoft Word documents.',
    date: 'May 05, 2026',
    readTime: '4 min read',
    category: 'Formatting Tutorials',
    content: `
### Restoring PDFs back into Edit-ready Word Files
When you decompile a PDF into .docx, standard cheap tools usually dump words inside floating text boxes. Editing those files subsequently is a complete nightmare.

#### Why Floating boxes occur
Most converters output words with absolute positioning parameters, placing text box rectangles over the page. This locks typing flow completely.

#### The OCR and Semantic extraction Solution
FoldPDF PDF to Word engine parses text flow patterns semantically. It reads margins, tabulations, list bullets, and paragraph flows. This maps your text back into real, flowing Word paragraphs for smooth styling and editing.
    `
  }
];
