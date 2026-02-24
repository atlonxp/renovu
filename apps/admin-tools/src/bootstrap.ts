import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import * as bodyParser from 'body-parser';
import { AppModule } from './app.module';
import { validateEnv } from './config';

// Validate the ENV variables before bootstrapping the app
validateEnv();

const BODY_PARSER_LIMIT = '50mb';

export async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.use(helmet());

  app.enableCors({
    origin: '*',
    preflightContinue: false,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Api-Key'],
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.use(bodyParser.json({ limit: BODY_PARSER_LIMIT }));
  app.use(bodyParser.urlencoded({ limit: BODY_PARSER_LIMIT, extended: true }));

  app.enableShutdownHooks();

  const port = process.env.PORT || '3005';
  await app.listen(port);

  Logger.log(`Admin Tools service is running on port ${port}`, 'Bootstrap');
}
