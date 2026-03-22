#!/usr/bin/env bash
set -e  # exit on any error

ROOT="$(pwd)"
echo "=== Working directory: $ROOT ==="

echo "=== STEP 1: Build @pos/shared ==="
npm run build --workspace=packages/shared
echo "=== shared build OK ==="

echo "=== STEP 2: Prisma generate ==="
cd "$ROOT/apps/api"
npx prisma generate --schema "$ROOT/prisma/schema.prisma"
echo "=== prisma generate OK ==="

echo "=== STEP 3: NestJS build ==="
cd "$ROOT/apps/api"
npx nest build
echo "=== nest build OK ==="

echo "=== BUILD COMPLETE ==="
