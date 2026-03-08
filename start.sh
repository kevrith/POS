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

# Setup database if missing
if [ ! -f "$ROOT_DIR/apps/api/dev.db" ] || [ ! -s "$ROOT_DIR/apps/api/dev.db" ]; then
  echo "🗄️  Setting up database..."
  
  # Add DATABASE_URL to root .env if missing
  if ! grep -q "DATABASE_URL" "$ROOT_DIR/.env" 2>/dev/null; then
    echo 'DATABASE_URL="file:./apps/api/dev.db"' >> "$ROOT_DIR/.env"
  fi
  
  # Run migrations and seed
  cd "$ROOT_DIR"
  export DATABASE_URL="file:./apps/api/dev.db"
  npx prisma migrate dev --name init --skip-seed
  npx ts-node prisma/seed.ts
  
  echo "✅ Database setup complete!"
  echo "📋 Login: owner@premiercafe.co.ke / password123"
  echo ""
fi

# Kill any existing processes on ports 3000-3003 and 3010
echo "🧹 Cleaning up existing processes..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
lsof -ti:3002 | xargs kill -9 2>/dev/null || true
lsof -ti:3003 | xargs kill -9 2>/dev/null || true
lsof -ti:3010 | xargs kill -9 2>/dev/null || true

echo ""
echo "📦 Starting servers..."

PIDS=()

# Start API (always exists)
if [ -d "$ROOT_DIR/apps/api" ]; then
  echo "  • API (NestJS) on port 3010"
  (cd "$ROOT_DIR/apps/api" && DATABASE_URL="file://$ROOT_DIR/prisma/dev.db" npm run start:dev) > /tmp/pos-api.log 2>&1 &
  PIDS+=($!)
fi

# Start Web (always exists)
if [ -d "$ROOT_DIR/apps/web" ]; then
  echo "  • Web (Vite) on port 3001"
  (cd "$ROOT_DIR/apps/web" && pnpm dev) > /tmp/pos-web.log 2>&1 &
  PIDS+=($!)
fi

# Start Admin (if exists)
if [ -d "$ROOT_DIR/apps/admin" ]; then
  echo "  • Admin (Vite) on port 3002"
  (cd "$ROOT_DIR/apps/admin" && pnpm dev) > /tmp/pos-admin.log 2>&1 &
  PIDS+=($!)
fi

# Start Desktop (if exists)
if [ -d "$ROOT_DIR/apps/desktop" ]; then
  echo "  • Desktop (Tauri) on port 3003"
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
echo "📍 API:  http://localhost:3010"
echo "📍 Web:  http://localhost:3001"
[ -d "$ROOT_DIR/apps/admin" ] && echo "📍 Admin: http://localhost:3002"
[ -d "$ROOT_DIR/apps/desktop" ] && echo "📍 Desktop: http://localhost:3003"
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
