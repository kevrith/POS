#!/usr/bin/env bash
set -e  # exit on any error

echo "=== STEP 1: Build @pos/shared ==="
cd packages/shared
npm install
npm run build
echo "=== shared build OK ==="
cd ../..

echo "=== STEP 2: Install apps/api dependencies ==="
cd apps/api
npm install
echo "=== api install OK ==="
cd ../..

echo "=== STEP 3: Prisma generate ==="
node_modules/.bin/prisma generate --schema prisma/schema.prisma
echo "=== prisma generate OK ==="

echo "=== STEP 4: NestJS build ==="
cd apps/api
../../node_modules/.bin/nest build
echo "=== nest build OK ==="
cd ../..

echo "=== BUILD COMPLETE ==="
