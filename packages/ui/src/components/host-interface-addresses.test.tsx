import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { HostInterfaceAddresses } from "./host-interface-addresses";

describe("HostInterfaceAddresses", () => {
	test("renders interface hierarchy, family markers and right-aligned address rows", () => {
		render(
			<HostInterfaceAddresses
				interfaces={[
					{
						iface: "eth0",
						mac: "00:11:22:33:44:55",
						ipv4: ["192.168.1.10"],
						ipv6: ["2001:db8::10"],
						speed_mbps: 1000,
					},
				]}
			/>,
		);

		expect(screen.getByText("eth0")).toBeTruthy();
		expect(screen.getByText("v4")).toBeTruthy();
		expect(screen.getByText("v6")).toBeTruthy();
		const rows = screen.getAllByTestId("ip-address-row");
		expect(rows).toHaveLength(2);
		expect(rows.every((row) => row.getAttribute("data-alignment") === "right")).toBe(true);
	});

	test("returns no interface section for an empty address set", () => {
		const view = render(
			<HostInterfaceAddresses
				interfaces={[{ iface: "eth0", mac: "", ipv4: [], ipv6: [], speed_mbps: null }]}
			/>,
		);
		expect(view.queryByText("Interfaces")).toBeNull();
	});
});
