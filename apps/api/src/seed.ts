import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── Business ─────────────────────────────────────────────────────────────
  const business = await prisma.business.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      name: 'Premier Café & Restaurant',
      taxType: 'VAT',
      serviceChargeRate: 10,
      posMode: 'HOSPITALITY',
      shortCode: 'PREMIE01',
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  // ─── Store ────────────────────────────────────────────────────────────────
  const store = await prisma.store.upsert({
    where: { storeCode: 'NRB01' },
    update: {},
    create: {
      id: 'store-1',
      businessId: business.id,
      name: 'Nairobi Main Branch',
      storeCode: 'NRB01',
    },
  });

  // ─── Users ────────────────────────────────────────────────────────────────
  const users = [
    { email: 'owner@premiercafe.co.ke', password: 'password123', pin: '1234', name: 'John Kamau', role: 'OWNER' },
    { email: 'manager@premiercafe.co.ke', password: 'manager123', pin: '5678', name: 'Grace Wanjiku', role: 'MANAGER' },
    { email: 'cashier@premiercafe.co.ke', password: 'cashier123', pin: '0000', name: 'Peter Otieno', role: 'CASHIER' },
    { email: 'waiter@premiercafe.co.ke', password: 'waiter123', pin: '9999', name: 'Mary Njeri', role: 'WAITER' },
    { email: 'kitchen@premiercafe.co.ke', password: 'kitchen123', pin: '1111', name: 'James Mwangi', role: 'KITCHEN' },
  ];

  for (const userData of users) {
    const passwordHash = await bcrypt.hash(userData.password, 10);
    const pinHash = await bcrypt.hash(userData.pin, 10);
    await prisma.user.upsert({
      where: { email: userData.email },
      update: { passwordHash, pinHash },
      create: {
        email: userData.email,
        name: userData.name,
        role: userData.role,
        businessId: business.id,
        passwordHash,
        pinHash,
      },
    });
    console.log(`✅ ${userData.role}: ${userData.email} (PIN: ${userData.pin})`);
  }

  // ─── Menu Items ───────────────────────────────────────────────────────────
  console.log('\n📦 Creating menu items...');

  // trackStock=true for packaged/bottled items; false for prepared food & coffee (service items)
  const itemDefs = [
    { name: 'Chicken Burger', category: 'Food', retailPriceCents: 75000, costPriceCents: 28000, trackStock: false },
    { name: 'Beef Burger', category: 'Food', retailPriceCents: 85000, costPriceCents: 35000, trackStock: false },
    { name: 'Fish & Chips', category: 'Food', retailPriceCents: 90000, costPriceCents: 38000, trackStock: false },
    { name: 'Caesar Salad', category: 'Food', retailPriceCents: 65000, costPriceCents: 22000, trackStock: false },
    { name: 'Nyama Choma 500g', category: 'Food', retailPriceCents: 120000, costPriceCents: 55000, trackStock: false },
    { name: 'Pilau (Plate)', category: 'Food', retailPriceCents: 45000, costPriceCents: 15000, trackStock: false },
    { name: 'Chips (Regular)', category: 'Food', retailPriceCents: 20000, costPriceCents: 6000, trackStock: false },
    { name: 'Chips (Large)', category: 'Food', retailPriceCents: 30000, costPriceCents: 9000, trackStock: false },
    { name: 'Samosa (2 pcs)', category: 'Snacks', retailPriceCents: 15000, costPriceCents: 5000, trackStock: true, initialStock: 50 },
    { name: 'Spring Rolls (4 pcs)', category: 'Snacks', retailPriceCents: 20000, costPriceCents: 7000, trackStock: true, initialStock: 30 },
    { name: 'Coca-Cola 500ml', category: 'Drinks', retailPriceCents: 12000, costPriceCents: 7000, trackStock: true, initialStock: 120 },
    { name: 'Fanta 500ml', category: 'Drinks', retailPriceCents: 12000, costPriceCents: 7000, trackStock: true, initialStock: 96 },
    { name: 'Sprite 500ml', category: 'Drinks', retailPriceCents: 12000, costPriceCents: 7000, trackStock: true, initialStock: 96 },
    { name: 'Tusker Lager 500ml', category: 'Drinks', retailPriceCents: 30000, costPriceCents: 18000, trackStock: true, initialStock: 60 },
    { name: 'Guinness 500ml', category: 'Drinks', retailPriceCents: 35000, costPriceCents: 22000, trackStock: true, initialStock: 48 },
    { name: 'Still Water 500ml', category: 'Drinks', retailPriceCents: 7000, costPriceCents: 3000, trackStock: true, initialStock: 200 },
    { name: 'Still Water 1L', category: 'Drinks', retailPriceCents: 12000, costPriceCents: 5000, trackStock: true, initialStock: 100 },
    { name: 'Fresh Orange Juice', category: 'Drinks', retailPriceCents: 35000, costPriceCents: 12000, trackStock: false },
    { name: 'Espresso', category: 'Coffee', retailPriceCents: 20000, costPriceCents: 5000, trackStock: false },
    { name: 'Cappuccino', category: 'Coffee', retailPriceCents: 30000, costPriceCents: 8000, trackStock: false },
    { name: 'Latte', category: 'Coffee', retailPriceCents: 30000, costPriceCents: 8000, trackStock: false },
    { name: 'Americano', category: 'Coffee', retailPriceCents: 25000, costPriceCents: 6000, trackStock: false },
    { name: 'Kenya AA Tea', category: 'Coffee', retailPriceCents: 15000, costPriceCents: 3000, trackStock: false },
    { name: 'Hot Chocolate', category: 'Coffee', retailPriceCents: 35000, costPriceCents: 10000, trackStock: false },
    { name: 'Chocolate Cake Slice', category: 'Desserts', retailPriceCents: 45000, costPriceCents: 15000, trackStock: true, initialStock: 20 },
    { name: 'Cheesecake Slice', category: 'Desserts', retailPriceCents: 50000, costPriceCents: 18000, trackStock: true, initialStock: 15 },
    { name: 'Ice Cream (2 scoops)', category: 'Desserts', retailPriceCents: 25000, costPriceCents: 8000, trackStock: false },
  ];

  for (const item of itemDefs) {
    let dbItem = await prisma.item.findFirst({ where: { name: item.name, storeId: store.id } });
    if (!dbItem) {
      dbItem = await prisma.item.create({
        data: {
          offlineId: randomUUID(),
          businessId: business.id,
          storeId: store.id,
          name: item.name,
          type: 'PRODUCT',
          category: item.category,
          retailPriceCents: item.retailPriceCents,
          costPriceCents: item.costPriceCents,
          wholesalePriceCents: Math.round(item.retailPriceCents * 0.85),
          vatApplicable: true,
          trackStock: item.trackStock,
        },
      });
      console.log(`  + ${item.name} — KES ${(item.retailPriceCents / 100).toFixed(0)}`);
      // Create initial inventory movement for stocked items
      if (item.trackStock && item.initialStock) {
        await prisma.inventoryMovement.create({
          data: {
            offlineId: randomUUID(),
            businessId: business.id,
            storeId: store.id,
            itemId: dbItem.id,
            type: 'INITIAL',
            quantity: item.initialStock,
            source: 'SEED',
          },
        });
      }
    }
  }

  // ─── Tables ───────────────────────────────────────────────────────────────
  console.log('\n🪑 Creating tables...');
  const tableCount = await prisma.table.count({ where: { storeId: store.id } });
  if (tableCount === 0) {
    for (let i = 1; i <= 12; i++) {
      await prisma.table.create({
        data: {
          storeId: store.id,
          number: `T${String(i).padStart(2, '0')}`,
          capacity: i <= 4 ? 2 : i <= 8 ? 4 : 6,
          floor: i <= 6 ? 'Ground Floor' : 'First Floor',
        },
      });
    }
    console.log('  + 12 tables (T01–T12)');
  }

  // ─── Customers ────────────────────────────────────────────────────────────
  console.log('\n👥 Creating sample customers...');
  const customerData = [
    { name: 'Alice Wambui', phone: '0722111222' },
    { name: 'Bob Kiprotich', phone: '0733222333' },
    { name: 'Carol Achieng', phone: '0711333444', creditLimitCents: 500000, loyaltyPoints: 250 },
  ];
  for (const c of customerData) {
    const existing = await prisma.customer.findFirst({ where: { phone: c.phone, businessId: business.id } });
    if (!existing) {
      await prisma.customer.create({
        data: {
          businessId: business.id,
          name: c.name,
          phone: c.phone,
          creditLimitCents: c.creditLimitCents ?? 0,
          loyaltyPoints: c.loyaltyPoints ?? 0,
        },
      });
      console.log(`  + ${c.name}`);
    }
  }

  console.log('\n✅ Seed complete!');
  console.log('─────────────────────────────────────');
  console.log('📌 Business ID:', business.id);
  console.log('📌 Store ID:', store.id);
  console.log('\n🔐 Login credentials:');
  console.log('  Owner:   owner@premiercafe.co.ke / password123');
  console.log('  Manager: manager@premiercafe.co.ke / manager123');
  console.log('  Cashier: PIN 0000  |  Waiter: PIN 9999');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
