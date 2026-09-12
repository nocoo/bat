"""Read only Bat's Access/Worker metadata; never emit credentials or raw responses."""

import json
import os
import urllib.error
import urllib.request


ACCOUNT = "d51a8fde361e4be31db17d8c56737c1f"
ZONE = "c64f1264b07d306e9ec8810cbec9f60f"
HOST = "bat.hexly.ai"
token = os.environ["CLOUDFLARE_API_TOKEN"]
if os.environ["CLOUDFLARE_ACCOUNT_ID"] != ACCOUNT:
    raise SystemExit("Refusing an unexpected Cloudflare account.")


def get(path):
    request = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4{path}",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
    )
    try:
        response = urllib.request.urlopen(request, timeout=30)
    except urllib.error.HTTPError as error:
        response = error
    except (urllib.error.URLError, TimeoutError):
        return {"success": False, "errors": [{"code": "network_error"}]}
    try:
        return json.load(response)
    except (ValueError, UnicodeDecodeError):
        return {"success": False, "errors": [{"code": "invalid_response"}]}


def rule_metadata(rules):
    output = []
    for rule in rules or []:
        if "email" in rule:
            output.append({"email": rule["email"].get("email")})
        elif "email_domain" in rule:
            output.append({"email_domain": rule["email_domain"].get("domain")})
        elif "everyone" in rule:
            output.append({"everyone": True})
        else:
            output.append({"selectors": sorted(rule)})
    return output


def policy_metadata(policy):
    return {
        "id": policy.get("id"),
        "name": policy.get("name"),
        "decision": policy.get("decision"),
        "precedence": policy.get("precedence"),
        "include": rule_metadata(policy.get("include")),
        "require": rule_metadata(policy.get("require")),
        "exclude": rule_metadata(policy.get("exclude")),
    }


def error_codes(result):
    return [error.get("code") for error in result.get("errors", [])]


report = {"accountId": ACCOUNT, "zoneId": ZONE, "hostname": HOST, "access": []}
found = False
for scope in [f"/accounts/{ACCOUNT}", f"/zones/{ZONE}"]:
    result = get(f"{scope}/access/apps?per_page=100")
    entry = {"scope": scope, "success": result.get("success"), "errors": error_codes(result)}
    apps = result.get("result") or []
    if not isinstance(apps, list):
        apps = []
    entry["applicationCount"] = len(apps)
    entry["applications"] = []
    for app in apps:
        domains = [app.get("domain", ""), *(app.get("self_hosted_domains") or [])]
        domains.extend(item.get("uri", "") for item in app.get("destinations", []))
        if not any(HOST in domain or "*.hexly.ai" in domain for domain in domains):
            continue
        found = True
        policies = get(f"{scope}/access/apps/{app['id']}/policies?per_page=100")
        entry["applications"].append({
            "id": app["id"],
            "name": app.get("name"),
            "type": app.get("type"),
            "domains": domains,
            "audience": app.get("aud"),
            "policiesSuccess": policies.get("success"),
            "policiesErrors": error_codes(policies),
            "policies": [policy_metadata(policy) for policy in policies.get("result") or []],
        })
    report["access"].append(entry)

org = get(f"/accounts/{ACCOUNT}/access/organizations")
report["organization"] = {
    "success": org.get("success"),
    "errors": error_codes(org),
    "authDomain": (org.get("result") or {}).get("auth_domain"),
}
settings = get(f"/accounts/{ACCOUNT}/workers/scripts/bat/settings")
report["worker"] = {
    "success": settings.get("success"),
    "errors": error_codes(settings),
    "bindings": [
        {"name": binding.get("name"), "type": binding.get("type")}
        for binding in (settings.get("result") or {}).get("bindings", [])
    ],
}
print(json.dumps(report, indent=2))
if not found:
    raise SystemExit("Bat's existing Access application was not visible; no configuration changed.")
