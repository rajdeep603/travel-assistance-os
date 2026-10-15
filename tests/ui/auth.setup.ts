import { expect, test as setup } from "@playwright/test";

// When the target requires operator sign-in (a deployment), log in once and
// share the session with every spec. Credentials come from the environment:
//   E2E_OPERATOR=admin E2E_PASSWORD=… E2E_BASE_URL=https://… npm run test:ui
export const STORAGE_STATE = "test-results/.auth/operator.json";

setup("operator session", async ({ page }) => {
  const name = process.env.E2E_OPERATOR;
  const password = process.env.E2E_PASSWORD;
  if (!name || !password) {
    await page.context().storageState({ path: STORAGE_STATE });
    return;
  }
  await page.goto("/login");
  await page.getByLabel("Operator name").fill(name);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /Sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.context().storageState({ path: STORAGE_STATE });
});
