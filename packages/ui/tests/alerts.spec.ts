import { expect, test } from "@playwright/test";

test.describe("Alerts page", () => {
	test("renders seeded alerts table and navigates to host detail", async ({ page }) => {
		await page.goto("/alerts");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByText("Alerts").first()).toBeVisible({ timeout: 15_000 });
		await expect(page.getByRole("link", { name: "Alerts" })).toBeVisible();

		for (const header of ["Host", "Rule", "Severity", "Message", "Since"]) {
			await expect(page.getByRole("columnheader", { name: header })).toBeVisible();
		}

		await expect(page.locator("tbody tr")).toHaveCount(2);
		await expect(page.getByText("alpha.test.local").first()).toBeVisible();
		await expect(page.getByText("warning").first()).toBeVisible();
		await expect(page.getByText("critical").first()).toBeVisible();
		await expect(page.getByText("Memory usage 85.2%").first()).toBeVisible();
		await expect(page.getByText("Disk / usage 92.1%").first()).toBeVisible();

		await page.getByRole("link", { name: "alpha.test.local" }).first().click();
		await expect(page).toHaveURL(/\/hosts\/f0d3fd30/);
	});
});
