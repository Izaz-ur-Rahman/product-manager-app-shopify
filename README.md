# Product Manager App

An embedded Shopify app that lets a merchant view, search, and edit their store's products directly from inside the Shopify Admin, while keeping Shopify itself as the single source of truth for all product data. Built for the "Shopify Application Developer" technical assessment.

## What this app does

- Authenticates with Shopify using OAuth and keeps a secure session per store.
- Shows a **Product Dashboard** with real product data pulled live from Shopify's Admin GraphQL API — image, title, SKU, price, inventory, and status — with server-side search and cursor-based pagination.
- Shows a **Product Details** page for a single product, including its full description, images, and all variants.
- Lets a merchant **edit** a product's title, description, status, product type, and vendor, saving the change back to Shopify itself via a GraphQL mutation (not just to a local copy).
- Keeps its own **activity log** (`ProductActivity` table) recording every edit made through the app, separate from Shopify's own data.
- Listens for a Shopify **`products/update` webhook**, so the activity log also captures changes made outside the app (e.g. edited directly in Shopify Admin, or by another app).
- Handles the usual failure modes gracefully: Shopify API errors, network failures, invalid/missing products, invalid form input, and failed webhook verification all show a clear message instead of crashing.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Remix / React Router v7 ("React Router app" — Shopify's officially recommended embedded app architecture) |
| UI | Shopify Polaris web components (`s-page`, `s-section`, etc.) + plain HTML/CSS for custom controls |
| API | Shopify Admin GraphQL API |
| Backend | Node.js (via the React Router / Remix server, using `loader`/`action` route exports) |
| Database | SQLite via Prisma ORM (stores Shopify sessions and the app's own `ProductActivity` log) |
| Shopify tooling | Shopify CLI (`@shopify/cli`), `shopify app dev` for local development with a secure tunnel |

## Project structure (relevant files)

```
app/
  shopify.server.js               Shopify app config: API key/secret, scopes, session storage
  db.server.js                    Singleton Prisma client
  routes/
    app.jsx                       Parent layout route — runs authenticate.admin() for every page,
                                   defines the shared ErrorBoundary for all child routes
    app._index.jsx                Product Dashboard (search, pagination, list)
    app.products.$id.jsx          Product Details + Edit Product page
    webhooks.products.update.jsx  Handles the products/update webhook
    webhooks.app.uninstalled.jsx  Scaffold-provided: cleans up sessions on uninstall
    auth.$.jsx                    Scaffold-provided: OAuth callback route
prisma/
  schema.prisma                   Session model (scaffold) + ProductActivity model (added by us)
shopify.app.toml                  App config: scopes, webhook subscriptions
.env.example                      Template of required environment variables (no real secrets)
```

## Environment variables

Copy `.env.example` to `.env` and fill in real values (never commit `.env` — it's already excluded via `.gitignore`):

- `SHOPIFY_API_KEY` — the app's Client ID, from the Partner Dashboard or `shopify.app.toml`.
- `SHOPIFY_API_SECRET` — the app's Client Secret, from the Partner Dashboard. Never exposed to the frontend — only ever read inside `.server.js` files, which the framework guarantees run server-side only.
- `SCOPES` — comma-separated Shopify Admin API scopes the app needs (currently `write_products,write_metaobjects,write_metaobject_definitions`).
- `SHOPIFY_APP_URL` — the app's public URL. In local development, the Shopify CLI sets/updates this automatically to the current tunnel URL each time you run `npm run dev`.
- `DATABASE_URL` — Prisma's connection string. Defaults to the local SQLite file (`file:dev.sqlite`) for development.

## Setup / installation instructions

1. **Prerequisites**: Node.js `>=20.19` (or `>=22.12`), a Shopify Partner account, and a development store (see below if you don't have these yet).
2. **Install dependencies**:
   ```
   npm install
   ```
3. **Set up environment variables**: copy `.env.example` to `.env` and fill in your app's API key/secret (get these from the Partner Dashboard, or they're auto-filled if you scaffolded the app with `shopify app init`).
4. **Set up the database**:
   ```
   npx prisma migrate dev
   ```
   This creates the local SQLite database and applies all migrations, including the `ProductActivity` table.
5. **Link the app to your Shopify Partner app record** (only needed once, or if switching machines):
   ```
   npm run config:link
   ```
6. **Run the app locally**:
   ```
   npm run dev
   ```
   This starts the Shopify CLI, opens a secure tunnel, and prompts you to pick which development store to preview against. Press `p` in the terminal to open the app in your browser, embedded inside that store's Shopify Admin.
7. **Import sample products** (if your development store is empty): in Shopify Admin, go to Products → Import, and upload a sample product CSV (for example from Shopify's public [shopify-product-csvs-and-images](https://github.com/Shopify/shopify-product-csvs-and-images) repo).

### If you don't have a Partner account / development store yet

1. Create a free account at [partners.shopify.com](https://partners.shopify.com), choosing "Build apps" as your focus.
2. From the Partner Dashboard, create a development store (choose the "Dev" store type and the free plan).
3. Install the Shopify CLI: `npm install -g @shopify/cli@latest`.
4. From the project folder, run `shopify app init` if scaffolding fresh, or `npm run dev` if the project already exists (as in this repo) — either way it will prompt you to log in and pick a development store.

## Database schema

**`ProductActivity`** (the app's own table — Shopify itself is never touched by this table; it exists purely for this app's internal audit trail):

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | Primary key |
| `shop` | String | The store's `.myshopify.com` domain this activity belongs to |
| `productId` | String | The Shopify product's global ID (`gid://shopify/Product/...`) |
| `action` | String | What happened, e.g. `title_updated`, `vendor_updated`, `webhook_products_update` |
| `oldValue` | String? | Previous value, when known (null for webhook-sourced rows) |
| `newValue` | String? | New value, or a short description for webhook-sourced rows |
| `createdAt` | DateTime | Set automatically to the time of the row's creation |

Indexed on `shop` and `productId` for fast lookups. One row is written per changed field on every in-app edit, and one row per received webhook event.

**`Session`** — provided by the Shopify scaffold, used internally by `PrismaSessionStorage` to persist OAuth access tokens per store. Not modified for this assessment.

To inspect the database visually at any time: `npx prisma studio` (opens a browser-based table viewer).

## Shopify app configuration

Configured in `shopify.app.toml`:

- **Scopes**: `write_products` (read/write product data), plus `write_metaobjects`/`write_metaobject_definitions` (scaffold defaults, unused by this app's own features).
- **Webhook subscriptions**:
  - `app/uninstalled` — scaffold-provided, cleans up the store's session when the app is uninstalled.
  - `app/scopes_update` — scaffold-provided, keeps the stored scopes in sync if a merchant changes app permissions.
  - `products/update` — added for this assessment. Delivered to `/webhooks/products/update`, logged into `ProductActivity`.
- **Embedded**: `true` — the app runs inside the Shopify Admin's iframe rather than as a standalone page.

## Webhook testing instructions

1. Make sure the dev server is running (`npm run dev`) with the tunnel active.
2. Open your development store's **native** Shopify Admin (not the embedded app) — the URL looks like `https://<your-store>.myshopify.com/admin/products`, with no `/apps/` segment in it.
3. Open any product there and change something (e.g. its title or status), then save.
4. Shopify sends a `products/update` webhook to `/webhooks/products/update`. The handler verifies the request's HMAC signature via `authenticate.webhook(request)` before trusting it, then writes a `webhook_products_update` row into `ProductActivity`.
5. Confirm it arrived: run `npx prisma studio`, open the `ProductActivity` table, and look for a new row with `action = webhook_products_update` and the product's title in `newValue`.
6. It's normal to occasionally see the same event logged twice — Shopify guarantees **at-least-once** delivery for webhooks, so duplicate deliveries can happen and are expected, not a bug.

Editing the product through this app's own Edit Product form is a *different* test — it exercises the GraphQL mutation path (Phase 5/6), not the webhook path. Testing the webhook specifically requires making the change somewhere Shopify considers "external" to this app, such as its native Admin product page.

## Architecture & key decisions

- **Shopify stays the source of truth.** All product data (title, description, status, variants, etc.) is always read fresh from Shopify's Admin GraphQL API and written back to Shopify via a mutation. The local database never stores a cached copy of product data — only the app's own activity log, which is data that has no equivalent in Shopify itself.
- **`loader` vs `action`.** Every route that reads data exports a `loader` (runs on GET); every route that changes data exports an `action` (runs on POST, i.e. form submissions). This is the core React Router/Remix convention and keeps read and write logic cleanly separated.
- **Server-only secrets.** Anything touching the Shopify API key/secret or the database lives in files ending in `.server.js`, a naming convention the framework uses to guarantee that code is stripped out of the browser bundle and only ever runs on the server.
- **Cursor-based pagination**, not page numbers, because that's how Shopify's GraphQL Admin API is designed — `pageInfo.hasNextPage`/`hasPreviousPage` tell the UI exactly when it's reached either end of the list without needing a separate "total count" query.
- **Real buttons over links for navigation.** Every navigation action (viewing a product's details, paging through results, going back to the dashboard) uses a styled `<button>` with React Router's `useNavigate()`, rather than anchor-tag links — this was a deliberate UI choice made during development, and it also makes disabling Previous/Next at the ends of the list straightforward via the native `disabled` attribute.
- **Comparing hidden original values on save**, rather than re-fetching from Shopify a second time before logging, keeps the edit action to a single round-trip while still accurately detecting which fields actually changed.
- **A shared `ErrorBoundary`** is defined once, in the parent `app.jsx` layout route, and automatically protects every child route (dashboard, details page, and any future page) rather than needing to be repeated per file.

## Known limitations / out of scope

- Duplicate webhook deliveries are not de-duplicated (would typically be done via the webhook's delivery ID in a production app) — acceptable for this assessment since Shopify's delivery guarantee is explicitly "at least once."
- No automated test suite was written; verification was done manually against the live development store at each phase.
- UI uses Polaris web components and plain styled HTML rather than the full Polaris React component library, to keep the implementation framework-light given the assessment's time scope.
