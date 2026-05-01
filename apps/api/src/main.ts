import * as Sentry from '@sentry/node';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import helmet from 'helmet';

// Initialize Sentry before anything else so all errors are captured
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  });
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Warn loudly if DATABASE_URL is missing or looks relative — prevents silent auth failures
  const dbUrl = process.env.DATABASE_URL ?? '';
  if (!dbUrl) {
    logger.error('❌ DATABASE_URL is not set! Auth will fail. Set it in apps/api/.env');
  } else if (!dbUrl.startsWith('file:///') && !dbUrl.startsWith('postgresql') && !dbUrl.startsWith('mysql')) {
    logger.warn(`⚠️  DATABASE_URL uses a relative path: "${dbUrl}" — login may fail if CWD differs. Use an absolute path (file:///home/...).`);
  } else {
    logger.log(`✅ DATABASE_URL: ${dbUrl}`);
  }

  try {
    logger.log('Starting NestJS application...');
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log', 'debug', 'verbose'],
      rawBody: true, // required for Paystack webhook signature verification
    });

    // Enable Socket.IO adapter for WebSocket/LAN sync support
    app.useWebSocketAdapter(new IoAdapter(app));

    // Security headers (HSTS, XSS protection, content-type sniff prevention, etc.)
    app.use(helmet({
      contentSecurityPolicy: false,       // disabled to allow Swagger UI
      crossOriginEmbedderPolicy: false,
      // Google OAuth popup needs to communicate back to the opener window.
      // same-origin COOP blocks window.closed polling used by @react-oauth/google.
      crossOriginOpenerPolicy: false,
    }));

    logger.log('Enabling CORS...');
    const allowedOrigins = [
      process.env.FRONTEND_URL ?? 'http://localhost:3001',
      process.env.ADMIN_URL ?? 'http://localhost:3002',
      ...(process.env.EXTRA_ORIGINS ? process.env.EXTRA_ORIGINS.split(',').map(o => o.trim()).filter(Boolean) : []),
    ];
    logger.log(`CORS allowed origins: ${allowedOrigins.join(', ')}`);
    app.enableCors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, Render health checks)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        // Allow any *.vercel.app preview deployment
        if (origin.endsWith('.vercel.app')) return callback(null, true);
        // Deny silently — using callback(new Error(...)) can interfere with
        // Express error handling before CORS headers are written to the response.
        callback(null, false);
      },
      credentials: true,
    });

    logger.log('Setting global prefix to /api...');
    app.setGlobalPrefix('api');

    logger.log('Enabling URI versioning (default v1)...');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

    // ─── Swagger / OpenAPI ─────────────────────────────────────────────────────
    const swaggerConfig = new DocumentBuilder()
      .setTitle('KASTRA POS API')
      .setDescription('eTIMS-compliant POS API for Kenyan businesses')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);

    logger.log('Starting server on port 3010...');
    // Lightweight health check for Render (no auth required)
    const httpAdapter = app.getHttpAdapter();
    httpAdapter.get('/api/v1/health', (_req: any, res: any) => res.json({ status: 'ok' }));

    const port = process.env.PORT ?? 3010;
    await app.listen(port);

    logger.log(`🚀 API running on port ${port}/api`);
    logger.log('📋 Health check: http://localhost:3010/api/auth/me');
    logger.log('📖 Swagger docs: http://localhost:3010/api/docs');
    logger.log('🔑 Super Admin: POST /api/v1/super-admin/login');

    // ── Keep-alive ping (free Render tier) ─────────────────────────────────
    // Render free services sleep after 15 min of inactivity.
    // Pinging own /health every 14 min keeps the service warm during business hours.
    if (process.env.KEEP_ALIVE === 'true' && process.env.RENDER_EXTERNAL_URL) {
      const pingUrl = `${process.env.RENDER_EXTERNAL_URL}/api/v1/health`;
      logger.log(`🏓 Keep-alive ping enabled → ${pingUrl}`);
      setInterval(async () => {
        try {
          await fetch(pingUrl);
        } catch {
          // ignore — if the server is down a restart will handle it
        }
      }, 14 * 60 * 1000); // every 14 minutes
    }
  } catch (error) {
    logger.error('Failed to start application:', error);
    if (process.env.SENTRY_DSN) Sentry.captureException(error);
    process.exit(1);
  }
}
bootstrap();
