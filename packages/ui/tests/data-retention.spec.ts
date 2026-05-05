import { expect, test } from "@playwright/test";

test.describe("Data Retention page", () => {
	test("page loads with correct breadcrumbs", async ({ page }) => {
		await page.goto("/settings/data");
		await page.waitForLoadState("domcontentloaded");

		const breadcrumb = page.getByLabel("Breadcrumb navigation");
		await expect(breadcrumb.getByText("Settings")).toBeVisible({ timeout: 15_000 });
		await expect(breadcrumb.getByText("Data Retention")).toBeVisible();
	});

	test("shows page heading and description", async ({ page }) => {
		await page.goto("/settings/data");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByRole("heading", { name: "Data Retention", level: 1 })).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByText("Configure how long monitoring data")).toBeVisible();
	});

	test("shows retention option buttons", async ({ page }) => {
		await page.goto("/settings/data");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByRole("button", { name: "1 day" })).toBeVisible({ timeout: 15_000 });
		await expect(page.getByRole("button", { name: "7 days" })).toBeVisible();
		await expect(page.getByRole("button", { name: "30 days" })).toBeVisible();
	});

	test("7 days is selected by default", async ({ page }) => {
		await page.goto("/settings/data");
		await page.waitForLoadState("domcontentloaded");

		const btn7 = page.getByRole("button", { name: "7 days" });
		await expect(btn7).toBeVisible({ timeout: 15_000 });
		// The active button has primary bg class
		await expect(btn7).toHaveClass(/bg-primary/);
	});

	test("sidebar has Data Retention link under Settings", async ({ page }) => {
		await page.goto("/settings/data");
		await page.waitForLoadState("domcontentloaded");

		const nav = page.getByLabel("Main navigation");
		await expect(nav.getByText("Data Retention")).toBeVisible({ timeout: 15_000 });
	});
});
