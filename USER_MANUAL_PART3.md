## 9. Hospitality Features (Restaurant Mode)

### 9.1 Table Management

#### View Floor Plan

1. Navigate to **Tables**
2. View visual floor plan with table statuses:
   - **Green (Available)**: Ready for seating
   - **Blue (Occupied)**: Customers seated
   - **Yellow (Bill Requested)**: Ready to pay
   - **Red (Reserved)**: Advance booking

#### Add Tables

1. Click **"+ Add Table"**
2. Enter:
   - **Table Number**: (e.g., "T1", "Table 5")
   - **Capacity**: Number of seats
   - **Floor/Section**: (e.g., "Indoor", "Outdoor", "VIP")
3. Save

#### Table Reservations

1. Click table
2. Select **"Reserve"**
3. Enter:
   - Customer name
   - Phone number
   - Date and time
   - Number of guests
   - Special requests
4. Save reservation

**Reservation Status:**
- Confirmed: Customer notified
- Pending: Awaiting confirmation
- Cancelled: Reservation cancelled

### 9.2 Taking Orders (Waiter)

#### Start New Order

1. Click available table (green)
2. Table status changes to OCCUPIED
3. Order screen opens

#### Add Items to Order

**Method 1: Menu Grid**
- Browse menu categories
- Click items to add
- Adjust quantities

**Method 2: Search**
- Type item name
- Select from results

#### Add Order Notes

For each item:
1. Click **note icon**
2. Enter special instructions
   - Example: "No onions", "Extra spicy", "Well done"
3. Save

#### Course Management

Organize items by course:
1. Select items
2. Click **"Set Course"**
3. Choose:
   - Appetizers
   - Main Course
   - Desserts
   - Drinks

### 9.3 Kitchen Order Ticket (KOT)

#### Send to Kitchen

1. Review order
2. Click **"Send to Kitchen"**
3. KOT printed at kitchen printer
4. Order appears on Kitchen Display System

**KOT Contains:**
- Table number
- Order time
- Waiter name
- Items with quantities
- Special instructions
- Course information

#### Kitchen Display System (KDS)

**For Kitchen Staff:**

1. Navigate to **Kitchen Display**
2. View pending orders in queue
3. For each item:
   - Click **"Start"** when cooking begins
   - Click **"Ready"** when complete
4. Waiter notified when order ready

**Order Status Colors:**
- **White**: Just received
- **Yellow**: In progress
- **Green**: Ready to serve
- **Red**: Overdue (>15 minutes)

### 9.4 Serving & Billing

#### Mark Items Served

1. Waiter views order
2. Click **"Served"** for delivered items
3. Customer can now request bill

#### Generate Bill

1. Customer requests bill
2. Waiter clicks **"Request Bill"**
3. Table status changes to BILL_REQUESTED
4. Bill printed/displayed

#### Process Payment

1. Click **"Pay Bill"**
2. Select payment method
3. Process payment (same as POS)
4. Print receipt
5. Table status returns to AVAILABLE

### 9.5 Split Bills

For groups paying separately:

1. Click **"Split Bill"**
2. Choose split method:
   - **By Item**: Assign items to different bills
   - **Equal Split**: Divide total equally
   - **Custom**: Enter custom amounts
3. Process each payment separately
4. All payments linked to original order

### 9.6 Service Charge

Automatically calculated if enabled:

**Configure:**
1. Go to **Settings** → **General**
2. Set **Service Charge Rate** (e.g., 10%)
3. Save

**On Bills:**
- Subtotal: KES 1,000
- Service Charge (10%): KES 100
- Total: KES 1,100

---

## 10. Reports & Analytics

### 10.1 Report Categories

KASTRA POS provides 20+ report types:

**Sales Reports:**
- Sales Summary
- Sales by Date
- Sales by Employee
- Sales by Category
- Payment Method Breakdown

**Financial Reports:**
- Profit & Loss Statement
- VAT/TOT Register
- Expense Report
- Cash Flow
- Owner Dashboard

**Inventory Reports:**
- Stock Valuation
- Stock Movement
- Expiry Report
- Recipe Variance
- Bundle Profitability

**Supplier Reports:**
- Supplier Ledger
- Supplier Performance
- Supplier Ageing
- GRN Discrepancy

**Customer Reports:**
- Credit Book
- Customer Analysis
- Loyalty Points

**Compliance Reports:**
- KRA Export (JSON/CSV)
- Audit Log Export
- Serial Registry

**Operational Reports:**
- Attendance Report
- Commission Report
- X-Report (shift snapshot)
- Z-Report (end of day)

### 10.2 Using Date Filters

All reports support date filtering:

#### Quick Filters

Click preset buttons:
- **Today**: Current day only
- **This Week**: Monday to today
- **This Month**: 1st to today
- **Custom**: Select specific range

#### Custom Date Range

1. Click **"Custom"**
2. Select **Start Date**
3. Select **End Date**
4. Reports automatically update

**Example:**
```
Start Date: 2026-01-01
End Date: 2026-01-31
Result: January 2026 data
```

### 10.3 Sales Reports

#### Sales Summary

**Access:** Reports → Sales

**Shows:**
- Total transactions
- Total revenue
- Average sale value
- VAT collected
- Payment method breakdown

**View Options:**
- **By Date**: Grouped by day (expandable)
- **All Transactions**: Flat list

**Actions:**
- **Print**: Print-friendly format
- **Export CSV**: Download spreadsheet
- **Refresh**: Update with latest data

#### Item Summary Report

**Access:** Reports → Item Summary

**Shows:**
- Sales by category
- Top-selling items
- Quantity sold
- Revenue per item
- Category performance

**Visual:**
- Progress bars showing item contribution
- Color-coded categories
- Percentage breakdown

**Use Cases:**
- Identify best sellers
- Plan inventory
- Optimize menu
- Negotiate supplier deals

### 10.4 Financial Reports

#### Profit & Loss Statement

**Access:** Reports → P&L

**Shows:**
```
Revenue                    KES 500,000
  Cost of Goods Sold      (KES 200,000)
─────────────────────────────────────
Gross Profit               KES 300,000
  Operating Expenses      (KES 150,000)
─────────────────────────────────────
Net Profit                 KES 150,000

Net Margin: 30%
```

**Includes:**
- Revenue from sales
- COGS (if tracked)
- All approved expenses
- Profit margin calculation

#### VAT Register

**Access:** Reports → Tax Report

**Shows:**
- All VAT-rated sales
- Receipt numbers
- Sale dates
- Net amount (ex-VAT)
- VAT amount (16%)
- Total amount

**Export Options:**
- **PDF**: For printing
- **CSV**: For Excel/accounting software
- **Print**: Direct to printer

**Use Case:** Monthly VAT return filing with KRA

#### Expense Report

**Access:** Reports → P&L → Expenses

**Shows:**
- All approved expenses
- Grouped by category
- Total per category
- Expense trends

**Categories:**
- Rent
- Utilities
- Supplies
- Transport
- Marketing
- Salaries
- Loan Repayment
- Other

### 10.5 Inventory Reports

#### Stock Valuation

**Access:** Reports → Inventory

**Shows:**
- All items with stock
- Current quantity
- Cost price per unit
- Total value (qty × cost)
- Grand total value

**Use Cases:**
- Insurance valuation
- Financial statements
- Loan applications
- Business valuation

#### Historical Stock Report

**Access:** Reports → Stock History

**Shows:**
- Stock levels at any past date
- Point-in-time snapshot
- Based on inventory movements

**How to Use:**
1. Select **As-of Date**
2. View stock levels on that date
3. Export for records

**Use Cases:**
- Month-end stock reports
- Audit requirements
- Variance analysis
- Theft investigation

#### Expiry Report

**Access:** Reports → Expiry

**Shows:**
- Items expiring soon
- Days remaining
- Batch/lot numbers
- Quantities
- Status (Critical/Warning/OK)

**Actions:**
- Discount items
- Return to supplier
- Write off expired stock

### 10.6 Employee Reports

#### Commission Report

**Access:** Reports → Commissions

**Shows per employee:**
- Sales count
- Total sales value
- Commission rate
- Commission earned
- Commission basis (% or per transaction)

**Export:** CSV for payroll processing

#### Attendance Report

**Access:** Reports → Attendance

**Shows:**
- Clock in/out times
- Hours worked
- Late arrivals
- Shift dates
- Employee names

**Filters:**
- By employee
- By date range
- By status (late/on-time)

#### Employee Sales Report

**Access:** Reports → Employee Sales

**Detailed breakdown:**
- Sales by employee
- Sales by category
- Items sold
- M-Pesa transactions collected
- Cash expected calculation

**Use Cases:**
- Performance evaluation
- Commission calculation
- Cash reconciliation
- Theft detection

### 10.7 Exporting Reports

All reports support export:

#### CSV Export

1. Click **"Export CSV"** button
2. File downloads automatically
3. Open in Excel/Google Sheets

**CSV Format:**
- Headers in first row
- Data in subsequent rows
- UTF-8 encoding (supports special characters)

#### Print Reports

1. Click **"Print"** button
2. Print preview opens in new window
3. Use browser print (Ctrl+P / Cmd+P)
4. Select printer or Save as PDF

**Print Format:**
- Professional layout
- Company header
- Date range
- Page numbers
- Totals and subtotals

#### PDF Reports

Some reports have dedicated PDF:
- VAT Register
- Purchase Orders
- Sale Receipts

1. Click **"PDF"** button
2. PDF opens in new tab
3. Download or print

### 10.8 X-Report & Z-Report

#### X-Report (Shift Snapshot)

**Access:** Reports → X/Z Report

**Purpose:** View current shift totals without closing

**Shows:**
- Transactions count
- Total sales
- VAT collected
- Payment breakdown
- Generated timestamp

**Use Case:** Mid-shift check, manager review

#### Z-Report (End of Day)

**Access:** Reports → X/Z Report → Run Z-Report

**Purpose:** Close business day and reconcile cash

**Process:**
1. Count physical cash in drawer
2. Enter closing balance
3. Click **"Run Z-Report"**

**Shows:**
- All X-Report data
- Opening balance
- Expected cash
- Actual cash (your count)
- Variance (over/short)
- Z-Report number

**Effects:**
- Closes cash drawer session
- Resets daily counters
- Creates permanent record

**Important:** Run only once per day at close of business.

---

## 11. KRA eTIMS Integration

### 11.1 eTIMS Overview

Kenya Revenue Authority (KRA) requires all VAT-registered businesses to submit sales data electronically through the eTIMS system.

**KASTRA POS provides:**
- Automatic eTIMS submission
- QR code receipts
- Control number tracking
- Offline VSCU support
- Compliance reports

### 11.2 eTIMS Configuration

#### Obtain eTIMS Credentials

1. Register on KRA iTax portal
2. Apply for eTIMS access
3. Receive credentials:
   - Branch ID (BHF ID)
   - TIN (KRA PIN)
   - CMC Key

#### Configure in KASTRA POS

1. Go to **Settings** → **KRA eTIMS**
2. Enter credentials:
   - **Branch ID**: Usually "00"
   - **TIN**: Your P000000000A format
   - **CMC Key**: From KRA
3. Select environment:
   - **Test**: For testing (sandbox)
   - **Production**: For live operations
4. Click **"Save & Test Connection"**

**Status:** If successful, shows "Connected ✓"

### 11.3 Automatic Submission

When enabled, every sale automatically:

1. **Sale Completed** at POS
2. **Data Sent** to KRA eTIMS API
3. **Control Number** received from KRA
4. **QR Code** generated with control number
5. **Receipt Printed** with QR code

**Receipt QR Code Contains:**
- Receipt number
- Date and time
- Total amount
- VAT amount
- eTIMS control number
- Business TIN

**Customer can scan QR code to verify with KRA.**

### 11.4 Manual Submission

For offline sales or resubmission:

1. Go to **Sales History**
2. Filter: **eTIMS Submitted = No**
3. Select sales to submit
4. Click **"Submit to eTIMS"**
5. System processes batch submission

**Status Updates:**
- ✅ Submitted successfully
- ❌ Failed (with error message)
- ⏳ Pending

### 11.5 VSCU (Offline Mode)

For areas with poor internet:

**Virtual Sales Control Unit (VSCU):**
- Stores sales locally
- Batches submissions
- Submits when online
- Maintains compliance

**Setup:**
1. Install KASTRA Desktop App (Tauri)
2. Enable VSCU mode
3. Configure sync schedule
4. Sales stored locally
5. Auto-submit when connected

### 11.6 eTIMS Reports

#### KRA Export

**Access:** Reports → KRA Export

**Generates:**
- JSON format (KRA-compatible)
- All sales in date range
- eTIMS control numbers
- Submission status
- VAT/TOT breakdown

**Use Case:** Monthly KRA filing, audits

#### Compliance Dashboard

**Shows:**
- Submission rate (%)
- Pending submissions
- Failed submissions
- Last sync time

**Actions:**
- Retry failed submissions
- Download compliance report
- View submission history

---

## 12. Troubleshooting

### 12.1 Common Issues

#### Cannot Login

**Symptoms:**
- "Invalid credentials" error
- Login button not responding

**Solutions:**
1. Verify email and password
2. Check Caps Lock is off
3. Try password reset
4. Clear browser cache
5. Try different browser

**Password Reset:**
1. Click "Forgot Password"
2. Enter email
3. Check email for reset link
4. Create new password

#### Barcode Scanner Not Working

**Symptoms:**
- Scans not registering
- Wrong characters appearing

**Solutions:**
1. Check USB connection
2. Test scanner in Notepad (should type numbers)
3. Verify scanner mode (keyboard emulation)
4. Check scanner battery (if wireless)
5. Re-pair Bluetooth scanner

**Configuration:**
- Scanner should be in "keyboard wedge" mode
- Add Enter/Return after scan (suffix)
- No prefix required

#### Receipt Printer Not Printing

**Symptoms:**
- Print command sent but nothing prints
- Printer offline

**Solutions:**
1. Check power and paper
2. Verify USB/Network connection
3. Check printer status lights
4. Test print from printer (self-test)
5. Reinstall printer driver
6. Check printer settings in KASTRA

**Printer Configuration:**
1. Go to **Settings** → **Printers**
2. Click **"+ Add Printer"**
3. Select type (USB/Network/Bluetooth)
4. Enter details
5. Click **"Test Print"**

#### Stock Not Updating

**Symptoms:**
- Sales completed but stock unchanged
- Stock shows incorrect quantity

**Solutions:**
1. Verify item has "Track Stock" enabled
2. Check inventory movements log
3. Refresh page (F5)
4. Check for failed sync
5. Contact support if persists

**Check Movements:**
1. Go to item details
2. Click **"View Movements"**
3. Verify all transactions logged

#### M-Pesa Payment Not Reflecting

**Symptoms:**
- Customer paid but system shows unpaid
- M-Pesa reference not found

**Solutions:**
1. Verify M-Pesa code is correct
2. Check M-Pesa statement
3. Manual payment entry:
   - Go to sale
   - Click "Add Payment"
   - Enter M-Pesa details
4. Contact M-Pesa support if needed

### 12.2 Performance Issues

#### Slow Loading

**Causes:**
- Poor internet connection
- Large database
- Many concurrent users

**Solutions:**
1. Check internet speed
2. Clear browser cache
3. Close unused tabs
4. Restart browser
5. Upgrade server resources

#### System Freezing

**Solutions:**
1. Check browser console for errors (F12)
2. Disable browser extensions
3. Update browser to latest version
4. Check server CPU/RAM usage
5. Restart application

### 12.3 Data Issues

#### Missing Sales

**Symptoms:**
- Sales not appearing in reports
- Transactions disappeared

**Solutions:**
1. Check date filter range
2. Verify store filter
3. Check sale status filter
4. Look in deleted/voided sales
5. Check database backup

#### Duplicate Items

**Symptoms:**
- Same product appears twice
- Different IDs but same name

**Solutions:**
1. Merge duplicate items:
   - Go to Inventory
   - Select duplicates
   - Click "Merge Items"
2. Update barcodes to unique values
3. Retrain staff on item selection

### 12.4 eTIMS Issues

#### Submission Failed

**Error Messages:**

**"Invalid TIN"**
- Verify TIN format (P000000000A)
- Check with KRA iTax portal

**"Branch not registered"**
- Register branch on eTIMS portal
- Wait 24 hours for activation

**"Connection timeout"**
- Check internet connection
- Verify eTIMS API is online
- Try manual submission later

**"Invalid CMC Key"**
- Regenerate CMC key on iTax
- Update in KASTRA settings

#### QR Code Not Generating

**Solutions:**
1. Verify eTIMS submission successful
2. Check control number received
3. Regenerate receipt
4. Update QR code library

### 12.5 Getting Support

#### Self-Service Resources

1. **User Manual**: This document
2. **Video Tutorials**: Available on website
3. **FAQ**: Common questions answered
4. **Knowledge Base**: Searchable articles

#### Contact Support

**Email Support:**
- Email: support@kastrapos.co.ke
- Response time: 24 hours
- Include: Business name, issue description, screenshots

**Phone Support:**
- Phone: +254 700 000 000
- Hours: Mon-Fri 8AM-6PM EAT
- For urgent issues only

**Live Chat:**
- Available in app (bottom right)
- Hours: Mon-Fri 9AM-5PM EAT
- Average response: 5 minutes

**Remote Assistance:**
- Request via support ticket
- Technician connects remotely
- Screen sharing for troubleshooting

#### Reporting Bugs

When reporting issues, include:
1. **What happened**: Describe the issue
2. **Expected behavior**: What should happen
3. **Steps to reproduce**: How to recreate
4. **Screenshots**: Visual evidence
5. **Browser/Device**: Technical details
6. **Error messages**: Exact text

**Bug Report Template:**
```
Subject: [BUG] Brief description

Environment:
- Browser: Chrome 120
- OS: Windows 11
- User Role: Cashier

Steps to Reproduce:
1. Go to POS
2. Add item to cart
3. Click payment
4. Error appears

Expected: Payment should process
Actual: Error "Payment failed"

Screenshot: [attached]
```

---

