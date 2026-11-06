import type { ConnectToken } from "@bat/shared";
import { expect, test } from "@playwright/test";

// Keys are secrets: never capture traces, videos or screenshots of this flow.
test.use({ trace: "off", screenshot: "off", video: "off" });

const workstationId = "11111111-1111-4111-8111-111111111111";

interface BearerWorkstations {
	data: { id: string; latest_report: { connectivity: unknown[] } | null }[];
	serverIds: string[];
	workstationIds: string[];
}

async function bearerServers(page: import("@playwright/test").Page, key: string) {
	const response = await page.request.get("/api/v1/servers", {
		headers: { Authorization: `Bearer ${key}` },
	});
	expect(response.status()).toBe(200);
	return ((await response.json()) as { data: { host_id: string }[] }).data
		.map((server) => server.host_id)
		.sort();
}

async function bearerWorkstations(
	page: import("@playwright/test").Page,
	key: string,
): Promise<BearerWorkstations> {
	const response = await page.request.get("/api/v1/workstations", {
		headers: { Authorization: `Bearer ${key}` },
	});
	expect(response.status()).toBe(200);
	return (await response.json()) as BearerWorkstations;
}

async function revealKey(page: import("@playwright/test").Page, name: string) {
	await page.getByRole("button", { name: `Reveal ${name}`, exact: true }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel(`Type ${name} to confirm`, { exact: true }).fill(name);
	await dialog.getByRole("button", { name: "Reveal key", exact: true }).click();
	await expect(dialog).toBeHidden();
	return page.getByLabel("Bearer key", { exact: true }).inputValue();
}

test.describe("Connect workstation grants", () => {
	test("a workstation-only key grants exactly one workstation and no server access", async ({
		page,
	}) => {
		await page.goto("/connect");
		const name = `Workstation only ${Date.now()}`;
		await page.getByRole("button", { name: "Create token", exact: true }).click();
		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("Token name", { exact: true }).fill(name);
		await expect(dialog.getByRole("checkbox", { checked: true })).toHaveCount(0);
		await expect(dialog.getByText("Authorized workstations", { exact: true })).toBeVisible();
		await expect(dialog.getByText("Authorized servers", { exact: true })).toBeVisible();

		await dialog.getByRole("checkbox", { name: /Field laptop/ }).check();
		await expect(dialog.getByRole("checkbox", { checked: true })).toHaveCount(1);
		const created = page.waitForResponse(
			(response) =>
				response.url().endsWith("/api/connect/tokens") && response.request().method() === "POST",
		);
		await dialog.getByRole("button", { name: "Create token", exact: true }).click();
		const response = await created;
		expect(response.status()).toBe(201);
		const token = ((await response.json()) as { data: ConnectToken }).data;
		expect(token.serverIds).toEqual([]);
		expect(token.workstationIds).toEqual([workstationId]);
		const request = response.request().postDataJSON() as {
			serverIds: string[];
			workstationIds: string[];
		};
		expect(request.serverIds).toEqual([]);
		expect(request.workstationIds).toEqual([workstationId]);

		const row = page
			.getByTestId("connect-token-row")
			.filter({ has: page.getByRole("heading", { name, exact: true }) });
		await expect(row.getByText("Authorized workstations (1)", { exact: true })).toBeVisible();
		await expect(row.getByText("Field laptop", { exact: true })).toBeVisible();
		await expect(row.getByText("No server access", { exact: true })).toBeVisible();
		await expect(row.getByText("No workstation access", { exact: true })).toHaveCount(0);

		const key = await revealKey(page, name);
		expect(await bearerServers(page, key)).toEqual([]);
		const granted = await bearerWorkstations(page, key);
		expect(granted.workstationIds).toEqual([workstationId]);
		expect(granted.serverIds).toEqual([]);
		expect(granted.data.map((entry) => entry.id)).toEqual([workstationId]);
		expect(granted.data[0]?.latest_report?.connectivity).toEqual([]);

		await page.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
		const edit = page.getByRole("dialog");
		await expect(edit.getByRole("checkbox", { name: /Field laptop/ })).toBeChecked();
		await expect(edit.getByRole("checkbox", { name: /pw-host-alpha/ })).not.toBeChecked();
		await edit.getByRole("checkbox", { name: /pw-host-alpha/ }).check();
		const patched = page.waitForResponse(
			(response) =>
				response.url().endsWith(`/api/connect/tokens/${token.id}`) &&
				response.request().method() === "PATCH",
		);
		await edit.getByRole("button", { name: "Save changes", exact: true }).click();
		const patchResponse = await patched;
		expect(patchResponse.status()).toBe(200);
		const patchedBody = patchResponse.request().postDataJSON() as {
			serverIds: string[];
			workstationIds: string[];
		};
		expect(patchedBody.serverIds).toEqual(["pw-host-alpha"]);
		expect(patchedBody.workstationIds).toEqual([workstationId]);

		await expect(row.getByText("Authorized servers (1)", { exact: true })).toBeVisible();
		await expect(row.getByText("Authorized workstations (1)", { exact: true })).toBeVisible();
		const mixedKey = await revealKey(page, name);
		expect(await bearerServers(page, mixedKey)).toEqual(["pw-host-alpha"]);
		const mixed = await bearerWorkstations(page, mixedKey);
		expect(mixed.workstationIds).toEqual([workstationId]);
		expect(mixed.data.map((entry) => entry.id)).toEqual([workstationId]);

		await page.getByRole("button", { name: `Revoke ${name}`, exact: true }).click();
		const revoke = page.getByRole("dialog");
		await revoke.getByLabel(`Type ${name} to confirm`, { exact: true }).fill(name);
		await revoke.getByRole("button", { name: "Revoke token", exact: true }).click();
		await expect(revoke).toBeHidden();
		await expect(row.getByText("Revoked", { exact: true })).toBeVisible();
	});
});
