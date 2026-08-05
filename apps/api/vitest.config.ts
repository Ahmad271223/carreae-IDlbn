import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://careerid:careerid_dev@localhost:5432/careerid_test";

export default defineConfig({
  // SWC (not esbuild) so NestJS decorator metadata is emitted for DI.
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: "es2022",
      },
      module: { type: "es6" },
    }),
  ],
  test: {
    environment: "node",
    globalSetup: "./test/global-setup.ts",
    // Integration tests share one database — no cross-file parallelism.
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 30_000,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      NODE_ENV: "test",
      APP_BASE_URL: "http://localhost:3000",
      // High defaults so functional tests never trip limits; the dedicated
      // rate-limit spec lowers AUTH_THROTTLE_LIMIT for its own app instance.
      THROTTLE_DEFAULT_LIMIT: "10000",
      AUTH_THROTTLE_LIMIT: "1000",
    },
  },
});
