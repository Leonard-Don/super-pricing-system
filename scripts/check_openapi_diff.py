"""Check the live FastAPI OpenAPI schema against docs/openapi.json baseline.

Exits non-zero on breaking changes (field deletion, type change, required-set
expansion). Non-breaking changes (new optional fields, new endpoints) are
reported but allowed.

Usage:
    python scripts/check_openapi_diff.py            # check, exit 1 if breaking
    python scripts/check_openapi_diff.py --update   # refresh baseline
    python scripts/check_openapi_diff.py --report   # print full diff, exit 0
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Iterable

REPO_ROOT = Path(__file__).resolve().parent.parent
BASELINE = REPO_ROOT / "docs" / "openapi.json"


def load_baseline() -> dict[str, Any]:
    if not BASELINE.exists():
        print(f"ERROR: no baseline at {BASELINE}; run with --update first", file=sys.stderr)
        sys.exit(2)
    return json.loads(BASELINE.read_text(encoding="utf-8"))


def fetch_current() -> dict[str, Any]:
    sys.path.insert(0, str(REPO_ROOT))
    from backend.main import app  # imported lazily so the script can --update without app

    return app.openapi()


def _resolve_ref(spec: dict[str, Any], ref: str) -> dict[str, Any]:
    """Resolve a JSON Pointer reference like '#/components/schemas/Foo'."""
    if not ref.startswith("#/"):
        return {}
    cursor: Any = spec
    for segment in ref[2:].split("/"):
        if not isinstance(cursor, dict):
            return {}
        cursor = cursor.get(segment, {})
    return cursor if isinstance(cursor, dict) else {}


def _flatten_schema(spec: dict[str, Any], schema: dict[str, Any], seen: set[str]) -> dict[str, Any]:
    """Inline a schema's $refs one level so field comparisons see real types."""
    if not isinstance(schema, dict):
        return {}
    ref = schema.get("$ref")
    if isinstance(ref, str):
        if ref in seen:
            return {"$cycle": ref}
        seen = seen | {ref}
        resolved = _resolve_ref(spec, ref)
        return _flatten_schema(spec, resolved, seen)
    return schema


def _walk_request_response(spec: dict[str, Any]) -> Iterable[tuple[str, dict[str, Any]]]:
    """Yield (key, schema) pairs for every request body and response field set."""
    for path, methods in spec.get("paths", {}).items():
        if not isinstance(methods, dict):
            continue
        for method, op in methods.items():
            if method not in {"get", "post", "put", "patch", "delete"} or not isinstance(op, dict):
                continue
            base = f"{method.upper()} {path}"
            req = op.get("requestBody", {}).get("content", {})
            for media_type, payload in req.items():
                schema = _flatten_schema(spec, payload.get("schema", {}), set())
                yield f"{base} body[{media_type}]", schema
            for status, response in op.get("responses", {}).items():
                content = response.get("content", {}) if isinstance(response, dict) else {}
                for media_type, payload in content.items():
                    schema = _flatten_schema(spec, payload.get("schema", {}), set())
                    yield f"{base} response[{status}][{media_type}]", schema


def _properties_of(schema: dict[str, Any]) -> dict[str, dict[str, Any]]:
    if not isinstance(schema, dict):
        return {}
    items = schema.get("items")
    if isinstance(items, dict):
        return _properties_of(items)
    props = schema.get("properties", {})
    return props if isinstance(props, dict) else {}


def _required_of(schema: dict[str, Any]) -> set[str]:
    if not isinstance(schema, dict):
        return set()
    items = schema.get("items")
    if isinstance(items, dict):
        return _required_of(items)
    req = schema.get("required", [])
    return set(req) if isinstance(req, list) else set()


def _type_signature(schema: dict[str, Any]) -> str:
    if not isinstance(schema, dict):
        return "?"
    if "type" in schema:
        if schema["type"] == "array":
            return f"array<{_type_signature(schema.get('items', {}))}>"
        return str(schema["type"])
    if "anyOf" in schema:
        return "anyOf"
    if "oneOf" in schema:
        return "oneOf"
    return "object"


def diff(baseline: dict[str, Any], current: dict[str, Any]) -> tuple[list[str], list[str]]:
    """Return (breaking, non_breaking) change descriptions."""
    breaking: list[str] = []
    nonbreaking: list[str] = []

    base_map = dict(_walk_request_response(baseline))
    curr_map = dict(_walk_request_response(current))

    for key, base_schema in base_map.items():
        if key not in curr_map:
            breaking.append(f"REMOVED endpoint surface: {key}")
            continue
        curr_schema = curr_map[key]

        base_props = _properties_of(base_schema)
        curr_props = _properties_of(curr_schema)
        base_required = _required_of(base_schema)
        curr_required = _required_of(curr_schema)

        for field in base_props:
            if field not in curr_props:
                breaking.append(f"REMOVED field {key} :: {field}")
                continue
            base_t = _type_signature(base_props[field])
            curr_t = _type_signature(curr_props[field])
            if base_t != curr_t:
                breaking.append(f"TYPE CHANGE {key} :: {field} ({base_t} -> {curr_t})")

        added_required = curr_required - base_required
        for field in added_required:
            if field in base_props:
                breaking.append(f"NEW REQUIRED {key} :: {field} (was optional)")

        added_optional = set(curr_props) - set(base_props)
        for field in sorted(added_optional):
            nonbreaking.append(f"+ field {key} :: {field}")

    for key in curr_map.keys() - base_map.keys():
        nonbreaking.append(f"+ endpoint surface: {key}")

    return breaking, nonbreaking


def _print_changes(breaking: list[str], nonbreaking: list[str]) -> None:
    if breaking:
        print("BREAKING CHANGES:")
        for line in breaking:
            print(f"  {line}")
    if nonbreaking:
        print(f"\nNon-breaking changes ({len(nonbreaking)}):")
        for line in nonbreaking[:30]:
            print(f"  {line}")
        if len(nonbreaking) > 30:
            print(f"  ... and {len(nonbreaking) - 30} more")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--update", action="store_true", help="overwrite baseline with current schema")
    parser.add_argument("--report", action="store_true", help="print diff but always exit 0")
    args = parser.parse_args()

    if args.update:
        current = fetch_current()
        BASELINE.write_text(json.dumps(current, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"baseline refreshed: {BASELINE}")
        return 0

    baseline = load_baseline()
    current = fetch_current()
    breaking, nonbreaking = diff(baseline, current)

    if not breaking and not nonbreaking:
        print("OpenAPI: no contract drift")
        return 0

    _print_changes(breaking, nonbreaking)

    if args.report:
        return 0
    if breaking:
        print(f"\nFAIL: {len(breaking)} breaking change(s) — refuse to merge.")
        print("If intentional: refresh baseline via `python scripts/check_openapi_diff.py --update`.")
        return 1
    print("\nOK: only non-breaking changes — gate passes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
