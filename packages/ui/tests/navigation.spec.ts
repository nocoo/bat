import { expect, test } from "@playwright/test";

test("navigation preserves shell nodes and collapsed state", async ({ page }) => {
	await page.goto("/hosts");
	await expect(page.getByText("alpha.test.local")).toBeVisible();
	await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
	const shell = await page.locator("[data-basalt-shell]").elementHandle();
	const header = await page.locator("main > header").elementHandle();
	const sidebar = await page.locator("aside").elementHandle();
	const documents: string[] = [];
	page.on("request", (request) => {
		if (request.resourceType() === "document") documents.push(request.url());
	});
	for (const label of ["Events", "Tags", "Setup", "Hosts"]) {
		await page.locator(`aside a[href="/${label.toLowerCase()}"]`).click();
		await expect(page.getByLabel("Breadcrumb navigation")).toContainText(label);
		await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toBeVisible();
		for (const node of [shell, header, sidebar]) {
			expect(await node?.evaluate((element) => element.isConnected)).toBe(true);
		}
	}
	await page.getByText("alpha.test.local").click();
	await expect(page.getByLabel("Breadcrumb navigation")).toContainText("alpha.test.local");
	await page
		.getByLabel("Breadcrumb navigation")
		.getByRole("link", { name: "Hosts", exact: true })
		.click();
	await expect(page).toHaveURL("/hosts");
	await page.goBack();
	await expect(page.getByLabel("Breadcrumb navigation")).toContainText("alpha.test.local");
	await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toBeVisible();
	for (const node of [shell, header, sidebar]) {
		expect(await node?.evaluate((element) => element.isConnected)).toBe(true);
	}
	expect(documents).toEqual([]);
});

test("mobile navigation closes the drawer and restores focus without replacing the header", async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/hosts");
	const menu = page.getByRole("button", { name: "Open navigation menu" });
	await expect(menu).toBeVisible();
	const header = await page.locator("main > header").elementHandle();
	await menu.click();
	const drawer = page.getByRole("dialog");
	await expect(drawer).toBeVisible();
	await drawer.getByRole("link", { name: "Events", exact: true }).click();
	await expect(page).toHaveURL("/events");
	await expect(drawer).not.toBeVisible();
	expect(await header?.evaluate((element) => element.isConnected)).toBe(true);
	await expect(menu).toBeFocused();
});

test("tablet navigation keeps the sidebar inside the drawer", async ({ page }) => {
	await page.setViewportSize({ width: 700, height: 900 });
	await page.goto("/hosts");
	await page.getByRole("button", { name: "Open navigation menu" }).click();
	const drawer = page.getByRole("dialog");
	await expect(drawer).toBeVisible();
	await expect(drawer).toHaveCSS("padding-left", "0px");
	await expect(drawer).toHaveCSS("padding-right", "0px");
	expect(
		await drawer.evaluate((element) => {
			const panel = element.getBoundingClientRect();
			const sidebar = element.querySelector("aside")?.getBoundingClientRect();
			return sidebar && sidebar.left >= panel.left - 1 && sidebar.right <= panel.right + 1;
		}),
	).toBe(true);
});

test("collapsed sidebar keeps its version badge compact and centered", async ({ page }) => {
	await page.goto("/hosts");
	await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
	const sidebar = page.locator("aside");
	await expect(sidebar).toHaveCSS("width", "68px");
	const badge = sidebar.getByText(/^v\d+\.\d+\.\d+$/);
	await expect(badge).toBeVisible();
	await expect
		.poll(() =>
			badge.evaluate((element) => {
				const badgeBounds = element.getBoundingClientRect();
				const sidebar = element.closest("aside")?.getBoundingClientRect();
				return (
					sidebar &&
					badgeBounds.width < sidebar.width * 0.8 &&
					Math.abs(badgeBounds.left + badgeBounds.width / 2 - sidebar.left - sidebar.width / 2) < 1
				);
			}),
		)
		.toBe(true);
});
