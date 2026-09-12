import type { ConnectToken, HostOverviewItem } from "@bat/shared";
import { expect, type Page, test } from "@playwright/test";

// Never capture network traces, videos or automatic screenshots containing keys.
test.use({ trace: "off", screenshot: "off", video: "off", timezoneId: "Asia/Shanghai" });

async function tokenAction(page: Page, kind: "Reveal" | "Rotate" | "Revoke", tokenName: string) {
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

async function createToken(page: Page, name: string, serverIds: string[]) {
	await page.getByRole("button", { name: "Create token", exact: true }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("Token name", { exact: true }).fill(name);
	await expect(dialog.getByRole("checkbox", { checked: true })).toHaveCount(0);
	for (const id of serverIds) await dialog.getByRole("checkbox", { name: new RegExp(id) }).check();
	const created = page.waitForResponse(
		(response) =>
			response.url().endsWith("/api/connect/tokens") && response.request().method() === "POST",
	);
	await dialog.getByRole("button", { name: "Create token", exact: true }).click();
	const response = await created;
	expect(response.status()).toBe(201);
	await expect(dialog).toBeHidden();
	return ((await response.json()) as { data: ConnectToken }).data;
}

async function authorizedServers(page: Page, key: string) {
	const response = await page.request.get("/api/v1/servers", {
		headers: { Authorization: `Bearer ${key}` },
	});
	expect(response.status()).toBe(200);
	return ((await response.json()) as { data: HostOverviewItem[] }).data
		.map((server) => server.host_id)
		.sort();
}

test.describe("Connect private credential management", () => {
	test("desktop keyboard flow, multiple servers, repeat reveal, clipboard, blur protection, edit, rotation and revocation", async ({
		page,
		context,
	}, testInfo) => {
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		await page.goto("/connect");
		await expect(page.getByRole("heading", { name: "Connect", exact: true })).toBeVisible();
		const name = `Desktop ${Date.now()}`;
		const create = page.getByRole("button", { name: "Create token", exact: true });
		await expect(create).toBeEnabled();
		await create.focus();
		await page.keyboard.press("Enter");
		await expect(page.getByLabel("Token name", { exact: true })).toBeFocused();
		await page.getByLabel("Token name", { exact: true }).fill(name);
		await expect(page.getByRole("radio", { name: /Read only/ })).toBeChecked();
		await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(0);
		await page.getByRole("checkbox", { name: /pw-host-alpha/ }).check();
		await page.getByRole("checkbox", { name: /pw-host-beta/ }).check();
		await page
			.getByRole("dialog")
			.getByRole("button", { name: "Create token", exact: true })
			.click();
		const row = page
			.getByTestId("connect-token-row")
			.filter({ has: page.getByRole("heading", { name, exact: true }) });
		await expect(row).toBeVisible();
		await expect(row.getByText("pw-host-alpha", { exact: true })).toBeVisible();
		await expect(row.getByText("pw-host-beta", { exact: true })).toBeVisible();
		await expect(row.getByText("Never", { exact: true })).toBeVisible();
		await expect(page.getByLabel("Bearer key", { exact: true })).toHaveCount(0);
		await page.screenshot({
			path: testInfo.outputPath("connect-desktop.png"),
			fullPage: true,
			mask: [page.locator('[data-testid="connect-token-row"] .font-mono')],
		});
		await tokenAction(page, "Reveal", name);
		const first = await page.getByLabel("Bearer key", { exact: true }).inputValue();
		expect(first.startsWith("batc_") && first.length === 48).toBe(true);
		expect(await authorizedServers(page, first)).toEqual(["pw-host-alpha", "pw-host-beta"]);
		await page.getByRole("button", { name: "Copy revealed key" }).click();
		expect((await page.evaluate(() => navigator.clipboard.readText())) === first).toBe(true);
		await page.evaluate(() => window.dispatchEvent(new Event("blur")));
		await expect(page.getByLabel("Bearer key", { exact: true })).toHaveCount(0);
		await tokenAction(page, "Reveal", name);
		expect((await page.getByLabel("Bearer key", { exact: true }).inputValue()) === first).toBe(
			true,
		);
		const persisted = await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]));
		expect(persisted.includes(first)).toBe(false);
		await page.getByRole("button", { name: "Hide key", exact: true }).click();
		await page.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
		const renamed = `${name} renamed`;
		await page.getByLabel("Token name", { exact: true }).fill(renamed);
		await expect(page.getByRole("checkbox", { name: /pw-host-alpha/ })).toBeChecked();
		await expect(page.getByRole("checkbox", { name: /pw-host-beta/ })).toBeChecked();
		await page.getByRole("checkbox", { name: /pw-host-beta/ }).uncheck();
		await page
			.getByRole("dialog")
			.getByRole("button", { name: "Save changes", exact: true })
			.click();
		await expect(page.getByRole("dialog")).toBeHidden();
		expect(await authorizedServers(page, first)).toEqual(["pw-host-alpha"]);
		await tokenAction(page, "Rotate", renamed);
		await tokenAction(page, "Reveal", renamed);
		expect((await page.getByLabel("Bearer key", { exact: true }).inputValue()) === first).toBe(
			false,
		);
		await page.getByRole("button", { name: "Create token", exact: true }).click();
		await expect(page.getByLabel("Bearer key", { exact: true })).toHaveCount(0);
		await page.keyboard.press("Escape");
		await tokenAction(page, "Revoke", renamed);
		await expect(
			page.getByRole("button", { name: `Reveal ${renamed}`, exact: true }),
		).toBeDisabled();
		await page.evaluate(() => navigator.clipboard.writeText(""));
	});

	test("mobile scope and expiry edits preserve the key and immediately enforce read-only access", async ({
		page,
	}, testInfo) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/connect");
		await page.getByRole("button", { name: "Create token", exact: true }).click();
		const name = `Mobile ${Date.now()}`;
		await page.getByLabel("Token name", { exact: true }).fill(name);
		await page.getByRole("checkbox", { name: /pw-host-beta/ }).check();
		await page.getByRole("radio", { name: /Read \+ write/ }).check();
		await page.locator("#token-expiry").fill("2099-01-01T12:00:37");
		const created = page.waitForResponse(
			(response) =>
				response.url().endsWith("/api/connect/tokens") && response.request().method() === "POST",
		);
		await page
			.getByRole("dialog")
			.getByRole("button", { name: "Create token", exact: true })
			.click();
		expect(((await (await created).json()) as { data: ConnectToken }).data.expiresAt).toBe(
			"2099-01-01T04:00:37.000Z",
		);
		await expect(page.getByRole("dialog")).toBeHidden();
		const row = page
			.getByTestId("connect-token-row")
			.filter({ has: page.getByRole("heading", { name, exact: true }) });
		await expect(row.getByText("Read + write", { exact: true })).toBeVisible();
		await expect(row.getByText("pw-host-beta", { exact: true })).toBeVisible();
		await expect(row).toContainText("2099");
		await page.getByRole("button", { name: "Agent instructions", exact: true }).click();
		await expect(page.locator("pre")).toContainText("If-Match");
		await expect(page.locator("pre")).toContainText("GET /servers");
		await expect(page.locator("pre")).toContainText("SERVER_ID");
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
		await tokenAction(page, "Reveal", name);
		const key = await page.getByLabel("Bearer key", { exact: true }).inputValue();
		const headers = { Authorization: `Bearer ${key}` };
		const serverUrl = "/api/v1/servers/pw-host-beta";
		const before = await page.request.get(serverUrl, { headers });
		expect(before.status()).toBe(200);
		const allowed = await page.request.patch(`${serverUrl}/description`, {
			headers: {
				...headers,
				"If-Match": before.headers().etag,
				"Idempotency-Key": `pw-scope-write-${Date.now()}`,
			},
			data: { description: "Connect scope transition" },
		});
		expect(allowed.status()).toBe(204);
		await page.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
		await expect(page.getByLabel("Bearer key", { exact: true })).toHaveCount(0);
		await expect(page.getByRole("radio", { name: /Read \+ write/ })).toBeChecked();
		await expect(page.locator("#token-expiry")).toHaveValue("2099-01-01T12:00:37");
		await page.getByRole("radio", { name: /Read only/ }).check();
		await page.locator("#token-expiry").fill("");
		await page
			.getByRole("dialog")
			.getByRole("button", { name: "Save changes", exact: true })
			.click();
		await expect(page.getByRole("dialog")).toBeHidden();
		await expect(row.getByText("Read only", { exact: true })).toBeVisible();
		await expect(row.getByText("Never", { exact: true })).toBeVisible();
		const after = await page.request.get(serverUrl, { headers });
		expect(after.status()).toBe(200);
		const denied = await page.request.patch(`${serverUrl}/description`, {
			headers: {
				...headers,
				"If-Match": after.headers().etag,
				"Idempotency-Key": `pw-scope-read-${Date.now()}`,
			},
			data: { description: "Must remain forbidden" },
		});
		expect(denied.status()).toBe(403);
		expect((await denied.json()).error.code).toBe("insufficient_scope");
		await tokenAction(page, "Reveal", name);
		expect((await page.getByLabel("Bearer key", { exact: true }).inputValue()) === key).toBe(true);
		await page.getByRole("button", { name: "Create token", exact: true }).click();
		await expect(page.getByLabel("Bearer key", { exact: true })).toHaveCount(0);
		await expect(page.getByRole("radio", { name: /Read only/ })).toBeChecked();
		await expect(page.locator("#token-expiry")).toHaveValue("");
		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog")).toBeHidden();
		await expect(page.getByRole("button", { name: "Create token", exact: true })).toBeFocused();
	});

	test("a late reveal response cannot show a key after the window loses focus", async ({
		page,
	}) => {
		await page.goto("/connect");
		const name = `Privacy ${Date.now()}`;
		await createToken(page, name, ["pw-host-alpha"]);
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

	test("empty grants, overlapping keys and stale permission edits preserve each key's authorization", async ({
		page,
	}) => {
		await page.goto("/connect");
		const emptyName = `Empty ${Date.now()}`;
		const empty = await createToken(page, emptyName, []);
		expect(empty.serverIds).toEqual([]);
		expect(empty.expiresAt).toBeNull();
		const emptyRow = page
			.getByTestId("connect-token-row")
			.filter({ has: page.getByRole("heading", { name: emptyName, exact: true }) });
		await expect(emptyRow.getByText("No server access", { exact: true })).toBeVisible();
		await tokenAction(page, "Reveal", emptyName);
		const emptyKey = await page.getByLabel("Bearer key", { exact: true }).inputValue();
		expect(await authorizedServers(page, emptyKey)).toEqual([]);

		await page.getByRole("button", { name: `Edit ${emptyName}`, exact: true }).click();
		await page.getByRole("checkbox", { name: /pw-host-alpha/ }).check();
		await page
			.getByRole("dialog")
			.getByRole("button", { name: "Save changes", exact: true })
			.click();
		await expect(page.getByRole("dialog")).toBeHidden();
		expect(await authorizedServers(page, emptyKey)).toEqual(["pw-host-alpha"]);

		const sharedName = `Shared ${Date.now()}`;
		const shared = await createToken(page, sharedName, ["pw-host-alpha"]);
		expect(shared.serverIds).toEqual(["pw-host-alpha"]);
		const sharedRow = page
			.getByTestId("connect-token-row")
			.filter({ has: page.getByRole("heading", { name: sharedName, exact: true }) });
		await expect(emptyRow.getByText("pw-host-alpha", { exact: true })).toBeVisible();
		await expect(sharedRow.getByText("pw-host-alpha", { exact: true })).toBeVisible();
		await tokenAction(page, "Reveal", sharedName);
		const sharedKey = await page.getByLabel("Bearer key", { exact: true }).inputValue();
		expect(sharedKey === emptyKey).toBe(false);
		expect(await authorizedServers(page, sharedKey)).toEqual(["pw-host-alpha"]);

		await page.getByRole("button", { name: `Edit ${emptyName}`, exact: true }).click();
		await page.getByRole("checkbox", { name: /pw-host-alpha/ }).uncheck();
		await expect(
			page.getByRole("dialog").getByText("No server access", { exact: true }),
		).toBeVisible();
		await page
			.getByRole("dialog")
			.getByRole("button", { name: "Save changes", exact: true })
			.click();
		await expect(page.getByRole("dialog")).toBeHidden();
		await expect(emptyRow.getByText("No server access", { exact: true })).toBeVisible();
		expect(await authorizedServers(page, emptyKey)).toEqual([]);
		expect(await authorizedServers(page, sharedKey)).toEqual(["pw-host-alpha"]);

		await page.getByRole("button", { name: `Edit ${sharedName}`, exact: true }).click();
		await expect(page.getByRole("checkbox", { name: /pw-host-alpha/ })).toBeChecked();
		const otherEditor = await page.request.patch(`/api/connect/tokens/${shared.id}`, {
			headers: {
				Origin: new URL(page.url()).origin,
				"X-Bat-Management": "1",
				"If-Match": `"${shared.id}:${shared.version}"`,
			},
			data: { serverIds: ["pw-host-beta"] },
		});
		expect(otherEditor.status()).toBe(200);
		await page.getByRole("checkbox", { name: /pw-host-alpha/ }).uncheck();
		const staleSave = page.waitForResponse(
			(response) =>
				response.url().endsWith(`/api/connect/tokens/${shared.id}`) &&
				response.request().method() === "PATCH",
		);
		await page
			.getByRole("dialog")
			.getByRole("button", { name: "Save changes", exact: true })
			.click();
		expect((await staleSave).status()).toBe(412);
		await expect(page.getByRole("dialog").getByRole("alert")).toContainText("changed");
		expect(await authorizedServers(page, sharedKey)).toEqual(["pw-host-beta"]);
		await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
		await expect(sharedRow.getByText("pw-host-beta", { exact: true })).toBeVisible();
		await page.getByRole("button", { name: `Edit ${sharedName}`, exact: true }).click();
		await expect(page.getByRole("checkbox", { name: /pw-host-alpha/ })).not.toBeChecked();
		await expect(page.getByRole("checkbox", { name: /pw-host-beta/ })).toBeChecked();
		await page.keyboard.press("Escape");
	});
});
