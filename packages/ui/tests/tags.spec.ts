import { expect, test } from "@playwright/test";

/**
 * Tags page E2E tests.
 *
 * These tests verify the Tags page UI functionality.
 */
test.describe("Tags page", () => {
	test("page loads with create tag input", async ({ page }) => {
		await page.goto("/tags");
		await page.waitForLoadState("domcontentloaded");

		// Create tag input should be visible
		const input = page.getByPlaceholder("New tag name");
		await expect(input).toBeVisible({ timeout: 15_000 });
	});

	test("create button is disabled when input is empty", async ({ page }) => {
		await page.goto("/tags");
		await page.waitForLoadState("domcontentloaded");

		// Create button should be disabled when input is empty
		const createButton = page.getByRole("button", { name: "Create" });
		await expect(createButton).toBeVisible({ timeout: 15_000 });
		await expect(createButton).toBeDisabled();
	});

	test("create button enables when text is entered", async ({ page }) => {
		await page.goto("/tags");
		await page.waitForLoadState("domcontentloaded");

		const input = page.getByPlaceholder("New tag name");
		const createButton = page.getByRole("button", { name: "Create" });

		// Initially disabled
		await expect(createButton).toBeDisabled();

		// Type something
		await input.fill("test-tag");

		// Button should be enabled
		await expect(createButton).toBeEnabled();

		// Clear input
		await input.fill("");

		// Button should be disabled again
		await expect(createButton).toBeDisabled();
	});

	test("shows empty state when no tags exist", async ({ page }) => {
		await page.goto("/tags");
		await page.waitForLoadState("domcontentloaded");

		// Should show empty state (database starts empty)
		await expect(page.getByText("No tags yet")).toBeVisible({ timeout: 15_000 });
	});
});
