// Webhooks page E2E tests

import { expect, test } from "@playwright/test";

test.describe("Webhooks page", () => {
	test("navigates to /settings/webhooks and renders heading", async ({ page }) => {
		await page.goto("/settings/webhooks");
		const heading = page.getByRole("heading", { name: /webhooks/i });
		await expect(heading).toBeVisible({ timeout: 10_000 });
	});

	test("breadcrumbs show Settings > Webhooks", async ({ page }) => {
		await page.goto("/settings/webhooks");
		await expect(page.getByText("Settings").first()).toBeVisible({
			timeout: 10_000,
		});
		await expect(page.getByText("Webhooks").first()).toBeVisible();
	});

	test("shows webhook list, empty state, or error state", async ({ page }) => {
		await page.goto("/settings/webhooks");
		// With real Worker backend, page may show webhook configs,
		// or empty/error state
		const generateButton = page.getByRole("button", { name: "Generate", exact: true });
		const emptyState = page.getByText("No webhooks configured");
		const errorState = page.getByText("Failed to load webhooks");
		await expect(generateButton.or(emptyState).or(errorState)).toBeVisible({ timeout: 10_000 });
	});

	test("shows description text", async ({ page }) => {
		await page.goto("/settings/webhooks");
		await expect(
			page.getByText(/configure webhook tokens for hosts to send events/i).first(),
		).toBeVisible({ timeout: 10_000 });
	});
});
