import { expect, test } from "@playwright/test";

test.describe("Data Retention page", () => {
	test.beforeEach(async ({ request }) => {
		expect((await request.put("/api/settings", { data: { retention_days: 7 } })).ok()).toBe(true);
	});
	test("displays retention controls and persists window changes", async ({ page }) => {
		await page.goto("/settings/data");
		await page.waitForLoadState("domcontentloaded");

		const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb navigation", exact: true });
		await expect(breadcrumb.getByText("Settings")).toBeVisible({ timeout: 15_000 });
		await expect(breadcrumb.getByText("Data Retention")).toBeVisible();
		await expect(page.getByRole("heading", { name: "Data Retention", level: 1 })).toBeVisible();
		await expect(
			page.getByText("Data outside this window is permanently deleted hourly."),
		).toBeVisible();
		await expect(
			page.getByText("Data older than this period will be permanently deleted."),
		).toHaveCount(0);
		await expect(page.getByLabel("Main navigation").getByText("Data Retention")).toBeVisible();

		const radio1 = page.getByRole("radio", { name: "1 day" });
		const radio7 = page.getByRole("radio", { name: "7 days" });
		const radio30 = page.getByRole("radio", { name: "30 days" });
		await expect(radio1).toBeAttached();
		await expect(radio7).toBeChecked();
		await expect(radio30).toBeAttached();
		await expect(radio1).not.toBeChecked();
		await expect(radio30).not.toBeChecked();

		await page.getByText("30 days").click();
		await expect(page.getByText("Saved")).toBeVisible({ timeout: 10_000 });
		await expect(radio30).toBeChecked();
		await expect(radio7).not.toBeChecked();

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
