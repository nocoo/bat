// The renewal countdown depends on the calendar day the browser counts on,
// and the seeded catalog is anchored to the worker's own clock. The specs
// therefore derive the expected label from the stored renewal date instead
// of hard-coding a day count that shifts with the hour.

export interface CountdownLabels {
	/** The compact list label: `112d left`, `due today`, `3d overdue`. */
	list: string;
	/** The detail sentence: `Renews in 112 days`, `Due today`, `Overdue by 3 days`. */
	detail: string;
}

/** The labels the dashboard would show for a host's stored renewal date. */
export async function countdownLabels(
	page: import("@playwright/test").Page,
	hid: string,
): Promise<CountdownLabels> {
	const host = (await (await page.request.get(`/api/hosts/${hid}`)).json()) as {
		renews_at: string | null;
	};
	if (!host.renews_at) {
		return { list: "", detail: "" };
	}
	const days = await page.evaluate((renews) => {
		const now = new Date();
		const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const renewal = new Date(`${renews}T00:00:00Z`);
		return Math.round((renewal.getTime() - midnight.getTime()) / 86_400_000);
	}, host.renews_at);
	if (days < 0) {
		return {
			list: `${-days}d overdue`,
			detail: `Overdue by ${-days} ${-days === 1 ? "day" : "days"}`,
		};
	}
	if (days === 0) {
		return { list: "due today", detail: "Due today" };
	}
	return {
		list: `${days}d left`,
		detail: `Renews in ${days} ${days === 1 ? "day" : "days"}`,
	};
}
