# Autoresearch Rules — Bat MVVM Simplification

## Goal
Refactor the project toward a clean MVVM architecture, simplify it, and
increase testability — without breaking correctness.

## Primary metric
`complexity_score = src_loc - 4 * unit_tests_passing`  (lower = better)

Computed by `scripts/autoresearch-bench.sh`.

- `src_loc`: total lines of production source under `packages/{shared,ui,worker}/src`,
  excluding `*.test.ts(x)` and `__tests__/`.
- `unit_tests_passing`: count of bun-test passing tests across `shared` + `worker`.
- Each new passing test "buys" up to 4 LoC of structural code — modest enough that
  trivial one-line tests don't pay off, generous enough to reward real coverage.

## Hard gates (must pass for keep)
1. `bun run typecheck` (turbo) passes.
2. All `shared` unit tests pass (0 failures).
3. All `worker` unit tests pass (0 failures).
4. Total passing unit tests ≥ baseline (`BASELINE_TESTS`, default 448).

If any gate fails, the bench prints `complexity_score=999999` and exits 1 →
`status=checks_failed` or `crash`, autoresearch reverts.

## Anti-cheat / non-overfitting rules
- **No minification / no code golfing.** Keep idiomatic TS, normal whitespace,
  meaningful names. If a diff is a one-line wall, revert.
- **No `any` / `@ts-ignore` to bypass typecheck.** New `any`s require a
  written justification in the commit message; otherwise revert.
- **No deletion of tests** to lower test-count baseline (the `BASELINE_TESTS`
  gate prevents this; never lower it).
- **No removal of features / components / routes** without confirming via
  e2e or by tracing call sites. "Dead code" must be proven dead.
- **MVVM split must be real**: View (TSX, presentation only) ↔ ViewModel
  (hook, state + intents, no JSX) ↔ Model (api/data layer). Don't just rename
  files.
- Don't overfit to the bench: do not introduce metric-gaming files (e.g.,
  test files that assert `expect(true).toBe(true)` 100 times).

## Workflow per experiment
1. Make a focused refactor (one concept at a time: extract a viewmodel,
   merge duplicated hooks, delete dead code, add tests for a pure module, …).
2. Run `bash scripts/autoresearch-bench.sh`.
3. `log_experiment` with the parsed metric.
4. On `keep`, commit auto-happens. On regression / gate fail, auto-revert.

## Ideas backlog
See `autoresearch.ideas.md`.
