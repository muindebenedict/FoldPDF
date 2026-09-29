import { TOOLS_DATA } from './toolsData';
import { DETAILED_BLOG_POSTS } from './pages/blog/blogPostsData';
import { getToolMeta } from './toolMeta';

export interface RouteMetadata {
  path: string;
  title: string;
  description: string;
}

const STATIC_ROUTES: RouteMetadata[] = [
  {
    path: '/',
    title: 'FoldPDF | Private PDF Tools That Never Upload Your Files',
    description: 'Free, private PDF tools. Merge, split, edit and convert PDF files directly inside your browser; the five tools that need our secure server delete your file immediately after processing.'
  },
  {
    path: '/about',
    title: 'About FoldPDF - Sovereign On-Device PDF Workspace',
    description: 'Learn about FoldPDF and our mission to provide private, browser-first document utilities that protect your sensitive files and data privacy.'
  },
  {
    path: '/security',
    title: 'Security & Browser Sandboxing Hub | FoldPDF',
    description: 'Discover how FoldPDF uses browser memory isolation, WASM, and zero-knowledge sandboxing to keep your sensitive files completely private.'
  },
  {
    path: '/transparency',
    title: 'Technical Transparency & Architecture | FoldPDF',
    description: 'Read our technical commitments, open engineering principles, code integrity standards, and stateless client memory management model.'
  },
  {
    path: '/how-it-works',
    title: 'How FoldPDF Works - On-Device Browser Processing',
    description: 'Understand how client-side WebAssembly and modern browser execution engines allow instant PDF editing without uploads, and how our five server-assisted tools handle and delete files.'
  },
  {
    path: '/sitemap',
    title: 'HTML Sitemap & PDF Tool Directory | FoldPDF',
    description: 'Explore all free PDF compression, conversion, merging, splitting, security, and editing tools available on FoldPDF.'
  },
  {
    path: '/contact',
    title: 'Contact FoldPDF Support & Feedback',
    description: 'Get in touch with the FoldPDF engineering team for questions, support, feature suggestions, or feedback regarding our private PDF tools.'
  },
  {
    path: '/privacy',
    title: 'Privacy & Cookie Policy | FoldPDF',
    description: 'Read FoldPDF\'s complete privacy policy. We do not store, view, transmit, or log your personal documents or edited files.'
  },
  {
    path: '/terms',
    title: 'Terms of Service | FoldPDF',
    description: 'Terms of service governing the use of FoldPDF browser-based PDF tools, online utilities, and web services.'
  },
  {
    path: '/dmca',
    title: 'DMCA Policy & Procedure | FoldPDF',
    description: 'FoldPDF DMCA compliance policy and official contact details for copyright notices and takedown requests.'
  },
  {
    path: '/blog',
    title: 'Document Security & PDF Architecture Blog | FoldPDF',
    description: 'Read technical guides, HIPAA/GDPR compliance tips, and PDF security best practices from the FoldPDF engineering team.'
  }
];

export function getAllRoutes(): RouteMetadata[] {
  const routes: RouteMetadata[] = [...STATIC_ROUTES];

  // Add all PDF tool pages
  TOOLS_DATA.forEach((tool) => {
    const routePath = `/${tool.urlPath}`;
    const { title, description } = getToolMeta(tool);

    routes.push({
      path: routePath,
      title,
      description
    });
  });

  // Add all Blog Post pages
  DETAILED_BLOG_POSTS.forEach((post) => {
    const routePath = `/blog/${post.slug}`;
    const title = `${post.title} | FoldPDF Blog`;
    const description = post.excerpt || post.summary || `Read ${post.title} on the FoldPDF document security blog.`;

    routes.push({
      path: routePath,
      title,
      description
    });
  });

  return routes;
}
