import { describe, expect, test } from "vitest";
import {
	EVENT_BODY_MAX_BYTES,
	EVENT_RETENTION_DAYS,
	EVENT_TAGS_MAX_COUNT,
	EVENT_TAG_MAX_LENGTH,
	EVENT_TITLE_MAX_LENGTH,
} from "../events";

describe("event constants", () => {
	test("title max length is 200", () => {
		expect(EVENT_TITLE_MAX_LENGTH).toBe(200);
	});
	test("body max bytes is 16 KiB", () => {
		expect(EVENT_BODY_MAX_BYTES).toBe(16_384);
	});
	test("tags max count is 10", () => {
		expect(EVENT_TAGS_MAX_COUNT).toBe(10);
	});
	test("tag max length is 50", () => {
		expect(EVENT_TAG_MAX_LENGTH).toBe(50);
	});
	test("retention days is 30", () => {
		expect(EVENT_RETENTION_DAYS).toBe(30);
	});
});
