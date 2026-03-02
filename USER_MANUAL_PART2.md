## 5. User Roles & Permissions

### 5.1 Role Hierarchy

```
OWNER (Full Access)
  ├── MANAGER (Operations)
  │   ├── ACCOUNTANT (Financial)
  │   ├── CASHIER (Sales)
  │   ├── WAITER (Hospitality)
  │   └── KITCHEN (Food Prep)
```

### 5.2 Permission Matrix

| Feature | Owner | Manager | Accountant | Cashier | Waiter | Kitchen |
|---------|-------|---------|------------|---------|--------|---------|
| **POS Sales** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Void Sales** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Inventory Management** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Purchase Orders** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Financial Reports** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Sales Reports** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Customer Management** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Staff Management** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Settings** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Hospitality Orders** | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Kitchen Display** | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Cash Drawer** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Expenses** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## 6. Point of Sale Operations

### 6.1 Starting a Shift

#### Open Cash Drawer

Before making sales, open your cash drawer:

1. Navigate to **Cash Drawer** from sidebar
2. Click **"Open Drawer"**
3. Enter **Opening Balance** (cash float)
   - Example: KES 5,000.00
4. Click **"Start Shift"**

**Status:** Drawer is now OPEN and ready for transactions.

### 6.2 Making a Sale

#### Navigate to POS

1. Click **Point of Sale** in sidebar
2. You'll see the POS interface with:
   - **Left**: Product grid/search
   - **Right**: Shopping cart
   - **Bottom**: Payment options

#### Add Items to Cart

**Method 1: Click Product**
1. Browse product grid
2. Click product tile
3. Item added to cart

**Method 2: Barcode Scan**
1. Focus on search bar (click or press F2)
2. Scan product barcode
3. Item automatically added

**Method 3: Search**
1. Type product name in search bar
2. Select from dropdown
3. Press Enter

#### Adjust Quantities

- **Increase**: Click **+** button on cart item
- **Decrease**: Click **-** button
- **Remove**: Click **×** (trash icon)
- **Direct Entry**: Click quantity number, type new amount

#### Apply Discounts

**Item Discount:**
1. Click **discount icon** on cart item
2. Enter discount amount or percentage
3. Click **Apply**

**Cart Discount:**
1. Click **"Discount"** button below cart
2. Enter total discount
3. Click **Apply**

#### Select Customer (Optional)

For credit sales or loyalty:

1. Click **"Select Customer"** button
2. Search by name or phone
3. Select customer
4. Customer info appears in cart header

**Add New Customer:**
1. Click **"+ New Customer"**
2. Enter name and phone
3. Click **Save**

### 6.3 Payment Processing

#### Review Cart

Before payment, verify:
- ✅ All items correct
- ✅ Quantities accurate
- ✅ Discounts applied
- ✅ Customer selected (if needed)

**Cart Summary Shows:**
- Subtotal (before tax)
- VAT (16% - extracted from prices)
- Service Charge (if applicable)
- **Total Amount Due**

#### Select Payment Method

Click payment method button:

**1. CASH**
- Enter amount received
- System calculates change
- Click **"Complete Sale"**

**2. M-PESA**
- Enter M-Pesa transaction code
- Example: QHY7KLM934
- Click **"Complete Sale"**

**3. CARD**
- Process card payment on terminal
- Enter approval code
- Click **"Complete Sale"**

**4. CREDIT**
- Customer must be selected
- Verify credit limit available
- Click **"Complete Sale"**
- Sale marked as CREDIT

**5. SPLIT PAYMENT**
- Click **"Split Payment"**
- Add multiple payment methods
- Example: KES 3,000 Cash + KES 2,000 M-Pesa
- Total must equal cart total
- Click **"Complete Sale"**

#### Receipt Options

After successful payment:

1. **Print Receipt**: Automatic if printer configured
2. **Email Receipt**: Enter customer email
3. **SMS Receipt**: Send to customer phone
4. **View Receipt**: Display on screen

**Receipt Contains:**
- Business name and address
- Receipt number (e.g., NRB01-2026-0000105)
- Date and time
- Cashier name
- Itemized list with prices
- Subtotal, VAT, Total
- Payment method
- QR code (for eTIMS verification)

### 6.4 Special Sale Types

#### Layaway Sale

For customers paying in installments:

1. Add items to cart
2. Click **"Layaway"** button
3. Enter:
   - Initial deposit amount
   - Payment schedule
   - Customer details
4. Click **"Create Layaway"**

**Managing Layaway:**
- View: **Layaway Book** in Reports
- Add Payment: Click layaway → **"Add Payment"**
- Complete: When fully paid, converts to regular sale

#### Proforma Invoice

For quotations:

1. Add items to cart
2. Click **"Proforma"** button
3. Enter:
   - Customer name
   - Valid until date
   - Notes
4. Click **"Generate Proforma"**

**Converting Proforma:**
1. Go to **Proforma Pipeline** in Reports
2. Find proforma
3. Click **"Convert to Sale"**
4. Process payment

#### Credit Sale

For trusted customers:

1. Add items to cart
2. Select customer (required)
3. Verify credit limit
4. Click **"Credit"** payment method
5. Complete sale

**Credit Management:**
- View outstanding: **Credit Book** in Reports
- Record payment: Customer profile → **"Add Payment"**

### 6.5 Voiding Sales

If a sale needs to be cancelled:

#### Requirements
- Manager or Owner role
- Sale must be PAID status
- Reason must be provided

#### Process

1. Go to **Sales History**
2. Find sale to void
3. Click **"Void"** button
4. Enter manager PIN
5. Select void type:
   - **Full Void**: Cancel entire sale
   - **Line Item Void**: Cancel specific items
6. Enter reason
7. Click **"Confirm Void"**

**Effects:**
- Stock returned to inventory
- Payment refunded (cash/credit note)
- Void record created for audit
- eTIMS void notification sent

### 6.6 Returns Processing

For returned items:

1. Go to **Sales History**
2. Find original sale
3. Click **"Return"** button
4. Select items to return
5. Choose refund method:
   - **Cash Refund**
   - **Store Credit**
6. Enter reason
7. Click **"Process Return"**

**Effects:**
- Stock added back to inventory
- Refund issued
- Sale status updated to CANCELLED

### 6.7 Closing Cash Drawer

At end of shift:

1. Navigate to **Cash Drawer**
2. Click **"Close Drawer"**
3. Count physical cash
4. Enter **Closing Balance**
5. System shows:
   - Expected cash (opening + cash sales - cash expenses)
   - Actual cash (your count)
   - Variance (difference)
6. Click **"Generate Z-Report"**

**Z-Report Contains:**
- Total sales count
- Total revenue
- Payment method breakdown
- Cash variance
- Shift duration

**Important:** Z-Report closes the business day and resets daily counters.

---

## 7. Inventory Management

### 7.1 Stock Overview

#### View Current Stock

1. Navigate to **Inventory** → **Items & Stock**
2. View list showing:
   - Item name
   - Category
   - Current quantity
   - Reorder level
   - Value (cost × quantity)

#### Stock Filters

- **Category**: Filter by product category
- **Low Stock**: Items below reorder level
- **Out of Stock**: Zero quantity items
- **Search**: Find by name or barcode

### 7.2 Stock Adjustments

For corrections or write-offs:

1. Find item in inventory list
2. Click **"Adjust"** button
3. Select adjustment type:
   - **Write-Off**: Damaged/expired goods
   - **Damaged**: Physical damage
   - **Theft**: Shrinkage
   - **Correction**: Count discrepancy
4. Enter quantity to remove
5. Add notes (required)
6. Click **"Save Adjustment"**

**Audit Trail:** All adjustments logged with user, timestamp, and reason.

### 7.3 Batch & Expiry Tracking

For pharmacy, food, or perishables:

#### Enable Batch Tracking

1. Edit item
2. Check **"Track Batches"**
3. Check **"Track Expiry"**
4. Set **Default Expiry Days**
5. Save

#### Receive Batch

When receiving goods:

1. Create GRN (Goods Received Note)
2. For each item, enter:
   - Lot/Batch number
   - Manufacturing date
   - Expiry date
   - Quantity received
3. Save GRN

#### Expiry Alerts

System automatically alerts for:
- **Critical**: Expires in 7 days (red)
- **Warning**: Expires in 30 days (yellow)
- **OK**: More than 30 days (green)

**View Expiry Report:**
1. Go to **Reports** → **Expiry**
2. Set alert threshold (days)
3. View items expiring soon
4. Take action (discount, remove, return)

### 7.4 Serial Number Tracking

For electronics, phones, or high-value items:

#### Enable Serial Tracking

1. Edit item
2. Check **"Track Serial Numbers"**
3. Save

#### Add Serial Numbers

**Method 1: Manual Entry**
1. Go to **Serial Tracking**
2. Click **"+ Add Serial"**
3. Select item
4. Enter serial number (e.g., IMEI)
5. Save

**Method 2: Bulk Import**
1. Click **"Import Serials"**
2. Upload CSV with serial numbers
3. System validates and imports

#### Selling Serialized Items

1. Add item to POS cart
2. System prompts: **"Select Serial Number"**
3. Choose from available serials
4. Complete sale
5. Serial marked as SOLD

**Serial Registry:**
- View all serials: **Reports** → **Serial Registry**
- Filter by status: Available, Sold, Reserved
- Track warranty and customer

### 7.5 Recipe/BOM Management

For restaurants or manufacturers:

#### Create Recipe

1. Go to **Inventory** → **Recipes/BOM**
2. Click **"+ New Recipe"**
3. Enter recipe details:
   - **Recipe Name**: Final product (e.g., "Club Sandwich")
   - **Selling Price**: Menu price
   - **Yield**: Portions produced

4. Add ingredients:
   - Select ingredient item
   - Enter quantity (grams/units)
   - Repeat for all ingredients

5. Save recipe

#### Recipe Costing

System automatically calculates:
- **Total Cost**: Sum of ingredient costs
- **Cost per Portion**: Total cost ÷ yield
- **Profit Margin**: (Selling price - cost) ÷ selling price × 100%

#### Selling Recipe Items

When sold at POS:
- Recipe item added to cart
- System automatically deducts ingredients from stock
- Inventory movements created for each ingredient

**Recipe Variance Report:**
- Compare planned vs actual ingredient usage
- Identify waste or theft
- Optimize recipes

### 7.6 Bundle/Kit Management

For product bundles:

#### Create Bundle

1. Go to **Inventory** → **Bundles/Kits**
2. Click **"+ New Bundle"**
3. Enter bundle details:
   - **Bundle Name**: (e.g., "Breakfast Combo")
   - **Bundle Price**: Discounted price

4. Add components:
   - Select item
   - Enter quantity
   - Repeat for all items

5. Save bundle

**Example Bundle:**
```
Breakfast Combo - KES 450
├── Club Sandwich × 1 (KES 850)
├── Espresso Shot × 1 (KES 250)
└── Coca-Cola 300ml × 1 (KES 55)
─────────────────────────────
Individual Total: KES 1,155
Bundle Price: KES 450
Savings: KES 705 (61%)
```

#### Selling Bundles

- Add bundle to cart like regular item
- System deducts all component items from stock
- Customer sees bundle name on receipt

**Bundle Profitability Report:**
- View bundle sales performance
- Calculate profit margins
- Identify popular bundles

### 7.7 Stock Transfers

For multi-store operations:

#### Create Transfer

1. Go to **Inventory** → **Stock Transfers**
2. Click **"+ New Transfer"**
3. Select:
   - **From Store**: Source location
   - **To Store**: Destination location
4. Add items and quantities
5. Click **"Create Transfer"**

**Status:** PENDING

#### Process Transfer

**At Source Store:**
1. View transfer
2. Click **"Dispatch"**
3. Print transfer note
4. Stock deducted from source

**Status:** IN_TRANSIT

**At Destination Store:**
1. View incoming transfer
2. Verify items received
3. Click **"Receive"**
4. Stock added to destination

**Status:** COMPLETED

---

## 8. Purchase Orders & Suppliers

### 8.1 Supplier Management

#### Add Supplier

1. Go to **Suppliers & POs**
2. Click **"+ Add Supplier"**
3. Enter details:
   - **Supplier Name**
   - **Contact Person**
   - **Phone & Email**
   - **Address**
   - **Payment Terms** (e.g., "Net 30")
   - **Credit Limit**
4. Save

### 8.2 Creating Purchase Orders

#### New Purchase Order

1. Click **"+ New PO"**
2. Select supplier
3. Enter expected delivery date
4. Add items:
   - Search and select item
   - Enter quantity ordered
   - Enter agreed price
5. Review PO total
6. Click **"Save as Draft"**

**PO Status:** DRAFT

#### Approve Purchase Order

1. Manager/Owner reviews PO
2. Click **"Approve"**
3. PO status changes to SENT
4. Optional: Email PO to supplier

### 8.3 Goods Received Note (GRN)

When goods arrive:

#### Create GRN

1. Find approved PO
2. Click **"Receive Goods"**
3. For each item:
   - Enter quantity received
   - Verify quality
   - Add batch/lot number (if applicable)
   - Add expiry date (if applicable)
4. Add delivery note number
5. Click **"Save GRN"**

**Effects:**
- Stock added to inventory
- PO status updated:
  - PARTIALLY_RECEIVED (if partial)
  - RECEIVED (if complete)

#### GRN Discrepancy

If received ≠ ordered:

- System flags discrepancy
- View in **Reports** → **GRN Discrepancy**
- Take action:
  - Contact supplier
  - Adjust PO
  - Create credit note

### 8.4 Supplier Reports

**Supplier Ledger:**
- View all POs by supplier
- Outstanding balances
- Payment history

**Supplier Performance:**
- On-time delivery rate
- Fill rate (% of orders complete)
- Average lead time
- Quality issues

**Supplier Ageing:**
- Outstanding amounts by age
- 0-30 days, 31-60 days, 61-90 days, 90+ days
- Overdue orders

---

