import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { resolve } from 'node:path';
import configuration from './config/configuration';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProductsModule } from './products/products.module';
import { ShoppingListModule } from './shopping-list/shopping-list.module';
import { ShoppingTripsModule } from './shopping-trips/shopping-trips.module';
import { StoresModule } from './stores/stores.module';
import { PaymentsModule } from './payments/payments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { StorageModule } from './storage/storage.module';
import { HouseholdsModule } from './households/households.module';

@Module({
  imports: [
    // ─── Config ───────────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        resolve(process.cwd(), '.env'),
        resolve(process.cwd(), '../../.env'),
      ],
      load: [configuration],
    }),

    // ─── Logging ──────────────────────────────────────────────────────────
    LoggerModule.forRoot({
      pinoHttp: {
        customProps: () => ({ context: 'HTTP' }),
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
      },
    }),

    // ─── Database ─────────────────────────────────────────────────────────
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('database.url'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        migrationsRun: true,
        synchronize: process.env.NODE_ENV !== 'production',
        logging: process.env.NODE_ENV === 'development',
        ssl:
          process.env.NODE_ENV === 'production'
            ? { rejectUnauthorized: false }
            : false,
      }),
    }),

    // ─── Scheduler ────────────────────────────────────────────────────────
    ScheduleModule.forRoot(),

    // ─── Feature modules ──────────────────────────────────────────────────
    AuthModule,
    UsersModule,
    ProductsModule,
    ShoppingListModule,
    ShoppingTripsModule,
    StoresModule,
    PaymentsModule,
    NotificationsModule,
    StorageModule,
    HouseholdsModule,
  ],
})
export class AppModule {}
