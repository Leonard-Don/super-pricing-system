from __future__ import annotations

import ast
from pathlib import Path

from backend.app.api.v1.legacy_route_retirement import LEGACY_ROUTE_RETIREMENT_MATRIX

API_MODULE = Path('backend/app/api/v1/api.py')


def _hidden_prefixes_from_api_module() -> set[str]:
    tree = ast.parse(API_MODULE.read_text(encoding='utf-8'))
    hidden: set[str] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        if not isinstance(node.func, ast.Attribute) or node.func.attr != 'include_router':
            continue
        prefix = None
        include_in_schema = True
        for keyword in node.keywords:
            if keyword.arg == 'prefix':
                prefix = ast.literal_eval(keyword.value)
            elif keyword.arg == 'include_in_schema':
                include_in_schema = ast.literal_eval(keyword.value)
        if prefix and include_in_schema is False:
            hidden.add(prefix)
    return hidden


def test_hidden_legacy_route_groups_are_documented_in_retirement_matrix():
    hidden_prefixes = _hidden_prefixes_from_api_module()
    matrix_prefixes = set(LEGACY_ROUTE_RETIREMENT_MATRIX)

    assert hidden_prefixes == matrix_prefixes

    for prefix in hidden_prefixes:
        row = LEGACY_ROUTE_RETIREMENT_MATRIX[prefix]
        assert row['status'] == 'hidden_legacy_support'
        assert row['owner']
        assert row['replacement']
        assert row['removal_condition']
        assert row['openapi_policy'] == 'include_in_schema_false'


def test_retirement_matrix_does_not_hide_public_product_routes():
    public_prefixes = {'/pricing', '/alt-data', '/macro', '/cross-market', '/research-workbench', '/quant-lab', '/infrastructure'}
    for prefix in public_prefixes:
        assert prefix not in LEGACY_ROUTE_RETIREMENT_MATRIX


def test_markdown_retirement_matrix_mentions_every_hidden_prefix():
    doc = Path('docs/legacy_route_retirement.md').read_text(encoding='utf-8')
    for prefix in _hidden_prefixes_from_api_module():
        assert f'`{prefix}`' in doc
