import { expect, test } from "@playwright/test";

/**
 * Setup page E2E tests.
 *
 * Tests verify the setup/installation guide page functionality.
 */
test.describe("Setup page", () => {
	test("page loads with Install Probe heading", async ({ page }) => {
		await page.goto("/setup");
		await page.waitForLoadState("domcontentloaded");

		// Main heading should be visible
		await expect(page.getByRole("heading", { name: "Install Probe" })).toBeVisible({
			timeout: 15_000,
		});
	});

	test("shows prerequisites section", async ({ page }) => {
		await page.goto("/setup");
		await page.waitForLoadState("domcontentloaded");

		// Prerequisites text should be visible
		await expect(page.getByText("Prerequisites")).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText("Linux server (x86_64 or aarch64)")).toBeVisible();
		await expect(page.getByText("Root access (sudo)")).toBeVisible();
	});

	test("shows step-by-step installation guide", async ({ page }) => {
		await page.goto("/setup");
		await page.waitForLoadState("domcontentloaded");

		// Step headings should be visible
		await expect(page.getByText("Step 1 — Get your write key")).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText("Step 2 — Run the install command")).toBeVisible();
		await expect(page.getByText("Step 3 — Verify the installation")).toBeVisible();
	});

	test("shows install command with placeholder", async ({ page }) => {
		await page.goto("/setup");
		await page.waitForLoadState("domcontentloaded");

		// Install command should contain the placeholder in a code block
		// The placeholder appears in a pre > code block
		await expect(page.locator("pre").first()).toBeVisible({ timeout: 15_000 });

		// Check that YOUR_WRITE_KEY appears somewhere in the page (multiple instances ok)
		await expect(page.getByText("YOUR_WRITE_KEY").first()).toBeVisible();
	});

	test("has copy button for code blocks", async ({ page }) => {
		await page.goto("/setup");
		await page.waitForLoadState("domcontentloaded");

		// Should have copy buttons (aria-label="Copy to clipboard")
		const copyButtons = page.getByRole("button", { name: "Copy to clipboard" });
		await expect(copyButtons.first()).toBeVisible({ timeout: 15_000 });
	});

	test("uninstall section is collapsible", async ({ page }) => {
		await page.goto("/setup");
		await page.waitForLoadState("domcontentloaded");

		// Uninstall button should be visible
		const uninstallButton = page.getByRole("button", { name: "Uninstall" });
		await expect(uninstallButton).toBeVisible({ timeout: 15_000 });

		// Initially, uninstall command should NOT be visible
		const uninstallCmd = page.getByText("--uninstall");
		await expect(uninstallCmd).not.toBeVisible();

		// Click to expand
		await uninstallButton.click();

		// Now uninstall command should be visible
		await expect(uninstallCmd).toBeVisible();
	});
});
