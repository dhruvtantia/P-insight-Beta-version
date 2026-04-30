"""
System contract endpoints.
"""

from fastapi import APIRouter

from app.schemas.system import FeatureRegistryResponse
from app.services.feature_registry import get_feature_registry

router = APIRouter(prefix="/system", tags=["System"])


@router.get(
    "/features",
    response_model=FeatureRegistryResponse,
    summary="Get modular feature registry and health contract",
)
async def get_features() -> FeatureRegistryResponse:
    return get_feature_registry()
