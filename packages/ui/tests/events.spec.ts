import { expect, test } from "@playwright/test";

test.describe("Events page", () => {
	test("page loads with correct breadcrumb", async ({ page }) => {
		await page.goto("/events");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByText("Events").first()).toBeVisible({ timeout: 15_000 });
	});

	test("sidebar navigation includes Events link", async ({ page }) => {
		await page.goto("/events");
		await page.waitForLoadState("domcontentloaded");

		const eventsLink = page.getByRole("link", { name: "Events" });
		await expect(eventsLink).toBeVisible({ timeout: 15_000 });
	});

	test("displays event table with seeded events", async ({ page }) => {
		await page.goto("/events");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByRole("columnheader", { name: "Host" })).toBeVisible({ timeout: 15_000 });
		await expect(page.getByRole("columnheader", { name: "Title" })).toBeVisible();
		await expect(page.getByRole("columnheader", { name: "Tags" })).toBeVisible();
		await expect(page.getByRole("columnheader", { name: "Time" })).toBeVisible();
	});

	test("shows event rows with titles", async ({ page }) => {
		await page.goto("/events");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByRole("columnheader", { name: "Title" })).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByText("Deploy v2.1.0")).toBeVisible();
		await expect(page.getByText("Config reload")).toBeVisible();
	});

	test("shows event host name", async ({ page }) => {
		await page.goto("/events");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByRole("columnheader", { name: "Host" })).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText("alpha.test.local").first()).toBeVisible();
	});

	test("shows event tags", async ({ page }) => {
		await page.goto("/events");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByRole("columnheader", { name: "Tags" })).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText("deploy, release")).toBeVisible();
	});

	test("event host link navigates to host detail", async ({ page }) => {
		await page.goto("/events");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByRole("columnheader", { name: "Host" })).toBeVisible({ timeout: 15_000 });

		await page.getByRole("link", { name: "alpha.test.local" }).first().click();
		await expect(page).toHaveURL(/\/hosts\/f0d3fd30/);
	});

	test("shows two event rows for seeded data", async ({ page }) => {
		await page.goto("/events");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByRole("columnheader", { name: "Title" })).toBeVisible({
			timeout: 15_000,
		});

		const rows = page.locator("tbody tr");
		await expect(rows).toHaveCount(2);
	});
});
