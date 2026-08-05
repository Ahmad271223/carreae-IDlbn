import { Module } from "@nestjs/common";
import { HealthModule } from "./modules/health/health.module";

/**
 * Modular monolith root. Every domain from docs/ARCHITECTURE.md gets its own
 * module under src/modules/<domain>; modules talk via public module APIs or
 * domain events — never via another module's repositories (boundary rule T4).
 */
@Module({
  imports: [HealthModule],
})
export class AppModule {}
