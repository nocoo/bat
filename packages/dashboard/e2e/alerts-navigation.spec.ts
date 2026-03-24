// Alerts page E2E tests
// Split from core-flows.spec.ts — alerts page

import { expect, test } from "@playwright/test";

test.describe("Alerts page", () => {
	test("navigates to /alerts and renders", async ({ page }) => {
		await page.goto("/alerts");
		await expect(page.locator("body")).toBeVisible();
	});

	test("shows alert table, empty state, or error state", async ({ page }) => {
		await page.goto("/alerts");
		// The page may show: alert table, "No active alerts", or "Failed to load alerts"
		// depending on whether a worker backend is available
		const table = page.locator("table");
		const emptyState = page.getByText("No active alerts");
		const errorState = page.getByText("Failed to load alerts");
		await expect(table.or(emptyState).or(errorState).first()).toBeVisible({
			timeout: 10_000,
		});
	});

	test("empty state has reassuring message", async ({ page }) => {
		await page.goto("/alerts");
		const normalMessage = page.getByText("All systems are running normally");
		const errorState = page.getByText("Failed to load alerts");
		await expect(normalMessage.or(errorState).first()).toBeVisible({
			timeout: 10_000,
		});
	});

	test("breadcrumb shows Alerts", async ({ page }) => {
		await page.goto("/alerts");
		const breadcrumb = page.getByText("Alerts");
		await expect(breadcrumb.first()).toBeVisible({ timeout: 10_000 });
	});
});
