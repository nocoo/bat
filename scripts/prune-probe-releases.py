"""Keep the newest three Bat probe releases in R2. Defaults to a dry run."""

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.parse
import urllib.request

ACCOUNT = "d51a8fde361e4be31db17d8c56737c1f"
BUCKET = "zhe"
PREFIX = "apps/bat/"
VERSION_KEY = re.compile(r"^apps/bat/((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))/(.+)$")
FILES = {
    f"bat-probe-linux-{arch}{suffix}"
    for arch in ("x86_64", "aarch64")
    for suffix in ("", ".sha256")
}
ROOT = Path(__file__).resolve().parent.parent


def list_objects(token):
    objects = []
    cursor = ""
    seen = set()
    while True:
        query = urllib.parse.urlencode({"prefix": PREFIX, "per_page": 1000, "cursor": cursor})
        request = urllib.request.Request(
            f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/r2/buckets/{BUCKET}/objects?{query}",
            headers={"Authorization": f"Bearer {token}"},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            page = json.load(response)
        if page.get("success") is not True or not isinstance(page.get("result"), list):
            raise ValueError("R2 object listing failed; refusing cleanup")
        objects.extend(page["result"])
        info = page.get("result_info", {})
        if not info.get("is_truncated"):
            return objects
        cursor = info.get("cursor")
        if not cursor or cursor in seen:
            raise ValueError("Incomplete R2 pagination; refusing cleanup")
        seen.add(cursor)


def cleanup_plan(objects, release_version):
    by_key = {obj["key"]: obj for obj in objects}
    versions = {}
    for key in by_key:
        match = VERSION_KEY.fullmatch(key)
        if match:
            versions.setdefault(match[1], []).append(key)
    ordered = sorted(versions, key=lambda v: tuple(map(int, v.split("."))), reverse=True)
    keep = ordered[:3]
    if not keep or keep[0] != release_version:
        raise ValueError("Expected release must be the newest uploaded version; refusing cleanup")
    # Do not evict a working release while a retained replacement is incomplete.
    for version in keep:
        for filename in FILES:
            obj = by_key.get(f"{PREFIX}{version}/{filename}", {})
            if obj.get("size", 0) <= 0 or not obj.get("etag"):
                raise ValueError(f"Incomplete retained release {version}; refusing cleanup")
    for filename in FILES:
        latest = by_key.get(f"{PREFIX}latest/{filename}", {})
        released = by_key[f"{PREFIX}{release_version}/{filename}"]
        if latest.get("etag") != released["etag"] or latest.get("size") != released["size"]:
            raise ValueError("latest/ does not match the completed release; refusing cleanup")
    delete = sorted(key for version in ordered[3:] for key in versions[version])
    return {
        "keep": keep,
        "remove_versions": ordered[3:],
        "delete": delete,
        "delete_bytes": sum(by_key[key]["size"] for key in delete),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release-version", required=True)
    parser.add_argument("--apply", action="store_true", help="Delete planned objects (default: dry run)")
    args = parser.parse_args()
    if os.environ.get("CLOUDFLARE_ACCOUNT_ID") != ACCOUNT:
        raise SystemExit("Refusing an unexpected Cloudflare account")
    token = os.environ["CLOUDFLARE_API_TOKEN"]
    plan = cleanup_plan(list_objects(token), args.release_version)
    print(json.dumps({"apply": args.apply, **plan}, indent=2), flush=True)
    if not args.apply:
        return
    wrangler = ROOT / "packages/worker/node_modules/.bin/wrangler"
    for key in plan["delete"]:
        subprocess.run(
            [str(wrangler), "r2", "object", "delete", f"{BUCKET}/{key}", "--remote"],
            cwd=ROOT, check=True,
        )
    remaining = cleanup_plan(list_objects(token), args.release_version)
    if remaining["delete"] or remaining["keep"] != plan["keep"]:
        raise SystemExit("R2 inventory changed or cleanup is incomplete; inspect before retrying")
    print(f"Verified: retained {', '.join(remaining['keep'])} and latest/", flush=True)


if __name__ == "__main__":
    main()
