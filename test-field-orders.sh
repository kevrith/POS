#!/bin/bash

# Field Orders Test Script
# This script tests the complete field orders workflow

set -e

API_URL="http://localhost:3010/api/v1"
TOKEN=""
BUSINESS_ID=""
AGENT_ID=""
CUSTOMER_ID=""
ORDER_ID=""

echo "🧪 Field Orders Integration Test"
echo "================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print success
success() {
    echo -e "${GREEN}✓${NC} $1"
}

# Function to print error
error() {
    echo -e "${RED}✗${NC} $1"
}

# Function to print info
info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# Step 1: Login as agent
info "Step 1: Logging in as sales agent..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "waiter@premiercafe.co.ke",
    "password": "waiter123"
  }')

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.accessToken')
BUSINESS_ID=$(echo $LOGIN_RESPONSE | jq -r '.user.businessId')
AGENT_ID=$(echo $LOGIN_RESPONSE | jq -r '.user.id')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
    error "Login failed. Check credentials."
    exit 1
fi

success "Logged in successfully"
info "Business ID: $BUSINESS_ID"
info "Agent ID: $AGENT_ID"
echo ""

# Step 2: Get or create a customer
info "Step 2: Getting customers..."
CUSTOMERS=$(curl -s -X GET "$API_URL/field-sales/customers?businessId=$BUSINESS_ID&agentId=$AGENT_ID" \
  -H "Authorization: Bearer $TOKEN")

CUSTOMER_COUNT=$(echo $CUSTOMERS | jq '. | length')
info "Found $CUSTOMER_COUNT customers"

if [ "$CUSTOMER_COUNT" -eq 0 ]; then
    info "Creating a test customer..."
    CUSTOMER_RESPONSE=$(curl -s -X POST "$API_URL/field-sales/customers" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{
        \"agentId\": \"$AGENT_ID\",
        \"businessId\": \"$BUSINESS_ID\",
        \"name\": \"Test Shop $(date +%s)\",
        \"phone\": \"+254712345678\",
        \"shopType\": \"RETAIL\",
        \"creditLimitCents\": 10000000
      }")
    CUSTOMER_ID=$(echo $CUSTOMER_RESPONSE | jq -r '.id')
    success "Created customer: $CUSTOMER_ID"
else
    CUSTOMER_ID=$(echo $CUSTOMERS | jq -r '.[0].id')
    success "Using existing customer: $CUSTOMER_ID"
fi
echo ""

# Step 3: Get inventory items
info "Step 3: Getting inventory items..."
ITEMS=$(curl -s -X GET "$API_URL/items?businessId=$BUSINESS_ID&activeOnly=true&limit=5" \
  -H "Authorization: Bearer $TOKEN")

ITEM_COUNT=$(echo $ITEMS | jq '. | length')
info "Found $ITEM_COUNT items"

if [ "$ITEM_COUNT" -eq 0 ]; then
    error "No items found. Please add items to inventory first."
    exit 1
fi

ITEM_ID=$(echo $ITEMS | jq -r '.[0].id')
ITEM_NAME=$(echo $ITEMS | jq -r '.[0].name')
ITEM_PRICE=$(echo $ITEMS | jq -r '.[0].retailPriceCents')
success "Using item: $ITEM_NAME (KES $(echo "scale=2; $ITEM_PRICE/100" | bc))"
echo ""

# Step 4: Create a field order
info "Step 4: Creating field order..."
ORDER_RESPONSE=$(curl -s -X POST "$API_URL/field-sales/orders" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"agentId\": \"$AGENT_ID\",
    \"businessId\": \"$BUSINESS_ID\",
    \"customerId\": \"$CUSTOMER_ID\",
    \"items\": [
      {
        \"itemId\": \"$ITEM_ID\",
        \"itemName\": \"$ITEM_NAME\",
        \"quantity\": 5,
        \"unitPriceCents\": $ITEM_PRICE,
        \"isSample\": false
      }
    ],
    \"notes\": \"Test order from integration test\",
    \"isSampleOrder\": false
  }")

ORDER_ID=$(echo $ORDER_RESPONSE | jq -r '.id')
ORDER_NUMBER=$(echo $ORDER_RESPONSE | jq -r '.orderNumber')

if [ "$ORDER_ID" = "null" ] || [ -z "$ORDER_ID" ]; then
    error "Failed to create order"
    echo "Response: $ORDER_RESPONSE"
    exit 1
fi

success "Created order: $ORDER_NUMBER (ID: $ORDER_ID)"
echo ""

# Step 5: Verify order appears in list
info "Step 5: Verifying order appears in field orders list..."
ORDERS=$(curl -s -X GET "$API_URL/field-sales/orders?businessId=$BUSINESS_ID" \
  -H "Authorization: Bearer $TOKEN")

ORDER_EXISTS=$(echo $ORDERS | jq --arg id "$ORDER_ID" '.[] | select(.id == $id) | .id')

if [ -z "$ORDER_EXISTS" ]; then
    error "Order not found in field orders list!"
    exit 1
fi

success "Order found in field orders list"
echo ""

# Step 6: Update order status to CONFIRMED
info "Step 6: Confirming order..."
CONFIRM_RESPONSE=$(curl -s -X PATCH "$API_URL/field-sales/orders/$ORDER_ID/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"businessId\": \"$BUSINESS_ID\",
    \"status\": \"CONFIRMED\",
    \"expectedDeliveryDate\": \"$(date -d '+3 days' +%Y-%m-%d)\"
  }")

CONFIRMED_STATUS=$(echo $CONFIRM_RESPONSE | jq -r '.status')

if [ "$CONFIRMED_STATUS" != "CONFIRMED" ]; then
    error "Failed to confirm order"
    echo "Response: $CONFIRM_RESPONSE"
    exit 1
fi

success "Order confirmed"
echo ""

# Step 7: Mark as PACKED
info "Step 7: Marking order as packed..."
PACK_RESPONSE=$(curl -s -X PATCH "$API_URL/field-sales/orders/$ORDER_ID/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"businessId\": \"$BUSINESS_ID\",
    \"status\": \"PACKED\"
  }")

PACKED_STATUS=$(echo $PACK_RESPONSE | jq -r '.status')

if [ "$PACKED_STATUS" != "PACKED" ]; then
    error "Failed to pack order"
    exit 1
fi

success "Order packed"
echo ""

# Step 8: Get delivery note
info "Step 8: Getting delivery note..."
DELIVERY_NOTE=$(curl -s -X GET "$API_URL/field-sales/orders/$ORDER_ID/delivery-note?businessId=$BUSINESS_ID" \
  -H "Authorization: Bearer $TOKEN")

DELIVERY_NOTE_ID=$(echo $DELIVERY_NOTE | jq -r '.id')

if [ "$DELIVERY_NOTE_ID" = "null" ] || [ -z "$DELIVERY_NOTE_ID" ]; then
    error "Failed to get delivery note"
    exit 1
fi

success "Delivery note retrieved"
echo ""

# Step 9: Generate invoice
info "Step 9: Generating invoice..."
INVOICE_RESPONSE=$(curl -s -X POST "$API_URL/field-sales/orders/$ORDER_ID/generate-invoice" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"businessId\": \"$BUSINESS_ID\"
  }")

INVOICE_NUMBER=$(echo $INVOICE_RESPONSE | jq -r '.invoiceNumber')

if [ "$INVOICE_NUMBER" = "null" ] || [ -z "$INVOICE_NUMBER" ]; then
    error "Failed to generate invoice"
    echo "Response: $INVOICE_RESPONSE"
    exit 1
fi

success "Invoice generated: $INVOICE_NUMBER"
echo ""

# Step 10: Record payment
info "Step 10: Recording payment..."
PAYMENT_RESPONSE=$(curl -s -X POST "$API_URL/field-sales/orders/$ORDER_ID/collect-payment?businessId=$BUSINESS_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"amountCents\": $(echo "scale=0; $ITEM_PRICE * 5 * 1.16" | bc | cut -d. -f1),
    \"method\": \"CASH\",
    \"collectedBy\": \"$AGENT_ID\"
  }")

PAYMENT_STATUS=$(echo $PAYMENT_RESPONSE | jq -r '.paymentStatus')

if [ "$PAYMENT_STATUS" = "null" ] || [ -z "$PAYMENT_STATUS" ]; then
    error "Failed to record payment"
    echo "Response: $PAYMENT_RESPONSE"
    exit 1
fi

success "Payment recorded. Status: $PAYMENT_STATUS"
echo ""

# Summary
echo "================================="
echo -e "${GREEN}✓ All tests passed!${NC}"
echo ""
echo "Summary:"
echo "  Order Number: $ORDER_NUMBER"
echo "  Order ID: $ORDER_ID"
echo "  Invoice: $INVOICE_NUMBER"
echo "  Payment Status: $PAYMENT_STATUS"
echo ""
echo "You can now:"
echo "  1. View the order in Field Orders page"
echo "  2. Check the invoice in Sales → Proformas"
echo "  3. Verify payment in customer ledger"
echo ""
