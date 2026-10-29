import { hashHostId } from "@bat/shared";
import { expect, type Page, type Request, test } from "@playwright/test";

const hostId = "pw-host-alpha";
const hid = "f0d3fd30";
const detail = `/hosts/${hid}`;

test.afterEach(async ({ page }) => {
	await page.unrouteAll({ behavior: "wait" });
});

async function deletionScenario(page: Page, recent = true, failures = 0) {
	let deleted = false;
	const requests: Request[] = [];
	const lastSeen = Math.floor(Date.now() / 1000) - (recent ? 15 : 3600);
	await page.route("**/api/hosts", async (route) => {
		const response = await route.fetch();
		const hosts = await response.json();
		await route.fulfill({
			response,
			json: hosts
				.filter((host: { host_id: string }) => !deleted || host.host_id !== hostId)
				.map((host: { host_id: string }) =>
					host.host_id === hostId ? { ...host, last_seen: lastSeen } : host,
				),
		});
	});
	await page.route("**/api/hosts/*", async (route) => {
		if (route.request().method() === "DELETE") {
			requests.push(route.request());
			if (requests.length <= failures) {
				await route.fulfill({ status: 503, json: { error: "Unavailable" } });
				return;
			}
			deleted = true;
			await route.fulfill({ json: { ok: true } });
			return;
		}
		if (deleted) {
			await route.fulfill({ status: 404, json: { error: "Host not found" } });
			return;
		}
		const response = await route.fetch();
		await route.fulfill({ response, json: { ...(await response.json()), last_seen: lastSeen } });
	});
	return requests;
}

test("first confirmation warns about recent uploads and cancel restores focus without deleting", async ({
	page,
}) => {
	const requests = await deletionScenario(page);
	await page.goto(detail);
	const trigger = page.getByRole("button", { name: "Delete host", exact: true });
	await trigger.click();
	const dialog = page.getByRole("alertdialog");
	await expect(dialog).toContainText("Step 1 of 2");
	await expect(dialog.getByRole("alert")).toContainText("probe may still be uploading");
	await expect(dialog.getByRole("alert")).toContainText("Stop or uninstall the probe first");
	await expect(dialog).toContainText("even after restarting or reinstalling the probe");
	await expect(dialog).toContainText("Deleted history and old grants are never restored");
	await expect(dialog).toContainText(
		"Webhook credentials and host-assigned agents/assets are also deleted",
	);
	await expect(dialog).toContainText("bindings to other hosts");
	await expect(dialog).toContainText("Shared tags and the immutable security audit are retained");
	await expect(dialog.getByRole("textbox")).toHaveCount(0);
	await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
	await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
	await expect(dialog).not.toBeVisible();
	await expect(trigger).toBeFocused();
	expect(requests).toHaveLength(0);
});

test("exact raw ID and both confirmations are required; success removes list and detail data", async ({
	page,
}) => {
	const requests = await deletionScenario(page);
	await page.goto(detail);
	await page.getByRole("button", { name: "Delete host", exact: true }).click();
	const dialog = page.getByRole("alertdialog");
	await dialog.getByRole("button", { name: "Continue to confirmation", exact: true }).click();
	await expect(dialog).toContainText("Step 2 of 2");
	const input = dialog.getByRole("textbox", { name: "Type the exact host ID to confirm" });
	const remove = dialog.getByRole("button", { name: "Permanently delete host", exact: true });
	await expect(remove).toBeDisabled();
	for (const value of [hid, hostId.toUpperCase(), `${hostId} `, ` ${hostId}`]) {
		await input.fill(value);
		await expect(remove).toBeDisabled();
	}
	expect(requests).toHaveLength(0);
	await input.fill(hostId);
	await expect(remove).toBeEnabled();
	await remove.click();
	await expect(page).toHaveURL("/hosts");
	await expect(page.getByTestId("host-card").filter({ hasText: "alpha.test.local" })).toHaveCount(
		0,
	);
	expect(requests).toHaveLength(1);
	expect(requests[0]?.url()).toContain(`/api/hosts/${hid}`);
	expect(requests[0]?.postDataJSON()).toEqual({ confirm_host_id: hostId });
	const headers = await requests[0]?.allHeaders();
	expect(headers?.["x-bat-management"]).toBe("1");
	expect(headers?.["content-type"]).toBe("application/json");
	expect(headers?.origin).toBe(new URL(page.url()).origin);
	await page.goto(detail);
	await expect(page.getByRole("heading", { name: "Host not found", exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Delete host", exact: true })).toHaveCount(0);
});

test("a failed delete stays in confirmation, preserves the host and allows a deliberate retry", async ({
	page,
}) => {
	const requests = await deletionScenario(page, false, 1);
	await page.goto(detail);
	await page.getByRole("button", { name: "Delete host", exact: true }).click();
	const dialog = page.getByRole("alertdialog");
	await expect(dialog.getByRole("alert")).toHaveCount(0);
	await expect(dialog).toContainText("Uploads remain blocked");
	await dialog.getByRole("button", { name: "Continue to confirmation", exact: true }).click();
	await dialog.getByRole("textbox").fill(hostId);
	await dialog.getByRole("button", { name: "Permanently delete host", exact: true }).click();
	await expect(dialog.getByRole("alert")).toContainText("Could not confirm deletion");
	await expect(page).toHaveURL(detail);
	await expect(dialog.getByRole("textbox")).toHaveValue(hostId);
	await dialog.getByRole("button", { name: "Permanently delete host", exact: true }).click();
	await expect(page).toHaveURL("/hosts");
	expect(requests).toHaveLength(2);
});

test("cancel and Escape reset typed confirmation on mobile without horizontal overflow", async ({
	page,
}) => {
	const requests = await deletionScenario(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(detail);
	const trigger = page.getByRole("button", { name: "Delete host", exact: true });
	await trigger.click();
	const dialog = page.getByRole("alertdialog");
	await dialog.getByRole("button", { name: "Continue to confirmation", exact: true }).click();
	await dialog.getByRole("textbox").fill(hostId);
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
		.toBe(true);
	await page.keyboard.press("Escape");
	await expect(dialog).not.toBeVisible();
	await expect(trigger).toBeFocused();
	await trigger.click();
	await expect(dialog).toContainText("Step 1 of 2");
	await dialog.getByRole("button", { name: "Continue to confirmation", exact: true }).click();
	await expect(dialog.getByRole("textbox")).toHaveValue("");
	await expect(
		dialog.getByRole("button", { name: "Permanently delete host", exact: true }),
	).toBeDisabled();
	expect(requests).toHaveLength(0);
});

test("description and working tag controls remain in the header without metrics", async ({
	page,
}) => {
	await page.route("**/api/hosts/*/metrics?*", (route) => route.fulfill({ status: 503, json: {} }));
	await page.goto(detail);
	const header = page.getByTestId("host-detail-header");
	await expect(header.getByRole("group", { name: "Host description", exact: true })).toBeVisible();
	await header.getByRole("button", { name: "Host tags", exact: true }).click();
	await expect(page.getByRole("combobox", { name: "Host tags: search" })).toBeVisible();
	await expect(header.getByRole("button", { name: "Delete host", exact: true })).toBeVisible();
});

test("real browser deletion blocks probe identity until explicit browser re-registration", async ({
	page,
}) => {
	const worker = process.env.BAT_E2E_WORKER;
	const writeKey = process.env.BAT_E2E_WRITE_KEY;
	if (!worker || !writeKey) throw new Error("An isolated E2E Worker and write key are required");
	const workerUrl = new URL(worker);
	expect(workerUrl.hostname).toBe("127.0.0.1");
	expect(workerUrl.port).not.toBe("7025");
	const id = `pw-delete-${Date.now()}`;
	const hostname = `${id}.test.local`;
	const identity = {
		host_id: id,
		hostname,
		os: "Test Linux",
		kernel: "6.8",
		arch: "x86_64",
		cpu_model: "Test CPU",
		uptime_seconds: 60,
		boot_time: Math.floor(Date.now() / 1000) - 60,
	};
	const ingest = () =>
		page.request.post(`${worker}/api/identity`, {
			headers: { Authorization: `Bearer ${writeKey}` },
			data: identity,
		});
	const management = (method: "DELETE" | "POST", suffix = "") =>
		page.evaluate(
			async ({ method, suffix, id }) => {
				const response = await fetch(`/api/hosts/${encodeURIComponent(id)}${suffix}`, {
					method,
					headers: { "Content-Type": "application/json", "X-Bat-Management": "1" },
					body: JSON.stringify({ confirm_host_id: id }),
				});
				return response.status;
			},
			{ method, suffix, id },
		);
	try {
		expect((await ingest()).status()).toBe(204);
		expect(
			(
				await page.request.patch(`/api/hosts/${id}/description`, {
					data: { description: "Delete acceptance fixture" },
				})
			).ok(),
		).toBe(true);
		await page.goto(`/hosts/${hashHostId(id)}`);
		await expect(page.getByRole("group", { name: "Host description", exact: true })).toContainText(
			"Delete acceptance fixture",
		);
		await page.getByRole("button", { name: "Delete host", exact: true }).click();
		const dialog = page.getByRole("alertdialog");
		await expect(dialog.getByRole("alert")).toContainText("probe may still be uploading");
		await dialog.getByRole("button", { name: "Continue to confirmation", exact: true }).click();
		await dialog.getByRole("textbox").fill(id);
		const deletion = page.waitForResponse(
			(response) =>
				response.request().method() === "DELETE" &&
				response.url().endsWith(`/api/hosts/${hashHostId(id)}`),
		);
		await dialog.getByRole("button", { name: "Permanently delete host", exact: true }).click();
		expect((await deletion).status()).toBe(200);
		await expect(page).toHaveURL("/hosts");
		await expect(page.getByTestId("host-card").filter({ hasText: hostname })).toHaveCount(0);
		expect((await page.request.get(`/api/hosts/${id}`)).status()).toBe(404);
		expect((await ingest()).status()).toBe(403);
		expect(await management("POST", "/register")).toBe(200);
		expect((await page.request.get(`/api/hosts/${id}`)).status()).toBe(404);
		expect((await ingest()).status()).toBe(204);
		expect((await (await page.request.get(`/api/hosts/${id}`)).json()).description).toBeNull();
	} finally {
		await page.goto("/hosts");
		expect([200, 404]).toContain(await management("DELETE"));
		const uploadStatus = (await ingest()).status();
		if (uploadStatus === 204) expect(await management("DELETE")).toBe(200);
		else expect(uploadStatus).toBe(403);
		expect((await ingest()).status()).toBe(403);
	}
});
