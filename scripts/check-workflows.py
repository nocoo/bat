#!/usr/bin/env python3
import pathlib
import re
import sys

import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
WORKFLOWS = ROOT / ".github/workflows"
BASE_CI = "777bbe4f9bacab8a91d8c01974480a6ee23d28e0"
SLOT_JOBS = [
    ("s1-types", "S1: Types"),
    ("s2-lint", "S2: Lint"),
    ("s3-workflow", "S3: Workflow"),
    ("g1-secrets", "G1: Secrets"),
    ("g2-dependencies", "G2: Dependencies"),
    ("b1-build", "B1: Build"),
    ("l1-unit", "L1: Unit"),
    ("l2-runtime", "L2: Runtime"),
    ("l3-integration", "L3: Integration"),
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


def check_ci():
    data = load(WORKFLOWS / "ci.yml")
    workflow_jobs = jobs(data)
    if list(workflow_jobs) != ["quality"]:
        raise SystemExit("ci.yml must contain exactly the quality caller job")
    job = workflow_jobs["quality"]
    if job.get("name") not in (None, "quality"):
        raise SystemExit("ci.yml quality job must not change the check-name prefix")
    if job.get("uses") != "./.github/workflows/quality-slots.yml":
        raise SystemExit("ci.yml must call the local quality-slots workflow")


def check_slots():
    data = load(WORKFLOWS / "quality-slots.yml")
    triggers = data.get("on", data.get(True))
    if not isinstance(triggers, dict) or "workflow_call" not in triggers:
        raise SystemExit("quality-slots.yml must use workflow_call")
    workflow_jobs = jobs(data)
    expected = dict(SLOT_JOBS)
    if set(workflow_jobs) != set(expected) | {"z1-gate"}:
        raise SystemExit("quality-slots.yml must contain exactly the 11 slot jobs and z1-gate")
    for job_id, name in expected.items():
        job = workflow_jobs[job_id]
        if job.get("name") != name:
            raise SystemExit(f"{job_id}: expected display name {name!r}")
        if not job.get("timeout-minutes"):
            raise SystemExit(f"{job_id}: missing timeout-minutes")
        if job.get("outputs", {}).get("tested-sha") != "${{ steps.tested-sha.outputs.sha }}":
            raise SystemExit(f"{job_id}: missing tested-sha output")
    z1 = workflow_jobs["z1-gate"]
    if set(z1.get("needs", [])) != set(expected):
        raise SystemExit("z1-gate must need every slot job")
    if z1.get("if") != "always()":
        raise SystemExit("z1-gate must run with if: always()")


def check_release():
    data = load(WORKFLOWS / "release.yml")
    references = list(uses_values(data))
    for reference in references:
        if "nocoo/base-ci/" in reference and not reference.endswith(f"@{BASE_CI}"):
            raise SystemExit(f"release.yml must pin base-ci v2026.15: {reference}")
    release_sources = [
        step
        for job in jobs(data).values()
        for step in job.get("steps", [])
        if isinstance(step, dict) and "release-source@" in step.get("uses", "")
    ]
    deploy_jobs = [
        job for job in jobs(data).values() if "deploy-worker.yml@" in job.get("uses", "")
    ]
    if len(release_sources) != 1 or len(deploy_jobs) != 1:
        raise SystemExit("release.yml must have one deploy-worker job and one probe release-source")
    for item in [*release_sources, *deploy_jobs]:
        with_values = item.get("with", {})
        if with_values.get("required-quality-check") != "quality / Z1: Gate":
            raise SystemExit("release source must require quality / Z1: Gate")


def main():
    check_immutable_refs()
    check_ci()
    check_slots()
    check_release()
    print("workflow structure verified")


if __name__ == "__main__":
    try:
        main()
    except (KeyError, TypeError, yaml.YAMLError) as error:
        print(f"workflow structure check failed: {error}", file=sys.stderr)
        sys.exit(1)
