import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.describe("Host detail page", () => {
	const alphaHid = "f0d3fd30";
	const betaHid = "4c494cde";
	const publicIpv6 = "2001:db8:85a3:8d3:1319:8a2e:370:7348";

	test("network legend uses inbound and outbound labels", async ({ page }) => {
		await page.goto(`/hosts/${alphaHid}`);
		const networkHeader = page.getByText("Network", { exact: true }).locator("..");
		await expect(networkHeader.getByText("Inbound", { exact: true })).toBeVisible();
		await expect(networkHeader.getByText("Outbound", { exact: true })).toBeVisible();
		await expect(networkHeader.getByText(/^(Download|Upload)$/)).toHaveCount(0);
	});

	test("sidebar navigation is present", async ({ page }) => {
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		const hostsLink = page.getByRole("link", { name: "Hosts" }).first();
		await expect(hostsLink).toBeVisible({ timeout: 15_000 });
	});

	test("breadcrumb shows Hosts link", async ({ page }) => {
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb", exact: true });
		await expect(breadcrumb).toBeVisible({ timeout: 15_000 });

		const hostsLink = breadcrumb.getByRole("link", { name: "Hosts" });
		await expect(hostsLink).toBeVisible();
	});

	test("clicking Hosts breadcrumb navigates back", async ({ page }) => {
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb", exact: true });
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

	test("back control sits left of the title and editable description and returns to Hosts", async ({
		page,
	}) => {
		await page.goto(`/hosts/${alphaHid}`);
		const title = page.getByRole("heading", { name: "alpha.test.local", exact: true });
		const back = page.getByRole("link", { name: "Back to hosts", exact: true });
		await expect(title).toBeVisible();
		await expect(back).toHaveAttribute("href", "/hosts");
		for (const width of [1280, 390]) {
			await page.setViewportSize({ width, height: 900 });
			// The shell resolves its responsive layout after the viewport change;
			// measure only once the back control has moved to the current column.
			await expect
				.poll(async () => (await back.boundingBox())?.x ?? Number.POSITIVE_INFINITY)
				.toBeLessThan(width === 390 ? 100 : 400);
			const button = await back.boundingBox();
			const heading = await title.boundingBox();
			const description = await page
				.getByRole("group", { name: "Host description", exact: true })
				.boundingBox();
			expect(button && heading && button.x + button.width < heading.x).toBe(true);
			expect(button && description && button.x + button.width < description.x).toBe(true);
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

	test("the lead block shows both public families as single-line rows", async ({ page }) => {
		for (const viewport of [
			{ width: 1440, height: 1000 },
			{ width: 1024, height: 1000 },
			{ width: 900, height: 1000 },
		]) {
			await page.setViewportSize(viewport);
			await page.goto(`/hosts/${alphaHid}`);
			await page.waitForLoadState("domcontentloaded");

			const header = page.getByTestId("host-detail-header");
			const v4Row = header.getByText("IPv4", { exact: true }).locator("..");
			const v6Row = header.getByText("IPv6", { exact: true }).locator("..");
			await expect(v4Row.getByTestId("ip-address-row-value")).toHaveText("203.0.113.10");
			await expect(
				v6Row.getByRole("button", { name: `Copy address ${publicIpv6}`, exact: true }),
			).toHaveAttribute("title", publicIpv6);

			// The IPv6 stays on one line in the fixed short form: the head and the
			// tail of the literal, and the full literal stays in title and name.
			const shown = (await v6Row.getByTestId("ip-address-row-value").textContent()) ?? "";
			expect(shown).toBe("2001:db8…7348");
			expect(shown.length).toBeLessThanOrEqual(14);
			expect(publicIpv6.startsWith(shown.split("…")[0] ?? "")).toBe(true);
			expect(publicIpv6.endsWith(shown.split("…")[1] ?? "")).toBe(true);

			for (const row of [v4Row, v6Row]) {
				const box = await row.evaluate((element) => {
					const rect = element.getBoundingClientRect();
					const value = element.querySelector('[data-testid="ip-address-row-value"]');
					return {
						height: Math.round(rect.height),
						clipped: element.scrollWidth > element.clientWidth + 1,
						valueClipped: (value?.scrollWidth ?? 0) > (value?.clientWidth ?? 0) + 1,
					};
				});
				expect(box.clipped).toBe(false);
				expect(box.valueClipped).toBe(false);
				expect(box.height).toBeLessThanOrEqual(28);
			}

			// The families share one baseline only where the lead column is wide
			// enough for two meaningful columns.
			const v4Box = await v4Row.boundingBox();
			const v6Box = await v6Row.boundingBox();
			const sideBySide = v4Box !== null && v6Box !== null && Math.abs(v4Box.y - v6Box.y) <= 2;
			expect(sideBySide).toBe(viewport.width >= 1440);

			// The rows start on the same left edge as the title above them.
			const titleBox = await header.getByText("Public address", { exact: true }).boundingBox();
			expect(Math.abs((v4Box?.x ?? 0) - (titleBox?.x ?? 0))).toBeLessThanOrEqual(1);
		}
	});

	test("the copy button never covers the address characters", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		const row = page
			.getByTestId("host-detail-header")
			.getByText("IPv6", { exact: true })
			.locator("..");
		await expect(row.getByTestId("ip-address-row-value")).toBeVisible({ timeout: 15_000 });

		const measure = () =>
			row.evaluate((element) => {
				const value = element.querySelector('[data-testid="ip-address-row-value"]');
				const button = element.querySelector('[data-testid="ip-address-row-copy"]');
				if (!value || !button) {
					return null;
				}
				const range = document.createRange();
				range.selectNodeContents(value);
				const textRight = Math.max(...Array.from(range.getClientRects()).map((rect) => rect.right));
				return {
					textRight: Math.round(textRight),
					rowRight: Math.round(element.getBoundingClientRect().right),
					buttonLeft: Math.round(button.getBoundingClientRect().left),
				};
			});

		// At rest the hidden button owns no width, so the address ends at the row end.
		const resting = await measure();
		expect(resting).not.toBeNull();
		expect(Math.abs((resting?.textRight ?? 0) - (resting?.rowRight ?? 0))).toBeLessThanOrEqual(1);

		// While the button is visible it reserves its own width and never covers the text.
		await row.hover();
		const hovered = await measure();
		expect(hovered?.textRight ?? 0).toBeLessThanOrEqual(hovered?.buttonLeft ?? 0);
	});

	test("hover and keyboard focus reveal the copy button", async ({ page }) => {
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		const copyButton = page
			.getByTestId("host-detail-header")
			.getByRole("button", { name: `Copy address ${publicIpv6}`, exact: true });
		await expect(copyButton).toBeVisible({ timeout: 15_000 });
		await expect(copyButton).toHaveCSS("opacity", "0");

		await copyButton.hover();
		await expect(copyButton).toHaveCSS("opacity", "1");

		await page.mouse.move(0, 0);
		await expect(copyButton).toHaveCSS("opacity", "0");

		await copyButton.focus();
		await expect(copyButton).toHaveCSS("opacity", "1");
	});

	test("clicking the row copies the untouched literal and shows an in-place success check", async ({
		page,
		context,
	}) => {
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		const copyButton = page
			.getByTestId("host-detail-header")
			.getByRole("button", { name: `Copy address ${publicIpv6}`, exact: true });
		await expect(copyButton).toBeVisible({ timeout: 15_000 });
		expect(await copyButton.getAttribute("data-state")).toBe("idle");

		await copyButton.click();

		await expect(copyButton).toHaveAttribute("data-state", "copied");
		await expect(copyButton).toHaveCSS("opacity", "1");
		await expect(copyButton.locator("svg")).toHaveClass(/text-basalt-success/);
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(publicIpv6);

		await expect(copyButton).toHaveAttribute("data-state", "idle", { timeout: 5_000 });
	});

	test("a refused copy shows the warning state instead of pretending", async ({ page }) => {
		await page.addInitScript(() => {
			Object.defineProperty(navigator, "clipboard", {
				configurable: true,
				value: { writeText: () => Promise.reject(new Error("clipboard denied")) },
			});
		});
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		const chip = page
			.getByTestId("host-detail-header")
			.getByRole("button", { name: `Copy address ${publicIpv6}`, exact: true });
		await expect(chip).toBeVisible({ timeout: 15_000 });
		await chip.click();

		await expect(chip).toHaveAttribute("data-state", "failed");
		await expect(chip.locator("svg")).toHaveClass(/text-basalt-warning/);
		await expect(
			page.getByRole("status").filter({ hasText: `Could not copy address: ${publicIpv6}` }),
		).toBeVisible();
	});

	test("reduced motion drops the overlay transition and the check animation", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		const copyButton = page
			.getByTestId("host-detail-header")
			.getByRole("button", { name: `Copy address ${publicIpv6}`, exact: true });
		await expect(copyButton).toBeVisible({ timeout: 15_000 });
		await expect(copyButton).toHaveCSS("transition-property", "none");
	});

	test("copy success and failure are announced in an accessible live region", async ({
		page,
		context,
	}) => {
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		const chip = page
			.getByTestId("host-detail-header")
			.getByRole("button", { name: `Copy address ${publicIpv6}`, exact: true });
		await expect(chip).toBeVisible({ timeout: 15_000 });
		await chip.click();
		await expect(
			page.getByRole("status").filter({ hasText: `Address copied: ${publicIpv6}` }),
		).toBeVisible();
	});

	test("the live region node survives repeated copies and re-announces the message", async ({
		page,
		context,
	}) => {
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		const chip = page
			.getByTestId("host-detail-header")
			.getByRole("button", { name: `Copy address ${publicIpv6}`, exact: true });
		await expect(chip).toBeVisible({ timeout: 15_000 });

		// The live region belongs to the address row and remains mounted across copies.
		const region = chip.locator("xpath=../following-sibling::*[@role='status']");
		await region.evaluate((element) => {
			element.setAttribute("data-live-region", "stable");
		});

		await chip.click();
		await expect(
			page.getByRole("status").filter({ hasText: `Address copied: ${publicIpv6}` }),
		).toBeVisible();

		await chip.click();
		await expect(
			page.getByRole("status").filter({ hasText: `Address copied: ${publicIpv6}` }),
		).toBeVisible();

		// The same node is still in the document — it was never remounted, only its
		// text changed — so the repeated message is announced again.
		await expect(page.locator('[data-live-region="stable"]')).toHaveCount(1);
		await expect(page.locator('[data-live-region="stable"]')).toHaveText(
			`Address copied: ${publicIpv6}`,
		);
	});

	test("a longest IPv4 remains complete and the Reading values stay untruncated", async ({
		page,
	}) => {
		for (const viewport of [
			{ width: 1440, height: 1000 },
			{ width: 1024, height: 1000 },
		]) {
			await page.setViewportSize(viewport);
			await page.goto(`/hosts/${alphaHid}`);
			await page.waitForLoadState("domcontentloaded");

			const header = page.getByTestId("host-detail-header");
			const row = header.getByText("IPv4", { exact: true }).locator("..");
			await expect(
				row.getByRole("button", { name: "Copy address 203.0.113.10", exact: true }),
			).toBeVisible({ timeout: 15_000 });
			const value = row.getByTestId("ip-address-row-value");
			await value.evaluate((element) => {
				element.textContent = "123.123.123.123";
			});

			const ipv4Geometry = await value.evaluate((element) => {
				const rect = element.getBoundingClientRect();
				return {
					text: element.textContent,
					width: Math.round(rect.width),
					clientWidth: element.clientWidth,
					scrollWidth: element.scrollWidth,
					clipped: element.scrollWidth > element.clientWidth + 1,
				};
			});
			expect(ipv4Geometry.text).toBe("123.123.123.123");
			expect(ipv4Geometry.text).toHaveLength(15);
			expect(ipv4Geometry.clipped).toBe(false);

			for (const label of ["CPU", "Memory", "Load 1m", "Disk"]) {
				const readingValue = header
					.getByText(label, { exact: true })
					.locator("..")
					.locator("span.font-mono")
					.first();
				await expect(readingValue).toBeVisible({ timeout: 15_000 });
				const geometry = await readingValue.evaluate((element) => {
					const rect = element.getBoundingClientRect();
					return {
						text: element.textContent,
						width: Math.round(rect.width),
						clientWidth: element.clientWidth,
						scrollWidth: element.scrollWidth,
						clipped: element.scrollWidth > element.clientWidth + 1,
					};
				});
				expect(geometry.text).toBeTruthy();
				expect(geometry.text).not.toContain("…");
				// The reading columns keep their values whole at 1440 and 1024.
				expect(geometry.clipped).toBe(false);
			}

			// The supporting line under each reading stays whole too.
			const details = await header.evaluate((element) =>
				Array.from(element.querySelectorAll("p.truncate")).map((node) => ({
					text: node.textContent ?? "",
					clipped: node.scrollWidth > node.clientWidth + 1,
				})),
			);
			for (const detail of details) {
				expect(detail.clipped).toBe(false);
			}

			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
				true,
			);
		}
	});

	test("public and interface rows stay compact and clipped-free in System Info", async ({
		page,
	}) => {
		for (const viewport of [
			{ width: 1440, height: 1000 },
			{ width: 1024, height: 1000 },
			{ width: 900, height: 1000 },
		]) {
			await page.setViewportSize(viewport);
			await page.goto(`/hosts/${alphaHid}`);
			await page.waitForLoadState("domcontentloaded");

			const publicV4 = page.getByText("Public IPv4", { exact: true }).locator("..");
			const iface = page.getByTestId("host-interface-eth0").getByTestId("ip-address-row").first();
			await expect(publicV4).toBeVisible({ timeout: 15_000 });
			await expect(iface).toBeVisible();

			for (const row of [publicV4, iface]) {
				const box = await row.boundingBox();
				expect(box?.height ?? 0).toBeLessThan(60);
				expect(
					await row.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
				).toBe(true);
			}
		}
	});

	test("disk fixtures render one same-device donut or separate two-device donuts", async ({
		page,
	}, testInfo) => {
		const fixtures = [
			{
				name: "same-device",
				disks: [
					{
						mount: "/mnt/data-01",
						device: "/dev/vda1",
						fs_type: "ext4",
						used_pct: 82,
						total_bytes: 1000,
						avail_bytes: 180,
					},
					{
						mount: "/",
						device: "/dev/vda1",
						fs_type: "ext4",
						used_pct: 82,
						total_bytes: 1000,
						avail_bytes: 180,
					},
					{
						mount: "/home",
						device: "/dev/vda1",
						fs_type: "ext4",
						used_pct: 82,
						total_bytes: 1000,
						avail_bytes: 180,
					},
				],
				expected: 1,
			},
			{
				name: "two-device",
				disks: [
					{
						mount: "/",
						device: "/dev/vda1",
						fs_type: "ext4",
						used_pct: 72,
						total_bytes: 1000,
						avail_bytes: 280,
					},
					{
						mount: "/data",
						device: "/dev/vdb1",
						fs_type: "xfs",
						used_pct: 95,
						total_bytes: 2000,
						avail_bytes: 100,
					},
				],
				expected: 2,
			},
		] as const;

		const measurements: Array<{
			fixture: string;
			width: number;
			donuts: number;
			sectorFills: string[];
			cardHeight: number;
			summaryText: number;
		}> = [];

		for (const fixture of fixtures) {
			await page.route("**/api/hosts/*/metrics?*", async (route) => {
				const response = await route.fetch();
				const original = await response.json();
				await route.fulfill({
					response,
					json: {
						...original,
						data: [
							{
								...original.data[0],
								disk_json: JSON.stringify(fixture.disks),
							},
						],
					},
				});
			});

			for (const width of [1440, 1024, 900]) {
				await page.setViewportSize({ width, height: 1000 });
				await page.goto(`/hosts/${alphaHid}`);
				await expect(page.getByText("Disk Usage", { exact: true })).toBeVisible({
					timeout: 15_000,
				});

				const donuts = page.getByTestId("disk-donut");
				await expect(donuts).toHaveCount(fixture.expected);
				for (let index = 0; index < fixture.expected; index += 1) {
					await expect(donuts.nth(index)).toBeVisible();
				}

				const sectorFills = await donuts.evaluateAll((nodes) =>
					nodes.flatMap((node) =>
						Array.from(node.querySelectorAll("path.recharts-sector")).map(
							(path) => getComputedStyle(path).fill,
						),
					),
				);
				expect(sectorFills.length).toBe(fixture.expected * 2);
				for (const fill of sectorFills) {
					expect(fill).not.toBe("rgb(0, 0, 0)");
					expect(fill).not.toBe("none");
				}
				expect(new Set(sectorFills).size).toBeGreaterThan(1);

				// The chart shell must not repeat the disk summary above the donut.
				await expect(page.getByText(/free across/)).toHaveCount(0);

				const card = page
					.getByText("Disk Usage", { exact: true })
					.locator("xpath=ancestor::*[@data-basalt-surface][1]");
				const cardBox = await card.boundingBox();
				expect(cardBox?.height ?? 0).toBeLessThan(320);

				await card.screenshot({
					path: testInfo.outputPath(`disk-${fixture.name}-${width}.png`),
				});

				measurements.push({
					fixture: fixture.name,
					width,
					donuts: fixture.expected,
					sectorFills: [...new Set(sectorFills)],
					cardHeight: Math.round(cardBox?.height ?? 0),
					summaryText: 0,
				});
			}

			await page.unrouteAll({ behavior: "wait" });
		}

		console.log(`DISK_MEASUREMENTS ${JSON.stringify(measurements)}`);
	});

	test("system info values and interface addresses share one right edge", async ({
		page,
	}, testInfo) => {
		const measurements: Array<{
			width: number;
			kernel: number;
			cpu: number;
			publicIpv4: number;
			publicIpv6: number;
			interfaceAddress: number;
		}> = [];

		for (const width of [1440, 1024]) {
			await page.setViewportSize({ width, height: 1000 });
			await page.goto(`/hosts/${alphaHid}`);
			await expect(page.getByText("System Info", { exact: true })).toBeVisible({
				timeout: 15_000,
			});

			const systemHeading = page.getByText("System Info", { exact: true });
			const systemBody = systemHeading.locator("xpath=../following-sibling::*[1]");
			const interfacesPanel = page.getByText("Interfaces", { exact: true }).locator("..");

			const textRight = (locator: ReturnType<typeof page.getByText>) =>
				locator.evaluate((element) => {
					const range = document.createRange();
					range.selectNodeContents(element);
					return Math.round(
						Math.max(...Array.from(range.getClientRects()).map((rect) => rect.right)),
					);
				});

			const kernel = await textRight(
				systemBody.getByText("Kernel", { exact: true }).locator("..").locator("span").last(),
			);
			const cpu = await textRight(
				systemBody.getByText("CPU", { exact: true }).locator("..").locator("span").last(),
			);
			const publicIpv4 = await textRight(
				systemBody
					.getByText("Public IPv4", { exact: true })
					.locator("..")
					.getByTestId("ip-address-row-value"),
			);
			const publicIpv6 = await textRight(
				systemBody
					.getByText("Public IPv6", { exact: true })
					.locator("..")
					.getByTestId("ip-address-row-value"),
			);
			const interfaceAddress = await textRight(
				page.getByTestId("host-interface-eth0").getByTestId("ip-address-row-value").first(),
			);

			for (const edge of [cpu, publicIpv4, publicIpv6, interfaceAddress]) {
				expect(Math.abs(edge - kernel)).toBeLessThanOrEqual(1);
			}

			await systemBody.screenshot({
				path: testInfo.outputPath(`system-info-${width}.png`),
			});
			await interfacesPanel.screenshot({
				path: testInfo.outputPath(`interfaces-${width}.png`),
			});

			measurements.push({ width, kernel, cpu, publicIpv4, publicIpv6, interfaceAddress });
		}

		console.log(`SYSTEM_INFO_MEASUREMENTS ${JSON.stringify(measurements)}`);
	});

	test("keyboard activation copies the literal", async ({ page, context }) => {
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		const chip = page
			.getByTestId("host-detail-header")
			.getByRole("button", { name: "Copy address 203.0.113.10", exact: true });
		await expect(chip).toBeVisible({ timeout: 15_000 });
		await chip.focus();
		await chip.press("Enter");

		await expect(chip).toHaveAttribute("data-state", "copied");
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("203.0.113.10");
	});

	test("a family without an observation does not render a row", async ({ page }) => {
		await page.goto(`/hosts/${betaHid}`);
		await page.waitForLoadState("domcontentloaded");

		const header = page.getByTestId("host-detail-header");
		await expect(
			header.getByRole("button", { name: "Copy address 198.51.100.20", exact: true }),
		).toBeVisible({ timeout: 15_000 });
		await expect(header.getByText("IPv6", { exact: true })).toHaveCount(0);
		await expect(
			header.getByRole("button", { name: "No address observed", exact: true }),
		).toHaveCount(0);
		await expect(page.getByText("Public IPv6", { exact: true })).toHaveCount(0);
	});

	test("system info shows only observed public family rows", async ({ page }) => {
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByText("Public IPv4", { exact: true })).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText("Public IPv6", { exact: true })).toBeVisible();
		await expect(page.getByText("Public IP", { exact: true })).toHaveCount(0);

		const v4Row = page.getByText("Public IPv4", { exact: true }).locator("..");
		const v6Row = page.getByText("Public IPv6", { exact: true }).locator("..");
		await expect(v4Row.getByTestId("ip-address-row-value")).toHaveText("203.0.113.10");
		const systemShown = (await v6Row.getByTestId("ip-address-row-value").textContent()) ?? "";
		expect(systemShown).toBe("2001:db8…7348");
		expect(systemShown.length).toBeLessThanOrEqual(14);
		expect(publicIpv6.startsWith(systemShown.split("…")[0] ?? "")).toBe(true);
		expect(publicIpv6.endsWith(systemShown.split("…")[1] ?? "")).toBe(true);
		await expect(v4Row).toBeVisible();
		await expect(v6Row).toBeVisible();
	});

	test("interfaces name each interface once and indent its addresses", async ({ page }) => {
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByText("Interfaces", { exact: true })).toBeVisible({ timeout: 15_000 });
		const interfaces = page.getByTestId("host-interface-eth0");
		await expect(interfaces.getByText("eth0", { exact: true })).toHaveCount(1);

		const rows = interfaces.getByTestId("ip-address-row");
		await expect(rows).toHaveCount(4);
		const expected = [
			"10.0.1.10",
			"203.0.113.10",
			"2001:db8:85a3:8d3:1319:8a2e:370:7349",
			"fe80::5054:ff:fe12:3456",
		];
		const nameBox = await interfaces.getByText("eth0", { exact: true }).boundingBox();
		for (const address of expected) {
			const copyButton = interfaces.getByRole("button", {
				name: `Copy address ${address}`,
				exact: true,
			});
			await expect(copyButton).toBeVisible();
			await expect(copyButton).toHaveAttribute("title", address);
			const row = copyButton.locator("..");
			const box = await row.boundingBox();
			expect(box?.height ?? 0).toBeLessThanOrEqual(28);
			// The addresses sit below and indented from the interface name.
			expect(box?.x ?? 0).toBeGreaterThan(nameBox?.x ?? 0);
			expect(box?.y ?? 0).toBeGreaterThan(nameBox?.y ?? 0);
		}
		const tops = await Promise.all(
			expected.map((address) =>
				interfaces
					.getByRole("button", { name: `Copy address ${address}`, exact: true })
					.evaluate((element) => Math.round(element.getBoundingClientRect().top)),
			),
		);
		expect(new Set(tops).size).toBe(tops.length);
	});

	test("address rows stay clipped-free at a narrow width", async ({ page }) => {
		await page.setViewportSize({ width: 900, height: 1000 });
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByTestId("host-interface-eth0")).toBeVisible({ timeout: 15_000 });
		const rows = page.getByTestId("ip-address-row");
		const count = await rows.count();
		expect(count).toBeGreaterThan(4);
		for (let index = 0; index < count; index += 1) {
			const row = rows.nth(index);
			await row.scrollIntoViewIfNeeded();
			expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
			const box = await row.boundingBox();
			expect(box?.height ?? 0).toBeLessThan(60);
		}
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true,
		);
	});

	test("1440, 1024 and 900px jp2 address screenshots and geometry", async ({
		page,
		context,
	}, testInfo) => {
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		const ifaces = JSON.parse(readFileSync("/tmp/jp2-ifaces.json", "utf8")) as unknown[];
		const ipv4 = "123.123.123.123";
		const ipv6 = "2001:0db8:85a3:0000:0000:8a2e:0370:7348";

		await page.route("**/api/hosts*", async (route) => {
			const response = await route.fetch();
			const hosts = await response.json();
			await route.fulfill({
				response,
				json: Array.isArray(hosts)
					? hosts.map((host) =>
							host.host_id === alphaHid
								? { ...host, hostname: "jp2", public_ip_v4: ipv4, public_ip_v6: ipv6 }
								: host,
						)
					: hosts,
			});
		});

		await page.route("**/api/hosts/f0d3fd30", async (route) => {
			const response = await route.fetch();
			const detail = await response.json();
			await route.fulfill({
				response,
				json: {
					...detail,
					hostname: "jp2",
					public_ip_v4: ipv4,
					public_ip_v6: ipv6,
					net_interfaces: ifaces,
				},
			});
		});

		const measurements: Array<{
			width: number;
			publicV4V6SideBySide: boolean;
			ipv4Shown: string;
			ipv6Shown: string;
			interfacesHeight: number;
			interfaceRows: number;
		}> = [];

		for (const width of [1440, 1024, 900]) {
			await page.setViewportSize({ width, height: 1000 });
			await page.goto(`/hosts/${alphaHid}`);
			await page.waitForLoadState("domcontentloaded");

			const header = page.getByTestId("host-detail-header");
			const v4Row = header.getByText("IPv4", { exact: true }).locator("..");
			const v6Row = header.getByText("IPv6", { exact: true }).locator("..");
			await expect(v4Row.getByTestId("ip-address-row-value")).toHaveText(ipv4);

			const v4Box = await v4Row.boundingBox();
			const v6Box = await v6Row.boundingBox();
			const sideBySide = v4Box !== null && v6Box !== null && Math.abs(v4Box.y - v6Box.y) <= 2;
			expect(sideBySide).toBe(width >= 1440);

			const valueGeometry = await Promise.all(
				[v4Row, v6Row].map((row) =>
					row.getByTestId("ip-address-row-value").evaluate((element) => {
						const rect = element.getBoundingClientRect();
						return {
							text: element.textContent ?? "",
							width: Math.round(rect.width),
							height: Math.round(rect.height),
							clipped: element.scrollWidth > element.clientWidth + 1,
						};
					}),
				),
			);
			// The IPv4 stays whole; the IPv6 keeps one line in the fixed short form.
			expect(valueGeometry[0]?.text).toBe(ipv4);
			expect(valueGeometry[0]?.text).not.toContain("…");
			expect(valueGeometry[1]?.text).toBe("2001:0db8…7348");
			expect(valueGeometry[1]?.text?.length ?? 0).toBeLessThanOrEqual(14);
			expect(ipv6.startsWith(valueGeometry[1]?.text?.split("…")[0] ?? "")).toBe(true);
			expect(ipv6.endsWith(valueGeometry[1]?.text?.split("…")[1] ?? "")).toBe(true);
			for (const geometry of valueGeometry) {
				expect(geometry?.clipped).toBe(false);
				expect(geometry?.height ?? 0).toBeLessThanOrEqual(24);
			}

			const interfacesHeading = page.getByText("Interfaces", { exact: true });
			await expect(interfacesHeading).toBeVisible({ timeout: 15_000 });
			const interfacesPanel = interfacesHeading.locator("..");
			const interfacesBox = await interfacesPanel.boundingBox();
			const interfaceRows = await page.getByTestId("ip-address-row").count();
			expect(interfaceRows).toBeGreaterThan(14);

			await header.screenshot({
				path: testInfo.outputPath(`jp2-${width}-public-address.png`),
			});

			const systemHeading = page.getByText("System Info", { exact: true });
			await expect(systemHeading).toBeVisible({ timeout: 15_000 });
			const systemBody = systemHeading.locator("xpath=../following-sibling::*[1]");
			await systemBody.screenshot({
				path: testInfo.outputPath(`jp2-${width}-system-info.png`),
			});

			await interfacesPanel.screenshot({
				path: testInfo.outputPath(`jp2-${width}-interfaces.png`),
			});

			// Hover and copied states of the same row.
			const copyButton = v6Row.getByRole("button", { name: `Copy address ${ipv6}`, exact: true });
			await copyButton.hover();
			await expect(copyButton).toHaveCSS("opacity", "1");
			await header.screenshot({
				path: testInfo.outputPath(`jp2-${width}-public-address-hover.png`),
			});
			await copyButton.click();
			await expect(copyButton).toHaveAttribute("data-state", "copied");
			await header.screenshot({
				path: testInfo.outputPath(`jp2-${width}-public-address-copied.png`),
			});

			measurements.push({
				width,
				publicV4V6SideBySide: sideBySide,
				ipv4Shown: valueGeometry[0]?.text ?? "",
				ipv6Shown: valueGeometry[1]?.text ?? "",
				interfacesHeight: Math.round(interfacesBox?.height ?? 0),
				interfaceRows,
			});
		}

		console.log("JP2_ADDRESS_MEASUREMENTS", JSON.stringify(measurements));
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

		const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb", exact: true });
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
