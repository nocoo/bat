import type { HostOverviewItem } from "@bat/shared";
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
	test("desktop lifecycle: create, reveal, copy, edit, rotate, and revoke token", async ({
		page,
		context,
	}) => {
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		await page.goto("/connect");
		await expect(page.getByRole("heading", { name: "Connect", exact: true })).toBeVisible();
		const name = `Desktop ${Date.now()}`;
		const create = page.getByRole("button", { name: "Create token", exact: true });
		await create.click();
		await page.getByLabel("Token name", { exact: true }).fill(name);
		await expect(page.getByRole("radio", { name: /Read only/ })).toBeChecked();
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

		await tokenAction(page, "Reveal", name);
		const first = await page.getByLabel("Bearer key", { exact: true }).inputValue();
		expect(first.startsWith("batc_") && first.length === 48).toBe(true);
		expect(await authorizedServers(page, first)).toEqual(["pw-host-alpha", "pw-host-beta"]);

		await page.getByRole("button", { name: "Copy revealed key" }).click();
		expect((await page.evaluate(() => navigator.clipboard.readText())) === first).toBe(true);
		await page.getByRole("button", { name: "Hide key", exact: true }).click();

		await page.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
		const renamed = `${name} renamed`;
		await page.getByLabel("Token name", { exact: true }).fill(renamed);
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

		await tokenAction(page, "Revoke", renamed);
		await expect(
			page.getByRole("button", { name: `Reveal ${renamed}`, exact: true }),
		).toBeDisabled();
		await page.evaluate(() => navigator.clipboard.writeText(""));
	});
});
