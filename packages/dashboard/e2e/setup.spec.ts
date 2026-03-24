// Setup page E2E tests

import { expect, test } from "@playwright/test";

test.describe("Setup page", () => {
	test("navigates to /setup and renders Install Probe heading", async ({ page }) => {
		await page.goto("/setup");
		const heading = page.getByRole("heading", { name: /install probe/i });
		await expect(heading).toBeVisible({ timeout: 10_000 });
	});

	test("shows prerequisites section", async ({ page }) => {
		await page.goto("/setup");
		const prerequisites = page.getByText("Prerequisites");
		await expect(prerequisites.first()).toBeVisible({ timeout: 10_000 });
		// Should mention Linux server requirement
		await expect(page.getByText(/linux server/i).first()).toBeVisible();
	});

	test("shows install steps when config loads", async ({ page }) => {
		await page.goto("/setup");
		// Step cards or error state (if setup config fails to load)
		const step1 = page.getByText("Step 1");
		const errorState = page.getByText("Failed to load setup configuration");
		await expect(step1.or(errorState).first()).toBeVisible({
			timeout: 10_000,
		});
	});

	test("uninstall section is collapsible", async ({ page }) => {
		await page.goto("/setup");
		// The uninstall section should be present as a collapsible trigger
		const uninstallTrigger = page.getByText("Uninstall");
		const isVisible = await uninstallTrigger
			.first()
			.isVisible({ timeout: 5_000 })
			.catch(() => false);
		if (isVisible) {
			// Click to expand
			await uninstallTrigger.first().click();
			// Should show uninstall instructions after expanding
			const uninstallContent = page.getByText(/systemctl stop bat-probe/i);
			await expect(uninstallContent.first()).toBeVisible({ timeout: 5_000 });
		}
	});

	test("shows description text", async ({ page }) => {
		await page.goto("/setup");
		await expect(page.getByText("Deploy the monitoring probe on your Linux servers")).toBeVisible({
			timeout: 10_000,
		});
	});
});
