#!/usr/bin/env node
const IMPL_SHA = /^[0-9a-f]{40}$/;

export const SLOTS = [
	{ id: "S1", job: "s1-types", name: "S1: Types", status: "impl" },
	{ id: "S2", job: "s2-lint", name: "S2: Lint", status: "impl" },
	{ id: "S3", job: "s3-workflow", name: "S3: Workflow", status: "impl" },
	{ id: "G1", job: "g1-secrets", name: "G1: Secrets", status: "impl" },
	{ id: "G2", job: "g2-dependencies", name: "G2: Dependencies", status: "impl" },
	{ id: "B1", job: "b1-build", name: "B1: Build", status: "impl" },
	{ id: "L1", job: "l1-unit", name: "L1: Unit", status: "impl" },
	{ id: "L2", job: "l2-runtime", name: "L2: Runtime", status: "impl" },
	{ id: "L3", job: "l3-integration", name: "L3: Integration", status: "impl" },
	{ id: "L4", job: "l4-e2e", name: "L4: E2E", status: "impl" },
	{ id: "P1", job: "p1-package", name: "P1: Package", status: "impl" },
	{ id: "Z1", job: "z1-gate", name: "Z1: Gate", status: "impl" },
];

export function verifyQualityGate(needs, options = {}) {
	const slots = options.slots ?? SLOTS;
	const extraRequired = options.extraRequired ?? [];
	const errors = [];
	let testedSha = null;

	if (!needs || typeof needs !== "object" || Array.isArray(needs)) {
		return { ok: false, errors: ["NEEDS_JSON must be an object"], testedSha: null };
	}

	const knownJobs = new Set(slots.map((slot) => slot.job));
	for (const [job, value] of Object.entries(needs)) {
		if (job !== "z1-gate" && !knownJobs.has(job) && !extraRequired.includes(job)) {
			errors.push(`unexpected required job '${job}' is not declared to Z1`);
		}
		if (!value || typeof value !== "object") errors.push(`invalid needs entry for '${job}'`);
	}

	for (const slot of slots) {
		if (slot.id === "Z1") continue;
		const entry = needs[slot.job];
		if (!entry) {
			errors.push(`${slot.id} is missing from Z1 needs`);
			continue;
		}
		if (slot.status === "impl") {
			if (entry.result !== "success") {
				errors.push(`${slot.id} is impl but finished with '${entry.result}'`);
				continue;
			}
			const sha = entry.outputs?.["tested-sha"];
			if (!IMPL_SHA.test(sha ?? "")) {
				errors.push(`${slot.id} did not report a tested SHA`);
				continue;
			}
			if (testedSha && testedSha !== sha) {
				errors.push(`${slot.id} tested ${sha}, expected ${testedSha}`);
			}
			testedSha ??= sha;
		} else if (entry.result !== "skipped") {
			errors.push(`${slot.id} is ${slot.status} but finished with '${entry.result}'`);
		}
	}

	for (const job of extraRequired) {
		if (needs[job]?.result !== "success") {
			errors.push(`required job '${job}' did not succeed`);
		}
	}

	return { ok: errors.length === 0, errors, testedSha };
}

if (import.meta.main) {
	let needs;
	try {
		needs = JSON.parse(process.env.NEEDS_JSON ?? "");
	} catch {
		console.error("NEEDS_JSON is not valid JSON");
		process.exit(1);
	}
	const result = verifyQualityGate(needs, {
		extraRequired: (process.env.EXTRA_REQUIRED_JOBS ?? "").split(/\s+/).filter(Boolean),
	});
	if (!result.ok) {
		for (const error of result.errors) console.error(`::error::${error}`);
		process.exit(1);
	}
	console.log(`Z1 verified all implemented slots at ${result.testedSha}`);
}
