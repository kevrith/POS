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

# Kill any existing processes on ports 3000-3003
echo "🧹 Cleaning up existing processes..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
lsof -ti:3002 | xargs kill -9 2>/dev/null || true
lsof -ti:3003 | xargs kill -9 2>/dev/null || true

echo ""
echo "📦 Starting servers..."

PIDS=()

# Start API (always exists)
if [ -d "$ROOT_DIR/apps/api" ]; then
  echo "  • API (NestJS) on port 3000"
  (cd "$ROOT_DIR/apps/api" && pnpm dev) > /tmp/pos-api.log 2>&1 &
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
echo "📍 API:  http://localhost:3000"
echo "📍 Web:  http://localhost:3001"
[ -d "$ROOT_DIR/apps/admin" ] && echo "📍 Admin: http://localhost:3002"
[ -d "$ROOT_DIR/apps/desktop" ] && echo "📍 Desktop: http://localhost:3003"
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
