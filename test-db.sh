#!/bin/bash

echo "Testing PostgreSQL connections..."
echo ""

# Test 1: postgres user with password
echo "Test 1: postgres/password"
PGPASSWORD=password psql -U postgres -h localhost -d postgres -c "SELECT 1;" 2>&1 | grep -q "1 row" && echo "✓ Works" || echo "✗ Failed"

# Test 2: postgres user no password
echo "Test 2: postgres (no password)"
psql -U postgres -h localhost -d postgres -c "SELECT 1;" 2>&1 | grep -q "1 row" && echo "✓ Works" || echo "✗ Failed"

# Test 3: Current user peer auth
echo "Test 3: $USER (peer auth)"
psql -d postgres -c "SELECT 1;" 2>&1 | grep -q "1 row" && echo "✓ Works" || echo "✗ Failed"

# Test 4: Check pg_hba.conf location
echo ""
echo "PostgreSQL config:"
psql -d postgres -c "SHOW hba_file;" 2>/dev/null || echo "Cannot access"
