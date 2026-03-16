# KASTRA POS — Enterprise Point of Sale for Kenya

Enterprise-grade, offline-first, KRA eTIMS-compliant POS system built for Kenyan businesses.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend (Web) | React 18 + TypeScript + Vite + Tailwind CSS |
| Frontend (PWA) | vite-plugin-pwa, Workbox, IndexedDB (Dexie.js) |
| Backend | NestJS 10 + Prisma 5 + PostgreSQL 16 |
| Desktop | Tauri v2 (offline-first, real SQLite queue) |
| Mobile (Staff) | Expo React Native (iOS + Android) |
| Mobile (Customer) | Expo React Native — self-service ordering |
| Mobile (Driver) | Expo React Native — delivery management |
| State Management | Zustand + TanStack Query v5 |
| Queue / Jobs | BullMQ + Redis (optional — falls back to sync) |
| Auth | JWT + PIN sessions + TOTP + Google OAuth |
| Payments | M-Pesa STK/QR, Paystack Card, Split, Gift Cards, Bank Transfer |
| Fiscal | KRA eTIMS (sandbox + production), VAT/TOT, VSCU |

---

## Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 16+
- Redis (optional — for background job queues)

---

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Create PostgreSQL database

```bash
sudo -u postgres psql << 'EOF'
CREATE DATABASE kastra_pos;
CREATE USER kastra WITH PASSWORD 'kastra2026';
GRANT ALL PRIVILEGES ON DATABASE kastra_pos TO kastra;
ALTER DATABASE kastra_pos OWNER TO kastra;
\c kastra_pos
GRANT ALL ON SCHEMA public TO kastra;
ALTER USER kastra CREATEDB;
EOF
```

### 3. Configure environment

```bash
cp apps/api/.env.example apps/api/.env   # then edit as needed
```

The only required change for local dev is `DATABASE_URL` — it defaults to the PostgreSQL instance above.

### 4. Run migrations + seed

```bash
cd apps/api
npx prisma migrate deploy --schema ../../prisma/schema.prisma
cd ../..
DATABASE_URL="postgresql://kastra:kastra2026@localhost:5432/kastra_pos" npx ts-node prisma/seed.ts
```

### 5. Start all servers

```bash
./start.sh
```

Or individually:

```bash
# API (NestJS) — port 3010
cd apps/api && npm run start:dev

# Web (Vite) — port 3001
cd apps/web && pnpm dev

# Admin (Vite) — port 3002
cd apps/admin && pnpm dev
```

> **Linux users**: If Vite crashes with `ENOSPC`, increase the inotify limit:
> ```bash
> sudo sysctl -w fs.inotify.max_user_watches=524288
> echo 'fs.inotify.max_user_watches=524288' | sudo tee -a /etc/sysctl.conf
> ```

---

## Default Login Credentials (seed data)

| Role | Email | Password | PIN |
|---|---|---|---|
| Owner | owner@premiercafe.co.ke | password123 | 1234 |
| Manager | manager@premiercafe.co.ke | manager123 | 5678 |
| Cashier | cashier@premiercafe.co.ke | cashier123 | 0000 |
| Waiter | waiter@premiercafe.co.ke | waiter123 | 9999 |

**Super Admin Console** (http://localhost:3002): `admin@kastrapos.co.ke` / `kastra-admin-2026`

---

## Project Structure

```
pos/
├── apps/
│   ├── api/            # NestJS backend (port 3010)
│   ├── web/            # React PWA (port 3001)
│   ├── admin/          # Super admin console (port 3002)
│   ├── desktop/        # Tauri desktop app
│   ├── mobile-pos/     # Expo RN — staff cashier app
│   ├── mobile-customer/# Expo RN — self-service ordering
│   └── mobile-driver/  # Expo RN — delivery driver app
├── packages/
│   └── shared/         # Shared TypeScript types + formatKES()
├── prisma/
│   ├── schema.prisma   # PostgreSQL schema (100+ models)
│   ├── seed.ts         # Development seed data
│   └── migrations/     # Prisma migration history
└── start.sh            # One-command dev launcher
```

---

## Key Features

### POS & Sales
- Retail, hospitality, fast-food, supermarket, kiosk modes
- Promotions auto-applied at checkout
- Gift cards, loyalty points (earn + redeem)
- Split payments (Cash + M-Pesa + Card + Bank Transfer)
- M-Pesa STK push + Dynamic QR
- Paystack card payments
- Offline queue — sales sync when connectivity restored
- Camera barcode scanning (ZXing)
- Quick keyboard entry (e.g. `3×500` syntax)
- WhatsApp + SMS receipts (Africa's Talking)
- KRA eTIMS auto-submit after checkout
- Multi-currency with live exchange rates

### Inventory
- Batch management (FEFO, expiry alerts, recall)
- Serial number tracking
- Item variants (size/colour/weight)
- CSV import + barcode label printing
- Bundles + recipe costing
- Supplier POs + GRN + stock transfers
- Stocktake sessions

### Hospitality
- Table management with floor-grouped layouts
- KOT routing (food → kitchen printer, drinks → bar printer)
- Bar tabs, room charge
- Modifiers with prices
- Table reservations, merge, transfer
- Hotel room management + guest folios + housekeeping queue
- Bill printing + checkout invoice

### HR & Payroll
- Employee management with commissions (sales value / transaction count / gross margin)
- Leave management with balance tracking
- Shift scheduling + shift-sales reports
- Full Kenya payroll: PAYE, NHIF, NSSF, AHL
- Payslip generation

### Reports
- X/Z-reports, VAT/TOT, P&L, commissions
- CSV export on all report tabs
- PDF generation (VAT report, sale receipt, PO)
- AI demand forecasting
- KRA JSON/CSV export
- Tamper-evident audit log export
- 20+ specialized report tabs

### Platform
- Multi-store (inter-store transfers, cross-store owner dashboard)
- Franchise management (multi-business hierarchy)
- License tier enforcement (STARTER / PRO / ENTERPRISE)
- Paystack subscription billing
- KDPA compliance (data deletion requests)
- Role-based access control + custom roles
- API keys with IP whitelist
- Security: Helmet, login lockout, password policies, TOTP
- Third-party integrations: QuickBooks, Xero, Shopify, WooCommerce
- Webhooks with HMAC signing
- Referral programme

---

## API

- Base URL: `http://localhost:3010/api/v1`
- Swagger docs: `http://localhost:3010/api/docs`
- Super Admin: `POST /api/v1/super-admin/login`

All endpoints require `Authorization: Bearer <JWT>` except auth and public routes.

---

## Environment Variables

See `apps/api/.env` for the full list. Critical ones:

```env
DATABASE_URL="postgresql://kastra:kastra2026@localhost:5432/kastra_pos"
JWT_SECRET="min-32-chars"
ENCRYPTION_KEY="64-hex-chars"   # AES-256-CBC for M-Pesa + eTIMS credentials
```

Optional integrations (leave blank to disable):
- `REDIS_HOST` — BullMQ queues (falls back to synchronous without it)
- `MPESA_*` — M-Pesa Daraja
- `AT_USERNAME` / `AT_API_KEY` — Africa's Talking SMS/WhatsApp
- `RESEND_API_KEY` — Email (Resend)
- `PAYSTACK_SECRET_KEY` — Subscriptions + card payments
- `SENTRY_DSN` — Error tracking
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth
