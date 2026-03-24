// Login page E2E tests
// Note: E2E_SKIP_AUTH=1 makes the user always logged in, so visiting /login
// redirects to / (proxy.ts line 42). We test the redirect behavior instead
// of the login page content, since the login page is unreachable in E2E mode.

import { expect, test } from "@playwright/test";

test.describe("Login page", () => {
	test("redirects authenticated users from /login to dashboard", async ({ page }) => {
		await page.goto("/login");
		// E2E_SKIP_AUTH=1 means user is always authenticated
		// proxy.ts redirects logged-in users from /login to /
		// / then redirects to /hosts
		await page.waitForURL("**/hosts", { timeout: 10_000 });
		expect(page.url()).toContain("/hosts");
	});

	test("auth bypass provides fake user session", async ({ page }) => {
		await page.goto("/hosts");
		// The fake session user name "E2E User" or "User" should appear in sidebar
		await expect(page.getByText("User").first()).toBeVisible({
			timeout: 10_000,
		});
	});
});
