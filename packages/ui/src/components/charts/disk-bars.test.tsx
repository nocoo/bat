import type { MetricsDataPoint } from "@bat/shared";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { DiskBars } from "./disk-bars";

const dp = (diskJson: string): MetricsDataPoint =>
	({ ts: 1, disk_json: diskJson }) as MetricsDataPoint;

afterEach(cleanup);

describe("DiskBars", () => {
	test("renders one donut for same-device multi-mount data", () => {
		const diskJson = JSON.stringify([
			{
				mount: "/mnt/data-01",
				device: "/dev/vda1",
				fs_type: "ext4",
				used_pct: 80,
				total_bytes: 1000,
				avail_bytes: 200,
			},
			{
				mount: "/",
				device: "/dev/vda1",
				fs_type: "ext4",
				used_pct: 80,
				total_bytes: 1000,
				avail_bytes: 200,
			},
			{
				mount: "/home",
				device: "/dev/vda1",
				fs_type: "ext4",
				used_pct: 80,
				total_bytes: 1000,
				avail_bytes: 200,
			},
		]);
		render(<DiskBars data={[dp(diskJson)]} />);
		expect(screen.getAllByTestId("disk-donut")).toHaveLength(1);
		expect(screen.getByText("80.0% used")).toBeTruthy();
		expect(screen.getByText("200 B free")).toBeTruthy();
		expect(screen.getByText("/mnt/data-01")).toBeTruthy();
		expect(screen.getByText("/dev/vda1")).toBeTruthy();
	});

	test("does not repeat the disk summary above the chart", () => {
		const diskJson = JSON.stringify([
			{ mount: "/", device: "/dev/vda1", used_pct: 40, total_bytes: 1000, avail_bytes: 600 },
		]);
		render(<DiskBars data={[dp(diskJson)]} />);
		expect(screen.queryByText(/free across/)).toBeNull();
		expect(screen.getAllByText("40.0% used")).toHaveLength(1);
	});

	test("renders separate donuts for two devices", () => {
		const diskJson = JSON.stringify([
			{ mount: "/", device: "/dev/vda1", used_pct: 40, total_bytes: 1000, avail_bytes: 600 },
			{ mount: "/data", device: "/dev/vdb1", used_pct: 95, total_bytes: 2000, avail_bytes: 100 },
		]);
		render(<DiskBars data={[dp(diskJson)]} />);
		expect(screen.getAllByTestId("disk-donut")).toHaveLength(2);
		expect(screen.getByText("40.0% used")).toBeTruthy();
		expect(screen.getByText("95.0% used")).toBeTruthy();
	});

	test("keeps the empty state", () => {
		render(<DiskBars data={[]} />);
		expect(screen.getByText("No disk data")).toBeTruthy();
		expect(screen.queryByTestId("disk-donut")).toBeNull();
	});
});
