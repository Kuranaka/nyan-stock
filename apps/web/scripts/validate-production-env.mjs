import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

for (const fileName of ['.env.production.local', '.env.local', '.env.production', '.env']) {
  const filePath = resolve(process.cwd(), fileName);
  if (existsSync(filePath)) process.loadEnvFile(filePath);
}

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
const errors = [];

if (!siteUrl) {
  errors.push('NEXT_PUBLIC_SITE_URL is required.');
} else {
  try {
    const parsed = new URL(siteUrl);
    if (parsed.protocol !== 'https:') errors.push('NEXT_PUBLIC_SITE_URL must use https.');
    if (['localhost', '127.0.0.1'].includes(parsed.hostname)) {
      errors.push('NEXT_PUBLIC_SITE_URL must not point to localhost.');
    }
  } catch {
    errors.push('NEXT_PUBLIC_SITE_URL must be a valid absolute URL.');
  }
}

if (!supportEmail) {
  errors.push('NEXT_PUBLIC_SUPPORT_EMAIL is required.');
} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) {
  errors.push('NEXT_PUBLIC_SUPPORT_EMAIL must be a valid email address.');
}

if (errors.length > 0) {
  console.error('Production environment validation failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log('ok - production web environment is configured');
}
