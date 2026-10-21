import { expect, test } from "@playwright/test";

test.describe("Hosts list page", () => {
	test("standard sort select supports pointer and keyboard selection", async ({ page }) => {
		await page.goto("/hosts");
		const sort = page.getByRole("combobox", { name: "Sort hosts" });
		const cards = page.getByTestId("host-card");
		await expect(cards).toHaveCount(2);
		await expect(cards.first()).toContainText("alpha.test.local");
		await sort.click();
		await expect(page.getByRole("option")).toHaveCount(5);
		await page.getByRole("option", { name: "Name Z→A" }).click();
		await expect(cards.first()).toContainText("beta.test.local");
		await sort.focus();
		await page.keyboard.press("Enter");
		await expect(page.getByRole("option", { name: "Name Z→A" })).toBeFocused();
		await page.keyboard.press("Home");
		await expect(page.getByRole("option", { name: "Name A→Z" })).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(sort).toHaveText("Name A→Z");
		await expect(sort).toBeFocused();
		await expect(cards.first()).toContainText("alpha.test.local");
	});

	test("page loads and displays sidebar navigation", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByRole("link", { name: "Hosts" }).first()).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByRole("link", { name: "Tags" })).toBeVisible();
		await expect(page.getByRole("link", { name: "Alerts" })).toBeVisible();
	});

	test("root path redirects to /hosts", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("domcontentloaded");
		await expect(page).toHaveURL("/hosts");
	});

	test("navigating to Tags page works", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("domcontentloaded");
		await page.getByRole("link", { name: "Tags" }).click();
		await expect(page).toHaveURL("/tags");
	});

	test("navigating to Setup page works", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("domcontentloaded");
		await page.getByRole("link", { name: "Setup" }).click();
		await expect(page).toHaveURL("/setup");
	});

	test("navigating to Alerts page works", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("domcontentloaded");
		await page.getByRole("link", { name: "Alerts" }).click();
		await expect(page).toHaveURL("/alerts");
	});

	test("navigating to Events page works", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("domcontentloaded");
		await page.getByRole("link", { name: "Events" }).click();
		await expect(page).toHaveURL("/events");
	});

	test("displays host cards with seeded data", async ({ page }) => {
		await page.goto("/hosts");
		await page.waitForLoadState("domcontentloaded");

		const cards = page.locator('[data-testid="host-card"]');
		await expect(cards.first()).toBeVisible({ timeout: 15_000 });
		await expect(cards).toHaveCount(2);
	});

	test("cards stretch to the tallest card in each row but remain content-sized on mobile", async ({
		page,
	}) => {
		const path = "/api/hosts/pw-host-beta/tags";
		const response = await page.request.get(path);
		expect(response.ok()).toBe(true);
		const tags: { id: number }[] = await response.json();
		try {
			expect((await page.request.put(path, { data: { tag_ids: [] } })).ok()).toBe(true);
			await page.goto("/hosts");
			const cards = page.getByTestId("host-card");
			await expect(cards).toHaveCount(2);
			await expect(cards.first().getByText("production", { exact: true })).toBeVisible();
			for (const width of [1280, 900]) {
				await page.setViewportSize({ width, height: 900 });
				await expect
					.poll(() =>
						cards.evaluateAll((elements) => {
							const [first, second] = elements.map((element) => ({
								card: element.getBoundingClientRect(),
								footer: element.lastElementChild?.getBoundingClientRect(),
								link: element.closest("a")?.getBoundingClientRect(),
							}));
							return (
								first &&
								second &&
								Math.abs(first.card.top - second.card.top) < 1 &&
								Math.abs(first.card.height - second.card.height) < 1 &&
								Math.abs((first.footer?.bottom ?? 0) - (second.footer?.bottom ?? 0)) < 1 &&
								Math.abs((second.link?.height ?? 0) - second.card.height) < 1
							);
						}),
					)
					.toBe(true);
			}
			await page.setViewportSize({ width: 390, height: 844 });
			const first = await cards.first().boundingBox();
			const second = await cards.nth(1).boundingBox();
			expect(first && second && second.y >= first.y + first.height).toBe(true);
			expect(first && second && first.height > second.height).toBe(true);
		} finally {
			expect(
				(await page.request.put(path, { data: { tag_ids: tags.map((tag) => tag.id) } })).ok(),
			).toBe(true);
		}
	});

	test("host card shows hostname", async ({ page }) => {
		await page.goto("/hosts");
		await page.waitForLoadState("domcontentloaded");
		await expect(page.locator('[data-testid="host-card"]').first()).toBeVisible({
			timeout: 15_000,
		});

		await expect(page.getByText("alpha.test.local")).toBeVisible();
		await expect(page.getByText("beta.test.local")).toBeVisible();
	});

	test("host card shows status badge", async ({ page }) => {
		await page.goto("/hosts");
		await page.waitForLoadState("domcontentloaded");
		await expect(page.locator('[data-testid="host-card"]').first()).toBeVisible({
			timeout: 15_000,
		});

		const badges = page.locator('[data-testid="status-badge"]');
		await expect(badges).toHaveCount(2);
	});

	test("tag filter bar is visible when tags exist", async ({ page }) => {
		await page.goto("/hosts");
		await page.waitForLoadState("domcontentloaded");
		await expect(page.locator('[data-testid="host-card"]').first()).toBeVisible({
			timeout: 15_000,
		});

		await expect(page.locator('[data-testid="tag-filter-bar"]')).toBeVisible();
	});

	test("tag filter bar shows all tags", async ({ page }) => {
		await page.goto("/hosts");
		await page.waitForLoadState("domcontentloaded");
		await expect(page.locator('[data-testid="tag-filter-bar"]')).toBeVisible({ timeout: 15_000 });

		const filterBar = page.locator('[data-testid="tag-filter-bar"]');
		await expect(filterBar.getByText("production")).toBeVisible();
		await expect(filterBar.getByText("staging")).toBeVisible();
		await expect(filterBar.getByText("us-east")).toBeVisible();
	});

	test("clicking tag filter narrows host list", async ({ page }) => {
		await page.goto("/hosts");
		await page.waitForLoadState("domcontentloaded");
		await expect(page.locator('[data-testid="host-card"]').first()).toBeVisible({
			timeout: 15_000,
		});

		// Click "staging" tag — only beta has it
		await page.locator('[data-testid="tag-filter-bar"]').getByText("staging").click();

		// Should filter to 1 card
		await expect(page.locator('[data-testid="host-card"]')).toHaveCount(1);
		await expect(page.getByText("beta.test.local")).toBeVisible();
	});

	test("clicking host card navigates to detail page", async ({ page }) => {
		await page.goto("/hosts");
		await page.waitForLoadState("domcontentloaded");
		await expect(page.locator('[data-testid="host-card"]').first()).toBeVisible({
			timeout: 15_000,
		});

		// Click alpha card
		await page.getByText("alpha.test.local").click();

		await expect(page).toHaveURL(/\/hosts\/f0d3fd30/);
	});

	test("sidebar version badge is visible", async ({ page }) => {
		await page.goto("/hosts");
		await page.waitForLoadState("domcontentloaded");
		await expect(page.getByText(/^v\d+\.\d+\.\d+$/)).toBeVisible({ timeout: 15_000 });
	});
});
