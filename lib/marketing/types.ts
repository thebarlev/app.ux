export type PortableTextSpan = {
  _type: "span";
  text: string;
  marks?: string[];
};

export type PortableTextBlock = {
  _type: "block";
  children?: PortableTextSpan[];
};

export type MarketingSectionType =
  | "hero"
  | "features"
  | "howItWorks"
  | "benefits"
  | "testimonials"
  | "faq"
  | "cta";

export type Section = {
  _id: string;
  type: MarketingSectionType | string;
  title: string;
  /**
   * Lightweight "portable-text-like" structure used by existing marketing components.
   * We keep the shape to avoid rewriting rendering logic.
   */
  content?: Array<PortableTextBlock | Record<string, any>>;
  order?: number;
  /**
   * Optional image URL (e.g. from /public).
   */
  imageUrl?: string;
};

export type MarketingPage = {
  _id: string;
  title: string;
  slug: { current: string };
  sections?: Section[];
  seo?: {
    metaTitle?: string;
    metaDescription?: string;
    ogImageUrl?: string;
  };
  ctaButtonText?: string;
  ctaButtonLink?: string;
};

