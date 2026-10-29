import { expect, test } from "@playwright/test";

test.use({ trace: "off", screenshot: "off", video: "off" });

for (const theme of ["light", "dark"] as const) {
	for (const width of [1440, 390]) {
		test(`${theme} ${width}px: Connect and retention use compact functional controls`, async ({
			page,
		}, testInfo) => {
			await page.setViewportSize({ width, height: 900 });
			await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
			await page.route("**/api/connect/tokens", (route) => {
				if (route.request().method() === "GET") {
					return route.fulfill({ json: { data: [] } });
				}
				return route.continue();
			});
			try {
				await page.goto("/connect");
				const island = page.locator("[data-basalt-island]");
				const header = page
					.getByRole("heading", { name: "Connect", exact: true })
					.locator("xpath=ancestor::header");
				const create = header.getByRole("button", { name: "Create token", exact: true });
				await expect(create).toBeEnabled();
				await expect(page.getByRole("button", { name: "Create token", exact: true })).toHaveCount(
					1,
				);
				await expect(header.getByText("API v1", { exact: true })).toHaveCount(0);
				await expect(page.getByText("One key. Your authorized servers.")).toHaveCount(0);
				await expect(page.getByText("Keep access intentional")).toHaveCount(0);
				const tokens = page.getByRole("region", { name: "Access tokens", exact: true });
				await expect(tokens.getByText("0 active", { exact: true })).toBeVisible();
				await expect(tokens.getByRole("heading", { name: "No tokens yet" })).toBeVisible();
				await expect(tokens.getByRole("button", { name: "Create token" })).toHaveCount(0);
				const headerBox = await header.evaluate((element) =>
					element.getBoundingClientRect().toJSON(),
				);
				const createBox = await create.evaluate((element) =>
					element.getBoundingClientRect().toJSON(),
				);
				const tokensBox = await tokens.evaluate((element) =>
					element.getBoundingClientRect().toJSON(),
				);
				expect(createBox.bottom).toBeLessThanOrEqual(headerBox.bottom);
				expect(tokensBox.y).toBeGreaterThanOrEqual(headerBox.bottom);
				await create.click();
				const dialog = page.getByRole("dialog");
				await expect(dialog.getByLabel("Token name", { exact: true })).toBeFocused();
				await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
				await expect(dialog).toBeHidden();
				await expect(create).toBeFocused();
				const guide = page.getByRole("complementary", { name: "Connection guide" });
				await expect(guide.getByRole("heading", { name: "Make the connection" })).toBeVisible();
				await expect(guide.getByLabel("API base URL", { exact: true })).toHaveValue(/\/api\/v1$/);
				await expect(guide.getByRole("link", { name: "API guide" })).toHaveAttribute(
					"href",
					"https://github.com/nocoo/bat/blob/main/docs/22-connect.md",
				);
				const agent = guide.getByRole("radio", { name: "Agent instructions", exact: true });
				await agent.click();
				await expect(agent).toBeChecked();
				const curl = guide.getByRole("radio", { name: "curl", exact: true });
				await curl.click();
				await expect(curl).toBeChecked();
				expect(
					await guide
						.getByRole("radiogroup", { name: "Example format", exact: true })
						.evaluate((element) => element.getBoundingClientRect().height),
				).toBe(createBox.height);
				await expect
					.poll(() => island.evaluate((element) => element.scrollWidth <= element.clientWidth))
					.toBe(true);
				await page.screenshot({
					path: testInfo.outputPath("connect.png"),
					fullPage: true,
					animations: "disabled",
				});
				await page.goto("/settings/data");
				await expect(
					page.getByRole("heading", { name: "Data Retention", exact: true }),
				).toBeVisible();
				await expect(page.getByText("Retention Window", { exact: true })).toHaveCount(0);
				const retention = page.getByRole("radiogroup", { name: "Retention window", exact: true });
				await expect(retention.getByRole("radio")).toHaveCount(3);
				expect(await retention.evaluate((element) => element.getBoundingClientRect().height)).toBe(
					createBox.height,
				);
				await expect
					.poll(() => island.evaluate((element) => element.scrollWidth <= element.clientWidth))
					.toBe(true);
				await page.screenshot({
					path: testInfo.outputPath("retention.png"),
					fullPage: true,
					animations: "disabled",
				});
			} finally {
				await page.unrouteAll({ behavior: "wait" });
			}
		});
	}
}
