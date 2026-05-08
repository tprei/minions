import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "e2e/**"],
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["test/**/*.test.ts"],
          exclude: ["test/pwa/**"],
        },
      },
      {
        test: {
          name: "pwa",
          environment: "jsdom",
          include: ["test/pwa/**/*.test.ts"],
        },
      },
    ],
  },
});
