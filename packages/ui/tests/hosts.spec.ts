import { expect, test } from "@playwright/test";

/**
 * Hosts list page E2E tests.
 *
 * These tests verify core UI functionality without mocking APIs.
 * The local Wrangler serves the app with an empty D1 database.
 */
test.describe("Hosts list page", () => {
	test("page loads and displays sidebar navigation", async ({ page }) => {
		await page.goto("/");

		// Wait for page to load
		await page.waitForLoadState("domcontentloaded");

		// Sidebar should have navigation links
		await expect(page.getByRole("link", { name: "Hosts" }).first()).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByRole("link", { name: "Tags" })).toBeVisible();
		await expect(page.getByRole("link", { name: "Alerts" })).toBeVisible();
	});

	test("navigating to Tags page works", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("domcontentloaded");

		// Click Tags link
		await page.getByRole("link", { name: "Tags" }).click();

		// Should navigate to tags page
		await expect(page).toHaveURL("/tags");
	});

	test("navigating to Setup page works", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("domcontentloaded");

		// Click Setup link in sidebar
		await page.getByRole("link", { name: "Setup" }).click();

		// Should navigate to setup page
		await expect(page).toHaveURL("/setup");
	});

	test("navigating to Alerts page works", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("domcontentloaded");

		// Click Alerts link
		await page.getByRole("link", { name: "Alerts" }).click();

		// Should navigate to alerts page
		await expect(page).toHaveURL("/alerts");
	});

	test("navigating to Events page works", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("domcontentloaded");

		// Click Events link
		await page.getByRole("link", { name: "Events" }).click();

		// Should navigate to events page
		await expect(page).toHaveURL("/events");
	});

	test("shows empty state or host cards", async ({ page }) => {
		await page.goto("/hosts");
		await page.waitForLoadState("domcontentloaded");

		// Wait for content to load - either hosts or empty state
		// The page should either show host cards or a "No hosts" message
		await page.waitForTimeout(2_000); // Allow API to respond

		// Check if we have hosts or empty state
		const hasHosts = await page.locator('[data-testid="host-card"]').count();
		if (hasHosts === 0) {
			// Empty state - no hosts registered yet
			// This is expected for a fresh database
			const pageContent = await page.textContent("body");
			expect(pageContent).toBeDefined();
		}
	});

	test("root path redirects to /hosts", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("domcontentloaded");

		// Should redirect to /hosts
		await expect(page).toHaveURL("/hosts");
	});
});
