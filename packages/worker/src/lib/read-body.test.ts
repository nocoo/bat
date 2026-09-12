import { CONNECT_LIMITS } from "@bat/shared";
import { afterEach, expect, test, vi } from "vitest";
import { readBody } from "./read-body.js";

function upload(body: ReadableStream<Uint8Array>, headers?: HeadersInit): Request {
	return new Request("http://localhost/upload", {
		method: "POST",
		body,
		headers,
		duplex: "half",
	} as RequestInit);
}

afterEach(() => vi.useRealTimers());

test("buffers all chunks into independent bytes and accepts an absent body", async () => {
	expect(await readBody(new Request("http://localhost"))).toBeNull();
	const request = upload(
		new ReadableStream({
			start(controller) {
				controller.enqueue(new Uint8Array([1, 2]));
				controller.enqueue(new Uint8Array([3, 4]));
				controller.close();
			},
		}),
	);
	expect(new Uint8Array((await readBody(request, 4)) as ArrayBuffer)).toEqual(
		new Uint8Array([1, 2, 3, 4]),
	);
	expect(request.bodyUsed).toBe(true);
	expect(request.body?.locked).toBe(false);
});

test("rejects a declared oversized body before reading it", async () => {
	const request = upload(new ReadableStream(), { "Content-Length": "5" });
	await expect(readBody(request, 4)).rejects.toMatchObject({ status: 413, code: "body_too_large" });
	expect(request.bodyUsed).toBe(false);
});

test.each(["0", "1", "invalid"])(
	"counts bytes despite Content-Length=%s and does not wait for cancellation",
	async (length) => {
		const cancel = vi.fn(() => new Promise<void>(() => undefined));
		const request = upload(
			new ReadableStream({
				start(controller) {
					controller.enqueue(new Uint8Array(5));
				},
				cancel,
			}),
			{ "Content-Length": length },
		);
		await expect(readBody(request, 4)).rejects.toMatchObject({
			status: 413,
			code: "body_too_large",
		});
		expect(cancel).toHaveBeenCalledOnce();
		expect(request.body?.locked).toBe(false);
	},
);

test("a stalled body times out even when cancellation resolves the pending read", async () => {
	vi.useFakeTimers();
	const cancel = vi.fn();
	const request = upload(new ReadableStream({ cancel }));
	const result = expect(readBody(request)).rejects.toMatchObject({
		status: 504,
		code: "body_timeout",
	});
	await vi.advanceTimersByTimeAsync(CONNECT_LIMITS.bodyTimeoutMs);
	await result;
	expect(cancel).toHaveBeenCalledOnce();
	expect(request.body?.locked).toBe(false);
	expect(vi.getTimerCount()).toBe(0);
});

test("rejected cancellation does not replace the body-size failure", async () => {
	const request = upload(
		new ReadableStream({
			start(controller) {
				controller.enqueue(new Uint8Array(5));
			},
			cancel: () => Promise.reject(new Error("Transport closed")),
		}),
	);
	await expect(readBody(request, 4)).rejects.toMatchObject({ status: 413, code: "body_too_large" });
});
