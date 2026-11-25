import { expect, test } from "@playwright/test";

test.use({ trace: "off", screenshot: "off", video: "off" });

const fieldLaptop = "11111111-1111-4111-8111-111111111111";
const retiredLaptop = "33333333-3333-4333-8333-333333333333";

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

test.describe("Workstations core journeys", () => {
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
	});

	test("detail shows identity, vitals, machine facts, target rows, and history window", async ({
		page,
	}) => {
		await page.goto(`/workstations/${fieldLaptop}`);
		await expect(page.getByRole("heading", { name: "Field laptop", exact: true })).toBeVisible();
		await expect(page.getByTestId("workstation-public-ip")).toHaveText("203.0.113.24");

		const detail = page.getByTestId("workstation-detail");
		await expect(detail.getByText("24.6%", { exact: true }).first()).toBeVisible();
		await expect(detail.getByText("field-laptop", { exact: true })).toBeVisible();

		const targets = page.getByRole("table", { name: "Reachability targets", exact: true });
		const alpha = targets.getByRole("row").filter({ hasText: "alpha.test.local" });
		await expect(
			alpha.getByRole("link", { name: "alpha.test.local", exact: true }),
		).toHaveAttribute("href", "/hosts/f0d3fd30");

		const window = page.getByRole("radiogroup", { name: "History window", exact: true });
		await expect(window.getByRole("radio", { name: "24h", exact: true })).toBeChecked();
		await window.getByRole("radio", { name: "6h", exact: true }).click();
		await expect(window.getByRole("radio", { name: "6h", exact: true })).toBeChecked();
	});

	test("consent posts a same-origin management request and returns code plus state only", async ({
		page,
	}) => {
		const origin = new URL(process.env.BAT_E2E_BASE as string).origin;
		const callback = `${origin}/callback`;
		await page.route(/\/callback\?/, (route) =>
			route.fulfill({ status: 200, contentType: "text/html", body: "<html>callback</html>" }),
		);

		await page.goto(`/workstation-login?${consentQuery(callback)}`);
		await expect(page.getByTestId("workstation-machine-name")).toHaveText("field-laptop");
		await page.getByLabel("Workstation display name").fill("Field laptop");
		await page.getByRole("button", { name: "Approve workstation", exact: true }).click();
		await page.waitForURL(/\/callback\?/);
		const url = new URL(page.url());
		expect(url.pathname).toBe("/callback");
		expect(url.searchParams.get("state")).toBe("state-0123456789abcdef");
		expect(url.searchParams.get("code")).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect([...url.searchParams.keys()].sort()).toEqual(["code", "state"]);
	});

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
