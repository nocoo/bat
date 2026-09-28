import { expect, test } from "@playwright/test";

test.describe("Data Retention page", () => {
	test.beforeEach(async ({ request }) => {
		expect((await request.put("/api/settings", { data: { retention_days: 7 } })).ok()).toBe(true);
	});
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

	test("shows retention radios with proper labels", async ({ page }) => {
		await page.goto("/settings/data");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByRole("radio", { name: "1 day" })).toBeAttached({ timeout: 15_000 });
		await expect(page.getByRole("radio", { name: "7 days" })).toBeAttached();
		await expect(page.getByRole("radio", { name: "30 days" })).toBeAttached();
	});

	test("7 days is selected by default", async ({ page }) => {
		await page.goto("/settings/data");
		await page.waitForLoadState("domcontentloaded");

		const radio7 = page.getByRole("radio", { name: "7 days" });
		await expect(radio7).toBeChecked({ timeout: 15_000 });

		await expect(page.getByRole("radio", { name: "1 day" })).not.toBeChecked();
		await expect(page.getByRole("radio", { name: "30 days" })).not.toBeChecked();
	});

	test("sidebar has Data Retention link under Settings", async ({ page }) => {
		await page.goto("/settings/data");
		await page.waitForLoadState("domcontentloaded");

		const nav = page.getByLabel("Main navigation");
		await expect(nav.getByText("Data Retention")).toBeVisible({ timeout: 15_000 });
	});

	test("clicking 30 days saves and shows Saved feedback", async ({ page }) => {
		await page.goto("/settings/data");
		await page.waitForLoadState("domcontentloaded");

		const radio30 = page.getByRole("radio", { name: "30 days" });
		await expect(radio30).toBeAttached({ timeout: 15_000 });

		await page.getByText("30 days").click();

		await expect(page.getByText("Saved")).toBeVisible({ timeout: 10_000 });
		await expect(radio30).toBeChecked();
		await expect(page.getByRole("radio", { name: "7 days" })).not.toBeChecked();
	});

	test("clicking 1 day saves and updates selection", async ({ page }) => {
		await page.goto("/settings/data");
		await page.waitForLoadState("domcontentloaded");

		const radio1 = page.getByRole("radio", { name: "1 day" });
		await expect(radio1).toBeAttached({ timeout: 15_000 });

		await page.getByText("1 day").click();
		await expect(page.getByText("Saved")).toBeVisible({ timeout: 10_000 });
		await expect(radio1).toBeChecked();
	});

	test("invalid retention is rejected without changing stored settings", async ({ request }) => {
		expect((await request.put("/api/settings", { data: { retention_days: -1 } })).status()).toBe(
			400,
		);
		expect(await (await request.get("/api/settings")).json()).toMatchObject({ retention_days: 7 });
	});
});
