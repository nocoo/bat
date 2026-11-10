import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
	delete window.__BAT_LOCAL__;
	localStorage.clear();
	sessionStorage.clear();
});
test("hosted UI ignores saved E2E without a launcher", async () => {
	localStorage.setItem("bat:environment-mode", "e2e");
	const fetcher = vi.fn();
	vi.stubGlobal("fetch", fetcher);
	const e = await import("./environment");
	await e.initializeEnvironment();
	expect(e.environment).toBeNull();
	expect(fetcher).not.toHaveBeenCalled();
	expect(e.environmentUrl("/api/hosts")).toBe("/api/hosts");
});
test("saved E2E starts a fresh interactive instance and accepted switches alone change preference", async () => {
	localStorage.setItem("bat:environment-mode", "e2e");
	window.__BAT_LOCAL__ = { capability: "local", locked: false, visible: true, instance: null };
	const fetcher = vi
		.fn()
		.mockResolvedValueOnce(
			Response.json({ id: "fresh", mode: "e2e", visible: true, locked: false }),
		)
		.mockResolvedValueOnce(Response.json({ error: "unavailable" }, { status: 503 }));
	vi.stubGlobal("fetch", fetcher);
	const e = await import("./environment");
	await e.initializeEnvironment();
	expect(JSON.parse(fetcher.mock.calls[0]?.[1].body).mode).toBe("e2e");
	expect(e.environmentUrl("/api/hosts")).toBe("/__bat/instances/fresh/api/hosts");
	await expect(e.selectEnvironment("prod")).rejects.toThrow("unavailable");
	expect(e.environment?.id).toBe("fresh");
	expect(localStorage.getItem(e.preferenceKey)).toBe("e2e");
});
test("explicit mode beats preference; automation ignores and preserves preference", async () => {
	localStorage.setItem("bat:environment-mode", "prod");
	window.__BAT_LOCAL__ = {
		capability: "local",
		initial: "e2e",
		locked: false,
		visible: true,
		instance: null,
	};
	const fetcher = vi
		.fn()
		.mockResolvedValue(Response.json({ id: "manual", mode: "e2e", visible: true, locked: false }));
	vi.stubGlobal("fetch", fetcher);
	let e = await import("./environment");
	await e.initializeEnvironment();
	expect(JSON.parse(fetcher.mock.calls[0]?.[1].body).mode).toBe("e2e");
	vi.resetModules();
	window.__BAT_LOCAL__ = {
		capability: "auto",
		locked: true,
		visible: false,
		instance: { id: "locked", mode: "e2e", locked: true, visible: false },
	};
	e = await import("./environment");
	await e.initializeEnvironment();
	expect(e.environment?.id).toBe("locked");
	expect(localStorage.getItem(e.preferenceKey)).toBe("prod");
	await expect(e.selectEnvironment("demo")).rejects.toThrow("unavailable");
});
test("a 410 switch clears the stale instance id and retries once without previous", async () => {
	window.__BAT_LOCAL__ = { capability: "local", locked: false, visible: true, instance: null };
	const fetcher = vi
		.fn()
		.mockResolvedValueOnce(
			Response.json({ id: "first", mode: "demo", visible: true, locked: false }),
		)
		.mockResolvedValueOnce(Response.json({ error: "Instance expired" }, { status: 410 }))
		.mockResolvedValueOnce(
			Response.json({ id: "rebuilt", mode: "prod", visible: true, locked: false }),
		);
	vi.stubGlobal("fetch", fetcher);
	const e = await import("./environment");
	sessionStorage.setItem("bat:environment-instance", "first");
	await e.initializeEnvironment();
	// The instance id went stale across a launcher restart.
	await e.selectEnvironment("prod");
	const bodies = fetcher.mock.calls
		.filter((call) => call[1]?.body)
		.map((call) => JSON.parse(call[1].body));
	expect(bodies.map((body) => body.previous)).toEqual(["first", undefined]);
	expect(e.environment?.id).toBe("rebuilt");
	expect(sessionStorage.getItem("bat:environment-instance")).toBe("rebuilt");
});
test("a second 410 surfaces the honest expiry error", async () => {
	window.__BAT_LOCAL__ = { capability: "local", locked: false, visible: true, instance: null };
	const fetcher = vi
		.fn()
		.mockResolvedValue(Response.json({ error: "Instance expired" }, { status: 410 }));
	vi.stubGlobal("fetch", fetcher);
	const e = await import("./environment");
	await expect(e.selectEnvironment("demo")).rejects.toThrow("Instance expired");
	expect(fetcher).toHaveBeenCalledTimes(2);
	expect(e.environment).toBeNull();
});
