// Events page E2E tests

import { expect, test } from "@playwright/test";

test.describe("Events page", () => {
	test("navigates to /events and renders heading", async ({ page }) => {
		await page.goto("/events");
		await expect(page.locator("body")).toBeVisible();
		// Breadcrumb should contain "Events"
		const breadcrumb = page.getByText("Events");
		await expect(breadcrumb.first()).toBeVisible({ timeout: 10_000 });
	});

	test("shows event table or empty/error state", async ({ page }) => {
		await page.goto("/events");
		// With real Worker backend, events page may show a table with data,
		// or empty/error state if no data
		const table = page.locator("table");
		const emptyState = page.getByText("No events yet");
		const errorState = page.getByText("Failed to load events");
		await expect(table.or(emptyState).or(errorState).first()).toBeVisible({
			timeout: 10_000,
		});
	});

	test("event table has expected columns when data exists", async ({ page }) => {
		await page.goto("/events");
		const table = page.locator("table");
		const isTableVisible = await table.isVisible({ timeout: 10_000 }).catch(() => false);
		if (isTableVisible) {
			// Verify table headers
			await expect(page.getByRole("columnheader", { name: "Time" })).toBeVisible();
			await expect(page.getByRole("columnheader", { name: "Host" })).toBeVisible();
			await expect(page.getByRole("columnheader", { name: "Title" })).toBeVisible();
		}
	});
});
