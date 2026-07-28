import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (embedded Postgres for local dev) loads a WASM bundle at runtime —
  // it must run from node_modules, not be bundled.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
};

export default nextConfig;
