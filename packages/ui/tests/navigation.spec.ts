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
		await expect(
			page.getByRole("navigation", { name: "Breadcrumb navigation", exact: true }),
		).toContainText(label);
		await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toBeVisible();
		for (const node of [shell, header, sidebar]) {
			expect(await node?.evaluate((element) => element.isConnected)).toBe(true);
		}
	}
	await page.getByText("alpha.test.local").click();
	await expect(
		page.getByRole("navigation", { name: "Breadcrumb navigation", exact: true }),
	).toContainText("alpha.test.local");
	await page
		.getByRole("navigation", { name: "Breadcrumb navigation", exact: true })
		.getByRole("link", { name: "Hosts", exact: true })
		.click();
	await expect(page).toHaveURL("/hosts");
	await page.goBack();
	await expect(
		page.getByRole("navigation", { name: "Breadcrumb navigation", exact: true }),
	).toContainText("alpha.test.local");
	await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toBeVisible();
	for (const node of [shell, header, sidebar]) {
		expect(await node?.evaluate((element) => element.isConnected)).toBe(true);
	}
	expect(documents).toEqual([]);
});

test("collapsed sidebar keeps its version badge compact and centered", async ({ page }) => {
	await page.goto("/hosts");
	const sidebar = page.getByRole("complementary", { name: "Main navigation", exact: true });
	await sidebar.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
	await expect(sidebar).toHaveAttribute("data-collapsed", "");
	await expect(sidebar).toHaveCSS("width", "68px");

	const logo = sidebar.locator('[data-slot="sidebar-brand-logo"] img[alt="bat"]');
	await expect(logo).toBeVisible();
	await expect(sidebar.locator('[data-slot="sidebar-brand-name"]')).toBeHidden();
});
