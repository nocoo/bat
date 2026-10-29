import { expect, test } from "@playwright/test";

for (const width of [375, 390]) {
	test(`${width}px: long tags stay compact and time and delete stay together`, async ({
		page,
	}, testInfo) => {
		await page.setViewportSize({ width, height: 900 });
		const tags = Array.from({ length: 10 }, (_, index) => ({
			id: index + 100,
			name: `${"生产环境".repeat(7)}${index}`,
			color: 0,
		}));
		for (const path of ["**/api/hosts/pw-host-alpha/tags", "**/api/tags"]) {
			await page.route(path, (route) => route.fulfill({ json: tags }));
		}
		try {
			await page.goto("/hosts/f0d3fd30");
			const header = page.getByTestId("host-detail-header");
			const manager = header.getByTestId("host-tags-manager");
			const chips = manager.getByRole("group").locator(":scope > span");
			await expect(chips).toHaveCount(10);
			await expect(manager.getByRole("button", { name: "Host tags", exact: true })).toHaveText(
				"Max 10",
			);
			for (const chip of await chips.all()) {
				await expect(chip).toHaveCSS("height", "28px");
				expect(await chip.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(
					true,
				);
				await expect(chip.getByRole("button")).toBeEnabled();
			}
			const time = await header
				.getByRole("radiogroup", { name: "Time range", exact: true })
				.boundingBox();
			const remove = await header
				.getByRole("button", { name: "Delete host", exact: true })
				.boundingBox();
			expect(time?.y).toBe(remove?.y);
			await expect
				.poll(() =>
					page
						.locator("[data-basalt-island]")
						.evaluate((element) => element.scrollWidth <= element.clientWidth),
				)
				.toBe(true);
			await page.screenshot({ path: testInfo.outputPath(`long-tags-${width}.png`) });
			await manager.getByRole("button", { name: "Host tags", exact: true }).click();
			await page.getByRole("combobox", { name: "Host tags: search" }).fill("another-tag");
			await expect(page.getByRole("option", { name: 'Create "another-tag"' })).toBeDisabled();
		} finally {
			await page.unrouteAll({ behavior: "wait" });
		}
	});
}

for (const theme of ["light", "dark"] as const) {
	test(`${theme}: host controls share a compact band above the description`, async ({
		page,
	}, testInfo) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
		// CI hides the locked environment picker (visible: !ci); force it visible to measure it.
		await page.route("**/__bat/bootstrap.js", async (route) => {
			const response = await route.fetch();
			const config = JSON.parse((await response.text()).slice("window.__BAT_LOCAL__=".length, -1));
			const instance = config.instance && { ...config.instance, visible: true };
			await route.fulfill({
				response,
				body: `window.__BAT_LOCAL__=${JSON.stringify({ ...config, visible: true, instance })};`,
			});
		});
		await page.goto("/hosts/f0d3fd30");
		const header = page.getByTestId("host-detail-header");
		const title = header.getByRole("heading", { name: "alpha.test.local", exact: true });
		const status = header.getByTestId("status-badge");
		const tags = header.getByTestId("host-tags-manager");
		const chips = tags.getByRole("group").locator(":scope > span");
		const add = tags.getByRole("button", { name: "Host tags", exact: true });
		const time = header.getByRole("radiogroup", { name: "Time range", exact: true });
		const remove = header.getByRole("button", { name: "Delete host", exact: true });
		await expect(chips).toHaveCount(2);
		await expect(add).toHaveText("+ Add");
		await expect(tags.getByText("Tags", { exact: true })).toHaveCount(0);
		await expect(tags.locator("svg.lucide-tags")).toHaveCount(0);
		await expect(remove).toHaveText("");
		await expect(remove).toHaveClass(/bg-basalt-destructive/);
		await expect(remove).toHaveClass(/text-basalt-destructive-foreground/);
		await expect(remove.locator("svg[aria-hidden=true]")).toBeVisible();
		const boxes = await Promise.all(
			[title, status, chips.nth(0), chips.nth(1), add, time, remove].map(async (control) => {
				const box = await control.boundingBox();
				if (!box) throw new Error("Header control is not visible");
				return box;
			}),
		);
		for (const [index, box] of boxes.entries()) {
			expect(
				Math.abs(box.y + box.height / 2 - (boxes[0].y + boxes[0].height / 2)),
			).toBeLessThanOrEqual(2);
			if (index > 0) {
				expect(box.x).toBeGreaterThanOrEqual(boxes[index - 1].x + boxes[index - 1].width);
				expect(box.height).toBeGreaterThanOrEqual(28);
				expect(box.height).toBeLessThanOrEqual(32);
			}
		}
		const description = await header
			.getByRole("group", { name: "Host description", exact: true })
			.boundingBox();
		expect(description?.y).toBeGreaterThanOrEqual(
			Math.max(...boxes.map((box) => box.y + box.height)),
		);
		const environment = page.getByRole("radiogroup", { name: "Environment", exact: true });
		await expect(environment).toHaveCSS("height", `${boxes[5].height}px`);
		await page.screenshot({ path: testInfo.outputPath(`compact-header-${theme}.png`) });
	});
}

test("compact environment switch preserves selection and reload without contacting another environment", async ({
	page,
}) => {
	let selected: { id: string; mode: string; locked: boolean; visible: boolean };
	let capability = "";
	const requestedModes: string[] = [];
	await page.route("**/__bat/bootstrap.js", async (route) => {
		const response = await route.fetch();
		const config = JSON.parse((await response.text()).slice("window.__BAT_LOCAL__=".length, -1));
		capability = config.capability;
		selected ??= { ...config.instance, locked: false, visible: true };
		await route.fulfill({
			response,
			body: `window.__BAT_LOCAL__=${JSON.stringify({ ...config, locked: false, visible: true })};`,
		});
	});
	await page.route("**/__bat/environment*", async (route) => {
		expect(route.request().headers()["x-bat-local"]).toBe(capability);
		if (route.request().method() === "POST") {
			const { mode } = route.request().postDataJSON();
			requestedModes.push(mode);
			selected = { ...selected, mode };
		}
		await route.fulfill({ json: selected });
	});
	try {
		await page.goto("/hosts/f0d3fd30");
		const picker = page.getByRole("radiogroup", { name: "Environment", exact: true });
		await expect(picker.getByRole("radio", { name: "E2E", exact: true })).toBeChecked();
		for (const [label, mode] of [
			["Demo", "demo"],
			["Prod", "prod"],
			["E2E", "e2e"],
		]) {
			await picker.getByRole("radio", { name: label, exact: true }).click();
			await expect(page).toHaveURL(/\/hosts$/);
			await expect(picker.getByRole("radio", { name: label, exact: true })).toBeChecked();
			expect(await page.evaluate(() => localStorage.getItem("bat:environment-mode"))).toBe(mode);
		}
		expect(requestedModes).toEqual(["e2e", "demo", "prod", "e2e"]);
	} finally {
		await page.unrouteAll({ behavior: "wait" });
	}
});
