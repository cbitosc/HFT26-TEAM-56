import type { NextConfig } from "next";

const SANDBOX_FILES = [
  "./src/lib/sandbox/runner/**",
  "./node_modules/quickjs-emscripten/**",
  "./node_modules/quickjs-emscripten-core/**",
  "./node_modules/@jitl/quickjs-ffi-types/**",
  "./node_modules/@jitl/quickjs-wasmfile-release-sync/**",
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // The code sandbox runs as a separate Node process (src/lib/sandbox), so its
  // script and QuickJS's WebAssembly build must ship with the routes that use it.
  // Generation validates questions there, and the workspace runs candidate
  // code there when no Piston service is configured.
  outputFileTracingIncludes: {
    "/api/assessments": SANDBOX_FILES,
    "/api/assessments/**/*": SANDBOX_FILES,
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
