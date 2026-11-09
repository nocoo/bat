import { expect, test } from "@playwright/test";

function billingDate(offsetDays: number): string {
	const date = new Date();
	const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	midnight.setDate(midnight.getDate() + offsetDays);
	const month = String(midnight.getMonth() + 1).padStart(2, "0");
	const day = String(midnight.getDate()).padStart(2, "0");
	return `${midnight.getFullYear()}-${month}-${day}`;
}

test.describe("Hosts list page", () => {
	test("standard sort select supports pointer and keyboard selection", async ({ page }) => {
		await page.goto("/hosts");
		const sort = page.getByRole("combobox", { name: "Sort hosts" });
		const cards = page.getByTestId("host-row");
		await expect(cards).toHaveCount(2);
		await expect(sort).toHaveCSS("font-size", "14px");
		await expect(cards.first()).toContainText("alpha.test.local");
		await sort.click();
		await expect(page.getByRole("option")).toHaveCount(5);
		await page.getByRole("option", { name: "Name Z→A" }).click();
		await expect(cards.first()).toContainText("beta.test.local");
		await sort.focus();
		await page.keyboard.press("Enter");
		await expect(page.getByRole("option", { name: "Name Z→A" })).toBeFocused();
		await page.keyboard.press("Home");
		await expect(page.getByRole("option", { name: "Name A→Z" })).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(sort).toHaveText("Name A→Z");
		await expect(sort).toBeFocused();
		await expect(cards.first()).toContainText("alpha.test.local");
	});

	test("tag filter announces selection and works with Space", async ({ page }) => {
		await page.goto("/hosts");
		const filters = page.getByTestId("tag-filter-bar");
		const staging = filters.getByRole("button", { name: "staging", exact: true });
		await staging.focus();
		await staging.press("Space");
		await expect(staging).toHaveAttribute("aria-pressed", "true");
		await expect(page.getByTestId("host-row")).toHaveCount(1);
		await filters.getByRole("button", { name: "Clear", exact: true }).click();
		await expect(staging).toHaveAttribute("aria-pressed", "false");
		await expect(page.getByTestId("host-row")).toHaveCount(2);
	});

	test("page loads and displays sidebar navigation", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByRole("link", { name: "Hosts" }).first()).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByRole("link", { name: "Tags" })).toBeVisible();
		await expect(page.getByRole("link", { name: "Alerts" })).toBeVisible();
	});

	test("root path redirects to /hosts", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("domcontentloaded");
		await expect(page).toHaveURL("/hosts");
	});

	test("navigating to Tags page works", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("domcontentloaded");
		await page.getByRole("link", { name: "Tags" }).click();
		await expect(page).toHaveURL("/tags");
	});

	test("navigating to Setup page works", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("domcontentloaded");
		await page.getByRole("link", { name: "Setup" }).click();
		await expect(page).toHaveURL("/setup");
	});

	test("navigating to Alerts page works", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("domcontentloaded");
		await page.getByRole("link", { name: "Alerts" }).click();
		await expect(page).toHaveURL("/alerts");
	});

	test("navigating to Events page works", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("domcontentloaded");
		await page.getByRole("link", { name: "Events" }).click();
		await expect(page).toHaveURL("/events");
	});

	test("displays host cards with seeded data", async ({ page }) => {
		await page.goto("/hosts");
		await page.waitForLoadState("domcontentloaded");

		const cards = page.locator('[data-testid="host-row"]');
		await expect(cards.first()).toBeVisible({ timeout: 15_000 });
		await expect(cards).toHaveCount(2);
	});

	test("the fleet table keeps uniform rows and stays inside the island on mobile", async ({
		page,
	}) => {
		const path = "/api/hosts/pw-host-beta/tags";
		const response = await page.request.get(path);
		expect(response.ok()).toBe(true);
		const tags: { id: number }[] = await response.json();
		try {
			expect((await page.request.put(path, { data: { tag_ids: [] } })).ok()).toBe(true);
			await page.goto("/hosts");
			const rows = page.getByTestId("host-row");
			await expect(rows).toHaveCount(2);
			await expect(rows.first().getByText("production", { exact: true })).toBeVisible();

			for (const width of [1280, 900]) {
				await page.setViewportSize({ width, height: 900 });
				await expect
					.poll(() =>
						rows.evaluateAll((elements) => {
							const heights = elements.map((element) => element.getBoundingClientRect().height);
							// The last row has no bottom hairline, so allow that single pixel.
							return heights.every((height) => Math.abs(height - (heights[0] ?? 0)) <= 1);
						}),
					)
					.toBe(true);
			}

			await page.setViewportSize({ width: 390, height: 844 });
			await expect(rows).toHaveCount(2);
			await expect
				.poll(() =>
					page
						.locator("[data-basalt-island]")
						.evaluate((element) => element.scrollWidth <= element.clientWidth),
				)
				.toBe(true);
		} finally {
			await page.request
				.put(path, { data: { tag_ids: tags.map((tag) => tag.id) } })
				.catch(() => {});
		}
	});

	test("host card shows hostname", async ({ page }) => {
		await page.goto("/hosts");
		await page.waitForLoadState("domcontentloaded");
		await expect(page.locator('[data-testid="host-row"]').first()).toBeVisible({
			timeout: 15_000,
		});

		await expect(page.getByText("alpha.test.local")).toBeVisible();
		await expect(page.getByText("beta.test.local")).toBeVisible();
	});

	test("host card shows status badge", async ({ page }) => {
		await page.goto("/hosts");
		await page.waitForLoadState("domcontentloaded");
		await expect(page.locator('[data-testid="host-row"]').first()).toBeVisible({
			timeout: 15_000,
		});

		const badges = page.locator('[data-testid="status-badge"]');
		await expect(badges).toHaveCount(2);
	});

	test("tag filter bar is visible when tags exist", async ({ page }) => {
		await page.goto("/hosts");
		await page.waitForLoadState("domcontentloaded");
		await expect(page.locator('[data-testid="host-row"]').first()).toBeVisible({
			timeout: 15_000,
		});

		await expect(page.locator('[data-testid="tag-filter-bar"]')).toBeVisible();
	});

	test("tag filter bar shows all tags", async ({ page }) => {
		await page.goto("/hosts");
		await page.waitForLoadState("domcontentloaded");
		await expect(page.locator('[data-testid="tag-filter-bar"]')).toBeVisible({ timeout: 15_000 });

		const filterBar = page.locator('[data-testid="tag-filter-bar"]');
		await expect(filterBar.getByText("production")).toBeVisible();
		await expect(filterBar.getByText("staging")).toBeVisible();
		await expect(filterBar.getByText("us-east")).toBeVisible();
	});

	test("clicking tag filter narrows host list", async ({ page }) => {
		await page.goto("/hosts");
		await page.waitForLoadState("domcontentloaded");
		await expect(page.locator('[data-testid="host-row"]').first()).toBeVisible({
			timeout: 15_000,
		});

		// Click "staging" tag — only beta has it
		await page.locator('[data-testid="tag-filter-bar"]').getByText("staging").click();

		// Should filter to 1 card
		await expect(page.locator('[data-testid="host-row"]')).toHaveCount(1);
		await expect(page.getByText("beta.test.local")).toBeVisible();
	});

	test("clicking host card navigates to detail page", async ({ page }) => {
		await page.goto("/hosts");
		await page.waitForLoadState("domcontentloaded");
		await expect(page.locator('[data-testid="host-row"]').first()).toBeVisible({
			timeout: 15_000,
		});

		// Click alpha card
		await page.getByText("alpha.test.local").click();

		await expect(page).toHaveURL(/\/hosts\/f0d3fd30/);
	});

	test("sidebar version badge is visible", async ({ page }) => {
		await page.goto("/hosts");
		await page.waitForLoadState("domcontentloaded");
		await expect(page.getByText(/^v\d+\.\d+\.\d+$/)).toBeVisible({ timeout: 15_000 });
	});

	test("the list shows machine specs and drops the traffic columns", async ({ page }) => {
		await page.setViewportSize({ width: 1536, height: 900 });
		await page.goto("/hosts");
		const table = page.getByRole("table", { name: "Servers" });
		await expect(table).toBeVisible({ timeout: 15_000 });

		const headers = (await table.getByRole("columnheader").allInnerTexts()).map((text) =>
			text.trim(),
		);
		expect(headers).toEqual([
			"Server",
			"Status",
			"CPU",
			"Memory",
			"Disk",
			"Load 1m",
			"Link",
			"Billing",
		]);

		const alpha = page.getByTestId("host-row").filter({ hasText: "alpha.test.local" });
		await expect(alpha).toContainText("8 cores");
		await expect(alpha).toContainText("8 GB");
		await expect(alpha).toContainText("50 GB");

		const beta = page.getByTestId("host-row").filter({ hasText: "beta.test.local" });
		await expect(beta).toContainText("4 cores");
		await expect(beta).toContainText("4 GB");
		await expect(beta).toContainText("20 GB");
	});

	test("the description affordance only appears for hosts that carry one", async ({ page }) => {
		await page.goto("/hosts");
		const rows = page.getByTestId("host-row");
		await expect(rows).toHaveCount(2);

		const alpha = rows.filter({ hasText: "alpha.test.local" });
		const alphaHint = alpha.getByRole("button", { name: "Description of alpha.test.local" });
		await expect(alphaHint).toBeVisible();

		const beta = rows.filter({ hasText: "beta.test.local" });
		await expect(beta.getByRole("button", { name: /^Description of/ })).toHaveCount(0);

		await alphaHint.hover();
		const tooltip = page.getByRole("tooltip");
		await expect(tooltip).toBeVisible();
		await expect(tooltip).toContainText("Primary ingress for the focused browser scenarios");

		// The hint is a sibling of the hostname link, so the link keeps its target.
		await expect(alpha.getByRole("link", { name: "alpha.test.local" })).toBeVisible();
		await alphaHint.focus();
		await expect(tooltip).toBeVisible();
	});

	test("the list fits its card at 1440 and 1024 without horizontal overflow", async ({ page }) => {
		await page.goto("/hosts");
		await expect(page.getByTestId("host-row")).toHaveCount(2);

		for (const width of [1440, 1024]) {
			await page.setViewportSize({ width, height: 900 });
			const table = page.getByRole("table", { name: "Servers" });
			await expect
				.poll(() => table.evaluate((element) => element.scrollWidth <= element.clientWidth))
				.toBe(true);
			await expect
				.poll(() =>
					table.evaluate((element) => {
						const card = element.closest("[data-basalt-table-container]")?.parentElement;
						return card ? element.getBoundingClientRect().width <= card.clientWidth : false;
					}),
				)
				.toBe(true);
		}
	});

	test("the list keeps the identity cell whole at 1024", async ({ page }) => {
		await page.goto("/hosts");
		const alpha = page.getByTestId("host-row").filter({ hasText: "alpha.test.local" });
		await expect(alpha).toBeVisible({ timeout: 15_000 });

		await page.setViewportSize({ width: 1536, height: 900 });
		const table = page.getByRole("table", { name: "Servers" });
		await expect(table.getByRole("columnheader").filter({ hasText: "Load 1m" })).toBeVisible();
		for (const tag of ["production", "us-east", "edge"]) {
			await expect(alpha.getByText(tag, { exact: true })).toBeVisible();
		}

		await page.setViewportSize({ width: 1280, height: 900 });
		// The load column gives way instead of truncating the identity cell.
		await expect(table.getByRole("columnheader").filter({ hasText: "Load 1m" })).toBeHidden();
		await expect(table.getByRole("columnheader").filter({ hasText: "Billing" })).toBeVisible();
		const hostname = alpha.getByRole("link", { name: "alpha.test.local" });
		await expect(hostname).toBeVisible();
		await expect
			.poll(() => hostname.evaluate((element) => element.scrollWidth <= element.clientWidth))
			.toBe(true);
		await expect(alpha.getByText("edge", { exact: true })).toBeVisible();
		await expect(alpha.getByText("production", { exact: true })).toBeVisible();
		await expect(alpha.getByText("us-east", { exact: true })).toBeVisible();

		// Below `xl` the tag trail narrows to two so the name stays readable.
		await page.setViewportSize({ width: 1024, height: 900 });
		await expect(table.getByRole("columnheader").filter({ hasText: "Billing" })).toBeVisible();
		await expect(table.getByRole("columnheader").filter({ hasText: "Link" })).toBeVisible();
		await expect
			.poll(() => hostname.evaluate((element) => element.scrollWidth <= element.clientWidth))
			.toBe(true);
		await expect(alpha.getByText("us-east", { exact: true })).toBeHidden();
		await expect(alpha.getByText("+1", { exact: true })).toBeVisible();
	});

	test("the Link column stacks the contract and dashes what is unset", async ({ page }) => {
		const response = await page.request.patch("/api/hosts/f0d3fd30/billing", {
			data: {
				cost_amount_cny: 3650,
				paid_at: billingDate(-253),
				renews_at: billingDate(112),
				bandwidth_mbps: 2500,
				traffic_quota_gb: 500,
				traffic_reset_day: 1,
			},
		});
		expect(response.ok()).toBe(true);
		try {
			await page.goto("/hosts");
			const alpha = page.getByTestId("host-row").filter({ hasText: "alpha.test.local" });
			const beta = page.getByTestId("host-row").filter({ hasText: "beta.test.local" });
			await expect(alpha.getByTestId("host-contract")).toBeVisible();

			// One column, two lines: the bandwidth on top, the quota and the
			// reset day together underneath.
			await expect(alpha.getByTestId("host-contract")).toContainText("2.5 Gbps");
			await expect(alpha.getByTestId("host-contract")).toContainText("500 GB · 1st");

			// A host without contract data keeps its dashes in the same column.
			await expect(beta.getByTestId("host-contract")).toContainText("—");

			// At 1024 the cell shows the bandwidth only.
			await page.setViewportSize({ width: 1024, height: 900 });
			await expect(alpha.getByTestId("host-contract")).toContainText("2.5 Gbps");
			await expect(alpha.getByTestId("host-contract").getByText("500 GB · 1st")).toBeHidden();
		} finally {
			await page.request.patch("/api/hosts/f0d3fd30/billing", {
				data: {
					cost_amount_cny: 3650,
					paid_at: billingDate(-253),
					renews_at: billingDate(112),
				},
			});
		}
	});

	test("the billing column prices every host and dashes the unpriced", async ({ page }) => {
		await page.goto("/hosts");
		const rows = page.getByTestId("host-row");
		await expect(rows).toHaveCount(2);

		const alpha = rows.filter({ hasText: "alpha.test.local" });
		const beta = rows.filter({ hasText: "beta.test.local" });
		await expect(alpha.getByTestId("host-daily-cost")).toHaveText("¥10.00/day");
		await expect(beta.getByTestId("host-daily-cost")).toHaveText("¥1.50/day");

		const response = await page.request.patch("/api/hosts/4c494cde/billing", {
			data: { cost_amount_cny: null, paid_at: null, renews_at: null },
		});
		expect(response.ok()).toBe(true);
		try {
			await page.reload();
			// No billing data is a single dash, never ¥0.
			await expect(beta.getByTestId("host-billing")).toHaveText("—");
			await expect(beta.getByTestId("host-daily-cost")).toHaveCount(0);
			await expect(alpha.getByTestId("host-daily-cost")).toHaveText("¥10.00/day");
		} finally {
			await page.request.patch("/api/hosts/4c494cde/billing", {
				data: {
					cost_amount_cny: 45,
					paid_at: billingDate(-28),
					renews_at: billingDate(2),
				},
			});
		}
	});

	test("the identity cell keeps its room and the cells never touch at 1024", async ({ page }) => {
		// A long hostname is the hard case: it must stay complete while the
		// expiry and cost cells keep a gap between them. Alpha borrows the
		// longer name for the measurement and gives it back afterwards.
		const rename = async (hostname: string) => {
			const res = await page.request.post("/api/identity", {
				headers: {
					Authorization: `Bearer ${process.env.BAT_E2E_WRITE_KEY}`,
					"Content-Type": "application/json",
				},
				data: {
					host_id: "pw-host-alpha",
					hostname,
					os: "Ubuntu 24.04.2 LTS",
					kernel: "6.8.0-45-generic",
					arch: "x86_64",
					cpu_model: "Intel Xeon E5-2680 v4",
					uptime_seconds: 86400,
					boot_time: Math.floor(Date.now() / 1000) - 86400,
				},
			});
			expect(res.status()).toBe(204);
		};
		await rename("alpha.example.test");

		try {
			for (const width of [1440, 1024]) {
				await page.setViewportSize({ width, height: 900 });
				await page.goto("/hosts");
				await expect(page.getByTestId("host-row").first()).toBeVisible({ timeout: 15_000 });

				const table = page.getByRole("table", { name: "Servers" });
				const long = page.getByRole("link", { name: "alpha.example.test" });
				await expect(long).toBeVisible();
				await expect
					.poll(() => long.evaluate((element) => element.scrollWidth <= element.clientWidth))
					.toBe(true);

				const geometry = await table.evaluate((element) => {
					const rows = Array.from(element.querySelectorAll("tbody tr"));
					const first = rows[0] as HTMLElement;
					// The row that carries a countdown — the gap between the expiry
					// text and the cost cell is what must stay open.
					const counted = (rows.find((row) => row.querySelector("td:nth-child(7) span")) ??
						first) as HTMLElement;
					const cells = Array.from(counted.querySelectorAll("td"));
					const expiry = cells[6] as HTMLElement;
					const cost = cells[7] as HTMLElement;
					const expiryText = expiry.querySelector("span")?.getBoundingClientRect();
					return {
						tableOverflow: element.scrollWidth - element.clientWidth,
						rowHeight: Math.round(first.getBoundingClientRect().height),
						identityWidth: Math.round((cells[0] as HTMLElement).getBoundingClientRect().width),
						expiryWidth: Math.round(expiry.getBoundingClientRect().width),
						costWidth: Math.round(cost.getBoundingClientRect().width),
						expiryCostGap: expiryText
							? Math.round(cost.getBoundingClientRect().left - expiryText.right)
							: null,
						cellOverflow: Math.max(
							...cells.map(
								(cell) => (cell as HTMLElement).scrollWidth - (cell as HTMLElement).clientWidth,
							),
						),
					};
				});
				expect(geometry.tableOverflow).toBeLessThanOrEqual(0);
				expect(geometry.cellOverflow).toBeLessThanOrEqual(0);
				// The identity cell keeps a usable width at every viewport.
				expect(geometry.identityWidth).toBeGreaterThanOrEqual(180);
				// The expiry and the cost never touch.
				expect(geometry.expiryCostGap ?? 0).toBeGreaterThanOrEqual(4);
				// Two lines of contract keep the row compact.
				expect(geometry.rowHeight).toBeLessThanOrEqual(60);
			}
		} finally {
			// The longer name must not leak into the specs that follow.
			await rename("alpha.test.local");
		}
	});

	test("the footer totals the fleet under the billing column", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/hosts");
		const table = page.getByRole("table", { name: "Servers" });
		await expect(table).toBeVisible({ timeout: 15_000 });

		const footer = page.getByTestId("host-table-footer");
		await expect(footer).toBeVisible();
		const total = footer.getByTestId("fleet-cost").filter({ visible: true });
		await expect(total).toContainText("¥11.50/day");
		await expect(total).toContainText("/month");
		await expect(total).toContainText("2 / 2 hosts");

		// The total line ends exactly where the last column's figures do.
		const gap = await page.evaluate(() => {
			const total = document.querySelector(
				'[data-testid="host-table-footer"] [data-testid="fleet-cost"]',
			);
			const last = document.querySelector('[data-testid="host-billing"]');
			if (!total || !last) return null;
			const padding = Number.parseFloat(getComputedStyle(last).paddingInlineEnd || "0");
			return total.getBoundingClientRect().right - (last.getBoundingClientRect().right - padding);
		});
		expect(gap).not.toBeNull();
		expect(Math.abs(gap ?? 0)).toBeLessThanOrEqual(2);

		await page.setViewportSize({ width: 1024, height: 900 });
		await expect
			.poll(() =>
				page.evaluate(() => {
					const scrolling = document.scrollingElement;
					return scrolling ? scrolling.scrollWidth - scrolling.clientWidth : 0;
				}),
			)
			.toBeLessThanOrEqual(0);
	});
});
