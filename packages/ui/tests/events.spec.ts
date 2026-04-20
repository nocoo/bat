import { expect, test } from "@playwright/test";

/**
 * Events page E2E tests.
 *
 * Tests verify the events list page functionality.
 */
test.describe("Events page", () => {
	test("page loads with correct breadcrumb", async ({ page }) => {
		await page.goto("/events");
		await page.waitForLoadState("domcontentloaded");

		// Breadcrumb should show "Events"
		await expect(page.getByText("Events").first()).toBeVisible({ timeout: 15_000 });
	});

	test("sidebar navigation includes Events link", async ({ page }) => {
		await page.goto("/events");
		await page.waitForLoadState("domcontentloaded");

		// Events link should be in sidebar
		const eventsLink = page.getByRole("link", { name: "Events" });
		await expect(eventsLink).toBeVisible({ timeout: 15_000 });
	});

	test("shows empty state when no events exist", async ({ page }) => {
		await page.goto("/events");
		await page.waitForLoadState("domcontentloaded");

		// Should show empty state (database starts empty)
		await expect(page.getByText("No events yet")).toBeVisible({ timeout: 15_000 });
		await expect(
			page.getByText("Events will appear here when hosts send webhook payloads"),
		).toBeVisible();
	});

	test("has table structure when data exists", async ({ page }) => {
		await page.goto("/events");
		await page.waitForLoadState("domcontentloaded");

		// Wait for the page to settle
		const hasData = await page
			.getByRole("columnheader", { name: "Host" })
			.isVisible({ timeout: 5_000 })
			.catch(() => false);

		if (hasData) {
			// If there's data, verify table structure
			await expect(page.getByRole("columnheader", { name: "Title" })).toBeVisible();
			await expect(page.getByRole("columnheader", { name: "Tags" })).toBeVisible();
			await expect(page.getByRole("columnheader", { name: "Time" })).toBeVisible();
		} else {
			// Empty state should be visible
			await expect(page.getByText("No events yet")).toBeVisible();
		}
	});
});
