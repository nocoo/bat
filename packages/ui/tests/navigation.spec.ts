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
	const sidebar = page.getByRole("complementary", { name: "Main navigation", exact: true });
	await sidebar.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
	await expect(sidebar).toHaveAttribute("data-collapsed", "");
	await expect(sidebar).toHaveCSS("width", "68px");

	const logo = sidebar.locator('[data-slot="sidebar-brand-logo"] img[alt="bat"]');
	await expect(logo).toBeVisible();
	await expect
		.poll(async () => {
			const rail = await sidebar.evaluate((element) => {
				const bounds = element.getBoundingClientRect();
				return { left: bounds.left, width: bounds.width, center: bounds.left + bounds.width / 2 };
			});
			const logoCenter = await logo.evaluate((element) => {
				const bounds = element.getBoundingClientRect();
				return bounds.left + bounds.width / 2;
			});
			return Math.abs(logoCenter - rail.center) < 1;
		})
		.toBe(true);

	// SidebarBrand keeps name/version in the header; collapsed overflow clips them off the rail.
	await expect(sidebar.locator('[data-slot="sidebar-brand-name"]')).toBeHidden();
	const version = sidebar.locator('[data-slot="sidebar-brand-version"]');
	await expect(version).toBeAttached();
	await expect(version).not.toBeInViewport();
});
