import { expect, test } from "@playwright/test";

test.describe("Tags page", () => {
	test("standard color select preserves the stored palette index", async ({ page }) => {
		const response = await page.request.post("/api/tags", { data: { name: "pw-color-check" } });
		expect(response.ok()).toBe(true);
		const tag = await response.json();
		try {
			await page.goto("/tags");
			const color = page.getByRole("combobox", { name: "Color for pw-color-check" });
			await color.click();
			await expect(page.getByRole("option")).toHaveCount(10);
			await page.getByRole("option", { name: "Orange", exact: true }).click();
			await expect(color).toHaveText("Orange");
			await page.reload();
			await expect(color).toHaveText("Orange");
			const tags = await (await page.request.get("/api/tags")).json();
			expect(tags.find((item: { id: number }) => item.id === tag.id).color).toBe(7);
		} finally {
			expect((await page.request.delete(`/api/tags/${tag.id}`)).ok()).toBe(true);
		}
	});

	test("displays seeded tags and supports create, rename, and delete", async ({ page }) => {
		await page.goto("/tags");
		await page.waitForLoadState("domcontentloaded");

		const input = page.getByPlaceholder("New tag name");
		const createButton = page.getByRole("button", { name: "Create" });
		await expect(input).toBeVisible({ timeout: 15_000 });
		await expect(createButton).toBeDisabled();

		await expect(page.getByText("production")).toBeVisible();
		await expect(page.getByText("staging")).toBeVisible();
		await expect(page.getByText("us-east")).toBeVisible();
		expect(await page.getByText(/\d+ hosts?/).count()).toBeGreaterThanOrEqual(3);

		await input.fill("pw-lifecycle-tag");
		await expect(createButton).toBeEnabled();
		await input.fill("");
		await expect(createButton).toBeDisabled();

		await input.fill("pw-rename-me");
		await createButton.click();
		await expect(page.getByText("pw-rename-me")).toBeVisible({ timeout: 10_000 });

		await page.getByText("pw-rename-me").click();
		const renameInput = page.locator('input[value="pw-rename-me"]');
		await expect(renameInput).toBeVisible({ timeout: 5_000 });
		await renameInput.fill("pw-renamed");
		await page.getByRole("button", { name: "Save" }).click();
		await expect(page.getByText("pw-renamed")).toBeVisible({ timeout: 10_000 });

		await page.getByRole("button", { name: "Delete tag pw-renamed" }).click();
		await expect(page.getByText("pw-renamed")).not.toBeVisible({ timeout: 10_000 });
	});
});
