import { expect, test } from "@playwright/test";

test.describe("Tags page", () => {
	test("page loads with create tag input", async ({ page }) => {
		await page.goto("/tags");
		await page.waitForLoadState("domcontentloaded");

		const input = page.getByPlaceholder("New tag name");
		await expect(input).toBeVisible({ timeout: 15_000 });
	});

	test("create button is disabled when input is empty", async ({ page }) => {
		await page.goto("/tags");
		await page.waitForLoadState("domcontentloaded");

		const createButton = page.getByRole("button", { name: "Create" });
		await expect(createButton).toBeVisible({ timeout: 15_000 });
		await expect(createButton).toBeDisabled();
	});

	test("create button enables when text is entered", async ({ page }) => {
		await page.goto("/tags");
		await page.waitForLoadState("domcontentloaded");

		const input = page.getByPlaceholder("New tag name");
		const createButton = page.getByRole("button", { name: "Create" });

		await expect(createButton).toBeDisabled();
		await input.fill("test-tag");
		await expect(createButton).toBeEnabled();
		await input.fill("");
		await expect(createButton).toBeDisabled();
	});

	test("displays seeded tags", async ({ page }) => {
		await page.goto("/tags");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByText("production")).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText("staging")).toBeVisible();
		await expect(page.getByText("us-east")).toBeVisible();
	});

	test("shows host count badge for tags", async ({ page }) => {
		await page.goto("/tags");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByText("production")).toBeVisible({ timeout: 15_000 });

		// production and us-east are assigned to alpha → 1 host each
		// staging is assigned to beta → 1 host
		const badges = page.getByText(/\d+ hosts?/);
		const count = await badges.count();
		expect(count).toBeGreaterThanOrEqual(3);
	});

	test("create a new tag", async ({ page }) => {
		await page.goto("/tags");
		await page.waitForLoadState("domcontentloaded");

		const input = page.getByPlaceholder("New tag name");
		await expect(input).toBeVisible({ timeout: 15_000 });

		await input.fill("pw-test-new-tag");
		await page.getByRole("button", { name: "Create" }).click();

		// New tag should appear in the list
		await expect(page.getByText("pw-test-new-tag")).toBeVisible({ timeout: 10_000 });
	});

	test("delete a tag", async ({ page }) => {
		await page.goto("/tags");
		await page.waitForLoadState("domcontentloaded");

		// Create a tag to delete
		const input = page.getByPlaceholder("New tag name");
		await expect(input).toBeVisible({ timeout: 15_000 });
		await input.fill("pw-delete-me");
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.getByText("pw-delete-me")).toBeVisible({ timeout: 10_000 });

		// Click delete button for the test tag
		await page.getByRole("button", { name: "Delete tag pw-delete-me" }).click();

		// Tag should disappear
		await expect(page.getByText("pw-delete-me")).not.toBeVisible({ timeout: 10_000 });
	});

	test("inline rename tag", async ({ page }) => {
		await page.goto("/tags");
		await page.waitForLoadState("domcontentloaded");

		// Create a tag to rename
		const input = page.getByPlaceholder("New tag name");
		await expect(input).toBeVisible({ timeout: 15_000 });
		await input.fill("pw-rename-me");
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.getByText("pw-rename-me")).toBeVisible({ timeout: 10_000 });

		// Click the tag chip to enter edit mode
		await page.getByText("pw-rename-me").click();

		// Rename input should appear
		const renameInput = page.locator('input[value="pw-rename-me"]');
		await expect(renameInput).toBeVisible({ timeout: 5_000 });
		await renameInput.fill("pw-renamed");
		await page.getByRole("button", { name: "Save" }).click();

		// Renamed tag should appear
		await expect(page.getByText("pw-renamed")).toBeVisible({ timeout: 10_000 });

		// Clean up
		await page.getByRole("button", { name: "Delete tag pw-renamed" }).click();
		await expect(page.getByText("pw-renamed")).not.toBeVisible({ timeout: 10_000 });
	});
});
