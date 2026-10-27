/**
 * auth.e2e-spec.ts
 *
 * Integration tests for the Auth HTTP pipeline.  Uses a focused test module
 * (AuthModule + JwtModule + ThrottlerModule) with mocked Prisma — no real DB or
 * Redis required.  Exercises the full NestJS guard/pipe/controller stack.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import * as request from 'supertest';
import { AuthModule } from '../src/auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

// ─── Shared mock data ────────────────────────────────────────────────────────

// Generated per run so no credential-shaped literal lives in the repo. The
// 'Aa1' prefix satisfies the API's complexity rules (upper, lower, digit).
const newPassword = () => `Aa1${randomBytes(8).toString('hex')}`;
const PASSWORD = newPassword();
const WRONG_PASSWORD = newPassword();
const REGISTER_PASSWORD = newPassword();

const mockBusiness = {
  id: 'biz-001',
  name: 'Test Cafe',
  planName: 'PRO',
  subscriptionTier: 'PRO',
  subscriptionStatus: 'ACTIVE',
  trialEndsAt: new Date(Date.now() + 30 * 86400000),
  subscriptionActive: true,
};

const mockUser = {
  id: 'user-001',
  email: 'owner@test.co.ke',
  passwordHash: bcrypt.hashSync(PASSWORD, 10),
  name: 'Test Owner',
  role: 'OWNER',
  pin: null,
  pinHash: null,
  totpSecret: null,
  totpEnabled: false,
  loginAttempts: 0,
  lockedUntil: null,
  businessId: 'biz-001',
  storeId: null,
  googleId: null,
  avatarUrl: null,
  business: mockBusiness,
  assignedStores: [],
};


// ─── Prisma service mock ─────────────────────────────────────────────────────

const prismaMock = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  userSession: {
    create: jest.fn().mockResolvedValue({}),
  },
  business: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  store: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
  $connect: jest.fn(),
  $disconnect: jest.fn(),
};

// ─── App bootstrap ────────────────────────────────────────────────────────────

let app: INestApplication;

beforeAll(async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
      AuthModule,
    ],
  })
    .overrideProvider(PrismaService)
    .useValue(prismaMock)
    .compile();

  app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  await app.init();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  jest.resetAllMocks();
  prismaMock.userSession.create.mockResolvedValue({});
  prismaMock.$transaction.mockImplementation((cb: (tx: typeof prismaMock) => unknown) => cb(prismaMock));
});

// ─── POST /api/v1/auth/login ──────────────────────────────────────────────────

describe('POST /api/v1/auth/login', () => {
  it('returns 401 when the user does not exist', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@test.co.ke', password: WRONG_PASSWORD });

    expect(res.status).toBe(401);
  });

  it('returns 401 when the password is wrong and increments loginAttempts', async () => {
    prismaMock.user.findUnique.mockResolvedValue(mockUser);
    prismaMock.user.update.mockResolvedValue({ ...mockUser, loginAttempts: 1 });

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'owner@test.co.ke', password: WRONG_PASSWORD });

    expect(res.status).toBe(401);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ loginAttempts: 1 }),
      }),
    );
  });

  it('returns 401 when account is locked', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...mockUser,
      loginAttempts: 5,
      lockedUntil: new Date(Date.now() + 15 * 60_000),
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'owner@test.co.ke', password: PASSWORD });

    expect(res.status).toBe(401);
  });

  it('returns an accessToken on valid credentials', async () => {
    prismaMock.user.findUnique.mockResolvedValue(mockUser);
    prismaMock.business.findUnique.mockResolvedValue(mockBusiness);
    prismaMock.user.update.mockResolvedValue({ ...mockUser, loginAttempts: 0 });

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'owner@test.co.ke', password: PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.accessToken.split('.')).toHaveLength(3); // valid JWT format
  });

  it('resets loginAttempts to 0 on successful login', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...mockUser, loginAttempts: 2 });
    prismaMock.business.findUnique.mockResolvedValue(mockBusiness);
    prismaMock.user.update.mockResolvedValue({ ...mockUser, loginAttempts: 0 });

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'owner@test.co.ke', password: PASSWORD });

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ loginAttempts: 0 }),
      }),
    );
  });
});

// ─── POST /api/v1/auth/register ───────────────────────────────────────────────

describe('POST /api/v1/auth/register', () => {
  it('returns 400 when required fields are missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'test@test.co.ke' }); // missing name, password, businessName

    expect(res.status).toBe(400);
  });

  it('returns 400 (not 500) when the password is too weak', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Weak', email: 'weak@test.co.ke', password: 'Aa1', businessName: 'Weak Cafe' });

    expect(res.status).toBe(400);
  });

  it('returns 409 or 400 when email is already registered', async () => {
    prismaMock.user.findUnique.mockResolvedValue(mockUser); // email already exists

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'Another Owner',
        email: 'owner@test.co.ke',
        password: REGISTER_PASSWORD,
        businessName: 'Another Cafe',
      });

    expect([400, 409]).toContain(res.status);
  });

  it('successfully creates a new business owner', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null); // email not taken
    prismaMock.business.findUnique.mockResolvedValue(null); // short code free
    prismaMock.business.create.mockResolvedValue(mockBusiness);
    prismaMock.store.create.mockResolvedValue({ id: 'store-001', storeCode: 'NRB01', receiptSequence: 0 });
    prismaMock.user.create.mockResolvedValue(mockUser);
    prismaMock.business.update.mockResolvedValue(mockBusiness);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'New Owner',
        email: 'new@test.co.ke',
        password: REGISTER_PASSWORD,
        businessName: 'New Cafe',
      });

    expect([200, 201]).toContain(res.status);
    expect(res.body).toHaveProperty('accessToken');
  });
});

// ─── PIN login ────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/login/pin', () => {
  it('returns 401 for wrong PIN', async () => {
    prismaMock.business.findFirst.mockResolvedValue({ id: 'biz-001' });
    prismaMock.user.findMany.mockResolvedValue([]); // no user with that PIN

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login/pin')
      .send({ pin: '9999', businessId: 'biz-001' });

    expect(res.status).toBe(401);
  });
});
