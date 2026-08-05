/** Test database URL — a separate database so tests never touch dev data. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://careerid:careerid_dev@localhost:5432/careerid_test";

/** Maintenance connection used only to create the test database. */
export const ADMIN_DATABASE_URL =
  process.env.ADMIN_DATABASE_URL ??
  "postgresql://careerid:careerid_dev@localhost:5432/careerid";
