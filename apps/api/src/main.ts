import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  try {
    logger.log('Starting NestJS application...');
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });
    
    logger.log('Enabling CORS...');
    app.enableCors();
    
    logger.log('Setting global prefix to /api...');
    app.setGlobalPrefix('api');
    
    logger.log('Starting server on port 3010...');
    await app.listen(3010);
    
    logger.log('🚀 API running on http://localhost:3010/api');
    logger.log('📋 Health check: http://localhost:3010/api/auth/me');
  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
}
bootstrap();
