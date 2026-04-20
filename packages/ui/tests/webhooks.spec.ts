import { expect, test } from "@playwright/test";

/**
 * Webhooks settings page E2E tests.
 *
 * Tests verify the webhooks configuration page functionality.
 */
test.describe("Webhooks page", () => {
	test("page loads with correct breadcrumbs", async ({ page }) => {
		await page.goto("/settings/webhooks");
		await page.waitForLoadState("domcontentloaded");

		// Breadcrumbs should show Settings > Webhooks in the breadcrumb nav
		const breadcrumb = page.getByLabel("Breadcrumb navigation");
		await expect(breadcrumb.getByText("Settings")).toBeVisible({ timeout: 15_000 });
		await expect(breadcrumb.getByText("Webhooks")).toBeVisible();
	});

	test("shows page heading and description", async ({ page }) => {
		await page.goto("/settings/webhooks");
		await page.waitForLoadState("domcontentloaded");

		// Main heading (h1)
		await expect(page.getByRole("heading", { name: "Webhooks", level: 1 })).toBeVisible({
			timeout: 15_000,
		});

		// Description text - use more specific selector
		await expect(page.getByText("Configure webhook tokens for hosts")).toBeVisible();
	});

	test("shows host selection dropdown", async ({ page }) => {
		await page.goto("/settings/webhooks");
		await page.waitForLoadState("domcontentloaded");

		// Host selection dropdown should exist
		const select = page.locator("select");
		await expect(select).toBeVisible({ timeout: 15_000 });

		// Check that select has the placeholder option (it's inside the select, not visible text)
		const placeholderOption = page.locator('option[value=""]');
		await expect(placeholderOption).toHaveText("Select a host...");
	});

	test("Generate button is disabled without host selection", async ({ page }) => {
		await page.goto("/settings/webhooks");
		await page.waitForLoadState("domcontentloaded");

		// Generate button should be disabled
		const generateButton = page.getByRole("button", { name: "Generate" });
		await expect(generateButton).toBeVisible({ timeout: 15_000 });
		await expect(generateButton).toBeDisabled();
	});

	test("shows empty state when no webhooks configured", async ({ page }) => {
		await page.goto("/settings/webhooks");
		await page.waitForLoadState("domcontentloaded");

		// Should show empty state (database starts empty)
		await expect(page.getByText("No webhooks configured")).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText("Select a host above to generate a webhook token")).toBeVisible();
	});
});
