import type { EventRow } from "@bat/shared";
import type { Repositories } from "./types.js";

export interface ConnectProductsRepository {
	forServer(repos: Repositories, serverId: string): Repositories;
	appendEvent(
		serverId: string,
		title: string,
		body: string,
		tags: string[],
		now: number,
	): Promise<void>;
	eventsPage(serverId: string, afterId: number, limit: number): Promise<EventRow[]>;
}
