# Agent Notes

## Project Overview

This repository is a monorepo for `にゃんストック`.

`にゃんストック` helps cat owners track household cat-supply inventory, estimate remaining days, receive local notifications, and reopen registered purchase links. The repository also contains a public landing page used for pre-release validation and signup collection.

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
  README.md
  agents.md
```

- `apps/mobile/`: React Native / Expo / TypeScript app.
- `apps/web/`: Next.js / TypeScript / Tailwind CSS landing page.
- Do not put Expo or Next.js app/config files in the repository root.
- Keep Expo Router's `app/` under `apps/mobile/app/`.
- Keep Next.js App Router's `app/` under `apps/web/src/app/`.
- Keep each app's `package.json`, lockfile, and `node_modules` separate.
- Do not force shared packages yet. The structure should allow a future `packages/shared/` for common types/constants.

## Tech Stack

### Mobile App

- Expo SDK 51
- React Native 0.74
- TypeScript with `strict` enabled
- Expo Router under `apps/mobile/app/`
- AsyncStorage for local-only persistence
- Expo Notifications for local reminders
- Expo WebBrowser for external purchase links
- date-fns for date calculations
- ESLint and Prettier

### Landing Page

- Next.js with App Router
- React
- TypeScript with `strict` enabled
- Tailwind CSS
- Vercel deployment target

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

## Vercel Settings

When publishing the LP on Vercel, import the GitHub repository and set:

- Root Directory: `apps/web`
- Build Command: `npm run build`
- Output Directory: `.next`

The default Next.js preset is usually sufficient.

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
- `apps/mobile/src/utils/`: Date and validation helpers.
- `apps/mobile/src/data/`: Development seed helpers.

### Landing Page

- `apps/web/src/app/`: Next.js App Router pages and layout.
- `apps/web/src/components/`: LP sections and reusable UI components.
- `apps/web/src/lib/`: Signup and analytics helper functions.
- `apps/web/public/`: Static public assets such as OGP placeholders.

## Implementation Guidelines

### Monorepo Boundaries

- Do not run `npm install` at the repository root.
- Do not create root-level Expo `app/`, `app.json`, `babel.config.js`, or mobile `src/`.
- Do not create root-level Next.js `app/`, `next.config.ts`, or web `src/`.
- LP changes belong in `apps/web/`.
- Mobile app changes belong in `apps/mobile/`.
- Do not mix mobile and web dependencies.

### Mobile App

- Keep screens out of direct storage details. Use the storage modules in `apps/mobile/src/features/**`.
- Keep inventory math in `apps/mobile/src/features/inventory/inventoryLogic.ts`.
- Keep purchase URL handling in `apps/mobile/src/features/inventory/purchaseLink.ts`.
- Do not add login, server sync, cloud storage, barcode scanning, OCR, or AI diagnosis unless explicitly requested.
- EC API/product-search integrations are allowed only when explicitly requested and must keep affiliate disclosure visible near purchase/search actions.
- Preserve the local-first privacy model: no address, phone number, exact location, or account data.
- Avoid veterinary or medical claims. Use wording like "記録する", "変化に気づきやすくする", and "気になる場合は獣医師に相談".
- Purchase-link UI must keep the affiliate disclosure visible near buy buttons.
- Delete and data-reset flows must keep confirmation dialogs.

### Landing Page

- Keep the LP as a standalone Next.js site in `apps/web/`.
- Use TypeScript and Tailwind CSS.
- Keep copy in Japanese and avoid veterinary or medical claims.
- Signup form submission can be local-only initially, but keep the submit function easy to connect later to Google Forms, Formspree, Supabase, Firebase, or a custom API.
- Analytics helpers can log to `console.log` initially, but should preserve event names for future GA4 / Clarity work.
- Legal pages may contain placeholder text during development, but must include TODO notes for pre-release legal review.
- Affiliate disclosure must be visible and understandable.

## Data Model Notes

Inventory items carry `catId` for multi-cat support.

Inventory status rules:

- Missing or non-positive `dailyUsage`: `unknown`
- Remaining days `<= 0`: `out`
- Remaining days `<= 3`: `warning`
- Remaining days `<= 7`: `watch`
- Remaining days `>= 8`: `in_stock`

`openedDate` is used as the calculation base when available; otherwise `purchaseDate` is used.

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
- Notification permission explanation review.
- Data safety declarations.
- Store screenshots.
- App icon and splash asset review.
- Store description.
- Copy review to avoid being mistaken for a veterinary or medical app.

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
