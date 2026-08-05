import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { HealthModule } from "./modules/health/health.module";
import { AuthModule } from "./modules/auth/auth.module";
import { PrismaModule } from "./prisma/prisma.module";

/**
 * Modular monolith root. Every domain from docs/ARCHITECTURE.md gets its own
 * module under src/modules/<domain>; modules talk via public module APIs or
 * domain events — never via another module's repositories (boundary rule T4).
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      // Async so limits are read at app init (tests tune them per instance).
      useFactory: () => ({
        throttlers: [
          {
            name: "default",
            ttl: 60_000,
            limit: Number(process.env.THROTTLE_DEFAULT_LIMIT ?? 100),
          },
        ],
      }),
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
  ],
})
export class AppModule {}
