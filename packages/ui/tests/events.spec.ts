import { expect, test } from "@playwright/test";

test.describe("Events page", () => {
	test("renders seeded events table and navigates to host detail", async ({ page }) => {
		await page.goto("/events");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByText("Events").first()).toBeVisible({ timeout: 15_000 });
		await expect(page.getByRole("link", { name: "Events" })).toBeVisible();

		for (const header of ["Host", "Title", "Tags", "When"]) {
			await expect(page.getByRole("columnheader", { name: header })).toBeVisible();
		}

		await expect(page.locator("tbody tr")).toHaveCount(2);
		await expect(page.getByText("Deploy v1.2.3")).toBeVisible();
		await expect(page.getByText("Config reload")).toBeVisible();
		await expect(page.getByText("alpha.test.local").first()).toBeVisible();
		await expect(page.getByText("deploy, release")).toBeVisible();

		await page.getByRole("link", { name: "alpha.test.local" }).first().click();
		await expect(page).toHaveURL(/\/hosts\/f0d3fd30/);
	});
});
