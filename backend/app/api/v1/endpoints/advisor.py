"""
AI Advisor API Endpoints
--------------------------
Three endpoints that power the AI Portfolio Copilot:

  POST /advisor/ask
    Accepts a user query + optional portfolio_id.
    Builds context, calls LLM provider, returns structured AIAdvisorResponse.
    If provider unavailable → fallback_used=True, frontend uses rule-based engine.

  GET  /advisor/status
    Returns which LLM provider is configured and whether AI is available.
    Frontend polls this once on mount to decide Claude vs rule-based mode.

  GET  /advisor/context/{portfolio_id}
    Returns the raw PortfolioContext as JSON — for debug visibility.
    Exposed at /debug page's AI Advisor section.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException

from app.db.database        import get_db
from sqlalchemy.orm         import Session

from app.schemas.advisor    import (
    AdvisorQueryRequest,
    AIAdvisorResponse,
    AdvisorStatusResponse,
    PortfolioContextPayload,
)
from app.services.ai_advisor_service import AIAdvisorService
from app.services.ai.provider        import get_provider_status
from app.services.feature_registry   import require_feature

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/advisor", tags=["AI Advisor"])


# ─── Status ───────────────────────────────────────────────────────────────────

@router.get(
    "/status",
    response_model=AdvisorStatusResponse,
    summary="Check AI advisor provider status",
)
def get_advisor_status():
    """
    Returns which LLM provider is configured and whether AI responses
    are available. Frontend calls this once on mount.
    """
    require_feature("advisor")
    status = get_provider_status()
    return AdvisorStatusResponse(**status)


# ─── Ask ──────────────────────────────────────────────────────────────────────

@router.post(
    "/ask",
    response_model=AIAdvisorResponse,
    summary="Ask the AI Portfolio Copilot a question",
)
def ask_advisor(
    req: AdvisorQueryRequest,
    db:  Session = Depends(get_db),
):
    """
    Main entry point for AI-powered portfolio advisory.

    - Builds structured portfolio context from the database
    - Calls the configured LLM provider (Claude → OpenAI → fallback)
    - Returns summary + bullet insights + recommendations + follow-ups

    When fallback_used=True the frontend should run rule-based routeQuery()
    locally and display its response instead.
    """
    require_feature("advisor")
    try:
        svc      = AIAdvisorService(db)
        response = svc.ask(req)
        return response
    except Exception as e:
        logger.error("Advisor ask endpoint error: %s", e, exc_info=True)
        # Return a fallback response rather than a 500 — the UI degrades gracefully
        return AIAdvisorResponse(
            query         = req.query,
            summary       = "",
            insights      = [],
            recommendations = [],
            follow_ups    = [],
            fallback_used = True,
            error_message = f"Internal error: {e}",
        )


# ─── Context preview (debug) ──────────────────────────────────────────────────

@router.get(
    "/context/{portfolio_id}",
    response_model=PortfolioContextPayload,
    summary="Preview the portfolio context that would be sent to the AI",
)
def get_portfolio_context(
    portfolio_id: int,
    db: Session = Depends(get_db),
):
    """
    Returns the clean JSON context object that the AI advisor uses.
    Intended for the /debug page so developers can inspect exactly
    what data is being provided to the LLM.
    """
    require_feature("advisor")
    try:
        svc     = AIAdvisorService(db)
        payload = svc.build_context_payload(portfolio_id)
        return payload
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("Context endpoint error for portfolio %s: %s", portfolio_id, e)
        raise HTTPException(status_code=500, detail=f"Failed to build context: {e}")
