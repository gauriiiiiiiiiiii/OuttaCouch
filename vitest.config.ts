import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // tsconfig uses "jsx": "preserve" for Next; tests need the automatic runtime.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": rootDir
    }
  },
  test: {
    // Node by default (API routes + lib). Component/page/hook files opt into
    // jsdom with a `// @vitest-environment jsdom` docblock.
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    // user-event driven page tests run ~10x slower under coverage instrumentation.
    // A generous ceiling still catches genuine hangs.
    testTimeout: 60_000,
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    coverage: {
      provider: "v8",
      include: ["app/**", "components/**", "lib/**", "middleware.ts", "pages/**"],
      exclude: ["**/*.d.ts"],
      reportOnFailure: true
    }
  }
});
