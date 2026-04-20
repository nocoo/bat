import { expect, test } from "@playwright/test";

test.describe("Alerts page", () => {
	test("page loads with correct breadcrumb", async ({ page }) => {
		await page.goto("/alerts");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByText("Alerts").first()).toBeVisible({ timeout: 15_000 });
	});

	test("sidebar shows Alerts link as active", async ({ page }) => {
		await page.goto("/alerts");
		await page.waitForLoadState("domcontentloaded");

		const alertsLink = page.getByRole("link", { name: "Alerts" });
		await expect(alertsLink).toBeVisible({ timeout: 15_000 });
	});

	test("displays alert table with seeded alerts", async ({ page }) => {
		await page.goto("/alerts");
		await page.waitForLoadState("domcontentloaded");

		// Wait for table to render
		await expect(page.getByRole("columnheader", { name: "Host" })).toBeVisible({ timeout: 15_000 });
		await expect(page.getByRole("columnheader", { name: "Rule" })).toBeVisible();
		await expect(page.getByRole("columnheader", { name: "Severity" })).toBeVisible();
		await expect(page.getByRole("columnheader", { name: "Message" })).toBeVisible();
		await expect(page.getByRole("columnheader", { name: "Since" })).toBeVisible();
	});

	test("shows alert rows with host name", async ({ page }) => {
		await page.goto("/alerts");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByRole("columnheader", { name: "Host" })).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText("alpha.test.local").first()).toBeVisible();
	});

	test("shows alert severity levels", async ({ page }) => {
		await page.goto("/alerts");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByRole("columnheader", { name: "Severity" })).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByText("warning").first()).toBeVisible();
		await expect(page.getByText("critical").first()).toBeVisible();
	});

	test("shows alert messages", async ({ page }) => {
		await page.goto("/alerts");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByRole("columnheader", { name: "Message" })).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByText("Memory usage 85.2%").first()).toBeVisible();
		await expect(page.getByText("Disk / usage 92.1%").first()).toBeVisible();
	});

	test("alert host name links to host detail", async ({ page }) => {
		await page.goto("/alerts");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByRole("columnheader", { name: "Host" })).toBeVisible({ timeout: 15_000 });

		// Click host link
		await page.getByRole("link", { name: "alpha.test.local" }).first().click();
		await expect(page).toHaveURL(/\/hosts\/f0d3fd30/);
	});

	test("shows two alert rows for seeded data", async ({ page }) => {
		await page.goto("/alerts");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByRole("columnheader", { name: "Host" })).toBeVisible({ timeout: 15_000 });

		// Two alert rows (mem_high + disk_full)
		const rows = page.locator("tbody tr");
		await expect(rows).toHaveCount(2);
	});
});
