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

	test("the lead block shows both public families as compact complete rows", async ({ page }) => {
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
			await expect(v6Row.getByTestId("ip-address-row-value")).toHaveText(publicIpv6);
			await expect(
				v6Row.getByRole("button", { name: `Copy address ${publicIpv6}`, exact: true }),
			).toHaveAttribute("title", publicIpv6);

			for (const row of [v4Row, v6Row]) {
				const box = await row.evaluate((element) => {
					const rect = element.getBoundingClientRect();
					return {
						height: Math.round(rect.height),
						clipped: element.scrollWidth > element.clientWidth + 1,
					};
				});
				expect(box.clipped).toBe(false);
				expect(box.height).toBeLessThanOrEqual(220);
			}
		}
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
		await expect(v6Row.getByTestId("ip-address-row-value")).toHaveText(publicIpv6);
		await expect(v4Row).toBeVisible();
		await expect(v6Row).toBeVisible();
	});

	test("interfaces list every literal as a compact row with the interface name as a mono label", async ({
		page,
	}) => {
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByText("Interfaces", { exact: true })).toBeVisible({ timeout: 15_000 });
		const interfaces = page.getByTestId("host-interface-eth0");
		const rows = interfaces.getByTestId("ip-address-row");
		await expect(rows).toHaveCount(4);
		const expected = [
			"10.0.1.10",
			"203.0.113.10",
			"2001:db8:85a3:8d3:1319:8a2e:370:7349",
			"fe80::5054:ff:fe12:3456",
		];
		for (const address of expected) {
			const copyButton = interfaces.getByRole("button", {
				name: `Copy address ${address}`,
				exact: true,
			});
			await expect(copyButton).toBeVisible();
			await expect(copyButton).toHaveAttribute("title", address);
			const row = copyButton.locator("..");
			await expect(row).toContainText("eth0");
			const box = await row.boundingBox();
			expect(box?.height ?? 0).toBeLessThan(60);
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
			ipv4Width: number;
			ipv6Width: number;
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
			await expect(v6Row.getByTestId("ip-address-row-value")).toHaveText(ipv6);

			const v4Box = await v4Row.boundingBox();
			const v6Box = await v6Row.boundingBox();
			const sideBySide = v4Box !== null && v6Box !== null && Math.abs(v4Box.y - v6Box.y) <= 2;
			if (width === 1440 || width === 1024) {
				expect(sideBySide).toBe(true);
			}

			const valueGeometry = await Promise.all(
				[v4Row, v6Row].map((row) =>
					row.getByTestId("ip-address-row-value").evaluate((element) => {
						const rect = element.getBoundingClientRect();
						return {
							text: element.textContent,
							width: Math.round(rect.width),
							clipped: element.scrollWidth > element.clientWidth + 1,
						};
					}),
				),
			);
			expect(valueGeometry[0]?.text).toBe(ipv4);
			expect(valueGeometry[1]?.text).toBe(ipv6);
			expect(valueGeometry[0]?.clipped).toBe(false);
			expect(valueGeometry[1]?.clipped).toBe(false);
			expect(valueGeometry[0]?.text).not.toContain("…");
			expect(valueGeometry[1]?.text).not.toContain("…");

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

			measurements.push({
				width,
				publicV4V6SideBySide: sideBySide,
				ipv4Width: valueGeometry[0]?.width ?? 0,
				ipv6Width: valueGeometry[1]?.width ?? 0,
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
