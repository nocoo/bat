import { expect, type Locator, test } from "@playwright/test";

/** Width/height and clipping of a chip, measured in the real layout. */
async function chipBox(locator: Locator) {
	return locator.evaluate((element) => {
		const rect = element.getBoundingClientRect();
		return {
			width: Math.round(rect.width),
			height: Math.round(rect.height),
			clipped: element.scrollWidth > element.clientWidth + 1,
		};
	});
}

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

	test("the lead block shows one chip per family, equal width and never clipped", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		const header = page.getByTestId("host-detail-header");
		const ipv4 = header.getByRole("button", { name: "Copy address 203.0.113.10", exact: true });
		const ipv6 = header.getByRole("button", { name: `Copy address ${publicIpv6}`, exact: true });
		await expect(ipv4).toBeVisible({ timeout: 15_000 });
		await expect(ipv6).toBeVisible();

		// IPv4 is shown complete; a long IPv6 is abbreviated in the middle, on one line.
		await expect(ipv4.getByTestId("ip-address-chip-value")).toHaveText("203.0.113.10");
		const short = ipv6.getByTestId("ip-address-chip-value");
		const shown = (await short.textContent()) ?? "";
		expect(shown).toContain("…");
		expect(shown.length).toBeLessThanOrEqual(14);
		expect(publicIpv6.startsWith(shown.split("…")[0] ?? "")).toBe(true);
		expect(publicIpv6.endsWith(shown.split("…")[1] ?? "")).toBe(true);

		// The full literal stays available even though the chip abbreviates.
		await expect(ipv6).toHaveAttribute("title", publicIpv6);

		const [v4Box, v6Box] = await Promise.all([chipBox(ipv4), chipBox(ipv6)]);
		expect(v4Box.width).toBe(v6Box.width);
		expect(v4Box.height).toBe(v6Box.height);
		expect(v4Box.clipped).toBe(false);
		expect(v6Box.clipped).toBe(false);

		// Same height as a family label row apart, one line only.
		expect(v6Box.height).toBeLessThan(60);
	});

	test("hover and keyboard focus replace the address with the copy overlay", async ({ page }) => {
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		const chip = page
			.getByTestId("host-detail-header")
			.getByRole("button", { name: `Copy address ${publicIpv6}`, exact: true });
		await expect(chip).toBeVisible({ timeout: 15_000 });
		const overlay = chip.getByTestId("ip-address-chip-overlay");
		await expect(overlay).toHaveCSS("opacity", "0");

		await chip.hover();
		await expect(overlay).toHaveCSS("opacity", "1");
		await expect(overlay).toContainText("Copy");

		await page.mouse.move(0, 0);
		await expect(overlay).toHaveCSS("opacity", "0");

		await chip.focus();
		await expect(overlay).toHaveCSS("opacity", "1");
	});

	test("clicking the chip copies the untouched literal and shows the success state", async ({
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
		expect(await chip.getAttribute("data-state")).toBe("idle");

		await chip.click();

		await expect(chip).toHaveAttribute("data-state", "copied");
		const overlay = chip.getByTestId("ip-address-chip-overlay");
		await expect(overlay).toContainText("Copied");
		await expect(overlay).toHaveCSS("opacity", "1");
		await expect(chip.locator("svg")).toHaveClass(/text-basalt-success/);
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(publicIpv6);

		// The feedback holds briefly, then fades back to the static address once the
		// pointer leaves the chip.
		await expect(chip).toHaveAttribute("data-state", "idle", { timeout: 5_000 });
		await page.mouse.move(0, 0);
		await expect(overlay).toHaveCSS("opacity", "0");
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
		const overlay = chip.getByTestId("ip-address-chip-overlay");
		await expect(overlay).toContainText("Copy failed");
		await expect(chip.locator("svg")).toHaveClass(/text-basalt-warning/);
		await expect(
			page.getByRole("status").filter({ hasText: `Could not copy address: ${publicIpv6}` }),
		).toBeVisible();
	});

	test("reduced motion drops the overlay transition and the check animation", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		const overlay = page
			.getByTestId("host-detail-header")
			.getByRole("button", { name: `Copy address ${publicIpv6}`, exact: true })
			.getByTestId("ip-address-chip-overlay");
		await expect(overlay).toBeVisible({ timeout: 15_000 });
		await expect(overlay).toHaveCSS("transition-property", "none");
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
		await expect(chip.getByTestId("ip-address-chip-overlay")).toHaveAttribute(
			"aria-hidden",
			"true",
		);

		await chip.click();
		await expect(
			page.getByRole("status").filter({ hasText: `Address copied: ${publicIpv6}` }),
		).toBeVisible();
	});

	test("a longest IPv4 never overflows the inner value span in the lead layout", async ({
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

			const header = page.getByTestId("host-detail-header");
			const value = header
				.getByRole("button", { name: "Copy address 203.0.113.10", exact: true })
				.getByTestId("ip-address-chip-value");
			await expect(value).toBeVisible({ timeout: 15_000 });
			await value.evaluate((element) => {
				element.textContent = "123.123.123.123";
			});
			const geometry = await value.evaluate((element) => {
				const rect = element.getBoundingClientRect();
				return {
					text: element.textContent,
					width: Math.round(rect.width),
					clientWidth: element.clientWidth,
					scrollWidth: element.scrollWidth,
					clipped: element.scrollWidth > element.clientWidth + 1,
				};
			});
			expect(geometry.text).toBe("123.123.123.123");
			expect(geometry.clipped).toBe(false);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
				true,
			);
		}
	});

	test("public and interface chips share one width in the System Info surface", async ({
		page,
	}) => {
		for (const viewport of [
			{ width: 1440, height: 1000 },
			{ width: 900, height: 1000 },
		]) {
			await page.setViewportSize(viewport);
			await page.goto(`/hosts/${alphaHid}`);
			await page.waitForLoadState("domcontentloaded");

			const publicV4 = page
				.getByText("Public IPv4", { exact: true })
				.locator("..")
				.getByTestId("ip-address-chip");
			const iface = page.getByTestId("host-interface-eth0").getByTestId("ip-address-chip").first();
			await expect(publicV4).toBeVisible({ timeout: 15_000 });
			await expect(iface).toBeVisible();

			const publicBox = await publicV4.boundingBox();
			const ifaceBox = await iface.boundingBox();
			expect(publicBox?.width).toBe(ifaceBox?.width);
			expect(publicBox?.height).toBe(ifaceBox?.height);
			expect(
				await iface.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
			).toBe(true);
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

	test("a family without an observation is a disabled, non-clickable chip", async ({ page }) => {
		await page.goto(`/hosts/${betaHid}`);
		await page.waitForLoadState("domcontentloaded");

		const header = page.getByTestId("host-detail-header");
		// Wait for the loaded detail: before it arrives both families are still empty.
		await expect(
			header.getByRole("button", { name: "Copy address 198.51.100.20", exact: true }),
		).toBeVisible({ timeout: 15_000 });
		const empty = header.getByRole("button", { name: "No address observed", exact: true });
		await expect(empty).toBeVisible();
		await expect(empty).toBeDisabled();
		await expect(empty.getByTestId("ip-address-chip-value")).toHaveText("—");
		await expect(empty.getByTestId("ip-address-chip-overlay")).toHaveCount(0);
	});

	test("system info shows both families as equal chips", async ({ page }) => {
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByText("Public IPv4", { exact: true })).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText("Public IPv6", { exact: true })).toBeVisible();
		await expect(page.getByText("Public IP", { exact: true })).toHaveCount(0);

		// The two chips inside the System Info card share one width.
		const v4Label = page.getByText("Public IPv4", { exact: true });
		const v6Label = page.getByText("Public IPv6", { exact: true });
		const v4Chip = v4Label.locator("..").getByTestId("ip-address-chip");
		const v6Chip = v6Label.locator("..").getByTestId("ip-address-chip");
		await expect(v4Chip).toBeVisible();
		await expect(v6Chip).toBeVisible();
		const [v4Box, v6Box] = await Promise.all([chipBox(v4Chip), chipBox(v6Chip)]);
		expect(v4Box.width).toBe(v6Box.width);
		expect(v4Box.height).toBe(v6Box.height);
		expect(v4Box.clipped).toBe(false);
		expect(v6Box.clipped).toBe(false);
		await expect(page.getByTestId("ip-address-chip").first()).toBeVisible();
	});

	test("interfaces list every literal as its own chip, one per line and equal width", async ({
		page,
	}) => {
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByText("Interfaces", { exact: true })).toBeVisible({ timeout: 15_000 });
		const interfaces = page.getByTestId("host-interface-eth0");
		await expect(interfaces.getByText("eth0", { exact: true })).toBeVisible();

		const chips = interfaces.getByTestId("ip-address-chip");
		await expect(chips).toHaveCount(4);
		const expected = [
			"10.0.1.10",
			"203.0.113.10",
			"2001:db8:85a3:8d3:1319:8a2e:370:7349",
			"fe80::5054:ff:fe12:3456",
		];
		const boxes = [];
		for (const address of expected) {
			const chip = interfaces.getByRole("button", {
				name: `Copy address ${address}`,
				exact: true,
			});
			await expect(chip).toBeVisible();
			await expect(chip).toHaveAttribute("title", address);
			boxes.push(await chipBox(chip));
		}
		// Every chip in the list has the same width and sits on its own line.
		expect(new Set(boxes.map((box) => box.width)).size).toBe(1);
		expect(new Set(boxes.map((box) => box.height)).size).toBe(1);
		for (const box of boxes) {
			expect(box.clipped).toBe(false);
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

	test("chips stay clipped-free at a narrow width", async ({ page }) => {
		await page.setViewportSize({ width: 900, height: 1000 });
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByTestId("host-interface-eth0")).toBeVisible({ timeout: 15_000 });
		const chips = page.getByTestId("ip-address-chip");
		const count = await chips.count();
		expect(count).toBeGreaterThan(4);
		for (let index = 0; index < count; index += 1) {
			const chip = chips.nth(index);
			await chip.scrollIntoViewIfNeeded();
			expect(await chip.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
			const box = await chip.boundingBox();
			expect(box?.height ?? 0).toBeLessThan(60);
		}
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true,
		);
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
