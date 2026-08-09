# Agent Notes

## Project Overview

This repository is a monorepo for `にゃんストック`.

`にゃんストック` helps households track supplies for cats and seven other companion-animal groups, estimate remaining days, receive local notifications, share data through Supabase, review costs, and reopen registered purchase links. The repository also contains the public App Store landing page and the product-master import pipeline.

## Repository Layout

```text
nyan-stock/
  apps/
    mobile/
      package.json
      app.json
      src/
      app/
    web/
      package.json
      next.config.ts
      src/
      app/
  packages/
    shared/
  services/
    product-importer/
  supabase/
    functions/
    migrations/
  README.md
  agents.md
```

- `apps/mobile/`: React Native / Expo / TypeScript app.
- `apps/web/`: Next.js / TypeScript / Tailwind CSS landing page.
- `packages/shared/`: Shared product and pet-master types consumed by the mobile app and importer.
- `services/product-importer/`: Product collection, normalization, review, merge, and quality-check CLI.
- `supabase/`: Append-only migrations and Edge Functions for auth-backed sharing and support services.
- Do not put Expo or Next.js app/config files in the repository root.
- Keep Expo Router's `app/` under `apps/mobile/app/`.
- Keep Next.js App Router's `app/` under `apps/web/src/app/`.
- Keep each app's `package.json`, lockfile, and `node_modules` separate.
- Keep shared product/pet-master types in `packages/shared/`; app-specific UI and storage types remain inside each app.

## Tech Stack

### Mobile App

- Expo SDK 54
- React Native 0.81
- TypeScript with `strict` enabled
- Expo Router under `apps/mobile/app/`
- Versioned and schema-validated AsyncStorage persistence, with legacy-data migration
- Supabase Auth, PostgREST, and Realtime for optional household sharing
- Expo Notifications for local reminders
- React Native Linking for purchase links and Expo WebBrowser for auth/subscription flows
- date-fns for date calculations
- ESLint and Prettier

### Landing Page

- Next.js with App Router
- React
- TypeScript with `strict` enabled
- Tailwind CSS
- Cloudflare Pages static-export deployment target

## Useful Commands

Run commands from the app directory, not the repository root.

### Mobile App

```bash
cd apps/mobile
npm install
npx expo start
npm run ios
npm run android
npm run lint
npm test
npx tsc --noEmit
npx expo export --platform ios
```

If `expo start` appears to hang in the sandbox, run it with escalated local process/network permissions. A successful start prints a Metro URL such as `exp://127.0.0.1:8081`.

### Landing Page

```bash
cd apps/web
npm install
npm run dev
npm run lint
npx tsc --noEmit
npm run build
```

If `next dev` or `next build` fails in the sandbox because Turbopack cannot bind a local port, rerun the command with escalated local process/network permissions.

## Cloudflare Pages Settings

When publishing the LP on Cloudflare Pages, connect the GitHub repository and set:

- Root Directory: `apps/web`
- Build Command: `npm ci && npm run build`
- Output Directory: `out`

Set `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_SUPPORT_EMAIL`; production builds fail when either is invalid or missing.

## Directory Map

### Mobile App

- `apps/mobile/app/`: Expo Router route entries.
- `apps/mobile/src/screens/`: Full screen implementations.
- `apps/mobile/src/components/`: Shared mobile UI components.
- `apps/mobile/src/constants/`: Colors, category labels, units, and default unit mapping.
- `apps/mobile/src/features/cats/`: Cat types and storage helpers.
- `apps/mobile/src/features/inventory/`: Inventory types, storage, calculations, purchase links, and EC helpers.
- `apps/mobile/src/features/notifications/`: Local notification permission and scheduling helpers.
- `apps/mobile/src/features/settings/`: Settings types and storage helpers.
- `apps/mobile/src/features/persistence/`: Shared versioned JSON codec, schemas, and AsyncStorage helpers.
- `apps/mobile/src/features/sync/`: Authenticated household sync, realtime subscriptions, targeted mutations, and keyset pagination.
- `apps/mobile/src/features/products/`: Remote pet-product master search and mapping.
- `apps/mobile/src/hooks/`: Cross-screen React hooks such as unsaved-change guards and load-error handling.
- `apps/mobile/src/utils/`: Date and validation helpers.
- `apps/mobile/src/data/`: Development seed helpers.

### Landing Page

- `apps/web/src/app/`: Next.js App Router pages and layout.
- `apps/web/src/components/`: LP sections and reusable UI components.
- `apps/web/src/lib/`: Site configuration and analytics helpers.
- `apps/web/public/`: Static screenshots, OGP assets, app-ads.txt, and promotional video.

### Product Importer

- `services/product-importer/src/petCatalog/`: Catalog normalization, review, repository, and quality logic.
- `services/product-importer/data/seed/`: Canonical seed inputs.
- `services/product-importer/data/generated/`: Reproducible review and quality outputs; large retained outputs use Git LFS.

## Implementation Guidelines

### Monorepo Boundaries

- Do not run `npm install` at the repository root.
- Do not create root-level Expo `app/`, `app.json`, `babel.config.js`, or mobile `src/`.
- Do not create root-level Next.js `app/`, `next.config.ts`, or web `src/`.
- LP changes belong in `apps/web/`.
- Mobile app changes belong in `apps/mobile/`.
- Do not mix mobile and web dependencies.

### Supabase Migrations

- Never edit, rename, delete, or reuse the version number of an existing file in `supabase/migrations/`, especially after it may have been applied to any remote database.
- Every schema change must be a new migration file with a unique, chronologically later version number than all existing local migration files.
- If a migration needs correction, add a follow-up migration that makes the required change; do not modify migration history.

### Supabase Large-Table Reads

- Treat `retailer_listings_raw`, `product_candidates`, `product_review_queue`, and other unbounded importer tables as large tables. A feature-specific command must not call `loadQualitySnapshot()` or `selectAll()` merely to find its own subset.
- Reserve the full quality snapshot for `quality:pet-catalog`, where an all-table consistency check is intentional. Review, merge, export, and maintenance commands must expose and use a targeted repository method.
- Filter at Supabase/PostgREST before downloading rows, and select only the columns the command needs. In particular, do not fetch `retailer_listings_raw.raw_json` unless the operation actually consumes it.
- For a long ordered scan, prefer keyset pagination using a stable unique cursor such as `id=gt.<last_id>` with `order=id.asc`. Avoid deep `offset` pagination on large or wide tables. Offset pagination is acceptable only for a deliberately bounded/small result set or a full quality check that requires it.
- Resolve relationships in stages: fetch the narrow parent/result rows first, collect their IDs, then fetch related rows with `in.(...)` batches of at most 100 IDs. Avoid large PostgREST embedded joins, especially joins that pull raw JSON payloads.
- Keep large-table requests sequential or explicitly concurrency-bounded. Do not start several full-table page scans in parallel, because this can exhaust Supabase statement memory even when each individual page is 1,000 rows.
- HTTP 500 retries are only for transient failures. If the same table/page or deep offset repeatedly returns HTTP 500, redesign the query using narrower filters, fewer columns, keyset pagination, and ID batches; do not treat eventual retry success as the fix.
- Add an index through a new migration when a targeted filter plus keyset order lacks suitable database support. Never rewrite an applied migration to add that index.
- For blocking-review CSV work, use `loadBlockingReviewSnapshot()`: export reads only open blocking issues and their candidates/listings, while apply reads only candidate IDs present in the edited CSV.

### Mobile App

- Keep screens out of direct storage details. Use the storage modules in `apps/mobile/src/features/**`.
- Keep inventory math in `apps/mobile/src/features/inventory/inventoryLogic.ts`.
- Keep purchase URL handling in `apps/mobile/src/features/inventory/purchaseLink.ts`.
- Extend the existing auth, household sync, and cloud icon storage only when explicitly requested, preserving membership-scoped access.
- EC API/product-search integrations are allowed only when explicitly requested and must keep affiliate disclosure visible near purchase/search actions.
- Preserve the local-first privacy model: no address, phone number, exact location, or account data.
- Avoid veterinary or medical claims. Use wording like "記録する", "変化に気づきやすくする", and "気になる場合は獣医師に相談".
- Purchase-link UI must keep the affiliate disclosure visible near buy buttons.
- Delete and data-reset flows must keep confirmation dialogs.

### Landing Page

- Keep the LP as a standalone Next.js site in `apps/web/`.
- Use TypeScript and Tailwind CSS.
- Keep copy in Japanese and avoid veterinary or medical claims.
- Analytics helpers can log to `console.log` initially, but should preserve event names for future GA4 / Clarity work.
- Legal pages may contain placeholder text during development, but must include TODO notes for pre-release legal review.
- Affiliate disclosure must be visible and understandable.

## Data Model Notes

Inventory items carry `catId` for multi-cat support.

Inventory status rules:

- `no_estimate`, or a mode without a resolvable estimated end date: `unknown`
- Remaining days `<= 0`: `out`
- Remaining days `<= 3`: `warning`
- Remaining days `<= 7`: `watch`
- Remaining days `>= 8`: `in_stock`

Usage-based estimates use `openedDate` when available; otherwise they use `purchaseDate`. The current lasting-days form uses `purchaseDate` until opened-date input is added to that flow.

## Verification Checklist

### Mobile App

Before finishing substantial mobile changes, run from `apps/mobile/`:

```bash
npx tsc --noEmit
npm run lint
```

For routing, Metro, Babel, or Expo config changes, also run:

```bash
npx expo export --platform ios
```

Manual smoke checks to keep in mind:

- Onboarding appears on a fresh install.
- Cat profile can be saved.
- Multi-cat selection and item filtering behave correctly.
- Inventory item creation validates required fields and URLs.
- Remaining days and status change with amount/daily usage.
- Items sort by soonest depletion first.
- Replenishment creates purchase history and resets dates/amount.
- Monthly purchase total excludes entries without price.
- Settings includes notification, legal, affiliate, EC settings, development seed data, and data reset entries.

### Landing Page

Before finishing substantial LP changes, run from `apps/web/`:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Manual smoke checks to keep in mind:

- The home page renders at mobile width without horizontal scrolling.
- CTA links jump to the signup form.
- Signup validates required email and email format.
- Signup success message appears after submission.
- FAQ items open and close.
- `/privacy`, `/terms`, and `/affiliate` render.
- OGP metadata exists.

## Store Readiness TODOs

Before App Store / Google Play release, prepare:

- Final privacy policy.
- Final terms of service.
- Final affiliate disclosure wording.
- Final ad integration review, including ad SDK choice, ad unit IDs, test ads, privacy disclosures, and store policy compliance.
- Notification permission explanation review.
- Data safety declarations.
- Store screenshots.
- App icon and splash asset review.
- Store description.
- Copy review to avoid being mistaken for a veterinary or medical app.
- Configure and verify Supabase Auth providers for release, especially Apple Sign in with Apple settings, redirect URLs, Apple Developer identifiers/keys, and iOS bundle ID alignment.
- Review npm audit findings and plan a staged Expo SDK / React Native upgrade; do not use `npm audit fix --force` as a release shortcut.

## LP Readiness TODOs

Before public promotion, prepare:

- Formal privacy policy.
- Formal terms of service.
- Confirmed affiliate disclosure.
- Signup form storage destination.
- GA4 / Clarity tracking.
- Final OGP image.
- Store links after App Store / Google Play release.
- Real app screenshots replacing mock UI where appropriate.
