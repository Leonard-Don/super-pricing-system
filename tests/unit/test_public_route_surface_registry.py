from __future__ import annotations

import re
from pathlib import Path

from fastapi.routing import APIRoute

from backend.app.api.v1.api import api_router
from backend.app.api.v1.public_route_surface_registry import PUBLIC_ROUTE_SURFACE_REGISTRY

FRONTEND_SRC = Path('frontend/src')
FRONTEND_SUFFIXES = {'.js', '.jsx', '.ts', '.tsx'}


def _public_api_routes() -> dict[str, APIRoute]:
    routes: dict[str, APIRoute] = {}
    for route in api_router.routes:
        if not isinstance(route, APIRoute) or route.include_in_schema is False:
            continue
        for method in route.methods or set():
            if method in {'GET', 'POST', 'PUT', 'PATCH', 'DELETE'}:
                routes[f'{method} {route.path}'] = route
    return routes


def _frontend_sources() -> list[str]:
    sources: list[str] = []
    for path in FRONTEND_SRC.rglob('*'):
        if path.suffix not in FRONTEND_SUFFIXES:
            continue
        path_text = path.as_posix().lower()
        if '/__tests__/' in path_text or '.test.' in path_text or '.spec.' in path_text:
            continue
        # Exclude auto-generated files (e.g. frontend/src/generated/api-types.ts) —
        # they list every API path as type annotations, not as actual UI call
        # sites, so they would falsely claim all routes are "used by the frontend".
        if '/generated/' in path_text:
            continue
        sources.append(path.read_text(encoding='utf-8'))
    return sources


def test_frontend_entry_detection_does_not_count_dynamic_route_siblings():
    route = APIRoute(
        '/system/alerts/{alert_index}/resolve',
        endpoint=lambda: None,
        methods=['POST'],
    )

    assert not _has_frontend_entry(route, ["api.get('/system/alerts/summary')"])


def test_frontend_entry_detection_matches_dynamic_template_endpoints():
    route = APIRoute(
        '/system/alerts/{alert_index}/resolve',
        endpoint=lambda: None,
        methods=['POST'],
    )

    assert _has_frontend_entry(route, ["api.post(`/system/alerts/${alertIndex}/resolve`)"])


def _route_source_patterns(path: str) -> list[re.Pattern[str]]:
    parts = [part for part in path.split('/') if part]
    if not parts:
        return []

    pattern_parts: list[str] = []
    for part in parts:
        if part.startswith('{') and part.endswith('}'):
            pattern_parts.append(r'(?:\$\{[^}]+\}|[^/`\'"]+)')
        else:
            pattern_parts.append(re.escape(part))

    route_pattern = '/' + '/'.join(pattern_parts)
    return [
        re.compile(route_pattern),
        re.compile('/api/v1' + route_pattern),
    ]


def _has_frontend_entry(route: APIRoute, frontend_sources: list[str]) -> bool:
    patterns = _route_source_patterns(route.path)
    return any(pattern.search(source) for pattern in patterns for source in frontend_sources)


def test_public_backend_routes_without_frontend_entry_are_classified():
    frontend_sources = _frontend_sources()
    public_routes = _public_api_routes()

    no_frontend_entry = {
        key
        for key, route in public_routes.items()
        if not _has_frontend_entry(route, frontend_sources)
    }

    assert no_frontend_entry == set(PUBLIC_ROUTE_SURFACE_REGISTRY)


def test_classified_public_routes_have_exit_plan():
    public_routes = _public_api_routes()
    deprecated_routes = {
        key for key, route in public_routes.items() if getattr(route, 'deprecated', False)
    }

    assert deprecated_routes <= set(PUBLIC_ROUTE_SURFACE_REGISTRY)
    for key, row in PUBLIC_ROUTE_SURFACE_REGISTRY.items():
        assert row['owner']
        assert row['entry_strategy']
        assert row['removal_condition']
        assert row['status'] in {'deprecated_compat', 'external_callback'}

    for key in deprecated_routes:
        assert PUBLIC_ROUTE_SURFACE_REGISTRY[key]['status'] == 'deprecated_compat'


def test_public_route_surface_registry_markdown_mentions_every_route():
    doc = Path('docs/public_route_surface_registry.md').read_text(encoding='utf-8')
    for key in PUBLIC_ROUTE_SURFACE_REGISTRY:
        assert f'`{key}`' in doc
