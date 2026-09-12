import { CONNECT_LIMITS } from "@bat/shared";
import { ConnectFault } from "../domain/connect.js";

export async function readBody(
	request: Request,
	maxBytes: number = CONNECT_LIMITS.bodyBytes,
): Promise<ArrayBuffer | null> {
	const tooLarge = () =>
		new ConnectFault(413, "body_too_large", `Request body exceeds ${maxBytes / 1024} KiB.`);
	if (Number(request.headers.get("Content-Length") ?? 0) > maxBytes) throw tooLarge();
	const reader = request.body?.getReader();
	if (!reader) return null;
	const chunks: Uint8Array[] = [];
	let size = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const expired = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			reject(new ConnectFault(504, "body_timeout", "Request body was not received in time."));
			void reader.cancel().catch(() => undefined);
		}, CONNECT_LIMITS.bodyTimeoutMs);
	});
	try {
		while (true) {
			const item = await Promise.race([reader.read(), expired]);
			if (item.done) break;
			size += item.value.byteLength;
			if (size > maxBytes) {
				void reader.cancel().catch(() => undefined);
				throw tooLarge();
			}
			chunks.push(item.value);
		}
		const bytes = new Uint8Array(size);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.byteLength;
		}
		return bytes.buffer;
	} finally {
		clearTimeout(timer);
		reader.releaseLock();
	}
}
