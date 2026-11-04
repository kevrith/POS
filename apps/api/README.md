# KASTRA POS — API

NestJS 10 + Prisma 5 backend. Single service for all nine client apps.

- Base URL: `http://localhost:3010/api/v1`
- Swagger: `http://localhost:3010/api/docs`
- Health: `GET /api/v1/health` · config presence: `GET /api/v1/health/config`

---

## Run

```bash
npm install
npx prisma generate --schema ../../prisma/schema.prisma
npx prisma migrate deploy --schema ../../prisma/schema.prisma
npx ts-node src/seed.ts        # light seed (idempotent); ../../prisma/seed.ts is the full, destructive one
npm run start:dev              # tsc --watch + node --watch on dist/main.js
```

`start:dev` compiles with `tsc --watch` and runs the emitted JS (not `nest start`),
so a type error surfaces in the compiler output rather than silently keeping the old
build alive.

| Script | Purpose |
|---|---|
| `npm run start:dev` | Watch-mode dev server (:3010) |
| `npm run build` | `tsc` + `tsc-alias` → `dist/` (prebuild also builds `@pos/shared`) |
| `npm start` | Run the built server |
| `npm test` | Jest unit tests |
| `npm run test:e2e` | e2e suite (`jest-e2e.json`) |
| `npm run test:cov` | Coverage |

---

## Bootstrap ([src/main.ts](src/main.ts))

- Global prefix `api`, URI versioning with default version `1` → every route is
  `/api/v1/...`.
- `rawBody: true` — required so the Paystack webhook signature can be verified
  against the unparsed body.
- Helmet security headers. CSP and COEP are off (Swagger UI), COOP is off (the
  Google OAuth popup polls `window.closed` on the opener).
- CORS allows `FRONTEND_URL`, `ADMIN_URL`, anything in `EXTRA_ORIGINS`, any
  `*.vercel.app` preview, and origin-less requests (mobile apps, curl, health checks).
- Socket.IO adapter for WebSocket / LAN sync.
- `AllExceptionsFilter` as a global filter. It keeps the status of `HttpException`s and
  maps Prisma request errors to client errors (`PrismaClientValidationError` -> 400,
  `P2025` -> 404, `P2002`/`P2003` -> 409). Anything else is a 500 with a generic
  message in production; Prisma messages embed the failing query, so they are logged,
  never returned.

`GET /api/v1/health/config` reports which env vars are **set** as booleans only —
never values — so a deployment can be verified at a glance without leaking secrets.

---

## Auth & guards ([src/auth/](src/auth/))

| Guard | Responsibility |
|---|---|
| `JwtAuthGuard` | Validates the bearer token, populates `AuthUser` |
| `TenantGuard` | Scopes the request to `businessId`. **Mandatory on every endpoint** |
| `RolesGuard` | Role-based access (`@Roles(...)`) |
| `SubscriptionGuard` | Enforces the plan tier; ends trials that have expired |

Login paths:

- **Email + password** → 15-minute access token
- **PIN** → 12-hour token (shop-floor sessions)
- **Google OAuth** (`google.strategy.ts`)
- **TOTP** second factor, **WebAuthn** (`webauthn.controller.ts`)
- **Phone OTP** for customers (customer portal, rate-limited). Numbers are
  canonicalized to `254XXXXXXXXX` by `common/phone.ts` before any lookup, and
  a failed SMS fails the request rather than silently reporting `sent: true`
- **Affiliate JWT** (`src/affiliate/affiliate-jwt.guard.ts`) — separate audience
- **Super admin** — `POST /api/v1/super-admin/login`, own guard

`POST /auth/refresh` requires a token that is **still valid**. Clients refresh
proactively; a 401 means log out, not retry.

`JwtPayload` and `AuthUser` both carry `planName`, so plan gating needs no extra
lookup.

---

## Plan enforcement

Gating exists in **two layers**, and both must be updated when you add a paid feature:

| Layer | Where | Enforces |
|---|---|---|
| Server | `SubscriptionGuard` + `@RequiresFeature(...)` | The actual access decision |
| Client | `apps/web/src/lib/featureGates.ts` | Sidebar filtering and page-level UX |

The client map is a **convenience, not a control** — it hides nav items. The server
decorator is what stops a request.

Decorate a controller (or a single handler) with the feature it sells:

```ts
import { Feature } from '@pos/shared';
import { RequiresFeature } from '../auth/subscription.guard';

@RequiresFeature(Feature.BUNDLES)
@Controller('bundle')
@UseGuards(JwtAuthGuard, TenantGuard)
export class BundleController { … }
```

`SubscriptionGuard` reads the decorator via `Reflector`, resolves the business's
`SubscriptionTier`, and calls `hasFeatureAccess(tier, feature)` from
[`@pos/shared`](../../packages/shared/README.md). The `Feature` enum and the
tier → feature map live in
`packages/shared/src/permissions/subscription-features.ts`; `getFeatureLimit` returns
numeric caps (stores, users) for the tier.

Trials get full access until they expire; after that the business's
`subscriptionTier` is enforced. Gifted ("comped") subscriptions grant a tier without
recording revenue.

---

## Modules

60+ feature modules registered in [src/app.module.ts](src/app.module.ts):

**Core** — `auth` `business` `items` `inventory` `sales` `customers` `payments`
`reports` `prisma`

**Fiscal & compliance** — `etims` `audit` `kdpa` `security` `api-keys`

**Inventory depth** — `batch` `serial` `bundle` `recipe` `stocktake` `transfers`
`damaged-goods` `supplier` `rfq`

**Hospitality & hotel** — `hospitality` `housekeeping` `channel-manager` `events`
`waitlist` `appointments`

Kitchen tickets (`hospitality/orders/:id/kot`, `hospitality/kot/:id/status`,
`hospitality/kds/orders`):
- one ticket per station (`KITCHEN` / `BAR` / `DESSERT`, from `Item.station` or inferred
  by `inferStation` in `@pos/shared`), numbered per store per service day (`KotCounter`);
- lines are claimed with `OrderItem.sentToKitchenAt`, so a repeated send is refused rather
  than duplicated (`firedAt` is the course-fire marker and is not used for this);
- status changes follow `KOT_TRANSITIONS`; an unchanged status is a no-op, a lost race is a 409;
- cancelling an order cancels its open tickets; voiding a sent line needs a manager and
  pulls it off its ticket (`kot_voided` socket event);
- every order, ticket and store id is checked against the caller's business, and
  `HospitalityAccessGuard` (on the hospitality, housekeeping and waitlist controllers) refuses
  restaurant routes (tables, orders, kitchen, kds, kot, reservations, bar-tabs, happy-hours,
  revpash, waitlist) unless the till is a restaurant till or `RESTAURANT` is in
  `Business.enabledModules`, and hotel routes (hotel-rooms, room-bookings, folio-charges,
  housekeeping, housekeeping-assignments, hotel-dashboard) unless the till is `HOSPITALITY` or `HOTEL` is enabled;
- the socket gateway verifies the JWT and joins a client only to its own business room.

Trust boundaries in `hospitality` (the global `TenantGuard` already rejects a foreign
`businessId`/`storeId` in the query, params or body; these cover everything it cannot see):
- routes that name a thing only by id (table, order, tab, room, booking, folio charge,
  happy hour, reservation, waitlist entry, housekeeping assignment) look it up with the
  caller's business and answer 404 otherwise; a body `storeId`/`roomId`/`tableId` is checked
  the same way, and the waiter, poster and assigner come from the login, not the body;
- order and bar-tab lines are priced from the menu (`priceLines`): name and unit price are
  read from `Item`, quantity must be a whole number 1 to 999, and priced modifiers must be
  non-negative and capped. There is no modifier catalogue, so a modifier price is bounded, not verified;
- a tab settles once (claimed inside the transaction) and only when payments cover it;
- checkout looks items up within the business, rejects non-positive quantities and
  out-of-range discount/tip/service charge, and requires a `NORMAL` sale's payments to cover its total;
- when a checkout names an `orderId`, `SalesService.createSale` ignores the client's cart and builds the
  sale from the order's own lines (price plus priced modifiers, times quantity), links `Sale.orderId`
  (unique, so an order has at most one sale) and claims the order `OPEN`/`BILL_REQUESTED` -> `PAID`
  inside the sale's transaction, so a failure rolls back both and two tills cannot both pay it;
  an optional `expectedTotalCents` makes it refuse (409) if the bill has moved on since the payer was shown it
  (the phone sends it; the web till does not);
- a PIN must be unique within a business (`assertPinAvailable`); a PIN shared before that
  rule logs nobody in without a `userId` (the staff picker passes it) and cannot attribute a manager override.

**Verticals** — `pharmacy` `prescriptions` `fuel-pump` `cybercafe`

**Money** — `expense` `budget` `ledger` `cheque` `layaway` `gift-cards` `loyalty`
`promotions` `payment-links` `subscription` `cash-drawer`

**People** — `hr` `disciplinary`

**Distribution** — `field-sales` `delivery` `delivery-routes` `franchise`

**Customer-facing** — `portal` `customer-portal` `nps` `notifications` `push`

**Platform** — `super-admin` `affiliate` `referrals` `integrations` `webhooks`
`email` `printers` `queue` `backup` `report-schedules`

---

## Database

Schema is `../../prisma/schema.prisma` (151 models) — the single source of truth.
The API does **not** own a schema copy.

```bash
npx prisma migrate dev --schema ../../prisma/schema.prisma --name <change>   # author
npx prisma migrate deploy --schema ../../prisma/schema.prisma                # apply
npx prisma validate --schema ../../prisma/schema.prisma
```

History is consolidated onto the base migration `20260314000000_init`.

Non-negotiable data rules:

- **Money in integer cents.** Never a float, never a Decimal-as-string round trip.
- **Stock is a ledger.** Write an `InventoryMovement`; never mutate a stock column.
- **`offlineId` (UUID)** on every offline-creatable record. The service layer
  deduplicates on it, so a replayed mobile/desktop request is a no-op instead of a
  duplicate sale, order or payment.
- Secrets at rest (M-Pesa and eTIMS credentials) are AES-256-CBC encrypted with
  `ENCRYPTION_KEY` (64 hex chars).

---

## Environment

Copy `.env.example` → `.env`. Required: `DATABASE_URL`, `JWT_SECRET`,
`ENCRYPTION_KEY`, `FRONTEND_URL`, `ADMIN_URL`. Everything else is optional and
disables its feature when blank — see the table in the [root README](../../README.md#environment-variables).

`.env` is never committed.

---

## Testing

```bash
npm test                # unit
npm run test:e2e        # e2e (--forceExit)
```

To exercise real endpoints without touching a shared database, run a throwaway
Postgres (`initdb` in a temp dir, `listen_addresses=127.0.0.1`), `prisma migrate
deploy --schema prisma/schema.prisma` against it, seed, and start the built API with a
scrubbed environment (explicit `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`,
`ENCRYPTION_KEY`, run from a directory with no `.env`) so no real M-Pesa, SMS or email
credentials load. The seeded business trial expires into the FREE tier, so set it to
ENTERPRISE first or most routes answer 403.

CI runs the unit suite and a full build against a live PostgreSQL service on every
push (`.github/workflows/ci.yml`).

---

## Gotchas

- **Two `@Controller('portal')` classes exist.** The public `portal/` module
  registers first and wins for bare `/portal/*` routes; authenticated customer
  routes are namespaced under `/portal/me/*`.
- **Customers are nested** under `businesses/:businessId/customers`.
- **`Shift` has no `employee` relation; `POItem` has no `item` relation** — fetch by
  id separately.
- Item-name fields vary by model: `SaleItem.name`, `OrderItem.name`,
  `StocktakeCount.itemName`, `FieldOrderItem.itemName`.
- Without `REDIS_HOST`, BullMQ falls back to synchronous execution — fine for dev,
  not for production throughput.
- **`Customer.phone` is stored canonically only where the portal has touched it.**
  Every other write path (POS, field sales, CSV import) still stores the number as
  typed; portal login matches all four shapes via `kePhoneVariants()` and rewrites
  the row on first login. Match on variants, never on an exact string.
- **Rate limits are per client IP, which needs `trust proxy`.** `main.ts` sets it
  from `TRUST_PROXY` (default `1` in production). Without it every request behind a
  load balancer reports the balancer's address and a per-IP limit becomes global.
  `AppThrottlerGuard.getTracker` reads `req.ip`, not the library's spoofable
  `req.ips[0]`.
- **Throw `HttpException` subclasses, never a plain `Error`, for anything a client can
  cause.** A plain `Error` is a 500. There is no global `ValidationPipe`, so use
  `requireArray` / `requireString` from `common/validate.ts` at service entry points
  that take a body field you then dereference.
- **Declare literal routes before `:param` routes in a controller.** Nest matches in
  declaration order; `:id/sync-sale` placed first used to swallow
  `quickbooks/sync-sale`, `xero/sync-sale` and `woocommerce/sync-sale`.
- **Public portal payments trust nothing from the client.** `portal/pay-order` charges
  the order's own `totalCents` (looked up by `orderNumber`) and stores the
  `checkoutRequestId` on the order; `confirm-payment` only accepts that same id.
- **Printers are tenant-scoped and LAN-only.** Every `/printers` route needs a login and
  resolves the printer through its store's `businessId`. `POST /printers/:id/print` opens
  a raw TCP connection from the API host, so it only accepts private IPv4 addresses
  (`printers/network-target.ts`); loopback, link-local and public hosts are refused. The
  API host must share a network with the printer.
- **Print jobs are queued, audited and retried (`print-jobs/`).** `POST /print-jobs` queues ESC/POS bytes for a
  LAN printer: with `PRINT_DELIVERY_MODE=direct` (default) the server sends at once and only queues a failure;
  with `queue` (cloud) a print bridge delivers. The bridge is a desktop till on the shop network: `POST
  /print-jobs/claim` takes jobs under a conditional UPDATE lock (one bridge per job), `POST /print-jobs/:id/result`
  reports back, failures retry with 5 s, 10 s, 20 s... backoff up to 5 attempts, then FAILED. Jobs expire (drawer
  pulse 2 min, kitchen ticket 15 min, receipt 24 h) so a stale ticket never prints late. The bridge only ever gets
  a printer's private IP literal. Prints made on the till itself (browser, USB, Bluetooth, installed printer) are
  logged with `POST /print-jobs/log`, and `POST /print-jobs/receipt-copy` counts how often a sale's receipt has been
  printed so reprints are marked COPY. Listing, retry and cancel are owner/manager only; payloads are never listed.
  `scripts/print-queue.e2e.ts` runs the whole flow against a throwaway Postgres.
- Migrations must match `schema.prisma`: check with `prisma migrate diff --from-url
  <scratch db> --to-schema-datamodel prisma/schema.prisma`. `WebAuthnCredential` once
  existed only through `db push`.

---

When you add or change an endpoint, module, guard or env var, update this README in
the same change.
