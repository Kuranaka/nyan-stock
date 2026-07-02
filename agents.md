# Agent Notes

## Project Overview

This repository is an Expo / React Native / TypeScript app named `にゃんストック`.
The app helps cat owners track household cat-supply inventory, estimate remaining days, receive local notifications, and reopen registered purchase links.

## Tech Stack

- Expo SDK 51
- React Native 0.74
- TypeScript with `strict` enabled
- Expo Router under `app/`
- AsyncStorage for local-only persistence
- Expo Notifications for local reminders
- Expo WebBrowser for external purchase links
- date-fns for date calculations
- ESLint and Prettier

## Useful Commands

Run these from the repository root:

```bash
npm install
npm start
npm run ios
npm run android
npm run lint
npx tsc --noEmit
npx expo export --platform ios
```

If `expo start` appears to hang in the sandbox, run it with escalated local process/network permissions. A successful start prints a Metro URL such as `exp://127.0.0.1:8081`.

## Directory Map

- `app/`: Expo Router route entries.
- `src/screens/`: Full screen implementations.
- `src/components/`: Shared UI components.
- `src/constants/`: Colors, category labels, units, and default unit mapping.
- `src/features/cats/`: Cat types and storage helpers.
- `src/features/inventory/`: Inventory types, storage, calculations, and purchase link helpers.
- `src/features/notifications/`: Local notification permission and scheduling helpers.
- `src/features/settings/`: Settings types and storage helpers.
- `src/utils/`: Date and validation helpers.
- `src/data/`: Development seed helpers.

## Implementation Guidelines

- Keep screens out of direct storage details. Use the storage modules in `src/features/**`.
- Keep inventory math in `src/features/inventory/inventoryLogic.ts`.
- Keep purchase URL handling in `src/features/inventory/purchaseLink.ts`.
- Do not add login, server sync, cloud storage, product-search APIs, barcode scanning, OCR, or AI diagnosis unless explicitly requested.
- Preserve the local-first privacy model: no address, phone number, exact location, or account data.
- Avoid veterinary or medical claims. Use wording like "記録する", "変化に気づきやすくする", and "気になる場合は獣医師に相談".
- Purchase-link UI must keep the affiliate disclosure visible near buy buttons.
- Delete and data-reset flows must keep confirmation dialogs.

## Data Model Notes

The app currently supports one cat in the UI, but inventory items already carry `catId` so multi-cat support can be added later.

Inventory status rules:

- Missing or non-positive `dailyUsage`: `unknown`
- Remaining days `<= 0`: `out`
- Remaining days `<= 3`: `warning`
- Remaining days `<= 7`: `watch`
- Remaining days `>= 8`: `in_stock`

`openedDate` is used as the calculation base when available; otherwise `purchaseDate` is used.

## Verification Checklist

Before finishing substantial changes, run:

```bash
npx tsc --noEmit
npm run lint
```

For routing or Metro/Babel changes, also run:

```bash
npx expo export --platform ios
```

Manual smoke checks to keep in mind:

- Onboarding appears on a fresh install.
- Cat profile can be saved.
- Inventory item creation validates required fields and URLs.
- Remaining days and status change with amount/daily usage.
- Items sort by soonest depletion first.
- Replenishment creates purchase history and resets dates/amount.
- Monthly purchase total excludes entries without price.
- Settings includes notification, legal, affiliate, and data reset entries.

## Store Readiness TODOs

Before App Store / Google Play release, prepare:

- Final privacy policy.
- Final terms of service.
- Final affiliate disclosure wording.
- Notification permission explanation review.
- Data safety declarations.
- Store screenshots.
- App icon and splash assets.
- Store description.
- Copy review to avoid being mistaken for a veterinary or medical app.
