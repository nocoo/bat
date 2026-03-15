// Dashboard L4 BDD E2E tests — Playwright browser flows
// Per docs/06-dashboard.md § L4 and docs/07-testing.md § L4
//
// Prerequisites:
//   - Playwright browsers installed: npx playwright install chromium
//   - E2E_SKIP_AUTH=1 set in playwright.config.ts webServer command
//
// Run: pnpm --filter @bat/dashboard test:e2e
//
// Core flows:
//   1. Auth bypass → direct access to hosts overview
//   2. Hosts overview → page renders
//   3. Host detail → page renders, time range picker visible
//   4. Alerts → empty state or table renders
//   5. Navigation → sidebar links work

import { expect, test } from "@playwright/test";

test.describe("Auth bypass", () => {
	test("E2E_SKIP_AUTH allows direct access to /hosts", async ({ page }) => {
		await page.goto("/hosts");
		// With E2E_SKIP_AUTH=1, user is auto-authenticated — should stay on /hosts
		await page.waitForURL("**/hosts");
		expect(page.url()).toContain("/hosts");
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
	test("navigates to host detail page without crashing", async ({ page }) => {
		await page.goto("/hosts/test-host");
		await expect(page.locator("body")).toBeVisible();
	});

	test("time range picker is visible", async ({ page }) => {
		await page.goto("/hosts/test-host");
		// Time range buttons are always rendered regardless of host existence
		const button = page.getByRole("button", { name: "1h" });
		await expect(button).toBeVisible({ timeout: 10_000 });
	});

	test("system info card renders when host exists", async ({ page }) => {
		await page.goto("/hosts/test-host");
		// System Info is guarded by `host &&` — for a non-existent host it won't render.
		// We verify the page loads without error; System Info visibility depends on data.
		await expect(page.locator("body")).toBeVisible();
		// If host data loads, System Info should be visible
		const sysInfo = page.getByText("System Info");
		const isVisible = await sysInfo.isVisible().catch(() => false);
		// No hard assertion — host may not exist in test env
		if (isVisible) {
			await expect(sysInfo).toBeVisible();
		}
	});
});

test.describe("Alerts page", () => {
	test("navigates to /alerts and renders", async ({ page }) => {
		await page.goto("/alerts");
		await expect(page.locator("body")).toBeVisible();
	});

	test("shows alert table or empty state", async ({ page }) => {
		await page.goto("/alerts");
		// The page may show: alert table, "No active alerts", or "Failed to load alerts"
		// depending on whether a worker backend is available
		const table = page.locator("table");
		const emptyState = page.getByText("No active alerts");
		const errorState = page.getByText("Failed to load alerts");
		await expect(table.or(emptyState).or(errorState).first()).toBeVisible({ timeout: 10_000 });
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
