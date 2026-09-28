import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
const target = "https://bat.hexly.ai";

export async function authenticateProd({ run = execute, request = fetch } = {}) {
	const readToken = async () => {
		const { stdout } = await run("cloudflared", ["access", "token", "--app", target], {
			timeout: 15000,
		});
		const token = stdout.trim();
		if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) throw new Error("Invalid token");
		return token;
	};
	let token;
	try {
		token = await readToken();
	} catch {
		try {
			await run("cloudflared", ["access", "login", "--quiet", target], { timeout: 90000 });
			token = await readToken();
		} catch {
			throw new Error(
				"Complete Access login with: cloudflared access login --quiet https://bat.hexly.ai, then retry Prod.",
			);
		}
	}
	const headers = { "cf-access-token": token };
	try {
		const response = await request(`${target}/api/me`, {
			headers,
			redirect: "manual",
			signal: AbortSignal.timeout(15000),
		});
		const user = response.ok ? await response.json() : null;
		if (!user?.authenticated || !user.email) throw new Error("User authentication required");
	} catch {
		throw new Error(
			"Prod authentication could not be verified. Run cloudflared access login --quiet https://bat.hexly.ai and retry.",
		);
	}
	return headers;
}
