import { expect, test } from "@playwright/test";

test.describe("Settings pages", () => {
	test.beforeEach(async ({ request }) => {
		expect((await request.put("/api/settings", { data: { retention_days: 7 } })).ok()).toBe(true);
	});

	test("webhooks page renders seeded controls and generates/deletes a webhook", async ({
		page,
	}) => {
		await page.goto("/settings/webhooks");
		await page.waitForLoadState("domcontentloaded");

		const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb navigation", exact: true });
		await expect(breadcrumb.getByText("Settings")).toBeVisible({ timeout: 15_000 });
		await expect(breadcrumb.getByText("Webhooks")).toBeVisible();
		await expect(page.getByRole("heading", { name: "Webhooks", level: 1 })).toBeVisible();

		const select = page.getByRole("combobox", { name: "Webhook host" });
		const generateButton = page.locator('button[type="submit"]');
		await expect(generateButton).toBeDisabled();
		await expect(page.getByText("alpha.test.local")).toBeVisible();

		await select.click();
		const options = page.getByRole("option");
		await expect(options).toHaveCount(1);
		await options.first().click();

		await expect(generateButton).toBeEnabled();
		await generateButton.click();

		const beta = page.getByTestId("webhook-row").filter({ hasText: "beta.test.local" });
		await expect(beta).toBeVisible({ timeout: 10_000 });
		await beta.getByRole("button", { name: "Delete webhook" }).click();
		await expect(beta).not.toBeVisible();
	});

	test("data retention page persists window changes and rejects invalid values", async ({
		page,
		request,
	}) => {
		await page.goto("/settings/data");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByRole("heading", { name: "Data Retention", level: 1 })).toBeVisible({
			timeout: 15_000,
		});
		const radio30 = page.getByRole("radio", { name: "30 days" });
		await expect(page.getByRole("radio", { name: "7 days" })).toBeChecked();

		await page.getByText("30 days").click();
		await expect(page.getByText("Saved")).toBeVisible({ timeout: 10_000 });
		await expect(radio30).toBeChecked();

		expect((await request.put("/api/settings", { data: { retention_days: -1 } })).status()).toBe(
			400,
		);
	});
});
