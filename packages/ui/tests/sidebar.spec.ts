import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
	test(`sidebar uses Basalt geometry and independent selection/hover in ${theme}`, async ({
		page,
	}) => {
		await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
		await page.goto("/hosts");
		const sidebar = page.getByRole("complementary", { name: "Main navigation", exact: true });
		const nav = sidebar.locator('[data-slot="sidebar-nav"]');
		const hosts = sidebar.getByRole("link", { name: "Hosts", exact: true });
		await expect(hosts).toHaveAttribute("aria-current", "page");
		await expect(nav).toHaveCSS("padding-left", "8px");
		await expect(nav).toHaveCSS("padding-right", "8px");
		const footer = sidebar.locator('[data-slot="sidebar-footer"]');
		await expect(footer).toHaveCSS("padding-left", "16px");
		await expect(footer).toHaveCSS("padding-bottom", "16px");
		await expect(footer).toHaveCSS("border-top-width", "0px");
		const separator = nav.locator('[data-orientation="horizontal"]');
		await expect(separator).toHaveCount(1);
		const railBounds = await sidebar.boundingBox();
		const row = nav.locator('[data-basalt-hover-item][data-hover-selected="true"]');
		const rowBounds = await row.boundingBox();
		const separatorBounds = await separator.boundingBox();
		expect(rowBounds?.x).toBe((railBounds?.x ?? 0) + 8);
		expect(separatorBounds?.x).toBe((railBounds?.x ?? 0) + 16);

		const selectedColor = await row.evaluate((element) => {
			const probe = document.createElement("span");
			probe.style.backgroundColor = "hsl(var(--basalt-selected))";
			element.append(probe);
			const expected = getComputedStyle(probe).backgroundColor;
			probe.remove();
			return expected;
		});
		await expect(row).toHaveCSS("background-color", selectedColor);
		await sidebar.getByRole("link", { name: "Events", exact: true }).hover();
		await expect(nav).toHaveAttribute("data-hover-visible", "true");
		const firstY = await nav.evaluate((element) =>
			element.style.getPropertyValue("--basalt-hover-y"),
		);
		await sidebar.getByRole("link", { name: "Tags", exact: true }).hover();
		await expect
			.poll(() => nav.evaluate((element) => element.style.getPropertyValue("--basalt-hover-y")))
			.not.toBe(firstY);
		const hoverColor = await nav.evaluate(
			(element) => getComputedStyle(element, "::before").backgroundColor,
		);
		expect(hoverColor).not.toBe(selectedColor);
		await sidebar.getByRole("button", { name: "Monitoring", exact: true }).hover();
		await expect(nav).toHaveAttribute("data-hover-visible", "false");
		await expect(row).toHaveCSS("background-color", selectedColor);

		const logo = sidebar.getByAltText("bat", { exact: true });
		const expandedLogo = await logo.boundingBox();
		await sidebar.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
		await expect(sidebar).toHaveCSS("width", "68px");
		expect((await logo.boundingBox())?.x).toBe(expandedLogo?.x);
		await expect(sidebar.getByRole("link", { name: "Hosts", exact: true })).toHaveAttribute(
			"aria-current",
			"page",
		);
		await sidebar.getByRole("link", { name: "Events", exact: true }).hover();
		await expect(nav).toHaveAttribute("data-hover-visible", "true");
	});
}

test("sidebar groups hide collapsed links from keyboard navigation and retain native links", async ({
	page,
}) => {
	await page.goto("/hosts");
	const sidebar = page.getByRole("complementary", { name: "Main navigation", exact: true });
	const monitoring = sidebar.getByRole("button", { name: "Monitoring", exact: true });
	await monitoring.click();
	await expect(monitoring).toHaveAttribute("aria-expanded", "false");
	await expect(sidebar.getByRole("link", { name: "Hosts", exact: true })).toHaveCount(0);
	await monitoring.press("Tab");
	await expect(sidebar.getByRole("button", { name: "Settings", exact: true })).toBeFocused();
	await monitoring.focus();
	await monitoring.press("Enter");
	await expect(sidebar.getByRole("link", { name: "Events", exact: true })).toBeVisible();
	const popupPromise = page.context().waitForEvent("page");
	await sidebar
		.getByRole("link", { name: "Events", exact: true })
		.click({ modifiers: ["ControlOrMeta"] });
	const popup = await popupPromise;
	await expect(popup).toHaveURL(/\/events$/);
	await expect(page).toHaveURL(/\/hosts$/);
	await popup.close();
});

test("mobile navigation stays expanded and closes on the current route without changing desktop state", async ({
	page,
}) => {
	await page.goto("/hosts");
	await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
	await expect(page.locator("aside")).toHaveCSS("width", "68px");
	await page.setViewportSize({ width: 390, height: 844 });
	const menu = page.getByRole("button", { name: "Open navigation menu" });
	await menu.click();
	const drawer = page.getByRole("dialog");
	await expect(drawer.locator("aside")).toHaveCSS("width", "260px");
	await expect(drawer.getByRole("button", { name: "Close navigation menu" })).toBeVisible();
	await expect(page.locator("body")).toHaveAttribute("data-scroll-locked", "1");
	await drawer.getByRole("link", { name: "Hosts", exact: true }).click();
	await expect(drawer).not.toBeVisible();
	await expect(menu).toBeFocused();
	await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked");
	await page.setViewportSize({ width: 1280, height: 720 });
	await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toBeVisible();
});
