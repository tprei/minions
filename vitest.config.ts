import { defineConfig, configDefaults } from "vitest/config";
import { resolve } from "path";

const pwaRoot = resolve(__dirname, "pwa");

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
        resolve: {
          alias: [
            { find: /^\/assets\/(.*)$/, replacement: `${pwaRoot}/assets/$1` },
          ],
        },
        test: {
          name: "pwa",
          environment: "jsdom",
          include: ["test/pwa/**/*.test.ts"],
        },
      },
    ],
  },
});
