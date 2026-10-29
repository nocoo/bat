import { expect, type Locator, test } from "@playwright/test";

async function areaBoxes(chart: Locator, count: number) {
	const areas = chart.locator(".recharts-area-area");
	await expect(areas).toHaveCount(count);
	return areas.evaluateAll((elements) =>
		elements.map((element) => {
			const { x, y, width, height } = (element as SVGGraphicsElement).getBBox();
			return { x, y, width, height };
		}),
	);
}

for (const resolution of ["raw", "hourly"] as const) {
	for (const theme of ["light", "dark"] as const) {
		for (const width of [1440, 390]) {
			test(`${resolution} ${theme} ${width}px: stacked series keep their units and axes`, async ({
				page,
			}, testInfo) => {
				await page.setViewportSize({ width, height: 900 });
				await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
				await page.route("**/api/hosts/*/metrics?*", async (route) => {
					const response = await route.fetch();
					const original = await response.json();
					const disk =
						resolution === "raw"
							? { read_iops: 1000, write_iops: 500, io_util_pct: 60 }
							: { read_iops_avg: 1000, write_iops_avg: 500, io_util_pct_avg: 60 };
					await route.fulfill({
						response,
						json: {
							...original,
							resolution,
							data: [0, 1, 2].map((index) => ({
								...original.data[0],
								ts: original.to - (2 - index) * (resolution === "raw" ? 30 : 3600),
								cpu_usage_pct: 30,
								cpu_iowait: 20,
								cpu_steal: 10,
								tcp_established: 100,
								tcp_time_wait: 50,
								tcp_orphan: 25,
								disk_io_json: JSON.stringify([{ device: "sda", ...disk }]),
							})),
						},
					});
				});
				try {
					await page.goto("/hosts/f0d3fd30");
					if (resolution === "hourly") {
						await page.getByRole("radio", { name: "7d", exact: true }).click();
					}
					for (const [title, values, labels] of [
						["CPU", [30, 20, 10], ["CPU Usage", "IO Wait", "Steal"]],
						["TCP Connections", [100, 50, 25], ["Established", "TIME_WAIT", "Orphan"]],
						["Disk I/O", [1000, 500], ["Read IOPS", "Write IOPS", "Utilization %"]],
					] as const) {
						const card = page
							.getByText(title, { exact: true })
							.locator("../..")
							.filter({ has: page.locator(".recharts-wrapper") });
						const chart = card.locator(".recharts-wrapper");
						await chart.scrollIntoViewIfNeeded();
						const boxes = await areaBoxes(chart, values.length);
						for (const [index, box] of boxes.entries()) {
							expect(box.height).toBeGreaterThan(0);
							if (index > 0) {
								expect(Math.abs(box.y + box.height - boxes[index - 1].y)).toBeLessThan(1);
								expect(box.height / boxes[0].height).toBeCloseTo(values[index] / values[0], 2);
							}
						}
						await expect(chart.locator(".recharts-line")).toHaveCount(title === "Disk I/O" ? 1 : 0);
						if (title === "CPU") {
							await expect(chart.locator(".recharts-yAxis-tick-labels")).toContainText("100%");
						}
						if (title === "Disk I/O") {
							const axes = chart.locator(".recharts-yAxis-tick-labels");
							await expect(axes).toHaveCount(2);
							await expect(axes.nth(0)).not.toContainText("%");
							await expect(axes.nth(1)).toContainText("100%");
							const axisBoxes = await Promise.all([
								axes.nth(0).boundingBox(),
								axes.nth(1).boundingBox(),
							]);
							expect(axisBoxes[1]?.x).toBeGreaterThan(axisBoxes[0]?.x ?? 0);
							const lineY = await chart
								.locator(".recharts-line-curve")
								.evaluate((element) => (element as SVGGraphicsElement).getBBox().y);
							const gridYs = await chart
								.locator(".recharts-cartesian-grid-horizontal line")
								.evaluateAll((lines) => lines.map((line) => Number(line.getAttribute("y1"))));
							const top = Math.min(...gridYs),
								bottom = Math.max(...gridYs);
							expect(Math.abs(lineY - (top + (bottom - top) * 0.4))).toBeLessThan(1);
						}
						await chart.hover();
						const tooltip = card.getByTestId("chart-tooltip");
						await expect(tooltip).toBeVisible();
						for (const label of labels) await expect(tooltip).toContainText(label);
						for (const value of values) {
							await expect(
								tooltip.getByText(
									title === "CPU"
										? `${value.toFixed(1)}%`
										: title === "Disk I/O"
											? value.toFixed(1)
											: String(value),
									{ exact: true },
								),
							).toBeVisible();
						}
						if (title === "Disk I/O")
							await expect(tooltip.getByText("60.0", { exact: true })).toBeVisible();
						await card.screenshot({
							path: testInfo.outputPath(`${title.replaceAll("/", "-")}.png`),
						});
					}
					await expect
						.poll(() =>
							page
								.locator("[data-basalt-island]")
								.evaluate((element) => element.scrollWidth <= element.clientWidth),
						)
						.toBe(true);
				} finally {
					await page.unrouteAll({ behavior: "wait" });
				}
			});
		}
	}
}
