#!/usr/bin/env python3
import pathlib
import re
import sys

import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
WORKFLOWS = ROOT / ".github/workflows"
BASE_CI = "3703a073693d598159e87f77f99587e586c14cfe"
SLOT_JOBS = [
    ("s1-types", "S1: Types"),
    ("s2-lint", "S2: Lint"),
    ("s3-workflow", "S3: Workflow"),
    ("g1-secrets", "G1: Secrets"),
    ("g2-dependencies", "G2: Dependencies"),
    ("b1-build", "B1: Build"),
    ("l1-unit-ts", "L1: Unit (TS)"),
    ("l1-unit-rust", "L1: Unit (Rust)"),
    ("l2-runtime", "L2: Runtime"),
    ("l3-integration-probe", "L3: Integration (Probe)"),
    ("l3-integration-env-1", "L3: Integration (Environments 1/2)"),
    ("l3-integration-env-2", "L3: Integration (Environments 2/2)"),
    ("l4-e2e", "L4: E2E"),
    ("p1-package", "P1: Package"),
]


def load(path: pathlib.Path):
    data = yaml.safe_load(path.read_text())
    if not isinstance(data, dict):
        raise SystemExit(f"{path}: workflow must be a mapping")
    return data


def jobs(data):
    value = data.get("jobs")
    if not isinstance(value, dict):
        raise SystemExit("workflow has no jobs mapping")
    return value


def uses_values(value):
    if isinstance(value, dict):
        for key, child in value.items():
            if key == "uses" and isinstance(child, str):
                yield child
            else:
                yield from uses_values(child)
    elif isinstance(value, list):
        for child in value:
            yield from uses_values(child)


def check_immutable_refs():
    for path in sorted(WORKFLOWS.glob("*.yml")) + sorted((ROOT / ".github/actions").glob("*/action.yml")):
        for ref in uses_values(load(path)):
            if ref.startswith("./") or ref.startswith("docker://"):
                continue
            if not re.fullmatch(r"[^@\s]+@[0-9a-f]{40}", ref):
                raise SystemExit(f"{path}: mutable external reference {ref}")


def check_pipeline():
    data = load(WORKFLOWS / "pipeline.yml")
    triggers = data.get("on", data.get(True))
    if not isinstance(triggers, dict) or "tags" in (triggers.get("push") or {}):
        raise SystemExit("pipeline.yml must not declare tag triggers")
    workflow_jobs = jobs(data)
    if list(workflow_jobs) != ["quality", "deploy"]:
        raise SystemExit("pipeline.yml must contain quality and deploy jobs")
    quality = workflow_jobs["quality"]
    if quality.get("name") not in (None, "quality"):
        raise SystemExit("pipeline.yml quality job must not change the check-name prefix")
    if quality.get("uses") != "./.github/workflows/quality-slots.yml":
        raise SystemExit("pipeline.yml must call the local quality-slots workflow")
    deploy = workflow_jobs["deploy"]
    if deploy.get("uses") != f"nocoo/base-ci/.github/workflows/deploy-worker.yml@{BASE_CI}":
        raise SystemExit(f"pipeline.yml deploy job must pin base-ci deploy-worker v2026.24")
    if deploy.get("needs") != ["quality"]:
        raise SystemExit("pipeline.yml deploy job must need quality")
    with_values = deploy.get("with", {})
    if not with_values.get("verify-command"):
        raise SystemExit("pipeline.yml deploy job must configure verify-command (D5)")


def check_slots():
    data = load(WORKFLOWS / "quality-slots.yml")
    triggers = data.get("on", data.get(True))
    if not isinstance(triggers, dict) or "workflow_call" not in triggers:
        raise SystemExit("quality-slots.yml must use workflow_call")
    for reference in uses_values(data):
        if "nocoo/base-ci/" in reference and not reference.endswith(f"@{BASE_CI}"):
            raise SystemExit(f"quality-slots.yml must pin base-ci v2026.24: {reference}")
    workflow_jobs = jobs(data)
    expected = dict(SLOT_JOBS)
    if set(workflow_jobs) != set(expected) | {"z1-gate"}:
        raise SystemExit(f"quality-slots.yml must contain exactly the {len(expected)} slot jobs and z1-gate")
    for job_id, name in expected.items():
        job = workflow_jobs[job_id]
        if job.get("name") != name:
            raise SystemExit(f"{job_id}: expected display name {name!r}")
        if not job.get("timeout-minutes"):
            raise SystemExit(f"{job_id}: missing timeout-minutes")
        if job.get("outputs", {}).get("tested-sha") != "${{ steps.tested-sha.outputs.sha }}":
            raise SystemExit(f"{job_id}: missing tested-sha output")
    l4_uses = list(uses_values(workflow_jobs["l4-e2e"]))
    if f"nocoo/base-ci/.github/actions/setup-playwright@{BASE_CI}" not in l4_uses:
        raise SystemExit("l4-e2e must use nocoo/base-ci setup-playwright")
    z1 = workflow_jobs["z1-gate"]
    if set(z1.get("needs", [])) != set(expected):
        raise SystemExit("z1-gate must need every slot job")
    if z1.get("if") != "always()":
        raise SystemExit("z1-gate must run with if: always()")
    z1_uses = list(uses_values(z1))
    if z1_uses != [f"nocoo/base-ci/.github/actions/z1-gate@{BASE_CI}"]:
        raise SystemExit("z1-gate must use only checkout-free nocoo/base-ci z1-gate")


def check_probe_release():
    data = load(WORKFLOWS / "probe-release.yml")
    references = list(uses_values(data))
    for reference in references:
        if "nocoo/base-ci/" in reference and not reference.endswith(f"@{BASE_CI}"):
            raise SystemExit(f"probe-release.yml must pin base-ci v2026.24: {reference}")
    release_sources = [
        step
        for job in jobs(data).values()
        for step in job.get("steps", [])
        if isinstance(step, dict) and "release-source@" in step.get("uses", "")
    ]
    if len(release_sources) != 1:
        raise SystemExit("probe-release.yml must have one probe release-source step")
    for item in release_sources:
        with_values = item.get("with", {})
        if with_values.get("required-quality-check") != "quality / Z1: Gate":
            raise SystemExit("probe release-source must require quality / Z1: Gate")
        if with_values.get("expected-workflow-path") != ".github/workflows/pipeline.yml":
            raise SystemExit("probe release-source must check .github/workflows/pipeline.yml")


def main():
    check_immutable_refs()
    check_pipeline()
    check_slots()
    check_probe_release()
    print("workflow structure verified")


if __name__ == "__main__":
    try:
        main()
    except (KeyError, TypeError, yaml.YAMLError) as error:
        print(f"workflow structure check failed: {error}", file=sys.stderr)
        sys.exit(1)
