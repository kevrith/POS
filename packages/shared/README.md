# @pos/shared

Single source of truth for TypeScript enums, role/permission definitions and money
helpers used across the API, web and admin apps.

Everything lives in [index.ts](index.ts), with `src/permissions/subscription-features.ts`
holding the plan-feature matrix.

---

## Build

```bash
npm run build      # tsc → dist/
npm run dev        # tsc --watch
```

The package publishes `dist/` (`main`, `types`, `exports` all point there), so
**it must be built before the API compiles**. `apps/api`'s `prebuild` script does this
for you; if you hit "cannot find module '@pos/shared'", build this package.

---

## Money helpers — read this first

Prices are stored as **integer cents** everywhere in the system. Never a float.

| Function | Purpose |
|---|---|
| `formatKES(cents)` | The only correct way to display money |
| `decimalToCents(amount)` / `centsToDec(cents)` | Boundary conversion |
| `calculateVAT(inclusiveAmountCents)` | VAT is **inclusive** — extracts `amount × 16 / 116`, does not add on top |
| `calculateTOT(inclusiveAmountCents, ratePct = 3)` | Turnover tax for non-VAT businesses |
| `calculateServiceCharge(...)` | Hospitality service charge line |
| `calculateWeightedPrice(...)` | Weighed items (scale input) |

Also: `isExpired` / `isExpiringSoon` (batch and FEFO logic), `formatDate` /
`formatDateTime`, `formatReceiptNumber`, `formatPONumber`.

---

## Enums

Mirrors of the Prisma enums so client code never hardcodes a string literal —
`SaleStatus`, `SaleType`, `ItemType`, `InventoryMovementType`, `UserRole`, and more.

`InventoryMovementType` is worth knowing in full: every stock change is a movement
(`SALE`, `RETURN`, `VOID`, `ADJUSTMENT`, `IMPORT`, `LAYAWAY_*`, `BUNDLE_SALE`,
`RECIPE_DEDUCTION`, `BATCH_RECEIPT`, …). Stock is a ledger — never write a stock
column directly.

---

## Roles & permissions

- `UserRole` — the full role enum.
- `FIELD_ROLES` — `[DRIVER, SALES_AGENT]`, the roles that work outside the shop.
- `ROLE_PERMISSIONS` — role → permission strings, the basis of RBAC.
---

## Plan features (`src/permissions/subscription-features.ts`)

Re-exported from the package root, so `import { Feature } from '@pos/shared'` works.

- `SubscriptionTier` — `FREE` `STARTER` `GROWTH` `PRO` `ENTERPRISE`.
- `Feature` — the sellable capability enum (`POS`, `BATCH_TRACKING`, `KDS`,
  `MULTI_STORE`, `FIELD_SALES`, `PAYROLL`, `WEBHOOKS`, `API_KEYS`, …).
- `hasFeatureAccess(tier, feature)` — the access decision.
- `getFeatureLimit(tier, …)` — numeric caps (stores, users).

This is the **authoritative** gate: the API's `SubscriptionGuard` calls
`hasFeatureAccess` for every controller marked `@RequiresFeature(Feature.X)`.

`apps/web/src/lib/featureGates.ts` is a **separate, client-side** map keyed by route
segment. It only filters the sidebar and page UX — it controls nothing. Adding a paid
feature means touching **both**: the `Feature` enum + tier map here, and the route key
there.

---

When you add an enum value, a money helper, a role or a plan feature, update this
README in the same change.
