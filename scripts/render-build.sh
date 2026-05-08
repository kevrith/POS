#!/usr/bin/env bash
set -e  # exit on any error

# Resolve repo root relative to this script's location, regardless of cwd
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
cd "$ROOT"
echo "=== Repo root: $ROOT ==="

echo "=== STEP 1: Build @pos/shared ==="
npm run build --workspace=packages/shared
echo "=== shared build OK ==="

echo "=== STEP 2: Prisma generate ==="
"$ROOT/node_modules/.bin/prisma" generate --schema "$ROOT/prisma/schema.prisma"
echo "=== prisma generate OK ==="

echo "=== STEP 2b: Prisma migrate deploy ==="
"$ROOT/node_modules/.bin/prisma" migrate deploy --schema "$ROOT/prisma/schema.prisma"
echo "=== prisma migrate deploy OK ==="

echo "=== STEP 3: NestJS build ==="
cd "$ROOT/apps/api"
NODE_OPTIONS="--max-old-space-size=4096" "$ROOT/node_modules/.bin/nest" build
echo "=== nest build OK ==="

echo "=== BUILD COMPLETE ==="
