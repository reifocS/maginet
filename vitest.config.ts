import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "e2e/**",
      "dist/**",
      "playwright-report/**",
      "test-results/**",
      "node_modules/**",
    ],
  },
});
