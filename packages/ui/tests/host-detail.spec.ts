import { expect, test } from "@playwright/test";

test.describe("Host detail page", () => {
	const alphaHid = "f0d3fd30";

	test("sidebar navigation is present", async ({ page }) => {
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		const hostsLink = page.getByRole("link", { name: "Hosts" }).first();
		await expect(hostsLink).toBeVisible({ timeout: 15_000 });
	});

	test("breadcrumb shows Hosts link", async ({ page }) => {
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		const breadcrumb = page.getByLabel("Breadcrumb navigation");
		await expect(breadcrumb).toBeVisible({ timeout: 15_000 });

		const hostsLink = breadcrumb.getByRole("link", { name: "Hosts" });
		await expect(hostsLink).toBeVisible();
	});

	test("clicking Hosts breadcrumb navigates back", async ({ page }) => {
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		const breadcrumb = page.getByLabel("Breadcrumb navigation");
		await expect(breadcrumb).toBeVisible({ timeout: 15_000 });
		await breadcrumb.getByRole("link", { name: "Hosts" }).click();
		await expect(page).toHaveURL("/hosts");
	});

	test("shows hostname in header", async ({ page }) => {
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByRole("heading", { name: "alpha.test.local" })).toBeVisible({
			timeout: 15_000,
		});
	});

	test("back control sits left of the title and subtitle and returns to Hosts", async ({
		page,
	}) => {
		await page.goto(`/hosts/${alphaHid}`);
		const title = page.getByRole("heading", { name: "alpha.test.local", exact: true });
		const back = page.getByRole("link", { name: "Back to hosts", exact: true });
		await expect(title).toBeVisible();
		await expect(back).toHaveAttribute("href", "/hosts");
		for (const width of [1280, 390]) {
			await page.setViewportSize({ width, height: 900 });
			const button = await back.boundingBox();
			const heading = await title.boundingBox();
			const subtitle = await page
				.getByText("Real-time metrics, system specifications, and services.", { exact: true })
				.boundingBox();
			expect(button && heading && button.x + button.width < heading.x).toBe(true);
			expect(button && subtitle && button.x + button.width < subtitle.x).toBe(true);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
				true,
			);
		}
		await back.click();
		await expect(page).toHaveURL("/hosts");
	});

	test("shows status badge", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		const badge = page.getByTestId("status-badge");
		await expect(badge).toBeVisible({ timeout: 15_000 });
		expect(
			await badge.evaluate((element) => {
				const range = document.createRange();
				range.selectNodeContents(element);
				return range.getClientRects().length;
			}),
		).toBe(1);
	});

	test("time range picker has all duration options", async ({ page }) => {
		await page.goto(`/hosts/${alphaHid}`);
		const picker = page.getByRole("radiogroup", { name: "Time range", exact: true });
		await expect(picker).toBeVisible();
		for (const name of ["1h", "6h", "24h", "7d", "30d", "90d"]) {
			await expect(picker.getByRole("radio", { name, exact: true })).toBeVisible();
		}
		await expect(picker.getByRole("radio", { name: "1h", exact: true })).toBeChecked();
		await expect(page.locator("legend").filter({ hasText: "Time range" })).toHaveCSS(
			"position",
			"absolute",
		);
	});

	test("time range segment changes the metrics request and supports keyboard selection", async ({
		page,
	}) => {
		await page.goto(`/hosts/${alphaHid}`);
		const picker = page.getByRole("radiogroup", { name: "Time range", exact: true });
		const sixHours = picker.getByRole("radio", { name: "6h", exact: true });
		const response = page.waitForResponse((result) => {
			const url = new URL(result.url());
			return (
				url.pathname.endsWith(`/api/hosts/${alphaHid}/metrics`) &&
				Number(url.searchParams.get("to")) - Number(url.searchParams.get("from")) === 21600
			);
		});
		await sixHours.click();
		expect((await response).ok()).toBe(true);
		await expect(sixHours).toBeChecked();
		await expect(picker.getByRole("radio", { name: "1h", exact: true })).not.toBeChecked();
		const day = picker.getByRole("radio", { name: "24h", exact: true });
		await day.focus();
		await day.press("Space");
		await expect(day).toBeChecked();
	});

	test("system info card shows OS and architecture", async ({ page }) => {
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByText("Ubuntu 24.04")).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText("x86_64")).toBeVisible();
	});

	test("system info card shows CPU model", async ({ page }) => {
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByText("Intel Xeon E5-2680 v4")).toBeVisible({ timeout: 15_000 });
	});

	test("system info card shows kernel", async ({ page }) => {
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByText("6.8.0-45-generic")).toBeVisible({ timeout: 15_000 });
	});

	test("system info card shows probe version", async ({ page }) => {
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByText("0.9.99").first()).toBeVisible({ timeout: 15_000 });
	});

	test("system info card shows public IP", async ({ page }) => {
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByText("203.0.113.10")).toBeVisible({ timeout: 15_000 });
	});

	test("navigating from hosts list to detail and back", async ({ page }) => {
		await page.goto("/hosts");
		await page.waitForLoadState("domcontentloaded");
		await expect(page.locator('[data-testid="host-card"]').first()).toBeVisible({
			timeout: 15_000,
		});

		await page.getByText("alpha.test.local").click();
		await expect(page).toHaveURL(/\/hosts\/f0d3fd30/);
		await expect(page.getByRole("heading", { name: "alpha.test.local" })).toBeVisible({
			timeout: 15_000,
		});

		const breadcrumb = page.getByLabel("Breadcrumb navigation");
		await breadcrumb.getByRole("link", { name: "Hosts" }).click();
		await expect(page).toHaveURL("/hosts");
	});

	test("unknown host shows fallback UI", async ({ page }) => {
		await page.goto("/hosts/00000000");
		await page.waitForLoadState("domcontentloaded");

		// Should still render basic page structure (sidebar, breadcrumb)
		await expect(page.getByRole("link", { name: "Hosts" }).first()).toBeVisible({
			timeout: 15_000,
		});
	});
});
