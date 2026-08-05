import type { INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import helmet from "helmet";

/**
 * Shared between main.ts and the integration tests so the tested app is
 * configured exactly like production — middleware drift between the two is a
 * classic source of "passes in test, fails live" auth bugs.
 */
export function configureApp(app: INestApplication): void {
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.APP_BASE_URL ?? "http://localhost:3000",
    credentials: true,
  });
  app.setGlobalPrefix("api/v1");
  app.enableShutdownHooks();
}
