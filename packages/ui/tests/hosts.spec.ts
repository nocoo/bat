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
});
