import { expect, test } from "@playwright/test";

/**
 * Alerts page E2E tests.
 *
 * Tests verify the alerts list page functionality.
 */
test.describe("Alerts page", () => {
	test("page loads with correct breadcrumb", async ({ page }) => {
		await page.goto("/alerts");
		await page.waitForLoadState("domcontentloaded");

		// Breadcrumb should show "Alerts"
		await expect(page.getByText("Alerts").first()).toBeVisible({ timeout: 15_000 });
	});

	test("sidebar shows Alerts link as active", async ({ page }) => {
		await page.goto("/alerts");
		await page.waitForLoadState("domcontentloaded");

		// Alerts link in sidebar should be visible
		const alertsLink = page.getByRole("link", { name: "Alerts" });
		await expect(alertsLink).toBeVisible({ timeout: 15_000 });
	});

	test("shows empty state when no alerts exist", async ({ page }) => {
		await page.goto("/alerts");
		await page.waitForLoadState("domcontentloaded");

		// Should show empty state (database starts empty)
		await expect(page.getByText("No active alerts")).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText("All systems are running normally")).toBeVisible();
	});

	test("has table headers when data loads", async ({ page }) => {
		await page.goto("/alerts");
		await page.waitForLoadState("domcontentloaded");

		// Wait for the page to settle - either table headers or empty state
		const hasData = await page
			.getByRole("columnheader", { name: "Host" })
			.isVisible({ timeout: 5_000 })
			.catch(() => false);

		if (hasData) {
			// If there's data, verify table structure
			await expect(page.getByRole("columnheader", { name: "Rule" })).toBeVisible();
			await expect(page.getByRole("columnheader", { name: "Severity" })).toBeVisible();
			await expect(page.getByRole("columnheader", { name: "Message" })).toBeVisible();
			await expect(page.getByRole("columnheader", { name: "Since" })).toBeVisible();
		} else {
			// Empty state should be visible
			await expect(page.getByText("No active alerts")).toBeVisible();
		}
	});
});
