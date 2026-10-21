import { expect, test } from "@playwright/test";

const host = "/api/hosts/pw-host-alpha";
const detail = "/hosts/f0d3fd30";

test("description editor validates, cancels and persists without duplicate saves", async ({
	page,
}) => {
	const initial = await (await page.request.get(host)).json();
	try {
		await page.goto(detail);
		const editor = page.getByRole("group", { name: "Host description", exact: true });
		await editor.getByRole("button", { name: "Edit Host description" }).click();
		const input = editor.getByRole("textbox", { name: "Host description" });
		await input.fill("x".repeat(201));
		await input.press("Enter");
		await expect(editor.getByRole("alert")).toContainText("200 characters");
		await input.press("Escape");
		await expect(editor.getByRole("button", { name: "Edit Host description" })).toBeFocused();
		await editor.getByRole("button", { name: "Edit Host description" }).click();
		await input.fill("Standard editor test");
		const saved = page.waitForResponse(
			(response) =>
				response.url().endsWith("/description") && response.request().method() === "PATCH",
		);
		await input.press("Enter");
		expect((await saved).ok()).toBe(true);
		await expect(editor.getByRole("button", { name: "Edit Host description" })).toHaveText(
			/Standard editor test/,
		);
		await page.reload();
		await expect(editor).toContainText("Standard editor test");
	} finally {
		expect(
			(
				await page.request.patch(`${host}/description`, {
					data: { description: initial.description },
				})
			).ok(),
		).toBe(true);
	}
});

test("maintenance fields preserve local time and clear the saved window", async ({ page }) => {
	const path = `${host}/maintenance`;
	const initial = await (await page.request.get(path)).json();
	try {
		await page.goto(detail);
		await page.getByLabel("Start", { exact: true }).fill("02:00");
		await page.getByLabel("End", { exact: true }).fill("03:00");
		await page.getByLabel("Maintenance reason").fill("Controls test");
		await page.getByRole("button", { name: initial ? "Update" : "Save", exact: true }).click();
		await expect(page.getByRole("button", { name: "Update", exact: true })).toBeDisabled();
		await page.reload();
		await expect(page.getByLabel("Start", { exact: true })).toHaveValue("02:00");
		await expect(page.getByLabel("End", { exact: true })).toHaveValue("03:00");
		await expect(page.getByLabel("Maintenance reason")).toHaveValue("Controls test");
		await page.getByRole("button", { name: "Clear", exact: true }).click();
		await expect(page.getByLabel("Start", { exact: true })).toHaveValue("");
	} finally {
		const restored = initial
			? await page.request.put(path, { data: initial })
			: await page.request.delete(path);
		expect(restored.ok()).toBe(true);
	}
});

test("tag picker creates, attaches and removes using standard keyboard controls", async ({
	page,
}) => {
	const name = "pw-control-tag";
	let id: number | undefined;
	try {
		await page.goto(detail);
		await page.getByRole("button", { name: "Host tags", exact: true }).click();
		const search = page.getByRole("combobox", { name: "Host tags: search" });
		await search.fill(name);
		await expect(page.getByRole("option", { name: `Create "${name}"` })).toBeVisible();
		await search.press("Enter");
		const remove = page.getByRole("button", { name: `Remove tag ${name}` });
		await expect(remove).toBeVisible();
		const tags = await (await page.request.get(`${host}/tags`)).json();
		id = tags.find((tag: { name: string }) => tag.name === name)?.id;
		expect(id).toBeDefined();
		await remove.focus();
		await remove.press("Space");
		await expect(remove).not.toBeVisible();
		expect(await (await page.request.get(`${host}/tags`)).json()).not.toContainEqual(
			expect.objectContaining({ id }),
		);
	} finally {
		const tags = await (await page.request.get("/api/tags")).json();
		id ??= tags.find((tag: { name: string }) => tag.name === name)?.id;
		if (id) expect((await page.request.delete(`/api/tags/${id}`)).ok()).toBe(true);
	}
});

test("port input adds and removes an allowlist entry", async ({ page }) => {
	const port = 54321;
	try {
		await page.goto(detail);
		await page.getByLabel("Port", { exact: true }).fill(String(port));
		await page.getByLabel("Port reason", { exact: true }).fill("Controls test");
		await page.getByLabel("Port reason", { exact: true }).press("Enter");
		const remove = page.getByRole("button", { name: `Remove port ${port} from allowlist` });
		await expect(remove).toBeVisible();
		await remove.click();
		await expect(remove).not.toBeVisible();
	} finally {
		await page.request.delete(`${host}/allowed-ports/${port}`);
	}
});
