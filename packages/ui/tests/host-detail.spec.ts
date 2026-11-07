import { expect, type Locator, test } from "@playwright/test";

/** Rendered line count of a block-level text element. */
async function lineCount(locator: Locator): Promise<number> {
	return locator.evaluate((element) => {
		const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
		if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
			return 0;
		}
		return Math.round(element.getBoundingClientRect().height / lineHeight);
	});
}

test.describe("Host detail page", () => {
	const alphaHid = "f0d3fd30";
	const betaHid = "4c494cde";
	const publicIpv6 = "2001:db8:85a3:8d3:1319:8a2e:370:7348";
	const interfaceIpv6 = "2001:db8:85a3:8d3:1319:8a2e:370:7349";

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

	test("public address lead block shows both families with copy affordances", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		const v4 = page.getByTestId("host-public-ip-v4");
		const v6 = page.getByTestId("host-public-ip-v6");
		await expect(v4).toHaveText("203.0.113.10", { timeout: 15_000 });
		await expect(v6).toHaveText(publicIpv6);
		await expect(page.getByText("IPv4", { exact: true }).first()).toBeVisible();
		await expect(page.getByText("IPv6", { exact: true }).first()).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Copy public address 203.0.113.10", exact: true }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: `Copy public address ${publicIpv6}`, exact: true }),
		).toBeVisible();
		// The lead cell is a narrow column: the literal wraps instead of being clipped.
		expect(await v6.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
			true,
		);
		expect(await lineCount(v6)).toBeGreaterThan(1);
		expect(await v6.evaluate((element) => getComputedStyle(element).textOverflow)).not.toBe(
			"ellipsis",
		);
	});

	test("the family label and the copy control stay on the first line of a wrapped literal", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		const value = page.getByTestId("host-public-ip-v6");
		await expect(value).toHaveText(publicIpv6, { timeout: 15_000 });
		expect(await lineCount(value)).toBeGreaterThan(1);

		const label = page.getByText("IPv6", { exact: true }).first();
		const copy = page.getByRole("button", {
			name: `Copy public address ${publicIpv6}`,
			exact: true,
		});
		const [valueBox, labelBox, copyBox] = await Promise.all([
			value.boundingBox(),
			label.boundingBox(),
			copy.boundingBox(),
		]);
		const lineHeight = await value.evaluate((element) =>
			Number.parseFloat(getComputedStyle(element).lineHeight),
		);
		const firstLineBottom = (valueBox?.y ?? 0) + lineHeight;

		// Neither the label nor the copy control may drift to the vertical centre
		// of the wrapped block: both belong to the first line.
		expect(labelBox?.y).toBeGreaterThanOrEqual((valueBox?.y ?? 0) - 2);
		expect((labelBox?.y ?? 0) + (labelBox?.height ?? 0)).toBeLessThanOrEqual(firstLineBottom + 2);
		expect(copyBox?.y).toBeLessThanOrEqual(firstLineBottom);
	});

	test("a family without an observation shows a muted dash instead of disappearing", async ({
		page,
	}) => {
		await page.goto(`/hosts/${betaHid}`);
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByTestId("host-public-ip-v4")).toHaveText("198.51.100.20", {
			timeout: 15_000,
		});
		await expect(page.getByTestId("host-public-ip-v6")).toHaveText("—");
	});

	test("system info lists public IPv4 and IPv6 separately", async ({ page }) => {
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByText("Public IPv4", { exact: true })).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByText("Public IPv6", { exact: true })).toBeVisible();
		await expect(page.getByText("Public IP", { exact: true })).toHaveCount(0);
	});

	test("interface addresses render one entry per interface", async ({ page }) => {
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		await expect(page.getByText("Interfaces", { exact: true })).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText("eth0", { exact: true })).toBeVisible();
		await expect(page.getByText("eth1", { exact: true })).toBeVisible();
		await expect(page.getByText("10.0.1.10", { exact: true })).toBeVisible();
		await expect(page.getByText(interfaceIpv6, { exact: true })).toBeVisible();
	});

	test("interface rows use the address-row anatomy and wrap a long IPv6 at rail and narrow widths", async ({
		page,
	}) => {
		for (const viewport of [
			{ width: 1440, height: 1000 },
			{ width: 390, height: 900 },
		]) {
			await page.setViewportSize(viewport);
			await page.goto(`/hosts/${alphaHid}`);
			await page.waitForLoadState("domcontentloaded");

			const row = page.getByTestId("host-interface-eth0");
			await expect(row).toBeVisible({ timeout: 15_000 });
			const name = page.getByText("eth0", { exact: true });
			const addresses = page.getByTestId("host-interface-addresses-eth0");

			const [rowBox, nameBox, addressesBox] = await Promise.all([
				row.boundingBox(),
				name.boundingBox(),
				addresses.boundingBox(),
			]);
			// Interface name on the left, literals right-aligned against the row edge.
			expect(nameBox?.x).toBeLessThan(addressesBox?.x ?? 0);
			expect(
				Math.abs(
					(addressesBox?.x ?? 0) +
						(addressesBox?.width ?? 0) -
						((rowBox?.x ?? 0) + (rowBox?.width ?? 0)),
				),
			).toBeLessThanOrEqual(1);

			const literal = page.getByText(interfaceIpv6, { exact: true });
			await expect(literal).toBeVisible();
			expect(
				await literal.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
			).toBe(true);
			expect(await lineCount(literal)).toBeGreaterThan(1);
			const style = await literal.evaluate((element) => {
				const computed = getComputedStyle(element);
				return { wordBreak: computed.wordBreak, textOverflow: computed.textOverflow };
			});
			expect(style.wordBreak).toBe("break-all");
			expect(style.textOverflow).not.toBe("ellipsis");
			// The whole row stays inside the card: the literal wraps, it never leaves.
			expect(
				(await addresses.evaluate((element) => element.getBoundingClientRect().right)) <=
					(await row.evaluate((element) => element.getBoundingClientRect().right)) + 1,
			).toBe(true);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
				true,
			);
		}
	});

	test("narrow viewport keeps the family rows and their copy controls usable", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 900 });
		await page.goto(`/hosts/${alphaHid}`);
		await page.waitForLoadState("domcontentloaded");

		const v6 = page.getByTestId("host-public-ip-v6");
		await expect(v6).toHaveText(publicIpv6, { timeout: 15_000 });
		await expect(
			page.getByRole("button", { name: `Copy public address ${publicIpv6}`, exact: true }),
		).toBeVisible();
		expect(await v6.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
			true,
		);
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
