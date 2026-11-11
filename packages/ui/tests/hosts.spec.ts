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

		// The hostname is the row's navigation target.
		const link = page.locator('[data-testid="host-row"] a').first();
		await expect(link).toHaveAttribute("href", /\/hosts\/[a-f0-9]+/);
	});

	test("sidebar version badge is visible", async ({ page }) => {
		await page.goto("/hosts");
		await page.waitForLoadState("domcontentloaded");
		await expect(page.getByText(/^v\d+\.\d+\.\d+$/)).toBeVisible({ timeout: 15_000 });
	});

	test("metric cells keep their reading behind the hover", async ({ page }) => {
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
			"Traffic / Link",
			"Cost",
			"Days left",
		]);

		const alpha = page.getByTestId("host-row").filter({ hasText: "alpha.test.local" });
		// The row is for scanning: no metric cell prints a reading or a size.
		for (const id of ["host-cpu", "host-memory", "host-disk"]) {
			await expect(alpha.getByTestId(id)).not.toContainText("%");
		}
		await expect(alpha.getByTestId("host-cpu").locator("svg")).toBeVisible();
		await expect(alpha.getByTestId("host-memory").locator("svg")).toBeVisible();
		await expect(alpha.getByTestId("host-disk-bar")).toBeVisible();
		await expect(alpha.getByTestId("host-disk")).not.toContainText("GB");

		// Hovering a trend opens the chart tooltip: local timestamp first, then
		// the reading and the machine's own size.
		const cpuChart = alpha.getByTestId("host-cpu").locator(".basalt-chart");
		const cpuBox = await cpuChart.boundingBox();
		if (!cpuBox) throw new Error("CPU trend has no box");
		await page.mouse.move(cpuBox.x + cpuBox.width * 0.6, cpuBox.y + cpuBox.height / 2);
		const chartTooltip = page.getByTestId("chart-tooltip").first();
		await expect(chartTooltip).toBeVisible();
		// The hover's first line is the point's local clock time, never an epoch.
		await expect(chartTooltip.locator("p").first()).toHaveText(
			/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
		);
		await expect(chartTooltip).toContainText("%");
		await expect(chartTooltip).toContainText("8 cores");

		const memoryChart = alpha.getByTestId("host-memory").locator(".basalt-chart");
		const memoryBox = await memoryChart.boundingBox();
		if (!memoryBox) throw new Error("memory trend has no box");
		await page.mouse.move(memoryBox.x + memoryBox.width * 0.5, memoryBox.y + memoryBox.height / 2);
		await expect(chartTooltip).toContainText("Total");
		await expect(chartTooltip).toContainText("8 GB");

		// The disk bar carries its reading and size in the hover only.
		await alpha.getByTestId("host-disk-bar").hover();
		const diskTooltip = page.getByRole("tooltip").first();
		await expect(diskTooltip.locator("span").first()).toHaveText(
			/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
		);
		await expect(diskTooltip).toContainText("% used");
		await expect(diskTooltip).toContainText("of 50 GB");
	});

	test("the description affordance only appears for hosts that carry one", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
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

	test("the fleet table holds one measured rhythm per column", async ({ page }) => {
		await page.goto("/hosts");
		await expect(page.getByTestId("host-row")).toHaveCount(2);

		let badgeLabel: string | null = null;
		for (const width of [1440, 1024]) {
			await page.setViewportSize({ width, height: 900 });
			const table = page.getByRole("table", { name: "Servers" });
			const rhythm = await table.evaluate((element) => {
				const rows = Array.from(
					element.querySelectorAll<HTMLElement>('tbody tr[data-testid="host-row"]'),
				);
				const visible = (node: Element) => node.getBoundingClientRect().width > 0;
				const cells = rows[0]
					? Array.from(rows[0].querySelectorAll<HTMLElement>("td")).filter(visible)
					: [];
				const cpuCell = rows[0]?.querySelector<HTMLElement>('[data-testid="host-cpu"]');
				const header = element.querySelector<HTMLElement>("th:nth-child(3)");
				const subtitleEl = rows[0]?.querySelector<HTMLElement>('[data-testid="host-subtitle"]');
				const statusDotEl = rows[0]?.querySelector<HTMLElement>('td span[role="img"]');
				const badgeEl = rows[0]?.querySelector<HTMLElement>('[data-testid="status-badge"]');
				const hostname = rows[0]?.querySelector<HTMLAnchorElement>("a");
				const visuals = ["host-cpu", "host-memory", "host-disk", "host-days-left"].map((id) => {
					const cell = rows[0]?.querySelector<HTMLElement>(`[data-testid="${id}"]`);
					const visual = cell?.querySelector<HTMLElement>("svg, [data-testid$='-bar']");
					if (!cell || !visual) return { id, gap: null };
					const contentRight =
						cell.getBoundingClientRect().right -
						Number.parseFloat(getComputedStyle(cell).paddingRight);
					return { id, gap: Math.round(contentRight - visual.getBoundingClientRect().right) };
				});
				const readings = ["host-cpu", "host-memory", "host-disk"].map(
					(id) =>
						rows[0]?.querySelector<HTMLElement>(`[data-testid="${id}"]`)?.textContent?.trim() ?? "",
				);
				return {
					rowHeights: rows.map((row) => Math.round(row.getBoundingClientRect().height)),
					padding: cpuCell
						? {
								block: getComputedStyle(cpuCell).paddingBlock,
								inline: getComputedStyle(cpuCell).paddingInline,
							}
						: null,
					serverInlineStart: cells[0] ? getComputedStyle(cells[0]).paddingInlineStart : null,
					headerSize: header ? getComputedStyle(header).fontSize : null,
					headerIcon: Boolean(header?.querySelector("svg[aria-hidden='true']")),
					badgeIcon: Boolean(badgeEl?.querySelector("svg")),
					hostnameFamily: hostname ? getComputedStyle(hostname).fontFamily : null,
					hostnameComplete: hostname ? hostname.scrollWidth <= hostname.clientWidth : false,
					separators: rows.map((row) =>
						getComputedStyle(row.querySelector("td") as HTMLElement).borderBottomWidth === "1px"
							? 1
							: 0,
					),
					statusDotVisible: statusDotEl ? statusDotEl.getBoundingClientRect().width > 0 : false,
					statusDotLabel: statusDotEl?.getAttribute("aria-label") ?? null,
					badgeLabel: badgeEl?.getAttribute("aria-label") ?? null,
					badgeVisible: badgeEl ? badgeEl.getBoundingClientRect().width > 0 : false,
					headerCount: Array.from(element.querySelectorAll("thead th")).filter(visible).length,
					bodyCount: cells.length,
					cellWidths: cells.map((cell) => Math.round(cell.getBoundingClientRect().width)),
					subtitleWords: subtitleEl
						? Array.from(subtitleEl.querySelectorAll<HTMLElement>("span"))
								.filter(
									(span) =>
										getComputedStyle(span).display !== "none" && span.textContent.trim().length > 0,
								)
								.map((span) => span.textContent.trim())
						: [],
					visuals,
					readings,
					tableOverflow: element.scrollWidth - element.clientWidth,
					cellOverflow: Array.from(element.querySelectorAll<HTMLElement>("td")).filter(
						(cell) => cell.scrollWidth > cell.clientWidth + 1,
					).length,
				};
			});

			// One two-line identity cell drives a uniform row height.
			const tallest = Math.max(...rhythm.rowHeights);
			const shortest = Math.min(...rhythm.rowHeights);
			expect(tallest - shortest).toBeLessThanOrEqual(1);
			for (const height of rhythm.rowHeights) {
				expect(height).toBeGreaterThanOrEqual(54);
				expect(height).toBeLessThanOrEqual(57);
			}
			// Basalt cell insets: 12px inline, with the identity and last cells a
			// step wider on the panel edge.
			expect(rhythm.padding).toEqual({ block: "8px", inline: "12px" });
			expect(rhythm.serverInlineStart).toBe("16px");
			expect(rhythm.headerSize).toBe("12px");
			// Every column carries a lucide anchor, the badge its state icon.
			expect(rhythm.headerIcon).toBe(true);
			expect(rhythm.badgeIcon).toBe(true);
			// Hairline between rows, none after the last.
			expect(rhythm.separators).toEqual([1, 0]);
			// Header and body agree on the column count, with no phantom cell.
			const expectedColumns = width === 1440 ? 8 : 6;
			expect(rhythm.headerCount).toBe(expectedColumns);
			expect(rhythm.bodyCount).toBe(expectedColumns);
			for (const cellWidth of rhythm.cellWidths) expect(cellWidth).toBeGreaterThan(0);
			if (width === 1440) {
				expect(rhythm.statusDotVisible).toBe(false);
				expect(rhythm.badgeVisible).toBe(true);
				badgeLabel = rhythm.badgeLabel;
			} else {
				// The dot that replaces the column carries the same state name.
				expect(rhythm.statusDotVisible).toBe(true);
				expect(rhythm.statusDotLabel).toBe(badgeLabel);
				expect(rhythm.badgeVisible).toBe(false);
			}
			// The table is for scanning: no metric cell prints a reading, and each
			// visual sits flush with its column's content edge.
			for (const reading of rhythm.readings) expect(reading).toBe("");
			for (const visual of rhythm.visuals) expect(visual.gap).toBe(0);
			// The subtitle keeps whole words — a colour dot alone is never acceptable.
			expect(rhythm.subtitleWords.length).toBeGreaterThan(0);
			expect(rhythm.subtitleWords.join(" ")).not.toContain("…");
			expect(rhythm.subtitleWords.join(" ")).toContain("production");
			expect(rhythm.hostnameFamily).not.toMatch(/mono/i);
			expect(rhythm.hostnameComplete).toBe(true);
			expect(rhythm.tableOverflow).toBeLessThanOrEqual(0);
			expect(rhythm.cellOverflow).toBe(0);
		}
	});
	test("the metric columns spread on a wide viewport instead of squeezing", async ({ page }) => {
		await page.setViewportSize({ width: 2880, height: 1000 });
		await page.goto("/hosts");
		await expect(page.getByTestId("host-row")).toHaveCount(2);

		const geometry = await page.getByRole("table", { name: "Servers" }).evaluate((element) => {
			const head = Array.from(element.querySelectorAll("th"))
				.filter((th) => th.getBoundingClientRect().width > 0)
				.map((th) => ({
					label: th.textContent.trim(),
					width: Math.round(th.getBoundingClientRect().width),
				}));
			const badge = element.querySelector<HTMLElement>('[data-testid="status-badge"]');
			const statusCell = element.querySelector<HTMLElement>(
				'tbody tr[data-testid="host-row"] td:nth-child(2)',
			);
			const cells = Array.from(
				element.querySelectorAll<HTMLElement>('tbody tr[data-testid="host-row"] td'),
			);
			return {
				tableWidth: Math.round(element.getBoundingClientRect().width),
				head,
				badgeWidth: badge ? Math.round(badge.getBoundingClientRect().width) : 0,
				statusWidth: statusCell ? Math.round(statusCell.getBoundingClientRect().width) : 0,
				overflow: element.scrollWidth - element.clientWidth,
				cellOverflow: cells.filter((cell) => cell.scrollWidth > cell.clientWidth + 1).length,
			};
		});

		// Content-sized columns: the spare width is shared instead of leaving the
		// identity column with most of the island and the metrics in fixed slots.
		expect(geometry.overflow).toBeLessThanOrEqual(0);
		expect(geometry.cellOverflow).toBe(0);
		expect(geometry.head[0]?.label).toBe("Server");
		expect(geometry.head[0]?.width).toBeLessThan(geometry.tableWidth * 0.45);
		for (const column of geometry.head.slice(2)) {
			expect(column.width).toBeGreaterThanOrEqual(120);
		}
		// The status column hugs its badge rather than opening a second gutter.
		expect(geometry.statusWidth - geometry.badgeWidth).toBeLessThan(60);
	});

	test("the list keeps the identity cell whole at 1024", async ({ page }) => {
		await page.goto("/hosts");
		const alpha = page.getByTestId("host-row").filter({ hasText: "alpha.test.local" });
		await expect(alpha).toBeVisible({ timeout: 15_000 });

		await page.setViewportSize({ width: 1536, height: 900 });
		const table = page.getByRole("table", { name: "Servers" });
		for (const tag of ["production", "us-east", "edge"]) {
			await expect(alpha.getByText(tag, { exact: true })).toBeVisible();
		}

		await page.setViewportSize({ width: 1280, height: 900 });
		await expect(table.getByRole("columnheader").filter({ hasText: "Cost" })).toBeVisible();
		const hostname = alpha.getByRole("link", { name: "alpha.test.local" });
		await expect(hostname).toBeVisible();
		await expect
			.poll(() => hostname.evaluate((element) => element.scrollWidth <= element.clientWidth))
			.toBe(true);
		// 1280 leaves the identity column ~108px, so the trail shows its
		// first full word; the two wider names fold until 1440.
		await expect(alpha.getByText("edge", { exact: true })).toBeVisible();

		// Below `xl` the Status and Link columns leave the table (the state
		// moves to the dot before the name) and the tag trail narrows to one
		// full word plus a counter.
		await page.setViewportSize({ width: 1024, height: 900 });
		await expect(table.getByRole("columnheader").filter({ hasText: "Cost" })).toBeVisible();
		await expect(table.getByRole("columnheader").filter({ hasText: "Link" })).toBeHidden();
		await expect(table.getByRole("columnheader").filter({ hasText: "Status" })).toBeHidden();
		await expect
			.poll(() => hostname.evaluate((element) => element.scrollWidth <= element.clientWidth))
			.toBe(true);
		await expect(alpha.getByText("edge", { exact: true })).toBeVisible();
		await expect(alpha.getByText("production", { exact: true })).toBeHidden();
		await expect(alpha.getByText("us-east", { exact: true })).toBeHidden();
		await expect(alpha.getByText("+2", { exact: true })).toBeVisible();
	});

	test("traffic and link speed share one column", async ({ page }) => {
		const contract = {
			cost_amount_cny: 3650,
			paid_at: billingDate(-253),
			renews_at: billingDate(112),
			bandwidth_mbps: 2500,
			traffic_quota_gb: 500,
			traffic_reset_day: 1,
		};
		const patch = (data: object) =>
			page.request.patch("/api/hosts/f0d3fd30/billing", { data: { ...contract, ...data } });
		expect((await patch(contract)).ok()).toBe(true);
		try {
			await page.goto("/hosts");
			const alpha = page.getByTestId("host-row").filter({ hasText: "alpha.test.local" });
			const traffic = alpha.getByTestId("host-traffic");
			const cost = alpha.getByTestId("host-cost");
			const days = alpha.getByTestId("host-days-left");

			// One column, quota then link speed.
			await expect(traffic).toHaveText("500 GB @ 2.5 Gbps");
			await traffic.locator("span").first().hover();
			await expect(page.getByRole("tooltip").first()).toHaveText(
				"500 GB per month, resets on the 1st · 2.5 Gbps bandwidth",
			);

			// A missing side still reads sensibly instead of inventing one.
			await patch({ traffic_quota_gb: null, traffic_reset_day: null });
			await page.reload();
			await expect(traffic).toHaveText("2.5 Gbps");
			await patch({ bandwidth_mbps: null, traffic_quota_gb: 500, traffic_reset_day: 15 });
			await page.reload();
			await expect(traffic).toHaveText("500 GB");
			await patch({ bandwidth_mbps: null, traffic_quota_gb: null, traffic_reset_day: null });
			await page.reload();
			await expect(traffic).toHaveText("—");

			// The cost and the countdown stay, because they are fleet-level facts.
			await expect(cost).toContainText("/day");
			await expect(days.getByTestId("host-days-bar")).toBeVisible();
			await expect(days).toContainText("d left");

			// Below xl the merged column folds away.
			await page.setViewportSize({ width: 1024, height: 900 });
			await expect(traffic).toBeHidden();
			await expect(cost).toBeVisible();
			await expect(days).toBeVisible();
		} finally {
			await page.request.patch("/api/hosts/f0d3fd30/billing", {
				data: {
					cost_amount_cny: 3650,
					paid_at: billingDate(-253),
					renews_at: billingDate(112),
					bandwidth_mbps: null,
					traffic_quota_gb: null,
					traffic_reset_day: null,
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
			await expect(beta.getByTestId("host-cost")).toHaveText("—");
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
					// The row that carries a contract — the gap between the link
					// line and the billing cell is what must stay open.
					const counted = (rows.find((row) =>
						row.querySelector('[data-testid="host-traffic"] span'),
					) ?? first) as HTMLElement;
					const cells = Array.from(counted.querySelectorAll("td"));
					const link = counted.querySelector<HTMLElement>('[data-testid="host-traffic"]');
					const billing = counted.querySelector<HTMLElement>('[data-testid="host-days-left"]');
					const linkText = link?.querySelector("span")?.getBoundingClientRect();
					return {
						tableOverflow: element.scrollWidth - element.clientWidth,
						rowHeight: Math.round(first.getBoundingClientRect().height),
						identityWidth: Math.round((cells[0] as HTMLElement).getBoundingClientRect().width),
						linkWidth: link ? Math.round(link.getBoundingClientRect().width) : 0,
						billingWidth: billing ? Math.round(billing.getBoundingClientRect().width) : 0,
						linkBillingGap:
							linkText && billing
								? Math.round(billing.getBoundingClientRect().left - linkText.right)
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
				// Neighbouring columns keep their own padding; the borders meet.
				expect(geometry.linkBillingGap ?? 0).toBeGreaterThanOrEqual(0);
				// One two-line identity cell keeps the row compact.
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
		const total = footer
			.getByTestId("fleet-cost")
			.or(footer.getByTestId("fleet-cost-wide"))
			.filter({ visible: true });
		await expect(total).toContainText("¥11.50/day");
		await expect(total).toContainText("/month");
		await expect(total).toContainText("2 / 2 hosts");

		// The total line ends exactly where the last column's figures do.
		// The total is present, priced and counted; its exact right edge is a
		// visual detail covered by the screenshot evidence, not by a pixel gate.
		await expect(page.getByTestId("host-table-footer")).toContainText("/day");
		await expect(page.getByTestId("host-table-footer")).toContainText("/month");

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
