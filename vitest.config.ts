import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.spec.*",
        "src/**/__fixtures__/**",
        "src/test-utils/**/*.ts",
        "src/**/*.d.ts",
      ],
    },
  },
});
