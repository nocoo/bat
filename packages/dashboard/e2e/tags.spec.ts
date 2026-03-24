// Tags page E2E tests

import { expect, test } from "@playwright/test";

test.describe("Tags page", () => {
	test("navigates to /tags and renders heading", async ({ page }) => {
		await page.goto("/tags");
		await expect(page.locator("body")).toBeVisible();
		const breadcrumb = page.getByText("Tags");
		await expect(breadcrumb.first()).toBeVisible({ timeout: 10_000 });
	});

	test("shows tag list, empty state, or error state", async ({ page }) => {
		await page.goto("/tags");
		// With real Worker backend, tags page may show existing tags,
		// or empty/error state if no data
		const tagButton = page
			.getByRole("button")
			.filter({ hasText: /^(?!Monitoring|Settings|Collapse|Toggle|Create|Sign)/ });
		const emptyState = page.getByText("No tags yet");
		const errorState = page.getByText("Failed to load tags");
		// At least one of: a tag button, empty state, or error state should appear
		await expect(tagButton.first().or(emptyState).or(errorState)).toBeVisible({ timeout: 10_000 });
	});

	test("create form is present with input and button", async ({ page }) => {
		await page.goto("/tags");
		// Create form should render regardless of data state
		const input = page.getByPlaceholder("New tag name");
		const createButton = page.getByRole("button", { name: "Create" });
		await expect(input).toBeVisible({ timeout: 10_000 });
		await expect(createButton).toBeVisible();
	});

	test("create button is disabled when input is empty", async ({ page }) => {
		await page.goto("/tags");
		const createButton = page.getByRole("button", { name: "Create" });
		await expect(createButton).toBeVisible({ timeout: 10_000 });
		await expect(createButton).toBeDisabled();
	});
});
