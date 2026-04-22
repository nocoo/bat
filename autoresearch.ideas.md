# Autoresearch Ideas Backlog

## Remaining candidates
- Consolidate the many `use-*` hooks into per-route ViewModels co-located
  with their route file. (DONE partially via `hooks/queries.ts`; still one hook
  per view is not enforced.)
- `services/aggregation.ts::buildExtJson` is a massive 100-line pure fn; could
  be exported + tested by feeding minimal partial RawRow objects. Risk: big test
  fixture → may not yield net metric win.
- Route-level groupers (e.g. `groupTagsByHost`) are too small to justify a
  dedicated export unless bundled with ≥4 tests (see run 34 — regressed at 3).
- Extract `filterPublicUnallowedPorts` from `services/status.ts::deriveHostStatus`
  public_port branch — pure, 10-line helper, 5+ test cases plausible.
- `packages/worker/src/routes/webhooks.ts`: validation for create/regenerate
  bodies could be extracted as `validateWebhookBody` (similar shape to tags/ports).
- `packages/shared/src/events.ts` + `tier2.ts` are type-only files; no pure helpers.
- `packages/worker/src/services/events.ts::generateWebhookToken` is pure — test
  length / charset / uniqueness across many calls (4-5 tests).

## Completed (do not re-try)
- ~~Consolidate 14 SWR hooks into one queries.ts~~ (run 2)
- ~~Add tests for transforms, palette, api.ts hashHostId, alerts.ts rules~~
- ~~Extract host-card/host-detail/top-processes format helpers~~
- ~~Extract avatar-color, webhooks-format, resolve-host, fleet-summary~~
- ~~Extract body validators (identity, metrics, tier2, allowed-ports, tags)~~
- ~~Test parsePagination, parseMetricsRange, parsePublicPorts, expandRawRow/Hourly~~
- ~~Test aggregateNetwork / aggregateDiskIo~~

## Anti-patterns observed
- Extracting a helper that's < 15 LoC with < 4 tests usually regresses the
  metric (overhead > tests credit). Aim for ≥ 4 tests per extraction.
- Converting a single-call-site helper to a module almost never wins LoC;
  only meaningful when it replaces duplicated code in 2+ routes.

## Watch out for
- React components that import from many `hooks/*` — ViewModel wants one hook
  per view, but splitting `queries.ts` back into many hooks would regress.
- Avoid breaking the public worker API (other clients depend on it).
- No `any`/`@ts-ignore` tricks; minimal `as unknown as X` for test-only partial
  row mocks is acceptable when the helper reads a narrow slice.
