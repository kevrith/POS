/**
 * Comprehensive seed script for POS system development/testing
 * Run: cd apps/api && npx ts-node ../../prisma/seed.ts
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database…');

  // ─── Clean existing data (proper order to avoid FK violations) ────────────
  // Wrap each in catch so a missing table in old DBs doesn't abort the cleanup
  const d = (p: Promise<any> | undefined) => (p ?? Promise.resolve()).catch(() => {});
  // Hotel / hospitality leaf tables
  await d(prisma.guestFolioCharge.deleteMany());
  await d(prisma.roomBooking.deleteMany());
  await d(prisma.hotelRoom.deleteMany());
  await d((prisma as any).barTab?.deleteMany());
  await d(prisma.kOT.deleteMany());
  await d(prisma.orderItem.deleteMany());
  await d(prisma.order.deleteMany());
  // Delivery
  await d(prisma.deliverySLA.deleteMany());
  await d(prisma.deliveryOrder.deleteMany());
  await d(prisma.deliveryZone.deleteMany());
  await d(prisma.courierIntegration.deleteMany());
  // Stocktake
  await d(prisma.stocktakeCount.deleteMany());
  await d(prisma.stocktakeSession.deleteMany());
  // Finance
  await d(prisma.bankStatementEntry.deleteMany());
  await d(prisma.bankStatement.deleteMany());
  await d(prisma.payslip.deleteMany());
  await d(prisma.payrollRun.deleteMany());
  await d(prisma.franchiseReport.deleteMany());
  await d(prisma.dataDeletionRequest.deleteMany());
  await d(prisma.referral.deleteMany());
  await d(prisma.licenseKey.deleteMany());
  // Notifications / scheduling
  await d(prisma.notification.deleteMany());
  await d(prisma.reportSchedule.deleteMany());
  await d(prisma.budget.deleteMany());
  await d(prisma.shift.deleteMany());
  await d(prisma.leaveBalance.deleteMany());
  // Settings tables
  await d(prisma.webhook.deleteMany());
  await d(prisma.apiKey.deleteMany());
  await d(prisma.printer.deleteMany());
  await d(prisma.integration.deleteMany());
  // Sales / loyalty leaf records
  await d((prisma as any).creditNote?.deleteMany());
  await d(prisma.loyaltyTransaction.deleteMany());
  await d(prisma.loyaltyProgram.deleteMany());
  await d(prisma.giftCard.deleteMany());
  await d(prisma.promotion.deleteMany());
  await d((prisma as any).proforma?.deleteMany());
  await d((prisma as any).layaway?.deleteMany());
  await d(prisma.prescription.deleteMany());
  await d(prisma.appointment.deleteMany());
  await d(prisma.auditLog.deleteMany());
  // Core transaction records
  await d(prisma.inventoryMovement.deleteMany());
  await d(prisma.saleItem.deleteMany());
  await d(prisma.payment.deleteMany());
  await d(prisma.return.deleteMany());
  await d(prisma.voidRecord.deleteMany());
  await d(prisma.sale.deleteMany());
  await d(prisma.serialRecord.deleteMany());
  await d(prisma.gRNItem.deleteMany());
  await d(prisma.gRN.deleteMany());
  await d(prisma.pOItem.deleteMany());
  await d(prisma.supplierPriceAgreement.deleteMany());
  await d(prisma.purchaseOrder.deleteMany());
  await d(prisma.supplier.deleteMany());
  // Inventory
  await d(prisma.recipeIngredient.deleteMany());
  await d(prisma.bundleComponent.deleteMany());
  await d(prisma.itemVariant.deleteMany());
  await d(prisma.batch.deleteMany());
  // Hospitality
  await d(prisma.tableReservation.deleteMany());
  await d(prisma.table.deleteMany());
  // HR
  await d(prisma.expense.deleteMany());
  await d(prisma.leave.deleteMany());
  await d(prisma.attendanceRecord.deleteMany());
  await d((prisma as any).commission?.deleteMany());
  await d(prisma.employee.deleteMany());
  await d(prisma.cashDrawerSession.deleteMany());
  // Customers / items
  await d(prisma.customer.deleteMany());
  await d(prisma.item.deleteMany());
  // Users
  await d(prisma.userStore.deleteMany());
  await d(prisma.userSession.deleteMany());
  await d(prisma.user.deleteMany());
  // Business settings
  await d(prisma.passwordPolicy.deleteMany());
  await d(prisma.taxConfiguration.deleteMany());
  await d(prisma.customRole.deleteMany());
  await d(prisma.terminal.deleteMany());
  await d(prisma.store.deleteMany());
  await d(prisma.business.deleteMany());

  console.log('✅ Cleaned existing data');

  // ─── Business ───────────────────────────────────────────────────────────
  const business = await prisma.business.create({
    data: {
      id: 'biz-001',
      name: 'Premier Café & Retail',
      taxType: 'VAT',
      serviceChargeRate: 10,
      negativePolicyDefault: 'WARN',
      posMode: 'RETAIL',
      expiredItemPolicy: 'WARN',
      expenseApprovalThresholdCents: 500000,
      subscriptionTier: 'BUSINESS',
      subscriptionStatus: 'ACTIVE',
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  // ─── Store ──────────────────────────────────────────────────────────────
  const store = await prisma.store.create({
    data: {
      id: 'store-001',
      businessId: business.id,
      name: 'Main Branch – Nairobi CBD',
      storeCode: 'NRB01',
      receiptSequence: 100,
    },
  });

  // ─── Users ──────────────────────────────────────────────────────────────
  const owner = await prisma.user.create({
    data: {
      id: 'user-owner-001',
      businessId: business.id,
      email: 'owner@premiercafe.co.ke',
      name: 'James Mwangi',
      role: 'OWNER',
      passwordHash: await bcrypt.hash('password123', 12),
      pin: '1234',
      pinHash: await bcrypt.hash('1234', 10),
    },
  });

  const manager = await prisma.user.create({
    data: {
      id: 'user-mgr-001',
      businessId: business.id,
      email: 'manager@premiercafe.co.ke',
      name: 'Grace Wanjiku',
      role: 'MANAGER',
      passwordHash: await bcrypt.hash('manager123', 12),
      pin: '5678',
      pinHash: await bcrypt.hash('5678', 10),
    },
  });

  const cashier = await prisma.user.create({
    data: {
      id: 'user-cashier-001',
      businessId: business.id,
      email: 'cashier@premiercafe.co.ke',
      name: 'Peter Kamau',
      role: 'CASHIER',
      passwordHash: await bcrypt.hash('cashier123', 12),
      pin: '0000',
      pinHash: await bcrypt.hash('0000', 10),
    },
  });

  const waiter = await prisma.user.create({
    data: {
      id: 'user-waiter-001',
      businessId: business.id,
      email: 'waiter@premiercafe.co.ke',
      name: 'Mary Atieno',
      role: 'WAITER',
      passwordHash: await bcrypt.hash('waiter123', 12),
      pin: '9999',
      pinHash: await bcrypt.hash('9999', 10),
    },
  });

  console.log('✅ Users created');

  // ─── Items ──────────────────────────────────────────────────────────────
  await prisma.item.createMany({
    data: [
      { id: 'item-001', offlineId: uuidv4(), businessId: business.id, storeId: store.id, name: 'Unga Jogoo 2kg',          type: 'PRODUCT', retailPriceCents:   22000, wholesalePriceCents: 19000, costPriceCents: 17000, trackStock: true,  vatApplicable: false, totApplicable: true,  barcode: '6001020003001', category: 'Groceries', reorderLevel: 10, reorderQty: 50 },
      { id: 'item-002', offlineId: uuidv4(), businessId: business.id, storeId: store.id, name: 'Brookside Milk 500ml',    type: 'PRODUCT', retailPriceCents:    6500,                              costPriceCents:  5000, trackStock: true,  vatApplicable: false, totApplicable: true,  barcode: '6001020003002', category: 'Dairy',      trackExpiry: true, defaultExpiryDays: 7,  reorderLevel: 20, reorderQty: 100 },
      { id: 'item-003', offlineId: uuidv4(), businessId: business.id, storeId: store.id, name: 'Tusker Beer 500ml',       type: 'PRODUCT', retailPriceCents:   35000,                              costPriceCents: 25000, trackStock: true,  vatApplicable: true,                        barcode: '6001020003003', category: 'Beverages', reorderLevel: 24, reorderQty: 72 },
      { id: 'item-004', offlineId: uuidv4(), businessId: business.id, storeId: store.id, name: 'Coca-Cola 300ml',         type: 'PRODUCT', retailPriceCents:    5500,                              costPriceCents:  3500, trackStock: true,  vatApplicable: true,                        barcode: '6001020003004', category: 'Beverages', reorderLevel: 24, reorderQty: 72 },
      { id: 'item-005', offlineId: uuidv4(), businessId: business.id, storeId: store.id, name: 'Sugar 1kg',               type: 'PRODUCT', retailPriceCents:   18000,                              costPriceCents: 14000, trackStock: true,  vatApplicable: false, totApplicable: true,  category: 'Groceries', reorderLevel: 10, reorderQty: 30 },
      { id: 'item-006', offlineId: uuidv4(), businessId: business.id, storeId: store.id, name: 'Cooking Oil 1L',          type: 'PRODUCT', retailPriceCents:   32000,                              costPriceCents: 25000, trackStock: true,  vatApplicable: false, totApplicable: true,  category: 'Groceries', reorderLevel: 6,  reorderQty: 24 },
      { id: 'item-007', offlineId: uuidv4(), businessId: business.id, storeId: store.id, name: 'Club Sandwich',           type: 'PRODUCT', retailPriceCents:   85000,                              costPriceCents: 40000, trackStock: false, vatApplicable: true,                        category: 'Food' },
      { id: 'item-008', offlineId: uuidv4(), businessId: business.id, storeId: store.id, name: 'Chips Large',             type: 'PRODUCT', retailPriceCents:   20000,                              costPriceCents:  8000, trackStock: false, vatApplicable: true,                        category: 'Food' },
      { id: 'item-009', offlineId: uuidv4(), businessId: business.id, storeId: store.id, name: 'Espresso Shot',           type: 'PRODUCT', retailPriceCents:   25000,                              costPriceCents:  8000, trackStock: false, vatApplicable: true,                        category: 'Coffee' },
      { id: 'item-010', offlineId: uuidv4(), businessId: business.id, storeId: store.id, name: 'Cappuccino',              type: 'PRODUCT', retailPriceCents:   35000,                              costPriceCents: 12000, trackStock: false, vatApplicable: true,                        category: 'Coffee' },
      { id: 'item-011', offlineId: uuidv4(), businessId: business.id, storeId: store.id, name: 'Dawa Cocktail',           type: 'PRODUCT', retailPriceCents:   45000,                              costPriceCents: 15000, trackStock: false, vatApplicable: true,                        category: 'Drinks' },
      { id: 'item-012', offlineId: uuidv4(), businessId: business.id, storeId: store.id, name: 'Delivery Service',        type: 'SERVICE', retailPriceCents:   15000,                              costPriceCents:  5000, trackStock: false, vatApplicable: true,                        category: 'Services' },
      { id: 'item-013', offlineId: uuidv4(), businessId: business.id, storeId: store.id, name: 'Samsung Galaxy A55',      type: 'PRODUCT', retailPriceCents: 4500000, wholesalePriceCents: 4200000, costPriceCents: 3800000, trackStock: true, trackSerials: true, vatApplicable: true, barcode: '8806094917772', category: 'Electronics', reorderLevel: 2, reorderQty: 5 },
      { id: 'item-014', offlineId: uuidv4(), businessId: business.id, storeId: store.id, name: 'Redmi Note 13',           type: 'PRODUCT', retailPriceCents: 2800000,                              costPriceCents: 2200000, trackStock: true, trackSerials: true, vatApplicable: true, barcode: '6934177794872', category: 'Electronics', reorderLevel: 2, reorderQty: 5 },
      { id: 'item-015', offlineId: uuidv4(), businessId: business.id, storeId: store.id, name: 'Bread Loaf',              type: 'PRODUCT', retailPriceCents:    7000,                              costPriceCents:  4500, trackStock: true,  vatApplicable: false,                       category: 'Bakery',     unitWeightGrams: 600,  reorderLevel: 10, reorderQty: 30 },
      { id: 'item-016', offlineId: uuidv4(), businessId: business.id, storeId: store.id, name: 'Chicken Breast (raw)',    type: 'PRODUCT', retailPriceCents:   80000,                              costPriceCents: 60000, trackStock: true,  vatApplicable: false,                       category: 'Meat',       unitWeightGrams: 1000, trackExpiry: true, defaultExpiryDays: 3,  reorderLevel: 5, reorderQty: 10 },
      { id: 'item-017', offlineId: uuidv4(), businessId: business.id, storeId: store.id, name: 'Lettuce',                 type: 'PRODUCT', retailPriceCents:    4000,                              costPriceCents:  2500, trackStock: true,  vatApplicable: false,                       category: 'Vegetables', unitWeightGrams: 300,  trackExpiry: true, defaultExpiryDays: 5,  reorderLevel: 5, reorderQty: 20 },
      { id: 'item-018', offlineId: uuidv4(), businessId: business.id, storeId: store.id, name: 'Club Sandwich (Recipe)',  type: 'RECIPE',  retailPriceCents:   85000,                              costPriceCents:     0, trackStock: false, vatApplicable: true,                        category: 'Food' },
      { id: 'item-019', offlineId: uuidv4(), businessId: business.id, storeId: store.id, name: 'Breakfast Bundle',        type: 'BUNDLE',  retailPriceCents:   45000,                              costPriceCents:     0, trackStock: false, vatApplicable: true,                        category: 'Food' },
      { id: 'item-020', offlineId: uuidv4(), businessId: business.id, storeId: store.id, name: 'Paracetamol 500mg x24',  type: 'PRODUCT', retailPriceCents:    8500,                              costPriceCents:  5000, trackStock: true,  trackBatches: true, trackExpiry: true, defaultExpiryDays: 730, vatApplicable: false, barcode: '6001020003020', category: 'Pharmacy' },
    ],
  });

  console.log('✅ Items created (20 items)');

  // ─── Recipe + Bundle ────────────────────────────────────────────────────
  await prisma.recipeIngredient.createMany({
    data: [
      { recipeItemId: 'item-018', ingredientItemId: 'item-015', quantityGrams: 100 },
      { recipeItemId: 'item-018', ingredientItemId: 'item-016', quantityGrams: 120 },
      { recipeItemId: 'item-018', ingredientItemId: 'item-017', quantityGrams: 30  },
    ],
  });

  await prisma.bundleComponent.createMany({
    data: [
      { bundleItemId: 'item-019', componentItemId: 'item-007', quantity: 1 },
      { bundleItemId: 'item-019', componentItemId: 'item-009', quantity: 1 },
      { bundleItemId: 'item-019', componentItemId: 'item-004', quantity: 1 },
    ],
  });

  console.log('✅ Recipe + Bundle configured');

  // ─── Initial stock movements ─────────────────────────────────────────────
  await prisma.inventoryMovement.createMany({
    data: [
      { offlineId: uuidv4(), businessId: business.id, itemId: 'item-001', storeId: store.id, type: 'INITIAL', quantity:  50, source: 'SEED' },
      { offlineId: uuidv4(), businessId: business.id, itemId: 'item-002', storeId: store.id, type: 'INITIAL', quantity:  30, source: 'SEED' },
      { offlineId: uuidv4(), businessId: business.id, itemId: 'item-003', storeId: store.id, type: 'INITIAL', quantity: 100, source: 'SEED' },
      { offlineId: uuidv4(), businessId: business.id, itemId: 'item-004', storeId: store.id, type: 'INITIAL', quantity:  80, source: 'SEED' },
      { offlineId: uuidv4(), businessId: business.id, itemId: 'item-005', storeId: store.id, type: 'INITIAL', quantity:  40, source: 'SEED' },
      { offlineId: uuidv4(), businessId: business.id, itemId: 'item-006', storeId: store.id, type: 'INITIAL', quantity:  25, source: 'SEED' },
      { offlineId: uuidv4(), businessId: business.id, itemId: 'item-013', storeId: store.id, type: 'INITIAL', quantity:   5, source: 'SEED' },
      { offlineId: uuidv4(), businessId: business.id, itemId: 'item-014', storeId: store.id, type: 'INITIAL', quantity:   8, source: 'SEED' },
      { offlineId: uuidv4(), businessId: business.id, itemId: 'item-015', storeId: store.id, type: 'INITIAL', quantity:  20, source: 'SEED' },
      { offlineId: uuidv4(), businessId: business.id, itemId: 'item-016', storeId: store.id, type: 'INITIAL', quantity:  10, source: 'SEED' },
      { offlineId: uuidv4(), businessId: business.id, itemId: 'item-017', storeId: store.id, type: 'INITIAL', quantity:  15, source: 'SEED' },
      { offlineId: uuidv4(), businessId: business.id, itemId: 'item-020', storeId: store.id, type: 'INITIAL', quantity:  50, source: 'SEED' },
    ],
  });

  // Pharmacy batch
  const batch = await prisma.batch.create({
    data: {
      offlineId: uuidv4(), storeId: store.id, itemId: 'item-020',
      lotNumber: 'LOT-2024-PCM-001',
      manufacturingDate: new Date('2024-01-15'),
      expiryDate: new Date('2026-01-15'),
      quantityReceived: 50, quantityRemaining: 50, status: 'ACTIVE',
    },
  });

  await prisma.inventoryMovement.create({
    data: { offlineId: uuidv4(), businessId: business.id, itemId: 'item-020', storeId: store.id, type: 'GRN_RECEIPT', quantity: 50, batchId: batch.id, source: 'SEED' },
  });

  // Serial numbers for phones
  await prisma.serialRecord.createMany({
    data: [
      { itemId: 'item-013', serialNumber: 'IMEI357000000001234', status: 'AVAILABLE' },
      { itemId: 'item-013', serialNumber: 'IMEI357000000001235', status: 'AVAILABLE' },
      { itemId: 'item-013', serialNumber: 'IMEI357000000001236', status: 'AVAILABLE' },
      { itemId: 'item-014', serialNumber: 'IMEI359000000007891', status: 'AVAILABLE' },
      { itemId: 'item-014', serialNumber: 'IMEI359000000007892', status: 'AVAILABLE' },
      { itemId: 'item-014', serialNumber: 'IMEI359000000007893', status: 'AVAILABLE' },
      { itemId: 'item-014', serialNumber: 'IMEI359000000007894', status: 'AVAILABLE' },
    ],
  });

  console.log('✅ Stock, batches, serials ready');

  // ─── Loyalty Program ────────────────────────────────────────────────────
  await prisma.loyaltyProgram.upsert({
    where: { id: 'lp-001' },
    update: {},
    create: { id: 'lp-001', businessId: business.id, name: 'Premier Café Rewards', kesPerPoint: 100, pointValueCents: 50, minRedemption: 100, isActive: true },
  });

  // ─── Customers ──────────────────────────────────────────────────────────
  await prisma.customer.createMany({
    data: [
      { id: 'cust-001', businessId: business.id, name: 'Amina Hassan',   phone: '0712345678', email: 'amina@gmail.com',       creditLimitCents: 500000,  loyaltyPoints: 250 },
      { id: 'cust-002', businessId: business.id, name: 'John Ochieng',   phone: '0723456789',                                 creditLimitCents: 200000,  loyaltyPoints: 80 },
      { id: 'cust-003', businessId: business.id, name: 'Fatuma Ali',     phone: '0734567890', email: 'fatuma@business.co.ke', creditLimitCents: 1000000, loyaltyPoints: 500 },
      { id: 'cust-004', businessId: business.id, name: 'David Kipchoge', phone: '0745678901',                                 creditLimitCents: 300000 },
      { id: 'cust-005', businessId: business.id, name: 'Rose Njeri',     phone: '0756789012',                                 creditLimitCents: 0,       loyaltyPoints: 30 },
    ],
  });

  // ─── Suppliers + POs ────────────────────────────────────────────────────
  await prisma.supplier.createMany({
    data: [
      { id: 'sup-001', businessId: business.id, name: 'Unga Holdings Ltd',              contact: 'Joseph Mwai',  address: 'Industrial Area, Nairobi', paymentTerms: 'Net 30', creditLimitCents: 5000000,  outstandingBalanceCents: 1200000 },
      { id: 'sup-002', businessId: business.id, name: 'Brookside Dairy',                contact: 'Sales Team',   address: 'Ruiru, Kiambu',            paymentTerms: 'Net 14', creditLimitCents: 3000000,  outstandingBalanceCents: 650000 },
      { id: 'sup-003', businessId: business.id, name: 'EABL (East African Breweries)',  contact: 'Trade Team',   address: 'Ruaraka, Nairobi',         paymentTerms: 'COD',    creditLimitCents: 10000000 },
      { id: 'sup-004', businessId: business.id, name: 'Phone City Distributors',        contact: 'Rahim Patel',  address: 'Moi Avenue, Nairobi',      paymentTerms: 'Net 7',  creditLimitCents: 20000000, outstandingBalanceCents: 4500000 },
    ],
  });

  const po1 = await prisma.purchaseOrder.create({ data: { id: 'po-001', businessId: business.id, supplierId: 'sup-001', poNumber: 'PO-2026-001', status: 'APPROVED', expectedDelivery: new Date(Date.now() + 3 * 86400000) } });
  await prisma.pOItem.createMany({ data: [
    { poId: po1.id, itemId: 'item-001', quantityOrdered: 100, agreedPriceCents: 17000 },
    { poId: po1.id, itemId: 'item-005', quantityOrdered: 50,  agreedPriceCents: 14000 },
  ]});

  const po2 = await prisma.purchaseOrder.create({ data: { id: 'po-002', businessId: business.id, supplierId: 'sup-004', poNumber: 'PO-2026-002', status: 'DRAFT', expectedDelivery: new Date(Date.now() + 7 * 86400000) } });
  await prisma.pOItem.createMany({ data: [
    { poId: po2.id, itemId: 'item-013', quantityOrdered: 10, agreedPriceCents: 3800000 },
    { poId: po2.id, itemId: 'item-014', quantityOrdered: 15, agreedPriceCents: 2200000 },
  ]});

  console.log('✅ Customers, suppliers, POs created');

  // ─── Sales ──────────────────────────────────────────────────────────────
  const sale1 = await prisma.sale.create({ data: {
    offlineId: uuidv4(), businessId: business.id, storeId: store.id, cashierId: cashier.id,
    receiptNumber: 'NRB01-2026-0000101', type: 'NORMAL', status: 'PAID',
    subtotalCents: 131000, vatCents: 20960, totalCents: 151960, priceLevel: 'RETAIL',
    items: { create: [
      { itemId: 'item-003', name: 'Tusker Beer 500ml', quantity: 2, unitPriceCents: 35000, totalCents: 70000 },
      { itemId: 'item-004', name: 'Coca-Cola 300ml',   quantity: 3, unitPriceCents:  5500, totalCents: 16500 },
      { itemId: 'item-007', name: 'Club Sandwich',     quantity: 1, unitPriceCents: 85000, totalCents: 85000 },
    ]},
    payments: { create: [{ offlineId: uuidv4(), method: 'CASH', amountCents: 151960 }] },
  }});

  const sale2 = await prisma.sale.create({ data: {
    offlineId: uuidv4(), businessId: business.id, storeId: store.id, cashierId: cashier.id, customerId: 'cust-002',
    receiptNumber: 'NRB01-2026-0000102', type: 'CREDIT', status: 'CREDIT',
    subtotalCents: 155000, vatCents: 0, totalCents: 155000, priceLevel: 'RETAIL',
    items: { create: [
      { itemId: 'item-001', name: 'Unga Jogoo 2kg', quantity: 3, unitPriceCents: 22000, totalCents: 66000 },
      { itemId: 'item-005', name: 'Sugar 1kg',      quantity: 2, unitPriceCents: 18000, totalCents: 36000 },
      { itemId: 'item-006', name: 'Cooking Oil 1L', quantity: 1, unitPriceCents: 32000, totalCents: 32000 },
    ]},
    payments: { create: [{ offlineId: uuidv4(), method: 'CREDIT', amountCents: 155000 }] },
  }});

  const sale3 = await prisma.sale.create({ data: {
    offlineId: uuidv4(), businessId: business.id, storeId: store.id, cashierId: owner.id, customerId: 'cust-001',
    receiptNumber: 'NRB01-2026-0000103', type: 'NORMAL', status: 'PAID',
    subtotalCents: 4500000, vatCents: 720000, totalCents: 5220000, priceLevel: 'RETAIL',
    items: { create: [{ itemId: 'item-013', name: 'Samsung Galaxy A55', quantity: 1, unitPriceCents: 4500000, totalCents: 4500000 }] },
    payments: { create: [
      { offlineId: uuidv4(), method: 'MPESA', amountCents: 3000000, reference: 'QHY7KLM934' },
      { offlineId: uuidv4(), method: 'CASH',  amountCents: 2220000 },
    ]},
  }});

  await prisma.serialRecord.update({ where: { serialNumber: 'IMEI357000000001234' }, data: { status: 'SOLD', saleId: sale3.id } });

  await prisma.sale.create({ data: {
    offlineId: uuidv4(), businessId: business.id, storeId: store.id, cashierId: cashier.id,
    receiptNumber: 'NRB01-2026-0000104', type: 'NORMAL', status: 'PAID',
    subtotalCents: 70000, vatCents: 11200, totalCents: 81200, priceLevel: 'RETAIL',
    items: { create: [
      { itemId: 'item-009', name: 'Espresso Shot', quantity: 2, unitPriceCents: 25000, totalCents: 50000 },
      { itemId: 'item-008', name: 'Chips Large',   quantity: 1, unitPriceCents: 20000, totalCents: 20000 },
    ]},
    payments: { create: [{ offlineId: uuidv4(), method: 'MPESA', amountCents: 81200, reference: 'TYU8NMK123' }] },
  }});

  await prisma.inventoryMovement.createMany({ data: [
    { offlineId: uuidv4(), businessId: business.id, itemId: 'item-003', storeId: store.id, type: 'SALE', quantity: -2, saleId: sale1.id, source: 'POS' },
    { offlineId: uuidv4(), businessId: business.id, itemId: 'item-004', storeId: store.id, type: 'SALE', quantity: -3, saleId: sale1.id, source: 'POS' },
    { offlineId: uuidv4(), businessId: business.id, itemId: 'item-001', storeId: store.id, type: 'SALE', quantity: -3, saleId: sale2.id, source: 'POS' },
    { offlineId: uuidv4(), businessId: business.id, itemId: 'item-005', storeId: store.id, type: 'SALE', quantity: -2, saleId: sale2.id, source: 'POS' },
    { offlineId: uuidv4(), businessId: business.id, itemId: 'item-006', storeId: store.id, type: 'SALE', quantity: -1, saleId: sale2.id, source: 'POS' },
    { offlineId: uuidv4(), businessId: business.id, itemId: 'item-013', storeId: store.id, type: 'SALE', quantity: -1, saleId: sale3.id, source: 'POS' },
  ]});

  console.log('✅ Sales created');

  // ─── Expenses ───────────────────────────────────────────────────────────
  await prisma.expense.createMany({ data: [
    { offlineId: uuidv4(), businessId: business.id, storeId: store.id, submittedBy: owner.id,   amountCents: 4500000, category: 'Rent',          description: 'Monthly shop rent – February 2026',    paidBy: 'BANK',  approvalStatus: 'APPROVED', approvedBy: owner.id },
    { offlineId: uuidv4(), businessId: business.id, storeId: store.id, submittedBy: manager.id, amountCents:  120000, category: 'Utilities',      description: 'Electricity bill – January',            paidBy: 'MPESA', approvalStatus: 'APPROVED', approvedBy: owner.id },
    { offlineId: uuidv4(), businessId: business.id, storeId: store.id, submittedBy: cashier.id, amountCents:   50000, category: 'Supplies',       description: 'Cleaning supplies',                     paidBy: 'CASH',  approvalStatus: 'PENDING' },
    { offlineId: uuidv4(), businessId: business.id, storeId: store.id, submittedBy: cashier.id, amountCents:   85000, category: 'Transport',      description: 'Delivery to client – Westlands',        paidBy: 'CASH',  approvalStatus: 'APPROVED', approvedBy: manager.id },
    { offlineId: uuidv4(), businessId: business.id, storeId: store.id, submittedBy: manager.id, amountCents:  250000, category: 'Marketing',      description: 'Facebook ads – January campaign',       paidBy: 'MPESA', approvalStatus: 'APPROVED', approvedBy: owner.id },
    { offlineId: uuidv4(), businessId: business.id, storeId: store.id, submittedBy: cashier.id, amountCents:   30000, category: 'Supplies',       description: 'Receipt paper rolls x10',               paidBy: 'CASH',  approvalStatus: 'REJECTED' },
    { offlineId: uuidv4(), businessId: business.id, storeId: store.id, submittedBy: manager.id, amountCents: 1200000, category: 'Loan Repayment', description: 'Equipment loan – monthly installment',  paidBy: 'BANK',  approvalStatus: 'APPROVED', approvedBy: owner.id, isRecurring: true, recurringDay: 15 },
  ]});

  // ─── Employees ──────────────────────────────────────────────────────────
  const empOwner   = await prisma.employee.create({ data: { userId: owner.id,   businessId: business.id, idNumber: 'KE12345678', emergencyContact: 'Wife: 0712000002',    employmentType: 'PERMANENT', commissionRate: 2.0, salesTargetCents: 50000000, startDate: new Date('2020-01-01') } });
  const empManager = await prisma.employee.create({ data: { userId: manager.id, businessId: business.id, idNumber: 'KE87654321', emergencyContact: 'Husband: 0722000002', employmentType: 'PERMANENT', commissionRate: 1.5, salesTargetCents: 30000000, startDate: new Date('2021-03-15') } });
  const empCashier = await prisma.employee.create({ data: { userId: cashier.id, businessId: business.id, idNumber: 'KE11223344', emergencyContact: 'Mother: 0733000002',  employmentType: 'PERMANENT', commissionRate: 1.0, salesTargetCents: 20000000, startDate: new Date('2022-06-01') } });
  const empWaiter  = await prisma.employee.create({ data: { userId: waiter.id,  businessId: business.id, idNumber: 'KE55667788', emergencyContact: 'Father: 0744000002',  employmentType: 'CASUAL',    commissionRate: 0.5, salesTargetCents: 10000000, startDate: new Date('2023-01-15') } });

  // ─── Attendance ─────────────────────────────────────────────────────────
  const now = new Date();
  const todayMidnight = new Date(now); todayMidnight.setHours(0, 0, 0, 0);
  const ystMidnight = new Date(todayMidnight.getTime() - 86400000);

  await prisma.attendanceRecord.createMany({ data: [
    { offlineId: uuidv4(), employeeId: empCashier.id, storeId: store.id, clockIn: new Date(todayMidnight.getTime() + 8 * 3600000), isLate: false, shiftDate: todayMidnight },
    { offlineId: uuidv4(), employeeId: empCashier.id, storeId: store.id, clockIn: new Date(ystMidnight.getTime() + 8 * 3600000), clockOut: new Date(ystMidnight.getTime() + 17 * 3600000), isLate: false, shiftDate: ystMidnight },
    { offlineId: uuidv4(), employeeId: empManager.id, storeId: store.id, clockIn: new Date(ystMidnight.getTime() + 8 * 3600000), clockOut: new Date(ystMidnight.getTime() + 17.5 * 3600000), isLate: false, shiftDate: ystMidnight },
    { offlineId: uuidv4(), employeeId: empWaiter.id,  storeId: store.id, clockIn: new Date(ystMidnight.getTime() + 8.6 * 3600000), clockOut: new Date(ystMidnight.getTime() + 17 * 3600000), isLate: true, shiftDate: ystMidnight },
  ]});

  // ─── Leave ──────────────────────────────────────────────────────────────
  await prisma.leave.createMany({ data: [
    { employeeId: empCashier.id, type: 'ANNUAL', startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 9 * 86400000), reason: 'Family event' },
    { employeeId: empWaiter.id,  type: 'SICK',   startDate: new Date(Date.now() - 3 * 86400000), endDate: new Date(Date.now() - 3 * 86400000), reason: 'Fever' },
  ]});

  console.log('✅ Employees, attendance, leave created');

  // ─── Hospitality Tables ─────────────────────────────────────────────────
  await prisma.table.createMany({ data: [
    { id: 'table-001', storeId: store.id, number: '1', capacity: 2, floor: 'Indoor',  status: 'AVAILABLE' },
    { id: 'table-002', storeId: store.id, number: '2', capacity: 4, floor: 'Indoor',  status: 'OCCUPIED' },
    { id: 'table-003', storeId: store.id, number: '3', capacity: 4, floor: 'Indoor',  status: 'BILL_REQUESTED' },
    { id: 'table-004', storeId: store.id, number: '4', capacity: 6, floor: 'Indoor',  status: 'AVAILABLE' },
    { id: 'table-005', storeId: store.id, number: '5', capacity: 2, floor: 'Outdoor', status: 'AVAILABLE' },
    { id: 'table-006', storeId: store.id, number: '6', capacity: 4, floor: 'Outdoor', status: 'OCCUPIED' },
    { id: 'table-007', storeId: store.id, number: '7', capacity: 6, floor: 'Outdoor', status: 'AVAILABLE' },
    { id: 'table-008', storeId: store.id, number: '8', capacity: 8, floor: 'Private', status: 'RESERVED' },
  ]});

  // ─── Cash Drawer ─────────────────────────────────────────────────────────
  await prisma.cashDrawerSession.create({ data: { businessId: business.id, storeId: store.id, cashierId: cashier.id, status: 'OPEN', openingBalanceCents: 500000 } });

  // ─── Done ────────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ DATABASE SEEDED SUCCESSFULLY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏢 Business:  Premier Café & Retail  (biz-001)');
  console.log('🏪 Store:     Main Branch – Nairobi CBD  (NRB01)');
  console.log('👤 Users:     4  (Owner, Manager, Cashier, Waiter)');
  console.log('🛒 Items:     20 (groceries, food, electronics, recipe, bundle)');
  console.log('👥 Customers: 5');
  console.log('🏭 Suppliers: 4  +  2 Purchase Orders');
  console.log('💰 Sales:     4  (PAID cash, CREDIT, M-Pesa split, M-Pesa)');
  console.log('💸 Expenses:  7  (approved, pending, rejected, recurring)');
  console.log('🍽️  Tables:    8  (mixed statuses for hospitality testing)');
  console.log('📱 Serials:   7  phone IMEIs (6 available, 1 sold)');
  console.log('💊 Batches:   1  pharmacy lot  (expires 2026-01-15)');
  console.log('');
  console.log('🔐 LOGIN CREDENTIALS:');
  console.log('   owner@premiercafe.co.ke   /  password123  (PIN: 1234)');
  console.log('   manager@premiercafe.co.ke /  manager123   (PIN: 5678)');
  console.log('   cashier@premiercafe.co.ke /  cashier123   (PIN: 0000)');
  console.log('   waiter@premiercafe.co.ke  /  waiter123    (PIN: 9999)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('❌ Seed failed:', e.message);
    await prisma.$disconnect();
    process.exit(1);
  });
