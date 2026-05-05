import { expect, test } from "@playwright/test";

// Helper: mock GET /api/settings to return a fixed value, and optionally
// mock PUT to succeed (updating the mocked value) or fail. Each test gets
// its own in-memory state so parallel workers never interfere.
function mockSettingsAPI(
	page: import("@playwright/test").Page,
	opts: { initial: number; putResult?: "success" | "fail" },
) {
	let current = opts.initial;
	return page.route("**/api/settings", async (route) => {
		if (route.request().method() === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ retention_days: current }),
			});
		} else if (route.request().method() === "PUT") {
			if (opts.putResult === "fail") {
				await route.fulfill({ status: 500, body: "Internal Server Error" });
			} else {
				const body = route.request().postDataJSON();
				current = body.retention_days;
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ retention_days: current }),
				});
			}
		} else {
			await route.continue();
		}
	});
}

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

	test("shows retention radios with proper labels", async ({ page }) => {
		await mockSettingsAPI(page, { initial: 7 });
		await page.goto("/settings/data");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByRole("radio", { name: "1 day" })).toBeAttached({ timeout: 15_000 });
		await expect(page.getByRole("radio", { name: "7 days" })).toBeAttached();
		await expect(page.getByRole("radio", { name: "30 days" })).toBeAttached();
	});

	test("7 days is selected by default", async ({ page }) => {
		await mockSettingsAPI(page, { initial: 7 });
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
		await mockSettingsAPI(page, { initial: 7, putResult: "success" });
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
		await mockSettingsAPI(page, { initial: 7, putResult: "success" });
		await page.goto("/settings/data");
		await page.waitForLoadState("domcontentloaded");

		const radio1 = page.getByRole("radio", { name: "1 day" });
		await expect(radio1).toBeAttached({ timeout: 15_000 });

		await page.getByText("1 day").click();
		await expect(page.getByText("Saved")).toBeVisible({ timeout: 10_000 });
		await expect(radio1).toBeChecked();
	});

	test("PUT failure shows error and preserves original selection", async ({ page }) => {
		await mockSettingsAPI(page, { initial: 7, putResult: "fail" });
		await page.goto("/settings/data");
		await page.waitForLoadState("domcontentloaded");

		const radio7 = page.getByRole("radio", { name: "7 days" });
		await expect(radio7).toBeChecked({ timeout: 15_000 });

		await page.getByText("30 days").click();

		await expect(page.getByText("API error: 500")).toBeVisible({ timeout: 10_000 });
		await expect(page.getByText("Saved")).not.toBeVisible();
		await expect(radio7).toBeChecked();
	});
});
