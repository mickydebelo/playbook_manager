import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / WASM database drivers must not be bundled by Turbopack.
  serverExternalPackages: ["@electric-sql/pglite", "@electric-sql/pglite-pgvector", "pg"],
};

export default nextConfig;
