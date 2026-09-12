import { expect, test } from "@playwright/test";

// Never capture network traces, videos or automatic screenshots containing keys.
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("Connect private credential management", () => {
	test("desktop keyboard flow, repeat reveal, clipboard, blur protection, rename, rotation and revocation", async ({
		page,
		context,
	}, testInfo) => {
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		await page.goto("/connect");
		await expect(page.getByRole("heading", { name: "Connect", exact: true })).toBeVisible();
		await page.getByLabel("Server", { exact: true }).selectOption("pw-host-alpha");
		const name = `Desktop ${Date.now()}`;
		const create = page.getByRole("button", { name: "Create token", exact: true });
		await create.focus();
		await page.keyboard.press("Enter");
		await expect(page.getByLabel("Token name", { exact: true })).toBeFocused();
		await page.getByLabel("Token name", { exact: true }).fill(name);
		await expect(page.getByRole("radio", { name: /Read only/ })).toBeChecked();
		await page
			.getByRole("dialog")
			.getByRole("button", { name: "Create token", exact: true })
			.click();
		const row = page
			.getByTestId("connect-token-row")
			.filter({ has: page.getByRole("heading", { name, exact: true }) });
		await expect(row).toBeVisible();
		await expect(row.getByText("Never", { exact: true })).toBeVisible();
		await expect(page.getByLabel("Bearer key", { exact: true })).toHaveCount(0);
		await page.screenshot({
			path: testInfo.outputPath("connect-desktop.png"),
			fullPage: true,
			mask: [page.locator('[data-testid="connect-token-row"] .font-mono')],
		});
		async function action(kind: "Reveal" | "Rotate" | "Revoke", tokenName: string) {
			await page.getByRole("button", { name: `${kind} ${tokenName}`, exact: true }).click();
			const dialog = page.getByRole("dialog");
			const submit = dialog.getByRole("button", {
				name: kind === "Reveal" ? "Reveal key" : kind === "Rotate" ? "Rotate key" : "Revoke token",
				exact: true,
			});
			await expect(submit).toBeDisabled();
			await dialog.getByLabel(`Type ${tokenName} to confirm`, { exact: true }).fill(tokenName);
			await submit.click();
			await expect(dialog).toBeHidden();
		}
		await action("Reveal", name);
		const first = await page.getByLabel("Bearer key", { exact: true }).inputValue();
		expect(first.startsWith("batc_") && first.length === 48).toBe(true);
		await page.getByRole("button", { name: "Copy revealed key" }).click();
		expect((await page.evaluate(() => navigator.clipboard.readText())) === first).toBe(true);
		await page.evaluate(() => window.dispatchEvent(new Event("blur")));
		await expect(page.getByLabel("Bearer key", { exact: true })).toHaveCount(0);
		await action("Reveal", name);
		expect((await page.getByLabel("Bearer key", { exact: true }).inputValue()) === first).toBe(
			true,
		);
		const persisted = await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]));
		expect(persisted.includes(first)).toBe(false);
		await page.getByRole("button", { name: "Hide key", exact: true }).click();
		await page.getByRole("button", { name: `Rename ${name}`, exact: true }).click();
		const renamed = `${name} renamed`;
		await page.getByLabel("New token name", { exact: true }).fill(renamed);
		await page
			.getByRole("dialog")
			.getByRole("button", { name: "Rename token", exact: true })
			.click();
		await expect(page.getByRole("dialog")).toBeHidden();
		await action("Rotate", renamed);
		await action("Reveal", renamed);
		expect((await page.getByLabel("Bearer key", { exact: true }).inputValue()) === first).toBe(
			false,
		);
		await page.getByLabel("Server", { exact: true }).selectOption("pw-host-beta");
		await expect(page.getByLabel("Bearer key", { exact: true })).toHaveCount(0);
		await page.getByLabel("Server", { exact: true }).selectOption("pw-host-alpha");
		await action("Revoke", renamed);
		await expect(
			page.getByRole("button", { name: `Reveal ${renamed}`, exact: true }),
		).toBeDisabled();
		await page.evaluate(() => navigator.clipboard.writeText(""));
	});

	test("mobile layout supports write scope, optional expiry and API examples", async ({
		page,
	}, testInfo) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/connect");
		await page.getByLabel("Server", { exact: true }).selectOption("pw-host-beta");
		await page.getByRole("button", { name: "Create token", exact: true }).click();
		await page.getByLabel("Token name", { exact: true }).fill(`Mobile ${Date.now()}`);
		await page.getByRole("radio", { name: /Read \+ write/ }).check();
		await page.locator("#token-expiry").fill("2099-01-01T12:00");
		await page
			.getByRole("dialog")
			.getByRole("button", { name: "Create token", exact: true })
			.click();
		await expect(page.getByRole("dialog")).toBeHidden();
		await expect(
			page.getByTestId("connect-token-row").getByText("Read + write", { exact: true }),
		).toBeVisible();
		await page.getByRole("button", { name: "Agent instructions", exact: true }).click();
		await expect(page.locator("pre")).toContainText("If-Match");
		await expect(page.locator("pre")).toContainText("pw-host-beta");
		await expect(page.getByLabel("API base URL", { exact: true })).toHaveValue(
			"http://localhost:27025/api/v1",
		);
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
		).toBe(true);
		await page.screenshot({
			path: testInfo.outputPath("connect-mobile-examples.png"),
			fullPage: true,
			mask: [page.locator('[data-testid="connect-token-row"] .font-mono')],
		});
		await page.getByRole("heading", { name: "Connect", exact: true }).scrollIntoViewIfNeeded();
		await page.screenshot({
			path: testInfo.outputPath("connect-mobile.png"),
			fullPage: true,
			mask: [page.locator('[data-testid="connect-token-row"] .font-mono')],
		});
		await page.getByRole("button", { name: "Create token", exact: true }).click();
		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog")).toBeHidden();
		await expect(page.getByRole("button", { name: "Create token", exact: true })).toBeFocused();
	});

	test("a late reveal response cannot show a key after the window loses focus", async ({
		page,
	}) => {
		await page.goto("/connect");
		await page.getByLabel("Server", { exact: true }).selectOption("pw-host-alpha");
		const name = `Privacy ${Date.now()}`;
		await page.getByRole("button", { name: "Create token", exact: true }).click();
		await page.getByLabel("Token name", { exact: true }).fill(name);
		await page
			.getByRole("dialog")
			.getByRole("button", { name: "Create token", exact: true })
			.click();
		await expect(page.getByRole("dialog")).toBeHidden();
		let unblock!: () => void, received!: () => void;
		const paused = new Promise<void>((resolve) => {
			received = resolve;
		});
		const resume = new Promise<void>((resolve) => {
			unblock = resolve;
		});
		await page.route("**/api/connect/**/reveal", async (route) => {
			const response = await route.fetch();
			received();
			await resume;
			await route.fulfill({ response });
		});
		await page.getByRole("button", { name: `Reveal ${name}`, exact: true }).click();
		await page.getByLabel(`Type ${name} to confirm`, { exact: true }).fill(name);
		await page.getByRole("dialog").getByRole("button", { name: "Reveal key", exact: true }).click();
		await paused;
		await page.evaluate(() => window.dispatchEvent(new Event("blur")));
		unblock();
		await expect(
			page.getByRole("dialog").getByRole("button", { name: "Reveal key", exact: true }),
		).toBeEnabled();
		await expect(page.getByLabel("Bearer key", { exact: true })).toHaveCount(0);
		await page.keyboard.press("Escape");
	});
});
