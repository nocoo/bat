import { expect, test } from "@playwright/test";

const pages = [
	["/hosts", "Hosts"],
	["/alerts", "Alerts"],
	["/events", "Events"],
	["/tags", "Tags"],
	["/connect", "Connect"],
	["/setup", "Install Probe"],
	["/settings/webhooks", "Webhooks"],
	["/settings/data", "Data Retention"],
] as const;

for (const width of [375, 390]) {
	test(`long hostname stays inside the ${width}px content island`, async ({ page }, testInfo) => {
		const hostname = `${"monitoring".repeat(6)}.${"production".repeat(6)}.example.test`;
		await page.setViewportSize({ width, height: 900 });
		for (const path of ["**/api/hosts", "**/api/hosts/f0d3fd30"]) {
			await page.route(path, async (route) => {
				const response = await route.fetch();
				const data = await response.json();
				await route.fulfill({
					response,
					json: Array.isArray(data)
						? data.map((host) => (host.host_id === "pw-host-alpha" ? { ...host, hostname } : host))
						: { ...data, hostname },
				});
			});
		}
		try {
			await page.goto("/hosts/f0d3fd30");
			const island = page.locator("[data-basalt-island]");
			await expect(island.getByRole("heading", { name: hostname, exact: true })).toBeVisible();
			await expect
				.poll(() => island.evaluate((element) => element.scrollWidth <= element.clientWidth))
				.toBe(true);
			await page.screenshot({ path: testInfo.outputPath(`long-hostname-${width}.png`) });
		} finally {
			await page.unrouteAll({ behavior: "wait" });
		}
	});
}

for (const theme of ["light", "dark"] as const) {
	for (const width of [1440, 390]) {
		test(`${theme} ${width}px: every workspace page keeps compact chrome and fits the viewport`, async ({
			page,
		}, testInfo) => {
			await page.setViewportSize({ width, height: 900 });
			await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
			for (const [path, title] of pages) {
				await page.goto(path);
				const island = page.locator("[data-basalt-island]");
				await expect(island.getByRole("heading", { name: title, exact: true })).toBeVisible();
				await expect(page.locator("[data-basalt-header]")).toHaveCSS("height", "52px");
				await expect
					.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
					.toBe(true);
				await expect(island).toHaveCSS("padding-left", width >= 1024 ? "24px" : "16px");
				await expect(island).toHaveCSS("padding-top", "16px");
				if (path === "/hosts" || path === "/tags") {
					await page.screenshot({
						path: testInfo.outputPath(`${title.toLowerCase()}-${theme}-${width}.png`),
					});
				}
			}
			await page.goto("/hosts/f0d3fd30");
			const header = page.getByTestId("host-detail-header");
			await expect(
				header.getByRole("group", { name: "Host description", exact: true }),
			).toBeVisible();
			await expect(header.getByRole("button", { name: "Host tags", exact: true })).toBeVisible();
			await expect
				.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
				.toBe(true);
			await page.screenshot({ path: testInfo.outputPath(`host-detail-${theme}-${width}.png`) });
			await header.getByRole("button", { name: "Delete host", exact: true }).click();
			const dialog = page.getByRole("alertdialog");
			await expect(dialog).toBeVisible();
			await dialog.getByRole("button", { name: "Continue to confirmation", exact: true }).click();
			await page.screenshot({ path: testInfo.outputPath(`host-delete-${theme}-${width}.png`) });
		});
	}
}
