import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";

export default defineConfig({
  testDir: "./tests/ui",
  outputDir: "./output/playwright",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
    },
  },
  use: {
    baseURL,
    colorScheme: "light",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "iphone-12-mini",
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
      use: {
        ...devices["iPhone 12 Mini"],
        browserName: "chromium",
        storageState: "./output/playwright-auth/admin.json",
      },
    },
    {
      name: "mobile-320",
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
      use: {
        viewport: { width: 320, height: 720 },
        storageState: "./output/playwright-auth/admin.json",
      },
    },
    {
      name: "mobile-390",
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
      use: {
        viewport: { width: 390, height: 844 },
        storageState: "./output/playwright-auth/admin.json",
      },
    },
    {
      name: "mobile-430",
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
      use: {
        viewport: { width: 430, height: 932 },
        storageState: "./output/playwright-auth/admin.json",
      },
    },
    {
      name: "tablet-768",
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
      use: {
        viewport: { width: 768, height: 1024 },
        storageState: "./output/playwright-auth/admin.json",
      },
    },
    {
      name: "mobile-landscape",
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
      use: {
        viewport: { width: 812, height: 375 },
        storageState: "./output/playwright-auth/admin.json",
      },
    },
    {
      name: "desktop",
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
      use: {
        viewport: { width: 1440, height: 1000 },
        storageState: "./output/playwright-auth/admin.json",
      },
    },
  ],
  webServer:
    process.env.PLAYWRIGHT_START_SERVER === "true"
      ? {
          command: "pnpm start -- -p 3100",
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
        }
      : undefined,
});
