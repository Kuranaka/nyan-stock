const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const configuredSupportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();

/**
 * Public details used in the site footer and legal pages.
 *
 * Set both values in the production Vercel environment before submitting the
 * Google OAuth consent screen. They must be reachable by users and use the
 * domain verified in Google Search Console.
 */
export const siteUrl = configuredSiteUrl?.replace(/\/$/, '');
export const supportEmail = configuredSupportEmail || undefined;

