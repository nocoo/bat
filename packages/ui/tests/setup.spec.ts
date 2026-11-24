import { expect, test } from "@playwright/test";

/**
 * Setup page E2E tests.
 *
 * Tests verify the setup/installation guide page functionality.
 */
test.describe("Setup page", () => {
	test("renders installation guide, copy controls, and collapsible uninstall", async ({ page }) => {
		await page.goto("/setup");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByRole("heading", { name: "Install Probe" })).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByText("Prerequisites")).toBeVisible();
		await expect(page.getByText("Linux server (x86_64 or aarch64)")).toBeVisible();
		await expect(page.getByText("Root access (sudo)")).toBeVisible();

		for (const step of [
			"Step 1 — Get your write key",
			"Step 2 — Install the binary and the unit",
			"Step 3 — Configure",
			"Step 4 — Start and verify",
		]) {
			await expect(page.getByText(step)).toBeVisible();
		}

		await expect(
			page.getByText("https://s.zhe.to/apps/bat/latest/manifest.json", { exact: true }),
		).toBeVisible();
		await expect(page.getByText(/bat-probe-linux-\$arch/).first()).toBeVisible();
		await expect(page.locator("pre").first()).toBeVisible();
		await expect(page.getByText("YOUR_WRITE_KEY").first()).toBeVisible();
		await expect(page.getByRole("button", { name: "Copy code" }).first()).toBeVisible();

		const uninstallButton = page.getByRole("button", { name: "Uninstall" });
		const uninstallCmd = page.getByText("systemctl disable --now bat-probe");
		await expect(uninstallButton).toBeVisible();
		await expect(uninstallCmd).toBeHidden();
		await uninstallButton.click();
		await expect(uninstallCmd).toBeVisible();
	});
});
