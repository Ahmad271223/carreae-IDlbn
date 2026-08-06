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
      API_BASE_URL: "http://localhost:3001",
      S3_ENDPOINT: process.env.S3_ENDPOINT ?? "http://localhost:9000",
      S3_ACCESS_KEY: process.env.S3_ACCESS_KEY ?? "careerid-dev",
      S3_SECRET_KEY: process.env.S3_SECRET_KEY ?? "careerid-dev-secret",
      S3_BUCKET_QUARANTINE: "careerid-test-quarantine",
      S3_BUCKET_DOCUMENTS: "careerid-test-documents",
      // Test-only key (32 bytes of 'a'); production keys come from a secret manager.
      ENCRYPTION_KEY: "YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=",
      // Test-only Ed25519 signing key — never used outside the test suite.
      CREDENTIAL_SIGNING_KEY:
        "-----BEGIN PRIVATE KEY-----\\nMC4CAQAwBQYDK2VwBCIEID6OQAaiN/TsSHxQdurrk/vAvjAWg+zZKvargjhkoYXB\\n-----END PRIVATE KEY-----",
    },
  },
});
