import { expect, test } from "@playwright/test";

test.describe("Data Retention page", () => {
	// Restore default 7-day retention after each test
	test.afterEach(async ({ request }) => {
		await request.put("/api/settings", { data: { retention_days: 7 } });
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

		// Other options are not selected
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

		// Wait for initial load
		const radio30 = page.getByRole("radio", { name: "30 days" });
		await expect(radio30).toBeAttached({ timeout: 15_000 });

		// Click 30 days via its label (radio is sr-only)
		await page.getByText("30 days").click();

		// Should show "Saved" feedback
		await expect(page.getByText("Saved")).toBeVisible({ timeout: 10_000 });

		// 30 days should now be checked
		await expect(radio30).toBeChecked();
		// 7 days should no longer be checked
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

	test("PUT failure shows error and preserves original selection", async ({ page }) => {
		await page.goto("/settings/data");
		await page.waitForLoadState("domcontentloaded");

		// Wait for initial render
		const radio7 = page.getByRole("radio", { name: "7 days" });
		await expect(radio7).toBeChecked({ timeout: 15_000 });

		// Mock PUT /api/settings to fail
		await page.route("**/api/settings", async (route) => {
			if (route.request().method() === "PUT") {
				await route.fulfill({ status: 500, body: "Internal Server Error" });
			} else {
				await route.continue();
			}
		});

		// Click 30 days — should fail
		await page.getByText("30 days").click();

		// Should show error message
		await expect(page.getByText("API error: 500")).toBeVisible({ timeout: 10_000 });

		// "Saved" should NOT be visible
		await expect(page.getByText("Saved")).not.toBeVisible();

		// Original selection (7 days) should be preserved via SWR revalidation
		await expect(radio7).toBeChecked();
	});
});
