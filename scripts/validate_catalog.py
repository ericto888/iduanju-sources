#!/usr/bin/env python3
"""Validate the iDuanJu source catalog using only the Python standard library."""
import json
import re
import sys
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.json"
RAW_PREFIX = "https://raw.githubusercontent.com/ericto888/iduanju-sources/main/"
ID_RE = re.compile(r"^[a-z0-9]+(?:\.[a-z0-9-]+){2,}$")
SEMVER_RE = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+$")
DOMAIN_RE = re.compile(r"^(?:\*\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$")


def fail(message):
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        fail(f"{path.relative_to(ROOT)} is not valid UTF-8 JSON: {exc}")


def main():
    catalog = read_json(INDEX)
    if not isinstance(catalog, dict) or catalog.get("schema") != 1:
        fail("index.json: schema must be 1")
    for key in ("name", "updatedAt", "categories", "plugins"):
        if key not in catalog:
            fail(f"index.json: missing {key}")
    try:
        date.fromisoformat(catalog["updatedAt"])
    except Exception:
        fail("index.json: updatedAt must be YYYY-MM-DD")

    categories = catalog["categories"]
    plugins = catalog["plugins"]
    if not isinstance(categories, list) or not isinstance(plugins, list):
        fail("categories and plugins must be arrays")

    category_ids = set()
    for item in categories:
        if not isinstance(item, dict) or not item.get("id") or not item.get("name"):
            fail("each category requires id and name")
        if item["id"] in category_ids:
            fail(f"duplicate category id: {item['id']}")
        category_ids.add(item["id"])

    seen = set()
    for item in plugins:
        if not isinstance(item, dict):
            fail("each plugin catalog item must be an object")
        for key in ("id", "name", "manifest"):
            if not isinstance(item.get(key), str) or not item[key].strip():
                fail(f"catalog plugin requires non-empty {key}")
        pid = item["id"]
        if not ID_RE.fullmatch(pid):
            fail(f"invalid reverse-domain plugin id: {pid}")
        if pid in seen:
            fail(f"duplicate plugin id: {pid}")
        seen.add(pid)

        if item.get("type") is not None and item["type"] not in {"video", "shortdrama", "comic", "live"}:
            fail(f"{pid}: invalid type")
        if item.get("adult") is not None and not isinstance(item["adult"], bool):
            fail(f"{pid}: adult must be boolean")
        if item.get("category") is not None and item["category"] not in category_ids:
            fail(f"{pid}: unknown category {item['category']}")

        manifest_url = item["manifest"]
        parsed = urlparse(manifest_url)
        if parsed.scheme != "https" or parsed.netloc != "raw.githubusercontent.com":
            fail(f"{pid}: manifest must use raw.githubusercontent.com HTTPS")
        expected_prefix = RAW_PREFIX + "sources/"
        if not manifest_url.startswith(expected_prefix) or not manifest_url.endswith("/manifest.json"):
            fail(f"{pid}: manifest must point inside this repository's sources/<id>/manifest.json")
        relative = manifest_url[len(RAW_PREFIX):]
        manifest_path = (ROOT / relative).resolve()
        if ROOT.resolve() not in manifest_path.parents or not manifest_path.is_file():
            fail(f"{pid}: manifest file does not exist in repository: {relative}")

        manifest = read_json(manifest_path)
        required = ("schema", "id", "name", "version", "author", "type", "adult",
                    "minAppVersion", "entry", "permissions", "capabilities")
        for key in required:
            if key not in manifest:
                fail(f"{pid}: manifest missing {key}")
        if manifest["schema"] != 1 or manifest["id"] != pid:
            fail(f"{pid}: manifest schema/id does not match catalog")
        if not isinstance(manifest["name"], str) or not manifest["name"].strip():
            fail(f"{pid}: manifest name is empty")
        if not SEMVER_RE.fullmatch(str(manifest["version"])):
            fail(f"{pid}: manifest version must be x.y.z")
        if manifest["type"] not in {"video", "shortdrama", "comic", "live"}:
            fail(f"{pid}: invalid manifest type")
        if not isinstance(manifest["adult"], bool):
            fail(f"{pid}: manifest adult must be boolean")
        author = manifest["author"]
        if not isinstance(author, dict) or not isinstance(author.get("name"), str) or not author["name"].strip():
            fail(f"{pid}: author.name is required")
        entry = manifest["entry"]
        if not isinstance(entry, str) or not re.fullmatch(r"[A-Za-z0-9_-]+\.js", entry):
            fail(f"{pid}: entry must be a simple .js filename")
        if not (manifest_path.parent / entry).is_file():
            fail(f"{pid}: entry script does not exist: {entry}")
        permissions = manifest["permissions"]
        if not isinstance(permissions, dict) or not isinstance(permissions.get("http"), list) or not permissions["http"]:
            fail(f"{pid}: permissions.http must be a non-empty array")
        for domain in permissions["http"] + permissions.get("media", []):
            if not isinstance(domain, str) or not DOMAIN_RE.fullmatch(domain):
                fail(f"{pid}: invalid declared domain: {domain}")
        required_caps = {"video": {"detail", "play"}, "shortdrama": {"detail", "play"},
                         "comic": {"detail", "pages"}, "live": {"play"}}[manifest["type"]]
        if not isinstance(manifest["capabilities"], list) or not required_caps.issubset(set(manifest["capabilities"])):
            fail(f"{pid}: missing required capabilities for type {manifest['type']}")
        if item.get("adult") is not None and item["adult"] != manifest["adult"]:
            fail(f"{pid}: catalog adult flag differs from manifest")
        if item.get("version") is not None and item["version"] != manifest["version"]:
            fail(f"{pid}: catalog version differs from manifest")
        if item.get("type") is not None and item["type"] != manifest["type"]:
            fail(f"{pid}: catalog type differs from manifest")

    print(f"Catalog valid: {len(plugins)} plugin(s), {len(categories)} categor(y/ies).")


if __name__ == "__main__":
    main()
