/**
 * Technical SEO Utilities for FoldPDF
 * Provides dynamic update capabilities for document titles, robots meta elements, canonical URLs,
 * OpenGraph attributes, Twitter Card records, and structured JSON-LD schemas.
 */

interface SEOParams {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  image?: string;
  publishDate?: string;
  modifyDate?: string;
  authorName?: string;
}

/**
 * Dynamically updates primary HTML meta tag structures for the current path
 */
export function generateMetaTags({
  title,
  description,
  path,
  type = "website",
  image = "https://foldpdf.com/FOLDPDF_icon_crisp.png",
  publishDate,
  modifyDate,
  authorName = "FoldPDF Team"
}: SEOParams): void {
  // Update browser document title
  document.title = title;

  const siteUrl = "https://foldpdf.com";
  const canonicalUrl = `${siteUrl}${path.startsWith("/") ? "" : "/"}${path}`;

  // Helper to set or create meta elements
  const setMetaTag = (attributeName: string, attributeValue: string, contentValue: string) => {
    let element = document.querySelector(`meta[${attributeName}="${attributeValue}"]`);
    if (!element) {
      element = document.createElement("meta");
      element.setAttribute(attributeName, attributeValue);
      document.head.appendChild(element);
    }
    element.setAttribute("content", contentValue);
  };

  // 1. Standard Tags
  setMetaTag("name", "description", description);

  // 2. Canonical URL Link element
  let canonicalEl = document.querySelector("link[rel='canonical']");
  if (!canonicalEl) {
    canonicalEl = document.createElement("link");
    canonicalEl.setAttribute("rel", "canonical");
    document.head.appendChild(canonicalEl);
  }
  canonicalEl.setAttribute("href", canonicalUrl);

  // 3. OpenGraph tags
  setMetaTag("property", "og:title", title);
  setMetaTag("property", "og:description", description);
  setMetaTag("property", "og:type", type);
  setMetaTag("property", "og:url", canonicalUrl);
  setMetaTag("property", "og:image", image);
  setMetaTag("property", "og:site_name", "FoldPDF");

  if (type === "article") {
    if (publishDate) {
      setMetaTag("property", "article:published_time", new Date(publishDate).toISOString());
    }
    if (modifyDate) {
      setMetaTag("property", "article:modified_time", new Date(modifyDate).toISOString());
    }
    setMetaTag("property", "article:author", authorName);
    setMetaTag("property", "article:section", "PDF Security");
  }

  // 4. Twitter Cards tags
  setMetaTag("name", "twitter:card", "summary_large_image");
  setMetaTag("name", "twitter:title", title);
  setMetaTag("name", "twitter:description", description);
  setMetaTag("name", "twitter:image", image);
  setMetaTag("name", "twitter:site", "@FoldPDF");
  setMetaTag("name", "twitter:creator", "@FoldPDF");
}

/**
 * Injects structured schema markup using standard JSON-LD
 */
export function generateStructuredData(type: "Article" | "FAQPage" | "WebSite" | "SoftwareApplication", data: any): void {
  let scriptEl = document.getElementById("foldpdf-seo-jsonld") as HTMLScriptElement | null;
  if (!scriptEl) {
    scriptEl = document.createElement("script");
    scriptEl.id = "foldpdf-seo-jsonld";
    scriptEl.type = "application/ld+json";
    document.head.appendChild(scriptEl);
  }

  let schemaContext: any = {
    "@context": "https://schema.org"
  };

  if (type === "WebSite") {
    schemaContext = {
      ...schemaContext,
      "@type": "WebSite",
      "name": "FoldPDF",
      "url": "https://foldpdf.com",
      "description": "Private, secure browser-based PDF utilities.",
      ...data
    };
  } else if (type === "SoftwareApplication") {
    schemaContext = {
      ...schemaContext,
      "@type": "SoftwareApplication",
      "name": data.name || "FoldPDF Online App",
      "operatingSystem": "All",
      "applicationCategory": "BusinessApplication",
      "offers": {
        "@type": "Offer",
        "price": "0.00",
        "priceCurrency": "USD"
      },
      ...data
    };
  } else if (type === "Article") {
    schemaContext = {
      ...schemaContext,
      "@type": "NewsArticle",
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": `https://foldpdf.com/blog/${data.slug}`
      },
      "headline": data.title,
      "description": data.excerpt,
      "datePublished": data.publishDate,
      "dateModified": data.modifyDate || data.publishDate,
      "author": {
        "@type": "Organization",
        "name": "FoldPDF Team",
        "url": "https://foldpdf.com"
      },
      "publisher": {
        "@type": "Organization",
        "name": "FoldPDF",
        "logo": {
          "@type": "ImageObject",
          "url": "https://foldpdf.com/FOLDPDF_icon_crisp.png"
        }
      },
      ...data
    };
  } else if (type === "FAQPage") {
    schemaContext = {
      ...schemaContext,
      "@type": "FAQPage",
      "mainEntity": data.faqs.map((faq: { question: string; answer: string }) => ({
        "@type": "Question",
        "name": faq.question,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": faq.answer
        }
      }))
    };
  }

  scriptEl.text = JSON.stringify(schemaContext, null, 2);
}