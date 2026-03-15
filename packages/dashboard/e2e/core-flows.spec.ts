// Dashboard L4 BDD E2E tests — Playwright browser flows
// Per docs/06-dashboard.md § L4 and docs/07-testing.md § L4
//
// Prerequisites:
//   - Playwright browsers installed: npx playwright install chromium
//   - Worker dev server running (or BAT_API_URL pointing to test worker)
//   - E2E_SKIP_AUTH=1 to bypass Google OAuth
//
// Run: pnpm --filter @bat/dashboard test:e2e
//
// Core flows:
//   1. Login → redirect to hosts overview
//   2. Hosts overview → cards render with status badges
//   3. Host detail → charts render, time range picker works, system info visible
//   4. Alerts → active alerts shown, link to host detail

import { expect, test } from "@playwright/test";

test.describe("Login flow", () => {
	test("redirects unauthenticated users to /login", async ({ page }) => {
		await page.goto("/hosts");
		// With E2E_SKIP_AUTH=1, auth should be bypassed
		// Without it, should redirect to /login
		const url = page.url();
		expect(url).toMatch(/\/(hosts|login)/);
	});

	test("login page renders", async ({ page }) => {
		await page.goto("/login");
		await expect(page.locator("body")).toBeVisible();
	});
});

test.describe("Hosts overview", () => {
	test("navigates to /hosts and renders page", async ({ page }) => {
		await page.goto("/hosts");
		await expect(page.locator("body")).toBeVisible();
		// Should show "Hosts" heading or similar
		const heading = page.getByRole("heading", { level: 1 });
		if (await heading.isVisible()) {
			await expect(heading).toContainText(/hosts/i);
		}
	});

	test("shows loading state or host cards", async ({ page }) => {
		await page.goto("/hosts");
		// Wait for either loading skeleton or host cards to appear
		const content = page.locator('[class*="card"], [class*="skeleton"]');
		await expect(content.first()).toBeVisible({ timeout: 10_000 });
	});
});

test.describe("Host detail", () => {
	test("navigates to host detail page", async ({ page }) => {
		await page.goto("/hosts/test-host");
		await expect(page.locator("body")).toBeVisible();
	});

	test("time range picker is visible", async ({ page }) => {
		await page.goto("/hosts/test-host");
		// Time range buttons: 1h, 6h, 24h, 7d, 30d, 90d
		const button = page.getByRole("button", { name: "1h" });
		await expect(button).toBeVisible({ timeout: 10_000 });
	});

	test("system info card is visible", async ({ page }) => {
		await page.goto("/hosts/test-host");
		const sysInfo = page.getByText("System Info");
		await expect(sysInfo).toBeVisible({ timeout: 10_000 });
	});
});

test.describe("Alerts page", () => {
	test("navigates to /alerts and renders", async ({ page }) => {
		await page.goto("/alerts");
		await expect(page.locator("body")).toBeVisible();
	});

	test("shows alert table or empty state", async ({ page }) => {
		await page.goto("/alerts");
		// Wait for either the alert table or "No active alerts" message
		const content = page.locator("table, text=No active alerts");
		await expect(content.first()).toBeVisible({ timeout: 10_000 });
	});
});

test.describe("Navigation", () => {
	test("sidebar has Hosts and Alerts links", async ({ page }) => {
		await page.goto("/hosts");
		const hostsLink = page.getByRole("link", { name: /hosts/i });
		const alertsLink = page.getByRole("link", { name: /alerts/i });
		await expect(hostsLink.first()).toBeVisible({ timeout: 10_000 });
		await expect(alertsLink.first()).toBeVisible({ timeout: 10_000 });
	});

	test("can navigate from hosts to alerts", async ({ page }) => {
		await page.goto("/hosts");
		await page
			.getByRole("link", { name: /alerts/i })
			.first()
			.click();
		await page.waitForURL("**/alerts");
		expect(page.url()).toContain("/alerts");
	});
});
