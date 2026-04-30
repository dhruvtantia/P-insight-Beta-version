"""
System and feature-contract schemas.
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field


FeatureStatus = Literal["enabled", "disabled", "degraded", "unavailable"]


class FeatureDependencyHealth(BaseModel):
    name: str
    status: FeatureStatus
    reason: Optional[str] = None


class FeatureHealth(BaseModel):
    feature_id: str
    label: str
    status: FeatureStatus
    route_prefix: str
    reason: Optional[str] = None
    dependencies: list[FeatureDependencyHealth] = Field(default_factory=list)
    side_effects: list[str] = Field(default_factory=list)
    failure_behavior: str
    frontend_owner_hook: Optional[str] = None
    disable_behavior: str


class FeatureRegistryResponse(BaseModel):
    features: list[FeatureHealth]
