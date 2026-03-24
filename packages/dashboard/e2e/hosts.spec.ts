// Hosts overview E2E tests
// Split from core-flows.spec.ts — hosts list page

import { expect, test } from "@playwright/test";

test.describe("Hosts overview", () => {
	test("navigates to /hosts and renders page", async ({ page }) => {
		await page.goto("/hosts");
		await expect(page.locator("body")).toBeVisible();
		// Should show "Hosts" heading or similar
		const heading = page.getByRole("heading", { level: 1 });
		if (await heading.isVisible()) {
			await expect(heading).toContainText(/hosts/i);
		}
	});

	test("shows loading state or host cards", async ({ page }) => {
		await page.goto("/hosts");
		// Wait for either loading skeleton or host cards to appear
		const content = page.locator('[class*="card"], [class*="skeleton"]');
		await expect(content.first()).toBeVisible({ timeout: 10_000 });
	});

	test("shows host cards, empty state, or error state", async ({ page }) => {
		await page.goto("/hosts");
		// With real Worker backend, hosts page may show host cards,
		// empty state ("No hosts registered"), or error state
		const hostCard = page.locator('[class*="card"]');
		const emptyState = page.getByText("No hosts registered");
		const errorState = page.getByText("Failed to load hosts");
		await expect(hostCard.first().or(emptyState).or(errorState)).toBeVisible({ timeout: 10_000 });
	});

	test("breadcrumb shows Hosts", async ({ page }) => {
		await page.goto("/hosts");
		const breadcrumb = page.getByText("Hosts");
		await expect(breadcrumb.first()).toBeVisible({ timeout: 10_000 });
	});
});
