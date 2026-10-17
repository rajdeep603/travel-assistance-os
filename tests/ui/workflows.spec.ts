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

test("an overbilled hospital invoice is reviewed line by line, accepted, and counted", async ({ page }) => {
  await page.goto("/inbox");
  await page.getByLabel("Sample message").selectOption("email:hospital-final-invoice");
  await page.getByRole("button", { name: /Receive it/i }).click();
  await expect(page.getByText(/Bill review found 4,802\.50 EUR above the reference tariff/).first()).toBeVisible();
  await page.getByRole("link", { name: "CASE-1022" }).first().click();
  await expect(page.getByText("Money on this case")).toBeVisible();
  await expect(page.getByText(/Billed €535\.00 above the guarantee LOG-0902/).first()).toBeVisible();
  await expect(page.getByText("Same charge as line 5: billed twice.").first()).toBeVisible();
  await page.getByRole("button", { name: /Accept: pay €7,582\.50/ }).first().click();
  await expect(page.getByText(/^Accepted by /).first()).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("saved, accepted by a person")).toBeVisible();
});

test("voice page explains when voice isn't configured", async ({ page }) => {
  await page.goto("/voice");
  await page.getByRole("button", { name: /^Start conversation$/ }).click();
  await expect(page.getByText(/Voice isn.t available on this server/i)).toBeVisible();
});

test("⌘K finds a guarantee by its reference and opens the case", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Search and commands" }).click();
  const dialog = page.getByRole("dialog", { name: "Search and commands" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox").fill("LOG-0902");
  await expect(dialog.getByRole("option", { name: /LOG-0902 · 11,850 EUR/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /CASE-1022/ })).toBeVisible();

  // Commands too: jump to a voice agent.
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox").fill("hospital line");
  await dialog.getByRole("option", { name: /Hospital & provider line/ }).click();
  await expect(page).toHaveURL(/\/voice\?agent=inbound-provider-line/);
  await expect(page.getByRole("combobox", { name: "Voice agent" })).toHaveValue("inbound-provider-line");
});

test("the presenter picks any voice agent and language, on a ready demo case", async ({ page }) => {
  await page.goto("/voice");
  await page.getByRole("combobox", { name: "Voice agent" }).selectOption("outbound-medical-transport");
  await expect(page.getByText(/You play:\s*The treating doctor/)).toBeVisible();
  await expect(page.getByRole("link", { name: "CASE-1022" }).first()).toBeVisible();
  await page.getByRole("combobox", { name: "Language" }).selectOption("Turkish");
  await expect(page).toHaveURL(/agent=outbound-medical-transport/);
  await expect(page).toHaveURL(/lang=Turkish/);
  await expect(page.getByText("What the agent recorded")).toBeVisible();
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

test("the floating AI assistant keeps the conversation and its history, with voice mode a click away", async ({ page }) => {
  await page.goto("/cases");
  await page.getByRole("button", { name: "Open the AI assistant" }).click();
  const panel = page.getByRole("dialog", { name: "AI assistant" });
  const box = panel.getByRole("textbox", { name: "Ask the assistant a question" });
  await box.fill("What is the status of CASE-1024?");
  await box.press("Enter");
  await expect(panel.getByText(/Assigned to Elif Demirtas/)).toBeVisible();
  // A follow-up about "it" stays on the case.
  await box.fill("Who is it assigned to?");
  await box.press("Enter");
  await expect(panel.getByText(/Assigned to Elif Demirtas/)).toHaveCount(2);

  // The conversation comes back after a reload, and is listed under History.
  await page.reload();
  await page.getByRole("button", { name: "Open the AI assistant" }).click();
  await expect(panel.getByText("Who is it assigned to?")).toBeVisible();
  await panel.getByRole("button", { name: "Conversation history" }).click();
  await expect(panel.getByRole("list", { name: "Earlier conversations" }).getByText("What is the status of CASE-1024?").first()).toBeVisible();
  await panel.getByRole("button", { name: "Conversation history" }).click();

  // Voice mode explains itself when the voice service isn't configured.
  await panel.getByRole("button", { name: "Talk to the assistant (voice mode)" }).click();
  await expect(panel.getByRole("alert")).toContainText("isn't configured");

  // The full page shows the same conversation, without the floating button.
  await page.goto("/assistant");
  await expect(page.getByText("Who is it assigned to?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open the AI assistant" })).toHaveCount(0);
});
