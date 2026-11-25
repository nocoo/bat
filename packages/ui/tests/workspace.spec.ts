import { expect, test } from "@playwright/test";

test.describe("Workspace secondary pages", () => {
	test("alerts page renders seeded alerts and navigates to host detail", async ({ page }) => {
		await page.goto("/alerts");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByText("Alerts").first()).toBeVisible({ timeout: 15_000 });
		await expect(page.locator("tbody tr")).toHaveCount(2);
		await expect(page.getByText("alpha.test.local").first()).toBeVisible();

		await page.getByRole("link", { name: "alpha.test.local" }).first().click();
		await expect(page).toHaveURL(/\/hosts\/f0d3fd30/);
	});

	test("events page renders seeded events and navigates to host detail", async ({ page }) => {
		await page.goto("/events");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByText("Events").first()).toBeVisible({ timeout: 15_000 });
		await expect(page.locator("tbody tr")).toHaveCount(2);
		await expect(page.getByText("Deploy v1.2.3")).toBeVisible();

		await page.getByRole("link", { name: "alpha.test.local" }).first().click();
		await expect(page).toHaveURL(/\/hosts\/f0d3fd30/);
	});

	test("setup page renders installation guide and collapsible uninstall", async ({ page }) => {
		await page.goto("/setup");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByRole("heading", { name: "Install Probe" })).toBeVisible({
			timeout: 15_000,
		});
		await expect(
			page.getByText("https://s.zhe.to/apps/bat/latest/manifest.json", { exact: true }),
		).toBeVisible();

		const uninstallButton = page.getByRole("button", { name: "Uninstall" });
		const uninstallCmd = page.getByText("systemctl disable --now bat-probe");
		await expect(uninstallCmd).toBeHidden();
		await uninstallButton.click();
		await expect(uninstallCmd).toBeVisible();
	});
});
