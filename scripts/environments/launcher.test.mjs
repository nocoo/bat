import { describe, expect, test } from "bun:test";
import { expireInstance, switchDecision } from "./launcher.mjs";

const instance = (overrides = {}) => ({
	id: "11111111-1111-4111-8111-111111111111",
	mode: "e2e",
	runtime: { close: async () => {} },
	pending: new Set(),
	active: true,
	...overrides,
});

describe("switchDecision", () => {
	test("an unknown previous id is treated as no previous instance", () => {
		const instances = new Map();
		expect(switchDecision(instances, "22222222-2222-4222-8222-222222222222")).toEqual({
			previousInstance: null,
		});
		expect(switchDecision(instances, undefined)).toEqual({ previousInstance: null });
	});

	test("a known active previous instance is returned for switching", () => {
		const active = instance();
		const instances = new Map([[active.id, active]]);
		expect(switchDecision(instances, active.id)).toEqual({ previousInstance: active });
	});

	test("a known inactive previous instance is a real expiry", () => {
		const inactive = instance({ active: false });
		const instances = new Map([[inactive.id, inactive]]);
		expect(switchDecision(instances, inactive.id)).toEqual({ expired: true });
	});
});

describe("expireInstance", () => {
	test("deactivates, drops from the map, awaits pending and releases the runtime", async () => {
		const victim = instance();
		let settled = false;
		const pendingOperation = Bun.sleep(10).then(() => {
			settled = true;
		});
		victim.pending.add(pendingOperation);
		const instances = new Map([
			[victim.id, victim],
			[
				"33333333-3333-4333-8333-333333333333",
				instance({ id: "33333333-3333-4333-8333-333333333333" }),
			],
		]);
		const released = [];
		await expireInstance(victim, instances, async (i) => released.push(i.id));
		expect(victim.active).toBe(false);
		expect(instances.has(victim.id)).toBe(false);
		expect(instances.size).toBe(1);
		expect(settled).toBe(true);
		expect(released).toEqual([victim.id]);
	});

	test("an instance without a runtime expires without a release", async () => {
		const victim = instance({ runtime: null });
		const instances = new Map([[victim.id, victim]]);
		const released = [];
		await expireInstance(victim, instances, async (i) => released.push(i.id));
		expect(victim.active).toBe(false);
		expect(instances.has(victim.id)).toBe(false);
		expect(released).toEqual([]);
	});
});
