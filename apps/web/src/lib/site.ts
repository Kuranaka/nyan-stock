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
export const appStoreUrl = 'https://apps.apple.com/jp/app/%E3%81%AB%E3%82%83%E3%82%93%E3%82%B9%E3%83%88%E3%83%83%E3%82%AF/id6789451045';
