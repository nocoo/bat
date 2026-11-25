import { expect, test } from "@playwright/test";

test.describe("Hosts list page", () => {
	test("root redirects to /hosts, displays sidebar, seeded hosts, and navigation links", async ({
		page,
	}) => {
		await page.goto("/");
		await page.waitForLoadState("domcontentloaded");
		await expect(page).toHaveURL("/hosts");

		await expect(page.getByRole("link", { name: "Hosts" }).first()).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByText(/^v\d+\.\d+\.\d+$/)).toBeVisible();

		const cards = page.locator('[data-testid="host-row"]');
		await expect(cards).toHaveCount(2);
		await expect(page.getByText("alpha.test.local")).toBeVisible();
		await expect(page.getByText("beta.test.local")).toBeVisible();
		await expect(page.locator('[data-testid="status-badge"]')).toHaveCount(2);
		await expect(page.locator('[data-testid="host-row"] a').first()).toHaveAttribute(
			"href",
			/\/hosts\/[a-f0-9]+/,
		);

		for (const [label, url] of [
			["Tags", "/tags"],
			["Setup", "/setup"],
			["Alerts", "/alerts"],
			["Events", "/events"],
		]) {
			await page.getByRole("link", { name: label }).click();
			await expect(page).toHaveURL(url);
		}
	});

	test("standard sort select supports pointer and keyboard selection", async ({ page }) => {
		await page.goto("/hosts");
		const sort = page.getByRole("combobox", { name: "Sort hosts" });
		const cards = page.getByTestId("host-row");
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
		await expect(cards.first()).toContainText("alpha.test.local");
	});

	test("tag filter bar shows all tags and narrows host list", async ({ page }) => {
		await page.goto("/hosts");
		await page.waitForLoadState("domcontentloaded");
		const filterBar = page.locator('[data-testid="tag-filter-bar"]');
		await expect(filterBar).toBeVisible({ timeout: 15_000 });
		await expect(filterBar.getByText("production")).toBeVisible();
		await expect(filterBar.getByText("staging")).toBeVisible();
		await expect(filterBar.getByText("us-east")).toBeVisible();

		await filterBar.getByText("staging").click();
		await expect(page.locator('[data-testid="host-row"]')).toHaveCount(1);
		await expect(page.getByText("beta.test.local")).toBeVisible();

		await filterBar.getByRole("button", { name: "Clear", exact: true }).click();
		await expect(page.locator('[data-testid="host-row"]')).toHaveCount(2);
	});

	test("metric cells show the reading and keep the sizes behind the hover", async ({ page }) => {
		await page.setViewportSize({ width: 1536, height: 900 });
		await page.goto("/hosts");
		const table = page.getByRole("table", { name: "Servers" });
		await expect(table).toBeVisible({ timeout: 15_000 });

		const alpha = page.getByTestId("host-row").filter({ hasText: "alpha.test.local" });
		for (const id of ["host-cpu", "host-memory", "host-disk"]) {
			await expect(alpha.getByTestId(id)).toContainText("%");
			await expect(alpha.getByTestId(id)).not.toContainText(/GB|cores/);
		}
		await expect(alpha.getByTestId("host-cpu").locator("svg")).toBeVisible();
		await expect(alpha.getByTestId("host-memory").locator("svg")).toBeVisible();
		await expect(alpha.getByTestId("host-disk-bar")).toBeVisible();

		const cpuChart = alpha.getByTestId("host-cpu").locator(".basalt-chart");
		const cpuBox = await cpuChart.boundingBox();
		if (!cpuBox) throw new Error("CPU trend has no box");
		await page.mouse.move(cpuBox.x + cpuBox.width * 0.6, cpuBox.y + cpuBox.height / 2);
		const chartTooltip = page.getByTestId("chart-tooltip").first();
		await expect(chartTooltip).toBeVisible();
		await expect(chartTooltip).toContainText("8 cores");
	});
});
