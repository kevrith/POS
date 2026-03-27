#!/bin/bash

# Universal POS - Development Server Starter
# Starts all available apps concurrently

echo "🚀 Starting Universal POS Development Servers..."
echo ""

# Get the root directory
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Install dependencies if missing
if [ ! -d "$ROOT_DIR/node_modules" ]; then
  echo "📦 Installing dependencies (this may take a few minutes)..."
  cd "$ROOT_DIR" && pnpm install
  echo ""
fi

# Run migrations (deploy = no shadow DB, safe for any provider)
echo "🗄️  Running database migrations..."
cd "$ROOT_DIR/apps/api" && npx prisma migrate deploy --schema "$ROOT_DIR/prisma/schema.prisma"
echo ""

# Kill any existing processes on used ports
echo "🧹 Cleaning up existing processes..."
lsof -ti:3005 | xargs kill -9 2>/dev/null || true
lsof -ti:3010 | xargs kill -9 2>/dev/null || true
lsof -ti:3012 | xargs kill -9 2>/dev/null || true

echo ""
echo "📦 Starting servers..."

PIDS=()

# Start API (always exists)
if [ -d "$ROOT_DIR/apps/api" ]; then
  echo "  • API (NestJS) on port 3010"
  (cd "$ROOT_DIR/apps/api" && npm run build && npm run start:dev) > /tmp/pos-api.log 2>&1 &
  PIDS+=($!)
fi

# Start Web (always exists)
if [ -d "$ROOT_DIR/apps/web" ]; then
  echo "  • Web (Vite) on port 3005"
  (cd "$ROOT_DIR/apps/web" && pnpm dev) > /tmp/pos-web.log 2>&1 &
  PIDS+=($!)
fi

# Start Admin (if exists)
if [ -d "$ROOT_DIR/apps/admin" ]; then
  echo "  • Admin (Vite) on port 3012"
  (cd "$ROOT_DIR/apps/admin" && pnpm dev) > /tmp/pos-admin.log 2>&1 &
  PIDS+=($!)
fi

# Start Desktop (if exists)
if [ -d "$ROOT_DIR/apps/desktop" ]; then
  echo "  • Desktop (Tauri) on port 3013"
  (cd "$ROOT_DIR/apps/desktop" && pnpm dev) > /tmp/pos-desktop.log 2>&1 &
  PIDS+=($!)
fi

# Wait for servers to start
echo ""
echo "⏳ Waiting for servers to start..."
sleep 8

echo ""
echo "✅ Servers started!"
echo ""
echo "📍 API:     http://localhost:3010"
echo "📍 Web:     http://localhost:3005"
[ -d "$ROOT_DIR/apps/admin" ] && echo "📍 Admin:   http://localhost:3012"
[ -d "$ROOT_DIR/apps/desktop" ] && echo "📍 Desktop: http://localhost:3013"
echo ""
echo "📋 Login Credentials:"
echo "  Email: owner@premiercafe.co.ke"
echo "  Password: password123"
echo "  PIN: 1234"
echo ""
echo "📋 Other Users:"
echo "  manager@premiercafe.co.ke / manager123 (PIN: 5678)"
echo "  cashier@premiercafe.co.ke / cashier123 (PIN: 0000)"
echo "  waiter@premiercafe.co.ke / waiter123 (PIN: 9999)"
echo ""
echo "📋 Logs:"
echo "  • API:  tail -f /tmp/pos-api.log"
echo "  • Web:  tail -f /tmp/pos-web.log"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Trap Ctrl+C to kill all processes
trap "echo '\n🛑 Stopping all servers...'; kill \${PIDS[@]} 2>/dev/null; exit" INT TERM

# Wait for all processes
wait ${PIDS[@]}
