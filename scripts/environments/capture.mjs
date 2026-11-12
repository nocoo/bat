import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "../../packages/ui/node_modules/@playwright/test/index.mjs";
import { guardBrowserRequest, isProductionUrl } from "./capture-guard.mjs";
import { launch } from "./launcher.mjs";
import { root } from "./runtime.mjs";

const automated = !process.argv.includes("--interactive");
const output = `${root}/artifacts/environments${automated ? "/automated" : ""}`;
mkdirSync(output, { recursive: true });
const app = await launch({ automated, built: true, port: 0, initial: "e2e", dataset: "demo" });
const browser = await chromium.launch();
const workstationId = "00000000-0000-4000-8000-000000000001";
const productionRequests = [];
try {
	const context = await browser.newContext({
		viewport: { width: 1440, height: 1000 },
		locale: "en-US",
		timezoneId: "UTC",
	});
	if (automated)
		await context.addInitScript(() => localStorage.setItem("bat:environment-mode", "prod"));
	await context.route(
		(url) => isProductionUrl(url.href),
		(route) => guardBrowserRequest(route, productionRequests),
	);
	const page = await context.newPage();
	page.setDefaultTimeout(20000);
	page.on("pageerror", (e) => console.error("Browser:", e.message));

	async function workloadSummary() {
		const header = await page
			.getByTestId("host-detail-header")
			.getByRole("heading")
			.first()
			.textContent();
		await page.getByText("Top Processes", { exact: false }).first().waitFor();
		const processes = await page
			.locator("table")
			.first()
			.locator("tbody tr")
			.evaluateAll((rows) => rows.slice(0, 5).map((row) => row.textContent));
		const chart = await page.locator("svg .recharts-area-area").first().getAttribute("d");
		return { header, processes, chart };
	}

	await page.goto(app.base);
	assert.equal(new URL(app.base).hostname, "127.0.0.1");
	await page.getByText("alpha.example.test", { exact: true }).first().waitFor({ timeout: 60000 });
	const current = () =>
		page.evaluate(() =>
			window.__BAT_LOCAL__?.locked
				? window.__BAT_LOCAL__.instance.id
				: sessionStorage.getItem("bat:environment-instance"),
		);
	if (automated) {
		assert.equal(await page.evaluate(() => localStorage.getItem("bat:environment-mode")), "prod");
		const segment = page.getByRole("radio", { name: "Demo", exact: true });
		if (process.env.CI) assert.equal(await segment.count(), 0);
		else assert.equal(await segment.isDisabled(), true);
	}
	const first = await current();
	const runtime = app.instances.get(first).runtime;
	const firstPath = runtime.path;
	await page.clock.setFixedTime(runtime.anchor * 1000);
	await page.waitForTimeout(600);
	await page.screenshot({ path: `${output}/hosts.png`, fullPage: true });
	await page.goto(`${app.base}/hosts/f0d3fd30`);
	await page.getByText("alpha.example.test", { exact: true }).first().waitFor();
	await page.waitForTimeout(600);
	await page.screenshot({ path: `${output}/detail.png`, fullPage: true });
	await page.getByText("Top Processes").first().scrollIntoViewIfNeeded();
	await page.screenshot({ path: `${output}/processes.png` });

	await page.goto(`${app.base}/workstations`);
	await page.getByRole("heading", { name: "Workstations", exact: true }).waitFor();
	await page.getByRole("link", { name: "Demo workstation", exact: true }).waitFor();
	await page.screenshot({ path: `${output}/workstations.png`, fullPage: true });

	await page.goto(`${app.base}/workstations/${workstationId}`);
	await page.getByRole("heading", { name: "Demo workstation", exact: true }).waitFor();
	await page.getByTestId("workstation-public-ip").waitFor();
	await page.getByTestId("workstation-topology").waitFor();
	const connectivityTable = page.getByRole("table", {
		name: "Reachability targets",
		exact: true,
	});
	await connectivityTable.getByRole("link").nth(7).waitFor({ timeout: 60000 });
	await page
		.locator('figure[aria-label^="CPU, memory and uptime"] svg .recharts-area-area')
		.first()
		.waitFor();
	const alphaConnectivity = connectivityTable
		.getByRole("row")
		.filter({ hasText: "alpha.example.test" });
	const betaConnectivity = connectivityTable
		.getByRole("row")
		.filter({ hasText: "beta.example.test" });
	await alphaConnectivity.getByText("0%", { exact: true }).first().waitFor();
	await betaConnectivity.getByText("100%", { exact: true }).first().waitFor();
	await page.screenshot({ path: `${output}/workstation-detail.png`, fullPage: true });
	await page.locator('figure[aria-label^="CPU, memory and uptime"]').scrollIntoViewIfNeeded();
	await page.waitForTimeout(300);
	await page.screenshot({ path: `${output}/workstation-history.png` });

	const alphaLink = connectivityTable.getByRole("link", {
		name: "alpha.example.test",
		exact: true,
	});
	const betaLink = connectivityTable.getByRole("link", { name: "beta.example.test", exact: true });
	await alphaLink.click();
	await page.waitForURL(/\/hosts\/[0-9a-f]{8}$/);
	const alphaRoute = new URL(page.url()).pathname;
	const alpha = await workloadSummary();
	await page.screenshot({ path: `${output}/workstation-host-alpha.png`, fullPage: true });

	await page.goto(`${app.base}/workstations/${workstationId}`);
	await connectivityTable.getByRole("link").nth(7).waitFor({ timeout: 60000 });
	await betaLink.click();
	await page.waitForURL(/\/hosts\/[0-9a-f]{8}$/);
	const betaRoute = new URL(page.url()).pathname;
	const beta = await workloadSummary();
	await page.screenshot({ path: `${output}/workstation-host-beta.png`, fullPage: true });

	assert.equal(alpha.header, "alpha.example.test");
	assert.equal(beta.header, "beta.example.test");
	assert.notEqual(alpha.header, beta.header);
	assert.notEqual(alphaRoute, betaRoute);
	assert.equal(alpha.chart, beta.chart);
	assert.deepEqual(alpha.processes, beta.processes);

	if (!automated) {
		await page.goto(`${app.base}/tags`);
		const name = page.getByPlaceholder(/tag name/i).first();
		assert.equal(await name.count(), 1);
		await name.fill("Unfinished label");
		page.once("dialog", (dialog) => dialog.dismiss());
		await page.getByText("Demo", { exact: true }).click();
		assert.equal(await current(), first);
		assert.equal(await name.inputValue(), "Unfinished label");
		page.once("dialog", (dialog) => dialog.accept());
		await page.getByText("Demo", { exact: true }).click();
		await page.waitForFunction(
			(id) => sessionStorage.getItem("bat:environment-instance") !== id,
			first,
			{ timeout: 60000 },
		);
		await page.getByText("alpha.example.test", { exact: true }).first().waitFor();
		assert.equal(existsSync(firstPath), false);
		assert.equal((await fetch(`${app.base}/__bat/instances/${first}/api/hosts`)).status, 410);
		assert.equal(await page.evaluate(() => localStorage.getItem("bat:environment-mode")), "demo");
		await page.getByText("E2E", { exact: true }).click();
		await page.waitForFunction(() => localStorage.getItem("bat:environment-mode") === "e2e", null, {
			timeout: 60000,
		});
		await page.getByText("alpha.example.test", { exact: true }).first().waitFor();
		assert.notEqual(await current(), first);
		await page.waitForTimeout(600);
		await page.screenshot({ path: `${output}/switch.png`, fullPage: true });
	}
	writeFileSync(
		`${output}/manifest.json`,
		JSON.stringify(
			{
				revision:
					process.env.BAT_CAPTURE_REVISION ??
					execFileSync("git", ["rev-parse", "HEAD"], {
						cwd: root,
						encoding: "utf8",
					}).trim(),
				fixtureVersion: 3,
				viewport: { width: 1440, height: 1000 },
				locale: "en-US",
				timezone: "UTC",
				anchor: app.instances.get(await current()).runtime.anchor,
				routes: [
					...new Set([
						"/",
						"/hosts/f0d3fd30",
						"/workstations",
						`/workstations/${workstationId}`,
						alphaRoute,
						betaRoute,
					]),
				],
				mode: "e2e",
				dataset: "demo",
			},
			null,
			2,
		),
	);
	console.log(
		automated
			? "PASS: automated rich E2E screenshots, recorded workstation, eight connectivity rows, equal host workload"
			: "PASS: explicit interactive E2E, draft cancellation, Demo exit/cleanup, stale rejection, fresh reentry, preference, screenshots",
	);
	const raw = app.instances.get(await current()).runtime.base;
	await page.goto(raw);
	await page.getByText("Failed to load hosts", { exact: true }).waitFor();
	assert.equal(await page.getByRole("radio", { name: "Demo", exact: true }).count(), 0);
	assert.equal(await page.evaluate(() => !!window.__BAT_LOCAL__), false);
	assert.deepEqual(productionRequests, []);
	await context.close();
} catch (error) {
	console.error("Capture failed:", error);
	throw error;
} finally {
	await browser.close();
	await app.close();
}
