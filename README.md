# Super Shop POS

Offline-first **supermarket point of sale** for Bangladeshi retail — a desktop app for Windows,
macOS and Linux. Bangla is the default language (English is one click away), everything runs on
the shop computer with a local SQLite database, and no internet connection is ever needed.

> বাংলা: এটি একটি সম্পূর্ণ অফলাইন সুপারশপ পিওএস সফটওয়্যার। বারকোড স্ক্যান করে বিক্রি, ভ্যাট,
> নগদ/কার্ড/বিকাশ/নগদ/রকেট পেমেন্ট, রিটার্ন, স্টক, ক্রয়, সরবরাহকারী, শিফট ও ক্যাশ, খরচ,
> রিপোর্ট ও রসিদ প্রিন্ট — সব এক জায়গায়। নিচের ডেমো পিন দিয়ে লগইন করুন।

## Features

- **Fast checkout** — barcode scanner support (scanning the same item increases the quantity),
  instant search in Bangla or English, product grid with images (can be turned off for compact
  cards), category bar, keyboard-first flow: **scan → add → pay**.
- **Two cashier layouts** (Settings → POS → Screen layout) — the *product grid* for shops that
  pick items on screen, or the *scan-only counter*: no product cards, one scan box and a wide
  item list like a supermarket checkout, with search suggestions while typing and `3*<barcode>`
  to add three at once.
- **Cart** — quantity steps, weighted items, item and cart discounts (percent or fixed, with
  cashier limits and manager approval), price override with permission, notes, hold and recall
  sales, member discounts.
- **VAT** — inclusive or exclusive, several rates (0 / 5 / 7.5 / 10 / 15 %), exact money math in
  poisha (no floating point errors), configurable rounding.
- **Payments** — cash with quick-cash buttons and change, card, bKash / Nagad / Rocket, loyalty
  points, split payments; insufficient payment is prevented.
- **Receipts** — 80 mm and 58 mm thermal receipts, A4 invoices, preview, reprint, test print,
  save as PDF when no printer is available. Receipts print in the language of the sale.
- **Returns & cancellations** — partial returns, stock restore, refund by original method,
  time windows and manager approval, full audit trail. Completed sales are never edited.
- **Customers & loyalty** — profiles, purchase history, points earning/redemption, VIP and
  wholesale types.
- **Inventory** — stock levels, low/out-of-stock and expiry alerts, stock ledger for every
  movement, adjustments with reasons.
- **Purchases & suppliers** — purchase orders, partial/full goods receiving (GRN), supplier dues
  and payments.
- **Shifts & cash** — open/close shifts per counter, denomination count, expected vs. actual cash,
  cash in/out, expenses, shift reports.
- **Dashboard & 25 reports** — sales, profit, VAT, payments, cashiers, counters, categories,
  brands, products, customers, stock, purchases, expenses, returns and more; print, CSV and JSON
  export.
- **Settings centre** — 29 sections with search: store details, receipt layout, printer, tax,
  payments, loyalty, discounts, shifts, users and permissions, theme, accent colour, fonts, digits,
  shortcuts, sounds, backup/restore and demo data.
- **Roles** — Admin, Manager, Cashier with an editable permission matrix and PIN login.
- **Activity log & profile** — who did what and when (sales, prices, stock, cash, settings) with
  filters and CSV export; each staff member keeps their own language, theme, fonts and PIN.
- **Looks** — dark theme by default, light theme, high contrast, 8 accent colours, density and
  font size options, focus mode for the cashier screen.

## Demo accounts

The first start creates a realistic demo shop (1,300+ products, 560 customers, 45 days of sales,
shifts, purchases, returns and expenses). Sign in with:

| User | Role | PIN |
| --- | --- | --- |
| Rahim (রহিম) | Admin | `1111` |
| Nusrat (নুসরাত) | Manager | `2222` |
| Karim (করিম) | Cashier | `3333` |
| Sadia (সাদিয়া) | Cashier | `4444` |
| Hasan (হাসান) | Cashier | `5555` |

Change the PINs in **Settings → Users** before using the app in a real shop, and use
**Settings → Data → Clear all data** to start with an empty shop.

## Requirements

- Node.js 22.12 or newer (for development and building only — the installed app bundles its own
  runtime).
- Windows 10/11, macOS 12+, or a modern Linux desktop.

## Run and build

```bash
npm install          # installs dependencies and the Electron runtime
npm run dev          # development with hot reload (separate "Super Shop POS Dev" data folder)
npm start            # production build + run
npm run verify       # type check + lint + unit tests + build
npm run test:e2e     # end-to-end tests against the real Electron app

npm run dist:win     # Windows installer  → release/<version>/Super Shop POS-Setup-<version>.exe
npm run dist:mac     # macOS DMG (build on a Mac)
npm run dist:linux   # Linux AppImage
npm run build:electron  # unpacked app folder (quick local check)
npm run shots        # after a build: screenshots of every screen → screenshots/
```

If `npm install` could not download Electron (offline or proxy), run
`node node_modules/electron/install.js` once you are online again.

## Keyboard shortcuts

| Key | Action | Key | Action |
| --- | --- | --- | --- |
| F1 | Sell (POS) | F7 | Hold sale |
| F2 | Products | F8 | Held sales |
| F3 | Sales history | F9 | Payment |
| F4 | Customers | F10 | Discount |
| F5 | Refresh | F11 | Full screen |
| F6 | Reports | Ctrl+K | Search everything |
| Ctrl+Enter | Complete payment | Delete | Remove selected item |
| + / − | Change quantity | Ctrl+/ | Show all shortcuts |

All shortcuts can be changed in **Settings → Keyboard shortcuts**.

## Where data is stored

Everything stays on this computer, in the app data folder
(`%APPDATA%\Super Shop POS` on Windows, `~/Library/Application Support/Super Shop POS` on macOS,
`~/.config/Super Shop POS` on Linux):

| Path | Contents |
| --- | --- |
| `data/supershop.db` | Shop database (SQLite): products, sales, customers, stock, shifts… |
| `config.json` | Settings for this computer (theme, language, printer, counter) |
| `backups/` | Automatic safety copies made before a reset or import |
| `logs/main.log` | Diagnostic log |

**Backups:** Settings → Data → *Back up now* saves one JSON file with all shop data. *Import
backup* checks the file, shows what it contains and asks for confirmation before replacing data.
Uninstalling the app keeps the data folder.

## Printing

Out of the box every print job opens the app's own preview first (printer, copies, print or save
as PDF). For a busy counter turn on **Auto print** in **Settings → Printer**: receipts then go
straight to the receipt printer chosen there (80 mm or 58 mm paper). Use *Test print* there to
check alignment. When printing fails the app offers to save the document as a PDF instead, and a
completed sale is never undone by a printing problem.

## Customising the look and the brand

Everything visual is defined in one place:

| What | Where |
| --- | --- |
| Colours (dark, light, high-contrast), radius, shadows, spacing | `src/styles/tokens.css` |
| Accent colour presets, fonts, font sizes, card sizes | `src/config/theme.config.ts` |
| App name, version, description | `package.json` (`productName`, `version`) |
| Default shop name, address, VAT, receipt text, rules | `src/config/defaults.ts` |
| Limits, numbering prefixes, timing, demo data volume | `src/config/app.config.ts` |
| Roles and permissions | `src/config/permissions.ts` |
| All texts (Bangla and English) | `src/i18n/locales/{bn,en}/*.ts` |
| App icon | `build/icon.png` (`npm run icons`) |

Most of these can also be changed at runtime in the Settings centre without touching code.
Developer notes (architecture, rules and recipes) are in [`CLAUDE.md`](./CLAUDE.md).

## Troubleshooting

- **The app starts as plain Node / "electron is not a function"** — some terminals set
  `ELECTRON_RUN_AS_NODE=1`. Clear it (`set ELECTRON_RUN_AS_NODE=` on Windows) and start again.
- **Nothing prints** — pick the printer again in Settings → Printer, run *Test print*, or save as
  PDF. Check `logs/main.log` for the printer error.
- **Start fresh** — Settings → Data → *Reset demo data* or *Clear all data* (a safety copy is
  written to `backups/` first).
