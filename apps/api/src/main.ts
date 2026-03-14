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
      contentSecurityPolicy: false, // disabled to allow Swagger UI
      crossOriginEmbedderPolicy: false,
    }));

    logger.log('Enabling CORS...');
    app.enableCors({
      origin: [
        process.env.FRONTEND_URL ?? 'http://localhost:3001',
        process.env.ADMIN_URL ?? 'http://localhost:3002',
      ],
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
    await app.listen(3010);

    logger.log('🚀 API running on http://localhost:3010/api');
    logger.log('📋 Health check: http://localhost:3010/api/auth/me');
    logger.log('📖 Swagger docs: http://localhost:3010/api/docs');
    logger.log('🔑 Super Admin: POST /api/v1/super-admin/login');
  } catch (error) {
    logger.error('Failed to start application:', error);
    if (process.env.SENTRY_DSN) Sentry.captureException(error);
    process.exit(1);
  }
}
bootstrap();
