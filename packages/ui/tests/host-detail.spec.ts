import { expect, test } from "@playwright/test";

test.describe("Host detail page", () => {
	const alphaHid = "f0d3fd30";

	test("renders header, network labels, breadcrumb, and system info", async ({ page }) => {
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByRole("heading", { name: "alpha.test.local" })).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByRole("link", { name: "Hosts" }).first()).toBeVisible();

		const networkHeader = page.getByText("Network", { exact: true }).locator("..");
		await expect(networkHeader.getByText("Inbound", { exact: true })).toBeVisible();
		await expect(networkHeader.getByText("Outbound", { exact: true })).toBeVisible();

		await expect(page.getByText("Ubuntu 24.04")).toBeVisible();
		await expect(page.getByText("x86_64")).toBeVisible();
		await expect(page.getByText("Intel Xeon E5-2680 v4")).toBeVisible();
		await expect(page.getByText("6.8.0-45-generic")).toBeVisible();
		await expect(page.getByText("0.9.99").first()).toBeVisible();

		const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb navigation", exact: true });
		await expect(breadcrumb).toBeVisible();
		await breadcrumb.getByRole("link", { name: "Hosts" }).click();
		await expect(page).toHaveURL("/hosts");
	});

	test("time range segment changes the metrics request and supports keyboard selection", async ({
		page,
	}) => {
		await page.goto(`/hosts/${alphaHid}`);
		const picker = page.getByRole("radiogroup", { name: "Time range", exact: true });
		for (const name of ["1h", "6h", "24h", "7d", "30d", "90d"]) {
			await expect(picker.getByRole("radio", { name, exact: true })).toBeVisible();
		}
		await expect(picker.getByRole("radio", { name: "1h", exact: true })).toBeChecked();

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
		const day = picker.getByRole("radio", { name: "24h", exact: true });
		await day.focus();
		await day.press("Space");
		await expect(day).toBeChecked();
	});

	test("navigating from hosts list to detail and back", async ({ page }) => {
		await page.goto("/hosts");
		await page.waitForLoadState("domcontentloaded");
		await expect(page.locator('[data-testid="host-row"]').first()).toBeVisible({
			timeout: 15_000,
		});

		await page.getByText("alpha.test.local").click();
		await expect(page).toHaveURL(/\/hosts\/f0d3fd30/);
		await expect(page.getByRole("heading", { name: "alpha.test.local" })).toBeVisible({
			timeout: 15_000,
		});

		const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb navigation", exact: true });
		await breadcrumb.getByRole("link", { name: "Hosts" }).click();
		await expect(page).toHaveURL("/hosts");
	});

	test("unknown host shows fallback UI", async ({ page }) => {
		await page.goto("/hosts/00000000");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByRole("link", { name: "Hosts" }).first()).toBeVisible({
			timeout: 15_000,
		});
	});
});
