from __future__ import annotations

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
        sources.append(path.read_text(encoding='utf-8'))
    return sources


def _route_fragments(path: str) -> set[str]:
    fragments: set[str] = set()
    current = ''
    for part in path.split('/'):
        if not part:
            continue
        if part.startswith('{'):
            if current:
                fragments.add(f"{current.rstrip('/')}/")
            continue
        current += f'/{part}'
    if current:
        fragments.add(current)
    return fragments


def _has_frontend_entry(route: APIRoute, frontend_sources: list[str]) -> bool:
    needles: set[str] = set()
    for fragment in _route_fragments(route.path):
        if len(fragment) >= 4:
            needles.add(fragment)
            needles.add(f'/api/v1{fragment}')
    return any(needle in source for needle in needles for source in frontend_sources)


def test_public_backend_routes_without_frontend_entry_are_classified():
    frontend_sources = _frontend_sources()
    public_routes = _public_api_routes()

    no_frontend_entry = {
        key
        for key, route in public_routes.items()
        if not _has_frontend_entry(route, frontend_sources)
    }

    assert no_frontend_entry == set(PUBLIC_ROUTE_SURFACE_REGISTRY)


def test_deprecated_public_routes_have_exit_plan():
    public_routes = _public_api_routes()
    deprecated_routes = {
        key for key, route in public_routes.items() if getattr(route, 'deprecated', False)
    }

    assert deprecated_routes <= set(PUBLIC_ROUTE_SURFACE_REGISTRY)
    for key, row in PUBLIC_ROUTE_SURFACE_REGISTRY.items():
        assert row['status'] == 'deprecated_compat'
        assert row['owner']
        assert row['entry_strategy']
        assert row['removal_condition']


def test_public_route_surface_registry_markdown_mentions_every_route():
    doc = Path('docs/public_route_surface_registry.md').read_text(encoding='utf-8')
    for key in PUBLIC_ROUTE_SURFACE_REGISTRY:
        assert f'`{key}`' in doc
