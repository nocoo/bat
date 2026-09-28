import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "../../packages/ui/node_modules/@playwright/test/index.mjs";
import { launch } from "./launcher.mjs";
import { root } from "./runtime.mjs";

const automated = process.argv.includes("--automated");
const output = `${root}/artifacts/environments${automated ? "/automated" : ""}`;
mkdirSync(output, { recursive: true });
const app = await launch({ automated, built: true, port: 0, initial: "e2e", dataset: "demo" });
const browser = await chromium.launch();
try {
	const context = await browser.newContext({
		viewport: { width: 1440, height: 1000 },
		locale: "en-US",
		timezoneId: "UTC",
	});
	if (automated)
		await context.addInitScript(() => localStorage.setItem("bat:environment-mode", "prod"));
	const page = await context.newPage();
	page.setDefaultTimeout(20000);
	page.on("pageerror", (e) => console.error("Browser:", e.message));
	await page.goto(app.base);
	await page.getByText("alpha.test.local", { exact: true }).first().waitFor({ timeout: 60000 });
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
	const firstPath = app.instances.get(first).runtime.path;
	await page.waitForTimeout(600);
	await page.screenshot({ path: `${output}/hosts.png`, fullPage: true });
	await page.goto(`${app.base}/hosts/f0d3fd30`);
	await page.getByText("alpha.test.local", { exact: true }).first().waitFor();
	await page.waitForTimeout(600);
	await page.screenshot({ path: `${output}/detail.png`, fullPage: true });
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
		await page.getByText("alpha.test.local", { exact: true }).first().waitFor();
		assert.equal(existsSync(firstPath), false);
		assert.equal((await fetch(`${app.base}/__bat/instances/${first}/api/hosts`)).status, 410);
		assert.equal(await page.evaluate(() => localStorage.getItem("bat:environment-mode")), "demo");
		await page.getByText("E2E", { exact: true }).click();
		await page.waitForFunction(() => localStorage.getItem("bat:environment-mode") === "e2e", null, {
			timeout: 60000,
		});
		await page.getByText("alpha.test.local", { exact: true }).first().waitFor();
		assert.notEqual(await current(), first);
		await page.waitForTimeout(600);
		await page.screenshot({ path: `${output}/switch.png`, fullPage: true });
	}
	writeFileSync(
		`${output}/manifest.json`,
		JSON.stringify(
			{
				revision: execFileSync("git", ["rev-parse", "HEAD"], {
					cwd: root,
					encoding: "utf8",
				}).trim(),
				fixtureVersion: 1,
				viewport: { width: 1440, height: 1000 },
				locale: "en-US",
				timezone: "UTC",
				anchor: app.instances.get(await current()).runtime.anchor,
				routes: ["/", "/hosts/f0d3fd30"],
				mode: "e2e",
				dataset: "demo",
			},
			null,
			2,
		),
	);
	console.log(
		automated
			? "PASS: automated rich E2E screenshots"
			: "PASS: explicit interactive E2E, draft cancellation, Demo exit/cleanup, stale rejection, fresh reentry, preference, screenshots",
	);
	const raw = app.instances.get(await current()).runtime.base;
	await page.goto(raw);
	await page.getByText("Failed to load hosts", { exact: true }).waitFor();
	assert.equal(await page.getByRole("radio", { name: "Demo", exact: true }).count(), 0);
	assert.equal(await page.evaluate(() => !!window.__BAT_LOCAL__), false);
	await context.close();
} catch (error) {
	console.error("Capture failed:", error);
	throw error;
} finally {
	await browser.close();
	await app.close();
}
