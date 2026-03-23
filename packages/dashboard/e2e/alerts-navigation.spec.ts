// Alerts & navigation E2E tests
// Split from core-flows.spec.ts — alerts page + sidebar navigation

import { expect, test } from "@playwright/test";

test.describe("Alerts page", () => {
	test("navigates to /alerts and renders", async ({ page }) => {
		await page.goto("/alerts");
		await expect(page.locator("body")).toBeVisible();
	});

	test("shows alert table or empty state", async ({ page }) => {
		await page.goto("/alerts");
		// The page may show: alert table, "No active alerts", or "Failed to load alerts"
		// depending on whether a worker backend is available
		const table = page.locator("table");
		const emptyState = page.getByText("No active alerts");
		const errorState = page.getByText("Failed to load alerts");
		await expect(table.or(emptyState).or(errorState).first()).toBeVisible({ timeout: 10_000 });
	});
});

test.describe("Navigation", () => {
	test("sidebar has Hosts and Alerts links", async ({ page }) => {
		await page.goto("/hosts");
		const hostsLink = page.getByRole("link", { name: /hosts/i });
		const alertsLink = page.getByRole("link", { name: /alerts/i });
		await expect(hostsLink.first()).toBeVisible({ timeout: 10_000 });
		await expect(alertsLink.first()).toBeVisible({ timeout: 10_000 });
	});

	test("can navigate from hosts to alerts", async ({ page }) => {
		await page.goto("/hosts");
		await page
			.getByRole("link", { name: /alerts/i })
			.first()
			.click();
		await page.waitForURL("**/alerts");
		expect(page.url()).toContain("/alerts");
	});
});
