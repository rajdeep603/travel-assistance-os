import { expect, test } from "@playwright/test";

// The demo's main journeys in a real browser, against the seeded database.

test("dashboard shows the outcomes and every module", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /CareTrail/i })).toBeVisible();
  for (const name of ["Medical Document AI", "AI Case Manager", "AI Call Center", "E-mail & Fax Automation"]) {
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  }
  for (const outcome of ["of calls handled end-to-end by AI", "from cost estimate to Letter of Guarantee", "languages served"]) {
    await expect(page.getByText(outcome)).toBeVisible();
  }
});

test("request → AI case → book a provider for that case", async ({ page }) => {
  await page.goto("/cases");
  await page.getByRole("button", { name: /Use sample request/i }).click();
  await page.getByRole("button", { name: /Analyse with AI/i }).click();
  await expect(page.getByText(/Case summary/i)).toBeVisible();
  await page.getByRole("button", { name: /Create Case/i }).click();
  // The new case's banner, not the recent-cases list (which re-renders after creation).
  const created = page.getByText(/Case\s+CASE-\d+\s+created/);
  await expect(created).toBeVisible();
  const caseRef = (await created.textContent())!.match(/CASE-\d+/)![0];
  await page.getByRole("link", { name: /open the case/i }).click();

  await expect(page.getByRole("heading", { name: new RegExp(caseRef) })).toBeVisible();
  await page.getByRole("link", { name: /Book a provider/i }).click();
  await expect(page.getByText(new RegExp(`Booking for\\s+${caseRef}`))).toBeVisible();
  await page.getByRole("button", { name: /Search providers/i }).click();
  await page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first().click();
  await page.getByRole("button", { name: /Confirm booking/i }).click();
  await expect(page.getByText(new RegExp(`Appointment APT-\\d{4}-\\d+ confirmed.*Linked to ${caseRef}`))).toBeVisible();
});

test("a faxed cost estimate becomes a Letter of Guarantee on the case", async ({ page }) => {
  await page.goto("/inbox");
  await page.getByLabel("Sample message").selectOption("fax:fax-cost-estimate");
  await page.getByRole("button", { name: /Receive it/i }).click();
  await expect(page.getByText("OCR").first()).toBeVisible();
  // Seeded letters are LOG-09xx; the one drafted from this fax comes from the live sequence.
  await expect(page.getByText(/Letter of Guarantee LOG-[1-9]\d*/).first()).toBeVisible();
  await page.getByRole("link", { name: "CASE-1024" }).first().click();
  await expect(page.getByText("Letters of Guarantee", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Letter PDF/i }).first()).toBeVisible();
});

test("the Turkish epikriz is read and translated", async ({ page }) => {
  await page.goto("/inbox");
  await page.getByLabel("Sample message").selectOption("email:hospital-epikriz-tr");
  await page.getByRole("button", { name: /Receive it/i }).click();
  await expect(page.getByRole("link", { name: "CASE-1022" }).first()).toBeVisible();
  await page.getByRole("button", { name: /Show English translation/i }).click();
  await expect(page.getByText(/Unstable angina pectoris/).first()).toBeVisible();
});

test("voice page explains when voice isn't configured", async ({ page }) => {
  await page.goto("/voice");
  await page.getByRole("button", { name: /^Start conversation$/ }).click();
  await expect(page.getByText(/Voice isn.t available on this server/i)).toBeVisible();
});

test("the business case recalculates from the visitor's own numbers", async ({ page }) => {
  await page.goto("/business-case");
  const headline = page.getByText(/^With these numbers, .+ would free about [\d,]+ agent hours a month/);
  await expect(headline).toBeVisible();
  const before = (await headline.textContent())!;
  await page.getByRole("spinbutton", { name: "Inbound calls per month" }).fill("20000");
  await expect(headline).not.toHaveText(before);
  await page.getByRole("button", { name: "Large insurer" }).click();
  await expect(page.getByRole("button", { name: "Large insurer" })).toHaveAttribute("aria-pressed", "true");
});
