// D1-backed CliTokensRepository. SQL lifted verbatim from
// `services/cli-tokens.ts` (now removed). Pure token helpers
// (`generateCliToken`, `hashToken`) live in `domain/cli-token.ts`.

import type { CliTokenRow, CliTokenScope } from "@bat/shared";
import type { CliTokensRepository } from "../../repos/types.js";

export class D1CliTokensRepository implements CliTokensRepository {
	private readonly db: D1Database;

	constructor(db: D1Database) {
		this.db = db;
	}

	async create(tokenHash: string, label: string, scope: CliTokenScope): Promise<CliTokenRow> {
		const row = await this.db
			.prepare("INSERT INTO cli_tokens (token_hash, label, scope) VALUES (?, ?, ?) RETURNING *")
			.bind(tokenHash, label, scope)
			.first<CliTokenRow>();
		if (!row) {
			throw new Error("Failed to create CLI token");
		}
		return row;
	}

	async list(): Promise<CliTokenRow[]> {
		const result = await this.db
			.prepare("SELECT * FROM cli_tokens ORDER BY created_at DESC")
			.all<CliTokenRow>();
		return result.results;
	}

	async delete(id: number): Promise<boolean> {
		const result = await this.db.prepare("DELETE FROM cli_tokens WHERE id = ?").bind(id).run();
		return (result.meta?.changes ?? 0) > 0;
	}

	async findByHashAndTouch(tokenHash: string): Promise<CliTokenRow | null> {
		const row = await this.db
			.prepare("SELECT * FROM cli_tokens WHERE token_hash = ?")
			.bind(tokenHash)
			.first<CliTokenRow>();
		if (!row) {
			return null;
		}
		await this.db
			.prepare("UPDATE cli_tokens SET last_used_at = unixepoch() WHERE id = ?")
			.bind(row.id)
			.run();
		return row;
	}
}
