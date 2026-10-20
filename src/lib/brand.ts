// The product's name and credits, in one place: UI, letters, e-mails, SMS and
// the voice agents all read these. Logo and colours live in components/brand.tsx.

export const BRAND = {
  name: "CareTrail",
  tagline: "AI assistance for travel health",
  poweredBy: "Sthiram",
  /** The legal name, for documents Sthiram issues (quotations). */
  company: "Sthiram Services LLP",
} as const;

/** "Powered by Sthiram" */
export const POWERED_BY = `Powered by ${BRAND.poweredBy}`;
