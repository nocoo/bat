import { expect, test } from "@playwright/test";

const host = "/api/hosts/pw-host-alpha";
const detail = "/hosts/f0d3fd30";

test("populated process table stays within mobile layout and preserves sorting", async ({
	page,
}) => {
	const process = {
		pid: 1,
		name: "small",
		cmd: "small --foreground",
		user: "root",
		state: "S",
		cpu_pct: 10,
		mem_rss: 1024,
		mem_pct: 1,
		mem_virt: 2048,
		num_threads: 2,
		uptime: 60,
		io_read_rate: 0,
		io_write_rate: 0,
	};
	await page.route("**/api/hosts/f0d3fd30", async (route) => {
		const response = await route.fetch();
		const data = await response.json();
		await route.fulfill({
			response,
			json: {
				...data,
				top_processes_json: JSON.stringify([
					process,
					{ ...process, pid: 2, name: "large", cpu_pct: 20, mem_rss: 2048 },
				]),
			},
		});
	});
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(detail);
	const table = page.getByRole("table");
	await expect(table.getByRole("row")).toHaveCount(3);
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
		.toBe(true);
	const memory = table.getByRole("columnheader", { name: /Memory/ });
	await memory.getByRole("button").click();
	await expect(memory).toHaveAttribute("aria-sort", "descending");
	await expect(table.getByRole("row").nth(1)).toContainText("large");
	await memory.getByRole("button").click();
	await expect(memory).toHaveAttribute("aria-sort", "ascending");
	await expect(table.getByRole("row").nth(1)).toContainText("small");
	await page.getByRole("textbox", { name: "Filter processes" }).fill("large");
	await expect(table.getByRole("row")).toHaveCount(2);
	await expect(table.getByRole("row").nth(1)).toContainText("large");
});

test("description editor validates, cancels and persists without duplicate saves", async ({
	page,
}) => {
	const initial = await (await page.request.get(host)).json();
	let saves = 0;
	page.on("request", (request) => {
		if (request.url().endsWith("/description") && request.method() === "PATCH") saves++;
	});
	try {
		await page.goto(detail);
		const header = page.getByTestId("host-detail-header");
		await expect(
			header.getByText("Real-time metrics, system specifications, and services."),
		).toHaveCount(0);
		const editor = header.getByRole("group", { name: "Host description", exact: true });
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
		expect(saves).toBe(1);
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

test("maintenance input typed before the saved window loads is kept", async ({ page }) => {
	const path = `${host}/maintenance`;
	const initial = await (await page.request.get(path)).json();
	if (initial) expect((await page.request.delete(path)).ok()).toBe(true);
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	let requested!: () => void;
	const loading = new Promise<void>((resolve) => {
		requested = resolve;
	});
	await page.route("**/api/hosts/pw-host-alpha/maintenance", async (route) => {
		if (route.request().method() !== "GET") return route.fallback();
		requested();
		await held;
		await route.fallback();
	});
	try {
		await page.goto(detail);
		await loading;
		await page.getByLabel("Start", { exact: true }).fill("02:00");
		const loaded = page.waitForResponse(
			(response) =>
				response.url().endsWith("/api/hosts/pw-host-alpha/maintenance") &&
				response.request().method() === "GET",
		);
		release();
		await loaded;
		await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
		await expect(page.getByLabel("Start", { exact: true })).toHaveValue("02:00");
	} finally {
		release();
		await page.unrouteAll({ behavior: "wait" });
		if (initial) expect((await page.request.put(path, { data: initial })).ok()).toBe(true);
	}
});

test("tag picker creates, attaches and removes using standard keyboard controls", async ({
	page,
}) => {
	const name = "pw-control-tag";
	let id: number | undefined;
	try {
		await page.goto(detail);
		await page
			.getByTestId("host-detail-header")
			.getByRole("button", { name: "Host tags", exact: true })
			.click();
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
