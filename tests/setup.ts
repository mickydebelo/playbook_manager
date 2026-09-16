import "@testing-library/jest-dom/vitest";
import { resetEnvCache } from "@/server/env";

// vitest already sets NODE_ENV=test; everything else is pinned so tests never depend on a developer's .env.
Object.assign(process.env, {
  SESSION_SECRET: "test-secret-test-secret-test-secret-1234",
  AUTH_PROVIDER: "dev",
  DEV_LOGIN_ENABLED: "true",
  DATABASE_URL: "",
  APP_BASE_URL: "http://localhost:3000",
});
resetEnvCache();
