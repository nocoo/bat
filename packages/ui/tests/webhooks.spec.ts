import { expect, test } from "@playwright/test";

test.describe("Webhooks page", () => {
	test("renders breadcrumbs, seeded webhook controls, and generates/deletes a webhook", async ({
		page,
	}) => {
		await page.goto("/settings/webhooks");
		await page.waitForLoadState("domcontentloaded");

		const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb navigation", exact: true });
		await expect(breadcrumb.getByText("Settings")).toBeVisible({ timeout: 15_000 });
		await expect(breadcrumb.getByText("Webhooks")).toBeVisible();
		await expect(page.getByRole("heading", { name: "Webhooks", level: 1 })).toBeVisible();
		await expect(page.getByText("Configure webhook tokens for hosts")).toBeVisible();

		const select = page.getByRole("combobox", { name: "Webhook host" });
		await expect(select).toHaveText("Select a host...");
		const generateButton = page.locator('button[type="submit"]');
		await expect(generateButton).toBeDisabled();

		await expect(page.getByText("alpha.test.local")).toBeVisible();
		await expect(page.locator("pre").first()).toContainText("curl");
		await expect(page.getByRole("button", { name: "Copy code" }).first()).toBeVisible();
		await expect(page.getByRole("button", { name: "Regenerate token" }).first()).toBeVisible();
		await expect(page.getByRole("button", { name: "Delete webhook" }).first()).toBeVisible();

		await select.click();
		const options = page.getByRole("option");
		await expect(options).toHaveCount(1);
		await expect(options.first()).toContainText("beta.test.local");
		await options.first().click();

		await expect(generateButton).toBeEnabled();
		await generateButton.click();

		const beta = page.getByTestId("webhook-row").filter({ hasText: "beta.test.local" });
		await expect(beta).toBeVisible({ timeout: 10_000 });
		await expect(select).toHaveText("Select a host...");

		await beta.getByRole("button", { name: "Delete webhook" }).click();
		await expect(beta).not.toBeVisible();
	});
});
