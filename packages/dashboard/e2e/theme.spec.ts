// Theme toggle E2E tests

import { expect, test } from "@playwright/test";

test.describe("Theme toggle", () => {
	test("theme toggle button is accessible", async ({ page }) => {
		await page.goto("/hosts");
		const toggleButton = page.getByRole("button", { name: "Toggle theme" });
		await expect(toggleButton).toBeVisible({ timeout: 10_000 });
	});

	test("cycling theme changes html class", async ({ page }) => {
		await page.goto("/hosts");
		const toggleButton = page.getByRole("button", { name: "Toggle theme" });
		await expect(toggleButton).toBeVisible({ timeout: 10_000 });

		// Default is "system" — click once → light (no dark class)
		await toggleButton.click();
		await expect(page.locator("html")).not.toHaveClass(/dark/);

		// Click again → dark
		await toggleButton.click();
		await expect(page.locator("html")).toHaveClass(/dark/);

		// Click again → system (depends on OS preference, just verify no crash)
		await toggleButton.click();
		await expect(page.locator("html")).toBeVisible();
	});

	test("theme persists across navigation", async ({ page }) => {
		await page.goto("/hosts");
		const toggleButton = page.getByRole("button", { name: "Toggle theme" });
		await expect(toggleButton).toBeVisible({ timeout: 10_000 });

		// Set to dark: system → light → dark (2 clicks)
		await toggleButton.click();
		await toggleButton.click();
		await expect(page.locator("html")).toHaveClass(/dark/);

		// Navigate to another page
		await page.getByRole("link", { name: "Alerts" }).first().click();
		await page.waitForURL("**/alerts");

		// Dark class should persist
		await expect(page.locator("html")).toHaveClass(/dark/);
	});

	test("theme toggle is available on login page", async ({ page }) => {
		await page.goto("/login");
		const toggleButton = page.getByRole("button", { name: "Toggle theme" });
		await expect(toggleButton).toBeVisible({ timeout: 10_000 });
	});
});
