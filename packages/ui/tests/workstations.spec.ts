import { expect, test } from "@playwright/test";

test.use({ trace: "off", screenshot: "off", video: "off" });

const fieldLaptop = "11111111-1111-4111-8111-111111111111";
const studioDesktop = "22222222-2222-4222-8222-222222222222";
const retiredLaptop = "33333333-3333-4333-8333-333333333333";
const newLaptop = "44444444-4444-4444-8444-444444444444";

function consentQuery(callback: string, name = "Field laptop"): string {
	const params = new URLSearchParams({
		installation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
		code_challenge: "C".repeat(43),
		code_challenge_method: "S256",
		state: "state-0123456789abcdef",
		callback,
		hostname: "field-laptop",
		name,
	});
	return params.toString();
}

test.describe("Workstations list", () => {
	test("sidebar navigation opens a populated compact table with honest states", async ({
		page,
	}) => {
		await page.goto("/hosts");
		await page.getByRole("link", { name: "Workstations", exact: true }).first().click();
		await expect(page).toHaveURL("/workstations");
		await expect(page.getByRole("heading", { name: "Workstations", exact: true })).toBeVisible();

		const table = page.getByRole("table", { name: "Workstations", exact: true });
		await expect(table).toBeVisible();
		for (const name of ["Field laptop", "Studio desktop", "Retired laptop", "New laptop"]) {
			await expect(table.getByRole("row").filter({ hasText: name })).toHaveCount(1);
		}

		const field = table.getByRole("row").filter({ hasText: "Field laptop" });
		await expect(field.getByText("Recent", { exact: true })).toBeVisible();
		await expect(field.getByText("macOS 15.5", { exact: true })).toBeVisible();
		await expect(field.getByText("203.0.113.24", { exact: true })).toBeVisible();

		const stale = table.getByRole("row").filter({ hasText: "Studio desktop" });
		await expect(stale.getByText("Stale", { exact: true })).toBeVisible();

		const disabled = table.getByRole("row").filter({ hasText: "Retired laptop" });
		await expect(disabled.getByText("Disabled", { exact: true })).toBeVisible();

		const empty = table.getByRole("row").filter({ hasText: "New laptop" });
		await expect(empty.getByText("Not observed", { exact: true })).toBeVisible();
		await expect(empty.getByText("Never", { exact: true })).toBeVisible();
		await expect(empty.getByText("—", { exact: true }).first()).toBeVisible();

		await expect(
			page.getByText("Stale means no report for more than 30 minutes", { exact: false }),
		).toBeVisible();
		await expect(page.getByRole("alert")).toHaveCount(0);
	});

	test("the pair dialog approves a headless code and reports the machine", async ({ page }) => {
		let body: unknown;
		let management = "";
		await page.route("**/api/workstations/pair", async (route) => {
			body = route.request().postDataJSON();
			management = route.request().headers()["x-bat-management"] ?? "";
			await route.fulfill({
				json: { ok: true, name: "Headless laptop", installation_id: fieldLaptop },
			});
		});
		await page.goto("/workstations");
		await page.getByRole("button", { name: "Pair", exact: true }).click();
		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("Pairing code").fill("abcd-2345");
		await dialog.getByRole("button", { name: "Approve", exact: true }).click();
		await expect(dialog.getByText("Approved Headless laptop")).toBeVisible();
		expect(body).toEqual({ pairing_code: "ABCD-2345" });
		expect(management).toBe("1");
	});

	test("a rejected pairing code explains why", async ({ page }) => {
		await page.route("**/api/workstations/pair", (route) =>
			route.fulfill({ status: 410, json: { error: "expired" } }),
		);
		await page.goto("/workstations");
		await page.getByRole("button", { name: "Pair", exact: true }).click();
		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("Pairing code").fill("ABCD-2345");
		await dialog.getByRole("button", { name: "Approve", exact: true }).click();
		await expect(dialog.getByRole("alert")).toContainText("expired");
	});

	test("the detail header renames a workstation through the management route", async ({ page }) => {
		let body: unknown;
		await page.route(`**/api/workstations/${fieldLaptop}`, async (route) => {
			if (route.request().method() !== "PATCH") {
				await route.continue();
				return;
			}
			body = route.request().postDataJSON();
			await route.fulfill({ json: { id: fieldLaptop, name: "Desk laptop" } });
		});
		await page.goto(`/workstations/${fieldLaptop}`);
		await page.getByRole("button", { name: "Rename Field laptop", exact: true }).click();
		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("Workstation name").fill("Desk laptop");
		await dialog.getByRole("button", { name: "Save name", exact: true }).click();
		await expect(page.getByRole("dialog")).toBeHidden();
		expect(body).toEqual({ name: "Desk laptop" });
	});

	test("the CLI setup dialog walks through enrollment with copyable commands", async ({ page }) => {
		await page.goto("/workstations");
		await page.getByRole("button", { name: "CLI setup", exact: true }).click();
		const dialog = page.getByRole("dialog");
		await expect(dialog.getByRole("heading", { name: "Add a workstation" })).toBeVisible();

		for (const command of [
			"npm install --global @nocoo/bat",
			"bat workstation login",
			"bat workstation probe",
			"bat workstation setup",
			"bat workstation setup --backend cron",
			"bat workstation status",
			"bat workstation setup --remove",
			"bat workstation logout",
		]) {
			await expect(dialog.getByText(command, { exact: true })).toBeVisible();
		}
		await expect(dialog.getByRole("button", { name: "Copy code", exact: true })).toHaveCount(8);
		await expect(dialog.getByText("/usr/sbin/cron", { exact: true })).toBeVisible();

		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden();
	});

	test("a failed list request shows the honest error and retry action", async ({ page }) => {
		await page.route("**/api/workstations", (route) =>
			route.fulfill({ status: 500, json: { error: "fixture outage" } }),
		);
		await page.goto("/workstations");
		await expect(page.getByText("Could not load workstations.", { exact: true })).toBeVisible();
		await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
	});

	test("breadcrumb resolves the workstation name and returns to the list", async ({ page }) => {
		await page.goto(`/workstations/${fieldLaptop}`);
		const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb", exact: true });
		await expect(breadcrumb).toContainText("Workstations");
		await expect(breadcrumb).toContainText("Field laptop");
		await breadcrumb.getByRole("link", { name: "Workstations", exact: true }).click();
		await expect(page).toHaveURL("/workstations");
	});
});

test.describe("Workstation detail", () => {
	test("identity, copyable address, vitals, machine facts and target rows", async ({ page }) => {
		await page.addInitScript(() => {
			Object.defineProperty(navigator, "clipboard", {
				configurable: true,
				value: { writeText: async () => undefined },
			});
		});
		await page.goto(`/workstations/${fieldLaptop}`);

		await expect(page.getByRole("heading", { name: "Field laptop", exact: true })).toBeVisible();
		await expect(page.getByTestId("workstation-public-ip")).toHaveText("203.0.113.24");
		await page.getByRole("button", { name: /Copy public address 203\.0\.113\.24/ }).click();
		await expect(page.getByRole("button", { name: /Copy public address/ })).toContainText("Copied");

		const detail = page.getByTestId("workstation-detail");
		await expect(detail.getByText("CPU", { exact: true }).first()).toBeVisible();
		await expect(detail.getByText("24.6%", { exact: true }).first()).toBeVisible();
		await expect(detail.getByText("Reachable", { exact: true }).first()).toBeVisible();
		await expect(detail.getByText("RTT p95", { exact: true })).toBeVisible();
		await expect(detail.getByText("10d 0h", { exact: true }).first()).toBeVisible();

		await expect(detail.getByText("field-laptop", { exact: true })).toBeVisible();
		await expect(detail.getByText("macOS 15.5 · aarch64", { exact: true })).toBeVisible();
		await expect(detail.getByText("Apple M3 Pro · 12 threads", { exact: true })).toBeVisible();
		await expect(detail.getByText("email:operator@example.test", { exact: true })).toBeVisible();
		await expect(detail.getByText("en0", { exact: true })).toBeVisible();
		await expect(detail.getByText("192.168.1.24", { exact: true })).toBeVisible();

		const targets = page.getByRole("table", { name: "Reachability targets", exact: true });
		const alpha = targets.getByRole("row").filter({ hasText: "alpha.test.local" });
		await expect(
			alpha.getByRole("link", { name: "alpha.test.local", exact: true }),
		).toHaveAttribute("href", "/hosts/f0d3fd30");
		await expect(alpha).toContainText("203.0.113.10");
		await expect(alpha).toContainText("Reachable");
		await expect(alpha).toContainText("0.4 ms");
		await expect(alpha).toContainText("0%");
		const beta = targets.getByRole("row").filter({ hasText: "beta.test.local" });
		await expect(beta).toContainText("Partial");
		await expect(beta).toContainText("33.3%");

		await expect(detail.getByTestId("workstation-report-errors")).toContainText(
			"statfs(/Volumes/Archive) permission denied",
		);
		await expect(
			page.getByText(
				"Unreachable or timeout is a reachability result, not an application-health verdict.",
			),
		).toBeVisible();
	});

	test("the window selector refetches the metrics range", async ({ page }) => {
		const ranges: string[] = [];
		await page.route("**/api/workstations/*/metrics?*", async (route) => {
			ranges.push(new URL(route.request().url()).search);
			await route.continue();
		});
		await page.goto(`/workstations/${fieldLaptop}`);
		const window = page.getByRole("radiogroup", { name: "History window", exact: true });
		await expect(window.getByRole("radio", { name: "24h", exact: true })).toBeChecked();
		await expect(page.getByTestId("workstation-detail")).toContainText("24 hours");

		await window.getByRole("radio", { name: "6h", exact: true }).click();
		await expect(window.getByRole("radio", { name: "6h", exact: true })).toBeChecked();
		await expect(page.getByTestId("workstation-detail")).toContainText("6 hours");
		await expect.poll(() => ranges.some((search) => /to=\d+/.test(search))).toBe(true);
	});

	test("selecting a target on the legend focuses it and exposes its loss axis", async ({
		page,
	}) => {
		await page.goto(`/workstations/${fieldLaptop}`);
		const legend = page.getByRole("list", { name: "Reachability targets", exact: true });
		const beta = legend.getByRole("button", { name: /beta\.test\.local/ });
		await expect(beta).toHaveAttribute("aria-pressed", "false");
		await beta.click();
		await expect(beta).toHaveAttribute("aria-pressed", "true");
		await expect(page.getByText("beta.test.local loss", { exact: false })).toHaveCount(0);
		const alpha = legend.getByRole("button", { name: /alpha\.test\.local/ });
		await alpha.click();
		await expect(alpha).toHaveAttribute("aria-pressed", "true");
		await expect(beta).toHaveAttribute("aria-pressed", "false");
	});

	test("the foreground detail snapshot refreshes public IP, connectivity and state", async ({
		page,
	}) => {
		const id = "55555555-5555-4555-8555-555555555555";
		const base = Math.floor(Date.now() / 1000);
		let calls = 0;
		const record = (fresh: boolean) => ({
			id,
			owner: "email:operator@example.test",
			name: "Live laptop",
			created_at: base - 86_400,
			last_seen_at: fresh ? base + 61 : base - 3_600,
			public_ip: fresh ? "203.0.113.201" : "203.0.113.200",
			disabled: false,
			latest_report: {
				report_id: fresh
					? "00000000-0000-4000-8000-000000000602"
					: "00000000-0000-4000-8000-000000000601",
				started_at: base - 8,
				finished_at: base - 7,
				sample_window_ms: 1_000,
				cli_version: "2.4.2",
				hostname: "live-laptop",
				os: "macOS 15.5",
				arch: "aarch64",
				uptime_seconds: 3_600,
				cpu: { model: "Apple M3", count: 12, usage_pct: 20 },
				mem: { total_bytes: 100, available_bytes: 50, used_pct: 50 },
				disk: [{ mount: "/", total_bytes: 100, available_bytes: 40, used_pct: 60 }],
				network: { interfaces: [] },
				connectivity: [
					{
						server_id: "pw-host-alpha",
						address: "203.0.113.10",
						family: 4,
						sent: 3,
						received: fresh ? 3 : 0,
						rtts_ms: fresh ? [0, 0.4, 0.7] : [null, null, null],
						status: fresh ? "reachable" : "timeout",
					},
				],
				collection_errors: [],
				targets_error: null,
				received_at: fresh ? base + 61 : base - 3_590,
			},
		});
		await page.clock.install();
		await page.route(`**/api/workstations/${id}`, (route) => {
			calls += 1;
			return route.fulfill({ json: record(calls > 1) });
		});
		await page.goto(`/workstations/${id}`);
		await expect(page.getByTestId("workstation-public-ip")).toHaveText("203.0.113.200");
		await expect(page.getByTestId("workstation-status")).toHaveAttribute("data-status", "stale");
		const targets = page.getByRole("table", { name: "Reachability targets", exact: true });
		const alpha = targets.getByRole("row").filter({ hasText: "alpha.test.local" });
		await expect(alpha).toContainText("Timeout");

		await page.clock.runFor(61_000);
		await expect(page.getByTestId("workstation-public-ip")).toHaveText("203.0.113.201");
		await expect(page.getByTestId("workstation-status")).toHaveAttribute("data-status", "recent");
		await expect(alpha).toContainText("Reachable");
		expect(calls).toBeGreaterThanOrEqual(2);
	});

	test("the topology draws one hub for every target and mirrors the legend focus", async ({
		page,
	}) => {
		await page.goto(`/workstations/${fieldLaptop}`);
		const graph = page.locator(".basalt-topology");
		await expect(graph).toBeVisible();
		await expect(graph.locator(".react-flow__node")).toHaveCount(3);
		await expect(graph.locator(".react-flow__edge")).toHaveCount(2);
		await expect(graph.getByText("Field laptop", { exact: true })).toBeVisible();
		await expect(graph.getByText("beta.test.local", { exact: true })).toBeVisible();

		await graph.getByText("beta.test.local", { exact: true }).click();
		const legend = page.getByRole("list", { name: "Reachability targets", exact: true });
		await expect(legend.getByRole("button", { name: /beta\.test\.local/ })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expect(
			page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
		).resolves.toBe(true);
	});

	test("stale and ICMP failures stay informational and honest", async ({ page }) => {
		await page.goto(`/workstations/${studioDesktop}`);
		await expect(page.getByRole("heading", { name: "Studio desktop", exact: true })).toBeVisible();
		await expect(page.getByTestId("workstation-status")).toHaveAttribute("data-status", "stale");
		await expect(page.getByTestId("workstation-status")).toHaveAttribute(
			"title",
			/no report for more than 30 minutes/i,
		);

		const targets = page.getByRole("table", { name: "Reachability targets", exact: true });
		const alpha = targets.getByRole("row").filter({ hasText: "alpha.test.local" });
		await expect(alpha).toContainText("Unreachable");
		const beta = targets.getByRole("row").filter({ hasText: "beta.test.local" });
		await expect(beta).toContainText("Local error");
		// A local collector failure is not a network observation: packet loss stays empty.
		await expect(beta.getByRole("cell").nth(5)).toHaveText("—");
		await expect(page.getByTestId("workstation-report-errors")).toContainText(
			"target discovery failed: connect token expired",
		);
		await expect(page.getByTestId("workstation-report-errors")).toContainText(
			"ping: local resolver failure",
		);
		await expect(page.getByRole("alert")).toHaveCount(0);
	});

	test("a workstation without a report never fabricates capacity", async ({ page }) => {
		await page.goto(`/workstations/${newLaptop}`);
		await expect(page.getByRole("heading", { name: "New laptop", exact: true })).toBeVisible();
		await expect(page.getByTestId("workstation-public-ip")).toHaveText("No public IP observed");
		const detail = page.getByTestId("workstation-detail");
		await expect(detail.getByText("No report yet", { exact: true }).first()).toBeVisible();
		await expect(
			detail.getByText("No connectivity targets in the latest report.", { exact: true }).first(),
		).toBeVisible();
		await expect(
			detail.getByText("No interface addresses reported.", { exact: true }),
		).toBeVisible();
		await expect(detail.getByText("RTT p95", { exact: true })).toBeVisible();
		await expect(detail.getByText("—", { exact: true }).first()).toBeVisible();
		await expect(detail.getByText("0%", { exact: true })).toHaveCount(0);
	});

	test("unknown workstations render a not-found state", async ({ page }) => {
		await page.goto("/workstations/does-not-exist");
		await expect(
			page.getByRole("heading", { name: "Workstation not found", exact: true }),
		).toBeVisible();
		await page.getByRole("link", { name: "Back to workstations", exact: true }).click();
		await expect(page).toHaveURL("/workstations");
	});

	test("mobile keyboard navigation opens the drawer and focuses a target", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/workstations");
		const menu = page.getByRole("button", { name: "Open navigation menu", exact: true });
		await menu.focus();
		await page.keyboard.press("Enter");
		const drawer = page.getByRole("dialog");
		await expect(drawer).toBeVisible();
		await drawer.getByRole("link", { name: "Workstations", exact: true }).click();
		await expect(page).toHaveURL("/workstations");
		await expect(drawer).toBeHidden();
		await page.getByRole("link", { name: "Field laptop", exact: true }).click();

		const legend = page.getByRole("list", { name: "Reachability targets", exact: true });
		const beta = legend.getByRole("button", { name: /beta\.test\.local/ });
		await beta.focus();
		await page.keyboard.press("Enter");
		await expect(beta).toHaveAttribute("aria-pressed", "true");
		await expect(
			page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
		).resolves.toBe(true);
	});
});

test.describe("Workstation consent", () => {
	test("rejects a missing or malformed request without offering approval", async ({ page }) => {
		let posts = 0;
		await page.route("**/api/workstation-auth/authorize", async (route) => {
			posts += 1;
			await route.continue();
		});
		await page.goto("/workstation-login");
		await expect(
			page.getByRole("heading", { name: "Authorization request rejected" }),
		).toBeVisible();
		await expect(page.getByRole("alert")).toContainText("Missing required installation_id");
		await expect(
			page.getByRole("button", { name: "Approve workstation", exact: true }),
		).toHaveCount(0);

		const origin = new URL(process.env.BAT_E2E_BASE as string);
		await page.goto(`/workstation-login?${consentQuery("https://evil.example/callback")}`);
		await expect(page.getByRole("alert")).toContainText(
			"callback must be a loopback http or https URL at exactly /callback.",
		);
		await expect(
			page.getByRole("button", { name: "Approve workstation", exact: true }),
		).toHaveCount(0);
		expect(origin.hostname).toBe("127.0.0.1");
		expect(posts).toBe(0);
	});

	test("consent posts a same-origin management request and returns code plus state only", async ({
		page,
	}) => {
		const origin = new URL(process.env.BAT_E2E_BASE as string).origin;
		const callback = `${origin}/callback`;
		const requests: { headers: Record<string, string>; body: string }[] = [];
		await page.route("**/api/workstation-auth/authorize", async (route) => {
			requests.push({
				headers: route.request().headers(),
				body: route.request().postData() ?? "",
			});
			await route.continue();
		});
		await page.route(/\/callback\?/, (route) =>
			route.fulfill({ status: 200, contentType: "text/html", body: "<html>callback</html>" }),
		);

		await page.goto(`/workstation-login?${consentQuery(callback)}`);
		await expect(page.getByTestId("workstation-machine-name")).toHaveText("field-laptop");
		await expect(page.getByText(/The browser receives a one-time code/)).toBeVisible();
		await expect(
			page.getByText("Shell, process list, files, credentials and remote commands."),
		).toBeVisible();
		await page.getByLabel("Workstation display name").fill("Field laptop");
		await page.getByRole("button", { name: "Approve workstation", exact: true }).click();
		await page.waitForURL(/\/callback\?/);
		const url = new URL(page.url());
		expect(url.pathname).toBe("/callback");
		expect(url.searchParams.get("state")).toBe("state-0123456789abcdef");
		expect(url.searchParams.get("code")).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect([...url.searchParams.keys()].sort()).toEqual(["code", "state"]);

		expect(requests).toHaveLength(1);
		expect(requests[0]?.headers["x-bat-management"]).toBe("1");
		expect(requests[0]?.headers.origin).toBe(origin);
		const body = JSON.parse(requests[0]?.body ?? "{}");
		expect(body).toMatchObject({
			installation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			code_challenge_method: "S256",
			state: "state-0123456789abcdef",
			callback,
			name: "Field laptop",
		});
		const storage = await page.evaluate(() => ({ ...localStorage }));
		for (const key of Object.keys(storage)) {
			expect(key).not.toMatch(/code|challenge|state|callback|token/i);
		}
	});

	test("a malicious returned redirect is refused without navigating or storing the code", async ({
		page,
	}) => {
		const origin = new URL(process.env.BAT_E2E_BASE as string).origin;
		const callback = `${origin}/callback`;
		await page.route("**/api/workstation-auth/authorize", (route) =>
			route.fulfill({
				status: 201,
				contentType: "application/json",
				body: JSON.stringify({
					redirect_url: `https://evil.example/callback?code=${"D".repeat(43)}&state=state-0123456789abcdef`,
				}),
			}),
		);
		await page.goto(`/workstation-login?${consentQuery(callback)}`);
		await page.getByRole("button", { name: "Approve workstation", exact: true }).click();
		await expect(page.getByRole("alert")).toContainText(
			"The authorization response did not return to the requested loopback callback.",
		);
		await expect(page).toHaveURL(/\/workstation-login\?/);
		await expect(page.getByTestId("workstation-machine-name")).toBeVisible();
	});

	test("the display name field submits on Enter and stays inert while empty", async ({ page }) => {
		const origin = new URL(process.env.BAT_E2E_BASE as string).origin;
		const callback = `${origin}/callback`;
		let posts = 0;
		await page.route("**/api/workstation-auth/authorize", async (route) => {
			posts += 1;
			await route.continue();
		});
		await page.route(/\/callback\?/, (route) =>
			route.fulfill({ status: 200, contentType: "text/html", body: "<html>callback</html>" }),
		);
		await page.goto(`/workstation-login?${consentQuery(callback)}`);
		const field = page.getByLabel("Workstation display name");
		await field.fill("   ");
		await field.press("Enter");
		await expect(page.getByTestId("workstation-machine-name")).toBeVisible();
		expect(posts).toBe(0);
		await field.fill("Field laptop");
		await field.press("Enter");
		await page.waitForURL(/\/callback\?/);
		expect(posts).toBe(1);
	});

	test("cancel never posts an authorization request", async ({ page }) => {
		let posts = 0;
		await page.route("**/api/workstation-auth/authorize", async (route) => {
			posts += 1;
			await route.continue();
		});
		const origin = new URL(process.env.BAT_E2E_BASE as string).origin;
		await page.goto(`/workstation-login?${consentQuery(`${origin}/callback`)}`);
		await page.getByRole("button", { name: "Cancel", exact: true }).click();
		await expect(page.getByRole("heading", { name: "Authorization cancelled" })).toBeVisible();
		expect(posts).toBe(0);
	});
});

test.describe("Workstation revocation", () => {
	test("the destructive confirmation deletes only the named workstation", async ({ page }) => {
		await page.goto(`/workstations/${retiredLaptop}`);
		await expect(page.getByRole("heading", { name: "Retired laptop", exact: true })).toBeVisible();
		await page.getByRole("button", { name: "Delete workstation", exact: true }).click();
		const dialog = page.getByRole("alertdialog");
		await expect(dialog).toContainText("This permanently deletes");
		await dialog.getByRole("button", { name: "Continue to confirmation", exact: true }).click();
		await dialog.getByLabel("Type the exact workstation name to confirm").fill("Retired laptop");
		await dialog
			.getByRole("button", { name: "Permanently delete workstation", exact: true })
			.click();
		await expect(page).toHaveURL("/workstations");
		const table = page.getByRole("table", { name: "Workstations", exact: true });
		await expect(table.getByRole("row").filter({ hasText: "Retired laptop" })).toHaveCount(0);
		await expect(table.getByRole("row").filter({ hasText: "Field laptop" })).toHaveCount(1);
	});
});
