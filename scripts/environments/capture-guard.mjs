const PRODUCTION_HOSTNAMES = new Set(["bat.hexly.ai", "bat-ingest.worker.hexly.ai"]);

export function productionHostname(value) {
	try {
		const { hostname } = new URL(value);
		return PRODUCTION_HOSTNAMES.has(hostname) ? hostname : null;
	} catch {
		return null;
	}
}

export function isProductionUrl(value) {
	return productionHostname(value) !== null;
}

export async function guardBrowserRequest(route, violations) {
	const hostname = productionHostname(route.request().url());
	if (hostname === null) {
		await route.continue();
		return null;
	}
	violations.push(hostname);
	await route.abort("blockedbyclient");
	return hostname;
}
