# Universal Offline-First POS System — Kenya

Enterprise-grade, offline-first, KRA eTIMS-compliant POS for Kenya.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind
- **Backend**: NestJS 10 + Prisma 5 + PostgreSQL
- **Desktop**: Tauri v2
- **State**: Zustand + TanStack Query
- **Queue**: BullMQ + Redis
- **Auth**: JWT + Google OAuth + TOTP

## Setup

```bash
# Install dependencies
pnpm install

# Setup environment
cp .env.example .env

# Run Prisma migrations
cd apps/api
pnpm prisma migrate dev

# Start development
pnpm dev
```

## Project Structure

```
pos-system/
├── apps/
│   ├── web/        # React PWA
│   ├── desktop/    # Tauri app
│   ├── api/        # NestJS backend
│   └── admin/      # Super admin
├── packages/
│   ├── shared/     # Types + enums
│   ├── sync-engine/
│   └── ui/
└── prisma/         # Database schema
```

## Development Phase

**Current**: Phase 0 — Foundation
**Status**: Setting up monorepo structure
