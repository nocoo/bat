import { expect, test } from "@playwright/test";

// The card view of the hosts page: the same overview data as the table, the
// reference dashboard's card anatomy, and a switch that survives reloads.
// Overdue and unpriced states are produced through the real billing API, so
// every badge in this file is rendered from stored data.

const betaHid = "4c494cde";

function billingDate(offsetDays: number): string {
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

async function overflowDelta(page: import("@playwright/test").Page): Promise<number> {
	return page.evaluate(() => {
		const scrolling = document.scrollingElement;
		return scrolling ? scrolling.scrollWidth - scrolling.clientWidth : 0;
	});
}

test.describe("Hosts card view", () => {
	test("the switch swaps views and persists across reloads", async ({ page }) => {
		await page.goto("/hosts");
		const table = page.getByRole("table", { name: "Servers" });
		await expect(table).toBeVisible({ timeout: 15_000 });
		await expect(page.getByTestId("host-card-grid")).toHaveCount(0);

		await page.getByTestId("hosts-view-cards").click();
		const grid = page.getByTestId("host-card-grid");
		await expect(grid).toBeVisible();
		await expect(table).toHaveCount(0);
		expect(await page.evaluate(() => localStorage.getItem("bat.hosts.view"))).toBe("cards");

		await page.reload();
		await expect(page.getByTestId("host-card-grid")).toBeVisible();
		await expect(page.getByRole("table", { name: "Servers" })).toHaveCount(0);

		await page.getByTestId("hosts-view-table").click();
		await expect(table).toBeVisible();
		await expect(page.getByTestId("host-card-grid")).toHaveCount(0);
		expect(await page.evaluate(() => localStorage.getItem("bat.hosts.view"))).toBe("table");

		await page.reload();
		await expect(page.getByRole("table", { name: "Servers" })).toBeVisible();
	});

	test("a card carries the full anatomy and navigates to the detail page", async ({ page }) => {
		await page.goto("/hosts");
		await page.getByTestId("hosts-view-cards").click();
		const grid = page.getByTestId("host-card-grid");
		await expect(grid).toBeVisible();

		const alpha = grid.getByTestId("host-card").filter({ hasText: "alpha.test.local" });
		await expect(alpha.getByTestId("status-badge")).toBeVisible();
		await expect(alpha.getByText("¥10.00/day", { exact: true })).toBeVisible();
		await expect(alpha.getByTestId("host-countdown")).toHaveText("剩 112 天");
		for (const tag of ["production", "us-east", "edge"]) {
			await expect(alpha.getByText(tag, { exact: true })).toBeVisible();
		}
		for (const label of ["CPU", "Memory", "Disk", "Load 1m", "Net", "Uptime"]) {
			await expect(alpha.getByText(label, { exact: true })).toBeVisible();
		}
		await expect(alpha.getByText(/8 cores/)).toBeVisible();
		await expect(alpha.getByRole("progressbar", { name: "CPU usage" })).toBeVisible();

		// The description affordance reveals its tooltip without navigating.
		const hint = alpha.getByRole("button", { name: "Description of alpha.test.local" });
		await hint.hover();
		const tooltip = page.getByRole("tooltip");
		await expect(tooltip).toBeVisible();
		await expect(tooltip).toContainText("Primary ingress");
		await expect(page).toHaveURL(/\/hosts$/);

		// The card itself is one link to the detail page.
		await grid.getByTestId("host-card").filter({ hasText: "beta.test.local" }).click();
		await expect(page).toHaveURL(new RegExp(`/hosts/${betaHid}`));
	});

	test("an overdue host turns the countdown destructive; an unpriced host shows no badge", async ({
		page,
	}) => {
		await setBilling(page, betaHid, {
			cost_amount_cny: 45,
			paid_at: billingDate(-40),
			renews_at: billingDate(-3),
		});
		await page.goto("/hosts");
		await page.getByTestId("hosts-view-cards").click();
		const beta = page.getByTestId("host-card").filter({ hasText: "beta.test.local" });
		await expect(beta.getByTestId("host-countdown")).toHaveText("已过期 3 天");
		await expect(beta.getByTestId("host-countdown")).toHaveClass(/text-basalt-destructive/);

		await setBilling(page, betaHid, {
			cost_amount_cny: null,
			paid_at: null,
			renews_at: null,
		});
		await page.reload();
		await expect(beta.getByTestId("host-countdown")).toHaveCount(0);
		await expect(beta.getByText(/\/day/)).toHaveCount(0);
		await expect(beta.getByTestId("status-badge")).toBeVisible();

		await setBilling(page, betaHid, {
			cost_amount_cny: 45,
			paid_at: billingDate(-28),
			renews_at: billingDate(2),
		});
	});

	test("cards form equal-height rows without horizontal scroll at 1440 and 1024", async ({
		page,
	}, testInfo) => {
		await page.goto("/hosts");
		await page.getByTestId("hosts-view-cards").click();
		const grid = page.getByTestId("host-card-grid");
		await expect(grid).toBeVisible();

		for (const width of [1440, 1024]) {
			await page.setViewportSize({ width, height: 900 });
			await expect.poll(() => overflowDelta(page)).toBeLessThanOrEqual(0);

			const geometry = await grid.evaluate((element) => {
				const cards = Array.from(element.children);
				const rows = new Map<number, { heights: number[]; metricTops: number[] }>();
				for (const card of cards) {
					const box = card.getBoundingClientRect();
					const metrics = card.querySelector('[role="progressbar"]')?.parentElement;
					const metricTop = metrics?.getBoundingClientRect().top ?? -1;
					const row = rows.get(box.top) ?? { heights: [], metricTops: [] };
					row.heights.push(box.height);
					row.metricTops.push(metricTop);
					rows.set(box.top, row);
				}
				return {
					cards: cards.length,
					rows: Array.from(rows.values()),
					columns: Math.max(...Array.from(rows.values()).map((row) => row.heights.length)),
					scrollWidth: element.scrollWidth,
					clientWidth: element.clientWidth,
				};
			});
			expect(geometry.cards).toBe(2);
			expect(geometry.columns).toBe(2);
			for (const row of geometry.rows) {
				// Cards in one row share their height and their metric block
				// offset, however many tags each host carries.
				const maxHeight = Math.max(...row.heights);
				const firstMetricTop = Math.min(...row.metricTops);
				for (const height of row.heights) {
					expect(Math.abs(height - maxHeight)).toBeLessThanOrEqual(1);
				}
				for (const top of row.metricTops) {
					expect(Math.abs(top - firstMetricTop)).toBeLessThanOrEqual(1);
				}
			}
			await page.screenshot({
				path: testInfo.outputPath(`card-view-${width}.png`),
				fullPage: true,
			});
		}
	});

	test("the card view drops the table island and carries the fleet total", async ({ page }) => {
		await page.goto("/hosts");
		await page.getByTestId("hosts-view-cards").click();
		const footer = page.getByTestId("host-card-footer").getByTestId("fleet-cost");
		await expect(footer).toBeVisible();

		// No table container: each card stands on its own surface.
		await expect(page.getByTestId("host-list")).toHaveCount(0);
		await expect(page.getByRole("heading", { name: "Servers" })).toHaveCount(0);

		await expect(footer).toContainText("¥11.50/day");
		await expect(footer).toContainText("/month");
		await expect(footer).toContainText("2 / 2 hosts");

		// The muted line ends where the grid ends.
		const gap = await page.evaluate(() => {
			const footer = document.querySelector(
				'[data-testid="host-card-footer"] [data-testid="fleet-cost"]',
			);
			const grid = document.querySelector('[data-testid="host-card-grid"]');
			if (!footer || !grid) return null;
			return footer.getBoundingClientRect().right - grid.getBoundingClientRect().right;
		});
		expect(gap).not.toBeNull();
		expect(Math.abs(gap ?? 0)).toBeLessThanOrEqual(2);
	});
});
