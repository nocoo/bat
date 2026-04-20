import { expect, test } from "@playwright/test";

test.describe("Webhooks page", () => {
	test("page loads with correct breadcrumbs", async ({ page }) => {
		await page.goto("/settings/webhooks");
		await page.waitForLoadState("domcontentloaded");

		const breadcrumb = page.getByLabel("Breadcrumb navigation");
		await expect(breadcrumb.getByText("Settings")).toBeVisible({ timeout: 15_000 });
		await expect(breadcrumb.getByText("Webhooks")).toBeVisible();
	});

	test("shows page heading and description", async ({ page }) => {
		await page.goto("/settings/webhooks");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByRole("heading", { name: "Webhooks", level: 1 })).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByText("Configure webhook tokens for hosts")).toBeVisible();
	});

	test("shows host selection dropdown", async ({ page }) => {
		await page.goto("/settings/webhooks");
		await page.waitForLoadState("domcontentloaded");

		const select = page.locator("select");
		await expect(select).toBeVisible({ timeout: 15_000 });

		const placeholderOption = page.locator('option[value=""]');
		await expect(placeholderOption).toHaveText("Select a host...");
	});

	test("Generate button is disabled without host selection", async ({ page }) => {
		await page.goto("/settings/webhooks");
		await page.waitForLoadState("domcontentloaded");

		const generateButton = page.locator('button[type="submit"]');
		await expect(generateButton).toBeVisible({ timeout: 15_000 });
		await expect(generateButton).toBeDisabled();
	});

	test("displays existing webhook for alpha", async ({ page }) => {
		await page.goto("/settings/webhooks");
		await page.waitForLoadState("domcontentloaded");

		// Seeded webhook for alpha should be visible
		await expect(page.getByText("alpha.test.local")).toBeVisible({ timeout: 15_000 });
	});

	test("webhook shows curl command with token", async ({ page }) => {
		await page.goto("/settings/webhooks");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByText("alpha.test.local")).toBeVisible({ timeout: 15_000 });

		// Should show a pre block with curl command
		const preBlock = page.locator("pre");
		await expect(preBlock.first()).toBeVisible();
		await expect(preBlock.first()).toContainText("curl");
	});

	test("webhook has copy button", async ({ page }) => {
		await page.goto("/settings/webhooks");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByText("alpha.test.local")).toBeVisible({ timeout: 15_000 });

		const copyButton = page.getByRole("button", { name: "Copy to clipboard" });
		await expect(copyButton.first()).toBeVisible();
	});

	test("webhook has regenerate button", async ({ page }) => {
		await page.goto("/settings/webhooks");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByText("alpha.test.local")).toBeVisible({ timeout: 15_000 });

		const regenButton = page.getByRole("button", { name: "Regenerate token" });
		await expect(regenButton.first()).toBeVisible();
	});

	test("webhook has delete button", async ({ page }) => {
		await page.goto("/settings/webhooks");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByText("alpha.test.local")).toBeVisible({ timeout: 15_000 });

		const deleteButton = page.getByRole("button", { name: "Delete webhook" });
		await expect(deleteButton.first()).toBeVisible();
	});

	test("dropdown only shows hosts without webhooks", async ({ page }) => {
		await page.goto("/settings/webhooks");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByText("alpha.test.local")).toBeVisible({ timeout: 15_000 });

		// alpha already has a webhook, so dropdown should only have beta
		const select = page.locator("select");
		const options = select.locator("option:not([value=''])");
		await expect(options).toHaveCount(1);
		await expect(options.first()).toContainText("beta.test.local");
	});

	test("generate webhook for beta host", async ({ page }) => {
		await page.goto("/settings/webhooks");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByText("alpha.test.local")).toBeVisible({ timeout: 15_000 });

		// Select beta from dropdown
		const select = page.locator("select");
		await select.selectOption({ label: "beta.test.local" });

		// Generate button should be enabled now
		const generateButton = page.locator('button[type="submit"]');
		await expect(generateButton).toBeEnabled();
		await generateButton.click();

		// Should now show both webhooks
		await expect(page.getByText("beta.test.local")).toBeVisible({ timeout: 10_000 });

		// Clean up — delete beta webhook
		const deleteButtons = page.getByRole("button", { name: "Delete webhook" });
		await deleteButtons.last().click();
	});
});
