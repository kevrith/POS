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

