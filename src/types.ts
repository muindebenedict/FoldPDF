export type ToolCategory = 'image-conversions' | 'document-conversions' | 'pdf-editing';

export interface ToolDefinition {
  id: string;
  urlPath: string; // e.g. "compress-pdf"
  name: string;
  category: ToolCategory;
  shortDesc: string;
  longDesc: string;
  iconName: string; // Lucide icon name string
  stepInstructions: string[];
  faqs?: { question: string; answer: string }[];
  benefits: string[];
  metaTitle?: string;
  metaDesc?: string;
  isPopular?: boolean;
}

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  content: string; // Markdown / styled text
  date: string;
  readTime: string;
  category: string;
}

export interface RecentFile {
  id: string;
  name: string;
  size: string;
  timestamp: string;
  toolUsed: string;
  downloadUrl?: string;
  hasAIAnalysis?: boolean;
}

export interface FAQItem {
  question: string;
  answer: string;
}
