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

