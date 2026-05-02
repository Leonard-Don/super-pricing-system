"""Preferences service: business logic for ``/preferences`` endpoints.

Routes layer (``routes.py``) delegates the actual store interaction to this
module. Functions accept the parsed ``profile_id`` rather than the raw
``Request`` object so they remain easy to test in isolation.
"""

from typing import Any, Dict

from backend.app.schemas.industry import IndustryPreferencesResponse
from backend.app.services.industry_preferences import industry_preferences_store


def get_preferences(profile_id: str) -> IndustryPreferencesResponse:
    return IndustryPreferencesResponse(**industry_preferences_store.get_preferences(profile_id=profile_id))


def update_preferences(payload: IndustryPreferencesResponse, profile_id: str) -> IndustryPreferencesResponse:
    data = industry_preferences_store.update_preferences(payload.model_dump(), profile_id=profile_id)
    return IndustryPreferencesResponse(**data)


def export_preferences(profile_id: str) -> Dict[str, Any]:
    return industry_preferences_store.get_preferences(profile_id=profile_id)


def import_preferences(payload: IndustryPreferencesResponse, profile_id: str) -> IndustryPreferencesResponse:
    data = industry_preferences_store.update_preferences(payload.model_dump(), profile_id=profile_id)
    return IndustryPreferencesResponse(**data)
