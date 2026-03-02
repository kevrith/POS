# KASTRA POS System
## Enterprise User Manual & Installation Guide

**Version:** 1.0  
**Last Updated:** March 2026  
**Document Type:** Enterprise Installation & User Guide  
**Classification:** Internal Use

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [System Requirements](#2-system-requirements)
3. [Installation Guide](#3-installation-guide)
4. [Initial Setup & Configuration](#4-initial-setup--configuration)
5. [User Roles & Permissions](#5-user-roles--permissions)
6. [Point of Sale Operations](#6-point-of-sale-operations)
7. [Inventory Management](#7-inventory-management)
8. [Purchase Orders & Suppliers](#8-purchase-orders--suppliers)
9. [Hospitality Features](#9-hospitality-features)
10. [Reports & Analytics](#10-reports--analytics)
11. [KRA eTIMS Integration](#11-kra-etims-integration)
12. [Troubleshooting](#12-troubleshooting)
13. [Appendix](#13-appendix)

---

## 1. Introduction

### 1.1 About KASTRA POS

KASTRA POS is an enterprise-grade, offline-first Point of Sale system designed specifically for Kenyan businesses. The system provides comprehensive business management capabilities including:

- **Multi-channel Sales**: Retail, Restaurant, Salon, Clinic, Supermarket modes
- **KRA eTIMS Compliance**: Automated tax reporting and submission
- **Offline-First Architecture**: Continue operations during internet outages
- **Multi-store Management**: Centralized control across multiple locations
- **Advanced Inventory**: Batch tracking, serial numbers, expiry management
- **Financial Management**: P&L, expenses, cash drawer, commission tracking
- **HR & Attendance**: Employee management, shift tracking, leave management

### 1.2 Key Features

#### Sales & POS
- Fast checkout with barcode scanning
- Multiple payment methods (Cash, M-Pesa, Card, Credit)
- Split payments and partial payments
- Discounts and promotions
- Layaway and proforma invoices
- Receipt printing and email

#### Inventory
- Real-time stock tracking
- Batch and expiry management (pharmacy/food)
- Serial number tracking (electronics)
- Recipe/BOM management (restaurants)
- Bundle/kit management
- Multi-store transfers
- Automatic reorder alerts

#### Compliance
- KRA eTIMS integration
- VAT/TOT reporting
- Tamper-evident audit logs
- QR code receipts
- VSCU offline submission

#### Business Intelligence
- 20+ report types
- Real-time dashboards
- Sales analytics by employee, category, time
- Profit & loss statements
- Supplier performance tracking
- Customer credit management

### 1.3 System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    KASTRA POS System                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Web App    │  │  Desktop App │  │  Mobile Apps │ │
│  │  (React PWA) │  │   (Tauri)    │  │ (React Native)│ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
│         │                  │                  │          │
│         └──────────────────┼──────────────────┘          │
│                            │                             │
│                    ┌───────▼────────┐                    │
│                    │   REST API     │                    │
│                    │   (NestJS)     │                    │
│                    └───────┬────────┘                    │
│                            │                             │
│         ┌──────────────────┼──────────────────┐         │
│         │                  │                  │          │
│  ┌──────▼──────┐  ┌────────▼────────┐  ┌─────▼─────┐  │
│  │  PostgreSQL │  │  Redis/BullMQ   │  │  SQLite   │  │
│  │  (Production)│  │  (Job Queue)    │  │  (Offline)│  │
│  └─────────────┘  └─────────────────┘  └───────────┘  │
│                                                          │
│  External Integrations:                                 │
│  • KRA eTIMS API                                        │
│  • M-Pesa Daraja API                                    │
│  • Email (Resend)                                       │
│  • SMS (Africa's Talking)                               │
│  • Accounting (QuickBooks)                              │
└─────────────────────────────────────────────────────────┘
```

---

## 2. System Requirements

### 2.1 Server Requirements (Production)

#### Minimum Specifications
- **CPU**: 2 cores, 2.0 GHz
- **RAM**: 4 GB
- **Storage**: 50 GB SSD
- **OS**: Ubuntu 20.04 LTS or later
- **Network**: 10 Mbps internet connection

#### Recommended Specifications
- **CPU**: 4 cores, 3.0 GHz
- **RAM**: 8 GB
- **Storage**: 100 GB SSD (NVMe preferred)
- **OS**: Ubuntu 22.04 LTS
- **Network**: 50 Mbps internet connection with backup 4G

### 2.2 Client Requirements

#### Web Browser (POS Terminals)
- **Browser**: Chrome 90+, Firefox 88+, Edge 90+
- **RAM**: 4 GB minimum
- **Screen**: 1366x768 minimum (1920x1080 recommended)
- **Peripherals**: 
  - Barcode scanner (USB/Bluetooth)
  - Receipt printer (USB/Network/Bluetooth)
  - Cash drawer (connected to printer)

#### Desktop Application
- **OS**: Windows 10/11, macOS 11+, Linux (Ubuntu 20.04+)
- **RAM**: 4 GB minimum
- **Storage**: 2 GB free space

#### Mobile Application
- **Android**: Version 8.0+ (API level 26+)
- **iOS**: Version 13.0+
- **RAM**: 2 GB minimum
- **Storage**: 500 MB free space

### 2.3 Network Requirements

- **Bandwidth**: 5 Mbps per terminal (minimum)
- **Latency**: <100ms to server
- **Backup**: 4G/LTE modem recommended for failover
- **Local Network**: Gigabit Ethernet for multi-terminal setups

### 2.4 Software Dependencies

#### Server
- Node.js 18.x or 20.x
- PostgreSQL 14+ (or SQLite for single-store)
- Redis 6+ (optional, for job queues)
- Nginx (reverse proxy)
- PM2 (process manager)

#### Development
- pnpm 8+
- Git 2.30+
- Docker 20+ (optional)

---

## 3. Installation Guide

### 3.1 Pre-Installation Checklist

Before beginning installation, ensure you have:

- [ ] Server with Ubuntu 22.04 LTS installed
- [ ] Root or sudo access
- [ ] Domain name configured (e.g., pos.yourbusiness.co.ke)
- [ ] SSL certificate (Let's Encrypt recommended)
- [ ] KRA eTIMS credentials (if applicable)
- [ ] M-Pesa API credentials (if using M-Pesa)
- [ ] Email service credentials (Resend or SMTP)

### 3.2 Server Setup (Ubuntu 22.04)

#### Step 1: Update System

```bash
# Update package lists
sudo apt update && sudo apt upgrade -y

# Install essential tools
sudo apt install -y curl wget git build-essential
```

#### Step 2: Install Node.js

```bash
# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x

# Install pnpm globally
npm install -g pnpm
```

#### Step 3: Install PostgreSQL

```bash
# Install PostgreSQL 14
sudo apt install -y postgresql postgresql-contrib

# Start and enable PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql << EOF
CREATE DATABASE kastra_pos;
CREATE USER kastra_user WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE kastra_pos TO kastra_user;
\q
EOF
```

#### Step 4: Install Redis (Optional)

```bash
# Install Redis
sudo apt install -y redis-server

# Configure Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Test Redis
redis-cli ping  # Should return PONG
```

#### Step 5: Install PM2

```bash
# Install PM2 globally
npm install -g pm2

# Configure PM2 to start on boot
pm2 startup
# Follow the command output instructions
```

### 3.3 Application Installation

#### Step 1: Clone Repository

```bash
# Create application directory
sudo mkdir -p /opt/kastra-pos
sudo chown $USER:$USER /opt/kastra-pos

# Clone repository
cd /opt/kastra-pos
git clone https://github.com/yourusername/kastra-pos.git .

# Or upload your source code
# scp -r ./pos-system user@server:/opt/kastra-pos/
```

#### Step 2: Install Dependencies

```bash
cd /opt/kastra-pos

# Install all dependencies
pnpm install

# This will install dependencies for:
# - apps/api (Backend)
# - apps/web (Frontend)
# - apps/admin (Admin panel)
# - packages/shared (Shared utilities)
```

#### Step 3: Configure Environment Variables

```bash
# Copy example environment file
cp .env.example .env

# Edit configuration
nano .env
```

**Required Configuration:**

```bash
# Database
DATABASE_URL="postgresql://kastra_user:your_secure_password@localhost:5432/kastra_pos"

# JWT Secret (generate with: openssl rand -hex 32)
JWT_SECRET="your-generated-jwt-secret-64-characters-long"

# Encryption Key (generate with: openssl rand -hex 32)
ENCRYPTION_KEY="your-generated-encryption-key-64-hex-characters"

# Application URLs
FRONTEND_URL="https://pos.yourbusiness.co.ke"
API_URL="https://api.yourbusiness.co.ke/api/v1"
ADMIN_URL="https://admin.yourbusiness.co.ke"

# Super Admin
SUPER_ADMIN_EMAIL="admin@yourbusiness.co.ke"
SUPER_ADMIN_PASSWORD="change-this-secure-password"

# KRA eTIMS
ETIMS_BASE_URL="https://etims-api.kra.go.ke/etims-api"
ETIMS_ENV="production"

# M-Pesa (Optional)
MPESA_CONSUMER_KEY="your-mpesa-consumer-key"
MPESA_CONSUMER_SECRET="your-mpesa-consumer-secret"
MPESA_SHORTCODE="your-shortcode"
MPESA_PASSKEY="your-passkey"
MPESA_ENV="production"

# Email (Resend)
RESEND_API_KEY="your-resend-api-key"
EMAIL_FROM="KASTRA POS <receipts@yourbusiness.co.ke>"

# Redis (if installed)
REDIS_HOST="localhost"
REDIS_PORT=6379
```

#### Step 4: Run Database Migrations

```bash
cd /opt/kastra-pos

# Run Prisma migrations
pnpm --filter @pos/api prisma migrate deploy

# Seed initial data (optional)
pnpm --filter @pos/api prisma db seed
```

#### Step 5: Build Applications

```bash
cd /opt/kastra-pos

# Build API
pnpm --filter @pos/api build

# Build Web App
pnpm --filter @pos/web build

# Build Admin Panel
pnpm --filter @pos/admin build
```

### 3.4 Configure Nginx

#### Step 1: Install Nginx

```bash
sudo apt install -y nginx
```

#### Step 2: Create Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/kastra-pos
```

**Nginx Configuration:**

```nginx
# API Server
server {
    listen 80;
    server_name api.yourbusiness.co.ke;

    location / {
        proxy_pass http://localhost:3010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Web App
server {
    listen 80;
    server_name pos.yourbusiness.co.ke;

    root /opt/kastra-pos/apps/web/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:3010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Admin Panel
server {
    listen 80;
    server_name admin.yourbusiness.co.ke;

    root /opt/kastra-pos/apps/admin/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

#### Step 3: Enable Site and Restart Nginx

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/kastra-pos /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

#### Step 4: Install SSL Certificate

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain SSL certificates
sudo certbot --nginx -d api.yourbusiness.co.ke
sudo certbot --nginx -d pos.yourbusiness.co.ke
sudo certbot --nginx -d admin.yourbusiness.co.ke

# Auto-renewal is configured automatically
```

### 3.5 Start Application with PM2

```bash
cd /opt/kastra-pos

# Start API server
pm2 start apps/api/dist/main.js --name kastra-api

# Save PM2 configuration
pm2 save

# Check status
pm2 status

# View logs
pm2 logs kastra-api
```

### 3.6 Firewall Configuration

```bash
# Enable UFW
sudo ufw enable

# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Check status
sudo ufw status
```

### 3.7 Verify Installation

1. **API Health Check**
   ```bash
   curl https://api.yourbusiness.co.ke/health
   # Should return: {"status":"ok"}
   ```

2. **Web App Access**
   - Open browser: https://pos.yourbusiness.co.ke
   - Should see login page

3. **Admin Panel Access**
   - Open browser: https://admin.yourbusiness.co.ke
   - Login with super admin credentials

---

## 4. Initial Setup & Configuration

### 4.1 First-Time Setup Wizard

When you first access the system, you'll be guided through a setup wizard:

#### Step 1: Welcome Screen

The welcome screen introduces you to KASTRA POS and outlines the setup process:
- Business Profile
- Store Setup
- KRA eTIMS (optional)
- Ready to Sell

**Action:** Click "Get Started"

#### Step 2: Business Profile

Configure your business information:

**Fields:**
- **Business Name**: Enter your registered business name
  - Example: "Premier Café & Retail"
  
- **Tax Type**: Select your tax registration
  - **VAT (16%)**: For businesses with turnover > KES 5M annually
  - **TOT (3%)**: For businesses with turnover < KES 5M annually
  - **Configure Later**: Skip for now, set in Settings

- **Business Type**: Choose your primary business model
  - **Retail**: General merchandise store
  - **Restaurant**: Table service with Kitchen Order Tickets
  - **Supermarket**: High-volume grocery operations
  - **Salon/Spa**: Service-based appointments
  - **Clinic**: Healthcare with prescriptions

**Important:** Business type determines which modules are visible in your navigation menu.

**Action:** Fill in details and click "Save & Continue"

#### Step 3: Store Setup

Configure your first physical location:

**Fields:**
- **Store Name**: Descriptive name for this location
  - Example: "Main Branch - Nairobi CBD"
  
- **Store Code**: Short code for receipts (max 10 characters)
  - Example: "NRB01"
  - Used in receipt numbers: NRB01-2026-0000001

**Action:** Click "Create Store"

#### Step 4: KRA eTIMS Integration (Optional)

Connect to Kenya Revenue Authority for tax compliance:

**Fields:**
- **Branch ID (BHF ID)**: Your KRA branch identifier
  - Usually "00" for single location
  
- **KRA PIN (TIN)**: Your Tax Identification Number
  - Format: P000000000A
  
- **CMC Key**: Your eTIMS Communication Key
  - Obtained from KRA iTax portal

**Options:**
- **Skip for Now**: Configure later in Settings → KRA eTIMS
- **Save & Continue**: Validate and save credentials

**Action:** Either skip or enter credentials

#### Step 5: Setup Complete

Congratulations! Your system is ready.

**Next Steps:**
- Add Products (Inventory)
- Add Staff (Settings)
- View Reports
- **Start Selling** (recommended)

**Action:** Click "Start Selling" to go to POS

### 4.2 Adding Your First Products

Before making sales, add products to your inventory:

#### Navigate to Inventory

1. Click **Inventory** in the left sidebar
2. Click **Items & Stock**

#### Add New Item

1. Click **"+ Add Item"** button
2. Fill in product details:

**Basic Information:**
- **Item Name**: Product name (e.g., "Coca-Cola 500ml")
- **Category**: Group items (e.g., "Beverages")
- **Type**: 
  - Product (physical goods)
  - Service (non-stock items)
  - Weighted (sold by weight)
  - Bundle (multiple items)
  - Recipe (manufactured items)

**Pricing (in KES):**
- **Retail Price**: Standard selling price (VAT-inclusive)
- **Wholesale Price**: Bulk pricing (optional)
- **Cost Price**: Your purchase cost

**Stock Management:**
- **Track Stock**: Enable for physical inventory
- **Initial Quantity**: Starting stock level
- **Reorder Level**: Alert when stock falls below this

**Tax:**
- **VAT Applicable**: Check if item is VAT-rated (16%)
- **TOT Applicable**: Check if item is TOT-rated (3%)

**Additional:**
- **Barcode**: Scan or enter barcode number
- **SKU**: Internal stock keeping unit

3. Click **"Save Item"**

#### Bulk Import (Optional)

For large catalogs:

1. Click **"Import"** button
2. Download CSV template
3. Fill in Excel/Google Sheets
4. Upload completed CSV

**CSV Format:**
```csv
name,category,type,retailPrice,costPrice,barcode,trackStock,vatApplicable
Coca-Cola 500ml,Beverages,PRODUCT,55,35,6001020003004,true,true
Tusker Beer 500ml,Beverages,PRODUCT,350,250,6001020003003,true,true
```

### 4.3 Adding Staff Members

#### Navigate to Settings

1. Click **Settings** in the left sidebar
2. Click **Users & Roles** tab

#### Add New User

1. Click **"+ Add User"** button
2. Fill in user details:

**Personal Information:**
- **Full Name**: Employee's full name
- **Email**: For login and notifications
- **Phone**: Contact number

**Access Control:**
- **Role**: Select from:
  - **Owner**: Full system access
  - **Manager**: All operations except settings
  - **Accountant**: Financial reports only
  - **Cashier**: POS and cash drawer
  - **Waiter**: Hospitality and tables
  - **Kitchen**: Kitchen display only

- **PIN**: 4-6 digit PIN for quick login
- **Stores**: Assign to specific locations

**Employment (Optional):**
- **ID Number**: National ID
- **Start Date**: Employment start date
- **Commission Rate**: Percentage or per-transaction
- **Sales Target**: Monthly target in KES

3. Click **"Create User"**

#### User Credentials

After creation, provide the user with:
- **Email**: Their login email
- **Temporary Password**: (sent via email)
- **PIN**: For quick POS access

**First Login:**
User will be prompted to change password on first login.

---

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

## 13. Appendix

### 13.1 Keyboard Shortcuts

#### Global Shortcuts

| Shortcut | Action |
|----------|--------|
| `F2` | Focus search bar |
| `F9` | Open cash drawer |
| `F10` | Quick sale (last item) |
| `Ctrl + K` | Command palette |
| `Ctrl + /` | Show shortcuts |
| `Esc` | Close modal/cancel |

#### POS Shortcuts

| Shortcut | Action |
|----------|--------|
| `F1` | New sale |
| `F3` | Select customer |
| `F4` | Apply discount |
| `F5` | Cash payment |
| `F6` | M-Pesa payment |
| `F7` | Card payment |
| `F8` | Credit payment |
| `Ctrl + Enter` | Complete sale |
| `Ctrl + Backspace` | Clear cart |

#### Navigation

| Shortcut | Action |
|----------|--------|
| `Alt + 1` | POS |
| `Alt + 2` | Inventory |
| `Alt + 3` | Reports |
| `Alt + 4` | Customers |
| `Alt + 5` | Settings |

### 13.2 Glossary

**BHF ID**: Branch ID for KRA eTIMS system

**Bundle**: Package of multiple items sold together at a discount

**Cash Drawer Session**: Period from opening to closing cash drawer

**CMC Key**: Communication Key for KRA eTIMS authentication

**COGS**: Cost of Goods Sold

**Credit Sale**: Sale where payment is deferred

**eTIMS**: Electronic Tax Invoice Management System (KRA)

**GRN**: Goods Received Note - document for received inventory

**KDS**: Kitchen Display System for restaurant orders

**KOT**: Kitchen Order Ticket - printed order for kitchen

**Layaway**: Payment plan where customer pays in installments

**PO**: Purchase Order - order placed with supplier

**Proforma**: Quotation or pro forma invoice

**Recipe/BOM**: Bill of Materials - ingredients for manufactured items

**SKU**: Stock Keeping Unit - unique product identifier

**TIN**: Tax Identification Number (KRA PIN)

**TOT**: Turnover Tax (3% for small businesses)

**VAT**: Value Added Tax (16% in Kenya)

**VSCU**: Virtual Sales Control Unit for offline eTIMS

**X-Report**: Mid-shift sales report (doesn't close day)

**Z-Report**: End-of-day report (closes business day)

### 13.3 Default Credentials

#### After Fresh Installation

**Super Admin:**
- Email: admin@kastrapos.co.ke
- Password: (set during installation)

**Seeded Test Users:**
- Owner: owner@premiercafe.co.ke / password123 (PIN: 1234)
- Manager: manager@premiercafe.co.ke / manager123 (PIN: 5678)
- Cashier: cashier@premiercafe.co.ke / cashier123 (PIN: 0000)
- Waiter: waiter@premiercafe.co.ke / waiter123 (PIN: 9999)

**⚠️ Security Warning:** Change all default passwords immediately in production!

### 13.4 API Endpoints

For developers integrating with KASTRA POS:

**Base URL:** `https://api.yourbusiness.co.ke/api/v1`

**Authentication:** JWT Bearer Token

#### Key Endpoints

```
POST   /auth/login              # User login
POST   /auth/logout             # User logout
GET    /auth/me                 # Current user info

GET    /items                   # List items
POST   /items                   # Create item
GET    /items/:id               # Get item details
PATCH  /items/:id               # Update item
DELETE /items/:id               # Delete item

POST   /sales                   # Create sale
GET    /sales                   # List sales
GET    /sales/:id               # Get sale details
POST   /sales/:id/void          # Void sale
POST   /sales/:id/return        # Return sale

GET    /reports/sales           # Sales report
GET    /reports/vat             # VAT report
GET    /reports/stock-valuation # Stock report
GET    /reports/profit-loss     # P&L report

POST   /etims/submit            # Submit to eTIMS
GET    /etims/status/:saleId    # Check eTIMS status
```

**Full API Documentation:** https://api.yourbusiness.co.ke/docs

### 13.5 Database Backup

#### Automated Backups

**PostgreSQL:**
```bash
# Daily backup (cron job)
0 2 * * * pg_dump kastra_pos > /backups/kastra_$(date +\%Y\%m\%d).sql
```

**Retention Policy:**
- Daily backups: 7 days
- Weekly backups: 4 weeks
- Monthly backups: 12 months

#### Manual Backup

```bash
# Backup database
pg_dump kastra_pos > backup.sql

# Restore database
psql kastra_pos < backup.sql
```

#### Backup Verification

Test restore monthly:
1. Create test database
2. Restore backup
3. Verify data integrity
4. Delete test database

### 13.6 Security Best Practices

#### Password Policy

- Minimum 12 characters
- Mix of uppercase, lowercase, numbers, symbols
- Change every 90 days
- No password reuse (last 5)
- Two-factor authentication (TOTP) for owners

#### Access Control

- Principle of least privilege
- Regular access reviews
- Disable inactive accounts
- Audit log monitoring
- IP whitelisting for admin panel

#### Data Protection

- Encryption at rest (database)
- Encryption in transit (HTTPS/TLS)
- Encrypted backups
- Secure credential storage
- PCI DSS compliance for card payments

#### Network Security

- Firewall rules (UFW)
- Fail2ban for brute force protection
- Regular security updates
- VPN for remote access
- Network segmentation

### 13.7 Compliance Checklist

#### KRA eTIMS Compliance

- [ ] eTIMS credentials configured
- [ ] All sales submitted to eTIMS
- [ ] QR codes on receipts
- [ ] Monthly VAT returns filed
- [ ] Audit logs maintained
- [ ] VSCU configured for offline

#### Data Protection (KDPA)

- [ ] Privacy policy published
- [ ] Customer consent obtained
- [ ] Data retention policy
- [ ] Secure data storage
- [ ] Data breach response plan
- [ ] DPO appointed (if required)

#### Financial Compliance

- [ ] Accurate financial records
- [ ] Audit trail maintained
- [ ] Regular reconciliation
- [ ] Expense documentation
- [ ] Supplier invoices filed
- [ ] Tax payments current

### 13.8 System Maintenance

#### Daily Tasks

- [ ] Verify backups completed
- [ ] Check system logs for errors
- [ ] Monitor disk space
- [ ] Review failed eTIMS submissions
- [ ] Reconcile cash drawers

#### Weekly Tasks

- [ ] Review user access
- [ ] Check system performance
- [ ] Update inventory counts
- [ ] Review low stock alerts
- [ ] Analyze sales trends

#### Monthly Tasks

- [ ] Security updates
- [ ] Database optimization
- [ ] Backup verification
- [ ] User training refresher
- [ ] Generate compliance reports
- [ ] Review and archive old data

#### Quarterly Tasks

- [ ] Full system audit
- [ ] Disaster recovery test
- [ ] Performance review
- [ ] Capacity planning
- [ ] Contract renewals

### 13.9 Upgrade Procedures

#### Before Upgrading

1. **Backup Everything**
   - Database
   - Configuration files
   - Custom modifications

2. **Review Release Notes**
   - Breaking changes
   - New features
   - Migration steps

3. **Test in Staging**
   - Clone production
   - Apply upgrade
   - Test critical workflows

#### Upgrade Steps

```bash
# 1. Backup
pg_dump kastra_pos > backup_pre_upgrade.sql

# 2. Stop application
pm2 stop kastra-api

# 3. Pull latest code
cd /opt/kastra-pos
git pull origin main

# 4. Install dependencies
pnpm install

# 5. Run migrations
pnpm --filter @pos/api prisma migrate deploy

# 6. Build applications
pnpm --filter @pos/api build
pnpm --filter @pos/web build

# 7. Start application
pm2 start kastra-api

# 8. Verify
curl https://api.yourbusiness.co.ke/health
```

#### Rollback Plan

If upgrade fails:

```bash
# 1. Stop application
pm2 stop kastra-api

# 2. Restore code
git reset --hard <previous-commit>

# 3. Restore database
psql kastra_pos < backup_pre_upgrade.sql

# 4. Restart
pm2 start kastra-api
```

### 13.10 Performance Optimization

#### Database Optimization

```sql
-- Analyze tables
ANALYZE;

-- Vacuum database
VACUUM FULL;

-- Reindex
REINDEX DATABASE kastra_pos;
```

#### Application Optimization

- Enable Redis caching
- Configure CDN for static assets
- Optimize images (WebP format)
- Enable gzip compression
- Implement lazy loading

#### Server Optimization

- Increase PostgreSQL shared_buffers
- Configure connection pooling
- Enable query caching
- Monitor slow queries
- Scale horizontally (load balancer)

### 13.11 Disaster Recovery

#### Recovery Time Objective (RTO)

**Target:** 4 hours

**Steps:**
1. Provision new server (1 hour)
2. Restore database (1 hour)
3. Deploy application (1 hour)
4. Verify and test (1 hour)

#### Recovery Point Objective (RPO)

**Target:** 24 hours

**Achieved through:**
- Daily automated backups
- Transaction logs
- Offsite backup storage

#### Disaster Scenarios

**Scenario 1: Server Failure**
- Restore from backup to new server
- Update DNS records
- Notify users

**Scenario 2: Database Corruption**
- Restore from last good backup
- Replay transaction logs
- Verify data integrity

**Scenario 3: Ransomware Attack**
- Isolate infected systems
- Restore from clean backup
- Scan for malware
- Change all passwords

### 13.12 Training Resources

#### Video Tutorials

Available at: https://training.kastrapos.co.ke

**Topics:**
- Getting Started (15 min)
- POS Operations (30 min)
- Inventory Management (45 min)
- Reports & Analytics (30 min)
- KRA eTIMS Setup (20 min)
- Troubleshooting (25 min)

#### Live Training

**Group Training:**
- Duration: 4 hours
- Capacity: 10 participants
- Cost: KES 50,000 per session
- Includes: Certificates, manual, support

**One-on-One Training:**
- Duration: 2 hours
- Cost: KES 15,000 per person
- Customized to your needs

**Contact:** training@kastrapos.co.ke

#### Certification Program

**KASTRA POS Certified User:**
- Online exam (50 questions)
- 80% pass mark
- Valid for 2 years
- Certificate issued

**Benefits:**
- Verified expertise
- Priority support
- Community access
- Job opportunities

---

## Converting This Manual to PDF

### Method 1: Using Pandoc (Recommended)

**Install Pandoc:**
```bash
# Ubuntu/Debian
sudo apt install pandoc texlive-latex-base texlive-fonts-recommended

# macOS
brew install pandoc basictex

# Windows
# Download from: https://pandoc.org/installing.html
```

**Combine All Parts:**
```bash
# Combine markdown files
cat USER_MANUAL.md USER_MANUAL_PART2.md USER_MANUAL_PART3.md > COMPLETE_MANUAL.md

# Convert to PDF
pandoc COMPLETE_MANUAL.md -o KASTRA_POS_User_Manual.pdf \
  --pdf-engine=xelatex \
  --toc \
  --toc-depth=3 \
  --number-sections \
  -V geometry:margin=1in \
  -V fontsize=11pt \
  -V documentclass=report \
  --highlight-style=tango
```

### Method 2: Using Microsoft Word

1. Open Word
2. File → Open → Select `USER_MANUAL.md`
3. Word will convert markdown to formatted document
4. Repeat for PART2 and PART3
5. Combine documents
6. Add page numbers and table of contents
7. File → Save As → PDF

### Method 3: Using Google Docs

1. Open Google Docs
2. File → Open → Upload markdown files
3. Use "Docs to Markdown" add-on (reverse)
4. Format as needed
5. File → Download → PDF

### Method 4: Using Online Converters

**Recommended Sites:**
- https://www.markdowntopdf.com/
- https://dillinger.io/ (export to PDF)
- https://md2pdf.netlify.app/

**Steps:**
1. Copy markdown content
2. Paste into converter
3. Adjust settings (margins, fonts)
4. Download PDF

### Adding Images/Screenshots

To add screenshots to the manual:

1. **Take Screenshots:**
   - Use Snipping Tool (Windows)
   - Use Screenshot (macOS: Cmd+Shift+4)
   - Use Flameshot (Linux)

2. **Save Images:**
   ```
   /pos/docs/images/
   ├── login-screen.png
   ├── pos-interface.png
   ├── inventory-list.png
   ├── reports-dashboard.png
   └── settings-page.png
   ```

3. **Reference in Markdown:**
   ```markdown
   ![Login Screen](./docs/images/login-screen.png)
   ```

4. **Convert with Images:**
   ```bash
   pandoc COMPLETE_MANUAL.md -o Manual.pdf \
     --resource-path=./docs/images
   ```

### Professional Formatting Tips

**Cover Page:**
```markdown
---
title: "KASTRA POS System"
subtitle: "Enterprise User Manual & Installation Guide"
author: "KASTRA Technologies"
date: "March 2026"
version: "1.0"
---
```

**Headers and Footers:**
```markdown
---
header-includes:
  - \usepackage{fancyhdr}
  - \pagestyle{fancy}
  - \fancyhead[L]{KASTRA POS User Manual}
  - \fancyhead[R]{Version 1.0}
  - \fancyfoot[C]{\thepage}
---
```

**Custom Styling:**
```markdown
---
mainfont: "Arial"
monofont: "Courier New"
linkcolor: blue
urlcolor: blue
toccolor: black
---
```

---

## Document Information

**Document Title:** KASTRA POS System - Enterprise User Manual & Installation Guide

**Version:** 1.0  
**Release Date:** March 2026  
**Last Updated:** March 1, 2026

**Prepared By:** KASTRA Technologies  
**Contact:** support@kastrapos.co.ke  
**Website:** https://kastrapos.co.ke

**Copyright © 2026 KASTRA Technologies. All rights reserved.**

This document is proprietary and confidential. No part of this document may be reproduced, distributed, or transmitted in any form or by any means without the prior written permission of KASTRA Technologies.

**Trademarks:**
- KASTRA POS is a trademark of KASTRA Technologies
- M-Pesa is a trademark of Safaricom PLC
- All other trademarks are property of their respective owners

**Disclaimer:**
While every effort has been made to ensure the accuracy of this manual, KASTRA Technologies assumes no responsibility for errors or omissions. The software and documentation are provided "as is" without warranty of any kind.

**Support:**
For technical support, training, or feedback on this manual, please contact:
- Email: support@kastrapos.co.ke
- Phone: +254 700 000 000
- Website: https://support.kastrapos.co.ke

---

## Quick Reference Card

**Print this page and keep at POS terminal**

### Common Tasks

| Task | Steps |
|------|-------|
| **New Sale** | F1 or click POS → Add items → Select payment → Complete |
| **Void Sale** | Sales History → Find sale → Void → Enter PIN → Confirm |
| **Add Customer** | POS → Select Customer → + New → Enter details → Save |
| **Check Stock** | Inventory → Search item → View quantity |
| **Add Stock** | Inventory → Item → Adjust → Enter quantity → Save |
| **View Reports** | Reports → Select type → Set date range → View |
| **Close Drawer** | Cash Drawer → Close → Count cash → Enter amount → Z-Report |

### Emergency Contacts

| Issue | Contact |
|-------|---------|
| **Technical Support** | +254 700 000 000 |
| **eTIMS Issues** | KRA: 0711 099 999 |
| **M-Pesa Issues** | Safaricom: 234 |
| **System Down** | support@kastrapos.co.ke |

### Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| **Scanner not working** | Check USB, test in Notepad |
| **Printer not printing** | Check power, paper, connection |
| **Slow system** | Refresh page (F5), clear cache |
| **Can't login** | Check password, try reset |
| **Stock not updating** | Verify "Track Stock" enabled |

---

**END OF MANUAL**

