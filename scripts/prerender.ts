import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const OG_IMAGE = 'https://www.foldpdf.online/og-image.png';
// Any path the app doesn't know renders the not-found page; it is saved as dist/404.html.
const NOT_FOUND_PATH = '/404';

// Mock browser globals for Node SSR environment
if (typeof globalThis.window === 'undefined') {
  const mockLocation = {
    pathname: '/',
    href: 'https://www.foldpdf.online/',
    host: 'www.foldpdf.online',
    hostname: 'www.foldpdf.online',
    search: '',
    hash: ''
  };

  const mockDom = {
    location: mockLocation,
    scrollTo: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    history: { pushState: () => {}, replaceState: () => {} },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    navigator: {
      userAgent: 'node',
    },
    document: {
      documentElement: { classList: { add: () => {}, remove: () => {} } },
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ setAttribute: () => {}, appendChild: () => {}, style: {} }),
      body: { appendChild: () => {}, removeChild: () => {} },
      title: '',
    }
  };

  globalThis.window = mockDom as any;
  globalThis.document = mockDom.document as any;
  globalThis.localStorage = mockDom.localStorage as any;
  globalThis.sessionStorage = mockDom.sessionStorage as any;
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: mockDom.navigator,
      configurable: true,
      writable: true,
    });
  } catch (e) {
    // Navigator read-only getter fallback
  }
}

async function buildPrerender() {
  console.log('🚀 Starting Static Site Generation (Pre-rendering)...');

  const distDir = path.resolve(rootDir, 'dist');
  const templatePath = path.resolve(distDir, 'index.html');

  if (!fs.existsSync(templatePath)) {
    throw new Error('dist/index.html not found! Run vite build before prerendering.');
  }

  const indexHtmlTemplate = fs.readFileSync(templatePath, 'utf-8');

  // Launch Vite in SSR middleware mode to execute TypeScript code natively
  const vite = await createServer({
    root: rootDir,
    server: { middlewareMode: true },
    appType: 'custom',
  });

  try {
    const { render } = await vite.ssrLoadModule('/src/entry-server.tsx');
    const { getAllRoutes } = await vite.ssrLoadModule('/src/routes.ts');

    const routes = [
      ...getAllRoutes(),
      {
        path: NOT_FOUND_PATH,
        title: 'Page not found | FoldPDF',
        description: "The page you're looking for doesn't exist. Try FoldPDF's free PDF tools instead.",
      },
    ];
    console.log(`📦 Found ${routes.length} total routes to pre-render.`);

    for (const routeInfo of routes) {
      const { path: routePath, title, description, structuredData } = routeInfo;

      // Update mock location for route context
      if (globalThis.window) {
        (globalThis.window as any).location.pathname = routePath;
        (globalThis.window as any).location.href = `https://www.foldpdf.online${routePath}`;
      }

      // Render React component tree to static HTML string
      const appHtml = render(routePath);

      // Start with base dist/index.html template
      let html = indexHtmlTemplate;

      // Replace or insert <title>
      if (title) {
        html = html.replace(/<title>.*?<\/title>/gi, `<title>${title}</title>`);
      }

      // Escape quotes in metadata strings
      const safeTitle = (title || '').replace(/"/g, '&quot;');
      const safeDesc = (description || '').replace(/"/g, '&quot;');

      // Replace or insert <meta name="description">
      if (description) {
        const descMeta = `<meta name="description" content="${safeDesc}" />`;
        if (/<meta\s+name=["']description["']/i.test(html)) {
          html = html.replace(/<meta\s+name=["']description["'][^>]*>/gi, descMeta);
        } else {
          html = html.replace('</head>', `  ${descMeta}\n</head>`);
        }
      }

      // Add Open Graph, Canonical URL, and Twitter Card tags
      const canonicalUrl = `https://www.foldpdf.online${routePath === '/' ? '' : routePath}`;
      const isNotFound = routePath === NOT_FOUND_PATH;
      const seoMetaBlock = `${isNotFound ? `
    <meta name="robots" content="noindex" />` : `
    <link rel="canonical" href="${canonicalUrl}" />`}
    <meta property="og:site_name" content="FoldPDF" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDesc}" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:type" content="${routePath.startsWith('/blog/') ? 'article' : 'website'}" />
    <meta property="og:image" content="${OG_IMAGE}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="FoldPDF: free PDF tools, no signup" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDesc}" />
    <meta name="twitter:image" content="${OG_IMAGE}" />
${(structuredData ?? [])
  // "<" is escaped so the JSON can never close the script tag early
  .map((item) => `    <script type="application/ld+json">${JSON.stringify(item).replace(/</g, '\\u003c')}</script>`)
  .join('\n')}
`;

      // Clean up previous meta tags if present in template, then append
      html = html.replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '');
      html = html.replace(/<meta\s+property=["']og:[^"']*["'][^>]*>/gi, '');
      html = html.replace(/<meta\s+name=["']twitter:[^"']*["'][^>]*>/gi, '');
      html = html.replace('</head>', `${seoMetaBlock}</head>`);

      // Inject pre-rendered React markup inside <div id="root">
      html = html.replace(
        /<div id="root"[^>]*><\/div>/,
        `<div id="root" class="h-full">${appHtml}</div>`
      );

      // Save pre-rendered HTML file to output path
      let outputFile: string;
      if (isNotFound) {
        outputFile = path.resolve(distDir, '404.html');
      } else if (routePath === '/' || routePath === '') {
        outputFile = path.resolve(distDir, 'index.html');
      } else {
        const cleanPath = routePath.startsWith('/') ? routePath.slice(1) : routePath;
        const targetDir = path.resolve(distDir, cleanPath);
        fs.mkdirSync(targetDir, { recursive: true });
        outputFile = path.resolve(targetDir, 'index.html');
      }

      fs.writeFileSync(outputFile, html, 'utf-8');
    }

    console.log(`✨ Successfully pre-rendered all ${routes.length - 1} pages and 404.html into dist/!`);
  } finally {
    await vite.close();
  }
}

buildPrerender().catch((err) => {
  console.error('❌ Static pre-rendering failed:', err);
  process.exit(1);
});
