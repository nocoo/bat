// Sidebar navigation E2E tests

import { expect, test } from "@playwright/test";

const NAV_ITEMS = [
	{ href: "/hosts", label: "Hosts" },
	{ href: "/alerts", label: "Alerts" },
	{ href: "/events", label: "Events" },
	{ href: "/tags", label: "Tags" },
	{ href: "/setup", label: "Setup" },
	{ href: "/settings/webhooks", label: "Webhooks" },
] as const;

test.describe("Sidebar navigation", () => {
	test("all nav items are visible in sidebar", async ({ page }) => {
		await page.goto("/hosts");
		for (const item of NAV_ITEMS) {
			const link = page.getByRole("link", { name: item.label });
			await expect(link.first()).toBeVisible({ timeout: 10_000 });
		}
	});

	test("clicking each nav item navigates to correct page", async ({ page }) => {
		await page.goto("/hosts");
		for (const item of NAV_ITEMS) {
			const link = page.getByRole("link", { name: item.label });
			await link.first().click();
			await page.waitForURL(`**${item.href}`);
			expect(page.url()).toContain(item.href);
		}
	});

	test("version badge is visible in expanded sidebar", async ({ page }) => {
		await page.goto("/hosts");
		// Version badge format: v{X.Y.Z}
		const versionBadge = page.getByText(/^v\d+\.\d+\.\d+$/);
		await expect(versionBadge).toBeVisible({ timeout: 10_000 });
	});

	test("sidebar collapse and expand toggle works", async ({ page }) => {
		await page.goto("/hosts");
		// Wait for sidebar to load
		await expect(page.getByRole("link", { name: "Hosts" }).first()).toBeVisible({
			timeout: 10_000,
		});

		// Click "Collapse sidebar" button
		const collapseButton = page.getByLabel("Collapse sidebar");
		await collapseButton.click();

		// After collapse, "Expand sidebar" button should appear
		const expandButton = page.getByLabel("Expand sidebar");
		await expect(expandButton).toBeVisible({ timeout: 5_000 });

		// Version badge should be hidden when collapsed
		const versionBadge = page.getByText(/^v\d+\.\d+\.\d+$/);
		await expect(versionBadge).not.toBeVisible();

		// Click expand to restore
		await expandButton.click();
		await expect(collapseButton).toBeVisible({ timeout: 5_000 });
		await expect(versionBadge).toBeVisible();
	});

	test("bat logo is visible", async ({ page }) => {
		await page.goto("/hosts");
		const logo = page.getByAltText("bat");
		await expect(logo.first()).toBeVisible({ timeout: 10_000 });
	});

	test("Home breadcrumb is always present", async ({ page }) => {
		await page.goto("/hosts");
		const homeBreadcrumb = page.getByText("Home");
		await expect(homeBreadcrumb.first()).toBeVisible({ timeout: 10_000 });
	});
});
