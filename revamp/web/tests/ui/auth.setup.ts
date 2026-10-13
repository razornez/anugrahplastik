import { expect, test as setup } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const authFile = "./output/playwright-auth/admin.json";

setup("authenticate admin", async ({ page }) => {
  const email = process.env.INITIAL_ADMIN_EMAIL;
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD are required for UI tests.");

  await page.goto("/admin/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/kata sandi|pin/i).fill(password);
  const sessionResponse = page.waitForResponse(async (response) => {
    const headers = await response.allHeaders();
    return Boolean(headers["set-cookie"]?.includes("anugrahplastik_session="));
  });
  await page.getByRole("button", { name: /masuk ke ruang kerja/i }).click();
  const response = await sessionResponse;
  await expect(page).toHaveURL(/\/admin(?:\?.*)?$/);
  const setCookie = (await response.allHeaders())["set-cookie"] ?? "";
  const token = /anugrahplastik_session=([^;]+)/.exec(setCookie)?.[1];
  if (!token) throw new Error("The login response did not include the admin session cookie.");
  await page.context().addCookies([
    {
      name: "anugrahplastik_session",
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
  await mkdir("./output/playwright-auth", { recursive: true });
  await page.context().storageState({ path: authFile });
});
