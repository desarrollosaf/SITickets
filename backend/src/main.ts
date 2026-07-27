import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());

  /*
   * whitelist descarta cualquier campo que no este en el DTO. Es lo que impide
   * que alguien mande { rol: 'admin' } o { solicitante: 7 } y el backend lo
   * tome en cuenta: si no esta declarado, no existe.
   */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:4200').split(','),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: false,
  });

  app.setGlobalPrefix('api');

  const puerto = Number(process.env.PORT ?? 3050);
  await app.listen(puerto, '0.0.0.0');
  new Logger('SITickets').log(`API escuchando en http://localhost:${puerto}/api`);
}
void bootstrap();
