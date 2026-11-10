import { expect, test } from "@playwright/test";
import { countdownLabels } from "./countdown";

// The focused catalog seeds one annual plan (alpha, due in 112 days) and one
// monthly plan (beta, due in 2 days). The overdue state is produced through
// the real API, so every countdown in this file is rendered from stored data.

const alphaHid = "f0d3fd30";
const betaHid = "4c494cde";
const alphaDetail = `/hosts/${alphaHid}`;

function localDate(offsetDays: number): string {
	const date = new Date();
	const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	midnight.setDate(midnight.getDate() + offsetDays);
	const month = String(midnight.getMonth() + 1).padStart(2, "0");
	const day = String(midnight.getDate()).padStart(2, "0");
	return `${midnight.getFullYear()}-${month}-${day}`;
}

async function setBilling(
	page: import("@playwright/test").Page,
	hid: string,
	billing: { cost_amount_cny: number | null; paid_at: string | null; renews_at: string | null },
) {
	const response = await page.request.patch(`/api/hosts/${hid}/billing`, { data: billing });
	expect(response.ok()).toBe(true);
}

test.describe("Host billing", () => {
	test("the cost card shows the amount, the daily rate and the countdown", async ({
		page,
	}, testInfo) => {
		for (const width of [1440, 1024]) {
			await page.setViewportSize({ width, height: 1000 });
			await page.goto(alphaDetail);
			await page.waitForLoadState("domcontentloaded");

			const card = page.getByTestId("host-contract-card");
			await expect(card).toBeVisible({ timeout: 15_000 });
			await expect(card.getByText("Contract", { exact: true })).toBeVisible();

			// One annual plan of ¥3,650.00 — the countdown is the prominent value.
			const labels = await countdownLabels(page, alphaHid);
			await expect(card.getByTestId("cost-countdown")).toHaveText(labels.detail);
			await expect(card.getByText("¥3,650.00", { exact: true })).toBeVisible();
			await expect(card.getByText("¥10.00/day", { exact: true })).toBeVisible();
			await expect(card.getByText("365 days", { exact: true })).toBeVisible();
			const stored = (await (await page.request.get(`/api/hosts/${alphaHid}`)).json()) as {
				paid_at: string;
				renews_at: string;
			};
			await expect(card.getByText(stored.paid_at, { exact: true })).toBeVisible();
			await expect(card.getByText(stored.renews_at, { exact: true })).toBeVisible();

			// The card sits in the right rail, next to System Info.
			const infoCard = page
				.getByText("System Info", { exact: true })
				.locator("xpath=ancestor::*[@data-basalt-surface][1]");
			const infoBox = await infoCard.boundingBox();
			const cardBox = await card.boundingBox();
			expect(infoBox).not.toBeNull();
			expect(cardBox).not.toBeNull();
			expect(Math.abs((infoBox?.x ?? 0) - (cardBox?.x ?? 0))).toBeLessThanOrEqual(2);
			expect(cardBox?.y ?? 0).toBeGreaterThan(infoBox?.y ?? 0);

			await card.screenshot({ path: testInfo.outputPath(`contract-card-${width}.png`) });
		}
	});

	test("the edit form writes the three inputs and the card follows", async ({ page }, testInfo) => {
		for (const width of [1440, 1024]) {
			await page.setViewportSize({ width, height: 1000 });
			await page.goto(alphaDetail);
			await expect(page.getByTestId("host-contract-card")).toBeVisible({ timeout: 15_000 });

			const card = page.getByTestId("host-contract-card");
			await card.getByRole("button", { name: "Edit contract" }).click();

			const form = page.getByTestId("contract-form");
			await expect(form).toBeVisible();
			const stored = (await (await page.request.get(`/api/hosts/${alphaHid}`)).json()) as {
				paid_at: string;
				renews_at: string;
			};
			await expect(form.getByLabel("Amount (¥)")).toHaveValue("3650");
			await expect(form.getByLabel("Last payment date")).toHaveValue(stored.paid_at);
			await expect(form.getByLabel("Next payment date")).toHaveValue(stored.renews_at);
			await form.screenshot({ path: testInfo.outputPath(`contract-form-${width}.png`) });

			if (width === 1440) {
				await form.getByLabel("Amount (¥)").fill("1200");
				await form.getByLabel("Last payment date").fill(localDate(-28));
				await form.getByLabel("Next payment date").fill(localDate(2));
				await form.getByRole("button", { name: "Save" }).click();

				await expect(card.getByTestId("cost-countdown")).toHaveText("Renews in 2 days");
				await expect(card.getByText("¥1,200.00", { exact: true })).toBeVisible();
				await expect(card.getByText("30 days", { exact: true })).toBeVisible();

				const detail = await (await page.request.get(`/api/hosts/${alphaHid}`)).json();
				expect(detail.cost_amount_cny).toBe(1200);
				expect(detail.paid_at).toBe(localDate(-28));
				expect(detail.renews_at).toBe(localDate(2));

				await setBilling(page, alphaHid, {
					cost_amount_cny: 3650,
					paid_at: localDate(-253),
					renews_at: localDate(112),
				});
			}
		}
	});

	test("the edit form refuses a renewal before the payment", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.goto(alphaDetail);
		const card = page.getByTestId("host-contract-card");
		await card.getByRole("button", { name: "Edit contract" }).click();

		const form = page.getByTestId("contract-form");
		await form.getByLabel("Next payment date").fill(localDate(-300));
		await form.getByRole("button", { name: "Save" }).click();

		await expect(form.getByRole("alert")).toContainText("after the last payment date");
		await expect(form).toBeVisible();
		await form.getByRole("button", { name: "Cancel" }).click();
	});

	test("the contract card records bandwidth, quota and reset day", async ({ page }, testInfo) => {
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.goto(alphaDetail);
		await expect(page.getByTestId("host-contract-card")).toBeVisible({ timeout: 15_000 });

		// The read view dashes the unset contract fields.
		const card = page.getByTestId("host-contract-card");
		await expect(card.getByText("Bandwidth", { exact: true })).toBeVisible();
		await expect(card.getByTestId("contract-bandwidth-value")).toContainText("—");
		await expect(card.getByTestId("contract-reset-value")).toContainText("—");

		await card.getByRole("button", { name: "Edit contract" }).click();
		const form = page.getByTestId("contract-form");
		await form.getByLabel("Bandwidth (Mbps)").fill("2500");
		await form.getByLabel("Traffic quota (GB)").fill("500");
		await form.getByLabel("Traffic reset day (1-31)").fill("1");
		await form.screenshot({ path: testInfo.outputPath("contract-form-filled.png") });
		await form.getByRole("button", { name: "Save" }).click();

		// The shared formatters write the values: 2500 Mbps becomes 2.5 Gbps
		// and the reset day becomes the ordinal sentence.
		await expect(card.getByTestId("contract-bandwidth-value")).toHaveText("2.5 Gbps");
		await expect(card.getByText("500 GB", { exact: true })).toBeVisible();
		// The label already says "Traffic reset" — the value is the bare day.
		await expect(card.getByText("Traffic reset", { exact: true })).toBeVisible();
		await expect(card.getByTestId("contract-reset-value")).toHaveText("1st");
		await card.screenshot({ path: testInfo.outputPath("contract-card-read.png") });

		// Every rejection path of the three counters.
		await card.getByRole("button", { name: "Edit contract" }).click();
		for (const [label, value] of [
			["Bandwidth (Mbps)", "0"],
			["Bandwidth (Mbps)", "100.5"],
			["Bandwidth (Mbps)", "1000001"],
			["Traffic quota (GB)", "-1"],
			["Traffic reset day (1-31)", "0"],
			["Traffic reset day (1-31)", "32"],
			["Traffic reset day (1-31)", "soon"],
		]) {
			await form.getByLabel(label).fill(value);
			await form.getByRole("button", { name: "Save" }).click();
			await expect(form.getByRole("alert")).toBeVisible();
			await form.getByLabel(label).fill("");
		}
		await form.getByRole("button", { name: "Cancel" }).click();

		await setBilling(page, alphaHid, {
			cost_amount_cny: 3650,
			paid_at: localDate(-253),
			renews_at: localDate(112),
		});
	});

	test("the host list shows the countdown in every state", async ({ page }, testInfo) => {
		for (const width of [1440, 1024]) {
			await page.setViewportSize({ width, height: 1000 });
			await setBilling(page, betaHid, {
				cost_amount_cny: 45,
				paid_at: localDate(-28),
				renews_at: localDate(2),
			});
			await page.goto("/hosts");
			await page.waitForLoadState("domcontentloaded");

			const rows = page.getByTestId("host-row");
			await expect(rows).toHaveCount(2);
			const alphaRow = rows.filter({ hasText: "alpha.test.local" });
			const betaRow = rows.filter({ hasText: "beta.test.local" });

			const alphaLabels = await countdownLabels(page, alphaHid);
			await expect(alphaRow.getByTestId("host-countdown")).toHaveText(alphaLabels.list);
			await expect(betaRow.getByTestId("host-countdown")).toHaveText("2d left");

			await setBilling(page, betaHid, {
				cost_amount_cny: 45,
				paid_at: localDate(-40),
				renews_at: localDate(-3),
			});
			await page.reload();
			await expect(betaRow.getByTestId("host-countdown")).toHaveText("3d overdue");
			await betaRow.screenshot({ path: testInfo.outputPath(`host-list-overdue-${width}.png`) });

			await setBilling(page, betaHid, {
				cost_amount_cny: null,
				paid_at: null,
				renews_at: null,
			});
			await page.reload();
			// Without billing the merged column shows one dash, not an empty cell.
			await expect(betaRow.getByTestId("host-billing")).toHaveText("—");
			await expect(betaRow.getByTestId("host-countdown")).toHaveCount(0);
			await betaRow.screenshot({ path: testInfo.outputPath(`host-list-no-billing-${width}.png`) });
		}

		await setBilling(page, betaHid, {
			cost_amount_cny: 45,
			paid_at: localDate(-28),
			renews_at: localDate(2),
		});
	});

	test("the table footer totals the daily cost of the priced hosts", async ({ page }, testInfo) => {
		for (const width of [1440, 1024]) {
			await page.setViewportSize({ width, height: 1000 });
			await page.goto("/hosts");
			await page.waitForLoadState("domcontentloaded");

			const footer = page.getByTestId("host-table-footer");
			const fleetCost = footer
				.getByTestId("fleet-cost")
				.or(footer.getByTestId("fleet-cost-wide"))
				.filter({ visible: true });
			await expect(footer).toBeVisible({ timeout: 15_000 });
			await expect(fleetCost).toContainText("¥11.50/day");
			await expect(fleetCost).toContainText("/month");
			await expect(fleetCost).toContainText("2 / 2 hosts");

			// The total sits under the billing column, which stays visible at every width.
			const table = page.getByRole("table", { name: "Servers" });
			await expect(table.getByRole("columnheader").filter({ hasText: "Billing" })).toBeVisible();
			await footer.screenshot({ path: testInfo.outputPath(`fleet-cost-${width}.png`) });
		}
	});
});
