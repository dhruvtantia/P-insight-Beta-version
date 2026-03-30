"""
AI Portfolio Chat API Endpoint  [Phase 2 — scaffold]
------------------------------------------------------
Accepts a user message and portfolio context, returns an AI-generated response.
Phase 1: Returns a structured scaffold response.
Phase 2: Wire to Anthropic Claude or OpenAI with portfolio context injection.
"""

from fastapi import APIRouter
from app.core.config import settings
from app.schemas.portfolio import ChatMessage, ChatResponse

router = APIRouter(prefix="/ai-chat", tags=["AI Chat"])


@router.post("/", response_model=ChatResponse, summary="Send a chat message to AI portfolio advisor")
async def chat(message: ChatMessage):
    """
    Phase 1: Returns scaffold response indicating feature is not yet active.
    Phase 2:
      - Inject portfolio summary + risk metrics as system context
      - Route to Anthropic Claude (claude-3-5-sonnet) or OpenAI GPT-4o
      - Stream response back to frontend

    To enable in Phase 2:
      1. Set AI_CHAT_ENABLED=true in .env
      2. Add ANTHROPIC_API_KEY or OPENAI_API_KEY to .env
      3. poetry add anthropic  (or openai)
      4. Replace the scaffold return below with actual API call
    """
    if not settings.AI_CHAT_ENABLED:
        return ChatResponse(
            reply=(
                "👋 AI Portfolio Chat is coming soon!\n\n"
                "Once enabled, you'll be able to ask questions like:\n"
                "• 'What is my portfolio's Sharpe ratio?'\n"
                "• 'Which sector am I most exposed to?'\n"
                "• 'Suggest ways to reduce my portfolio risk.'\n\n"
                f"Your question: \"{message.message}\" has been noted. "
                "Add your ANTHROPIC_API_KEY to .env to activate this feature."
            ),
            source="scaffold",
            enabled=False,
        )

    # ─── Phase 2: Real AI integration ─────────────────────────────────────────
    # import anthropic
    # client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    # system_prompt = build_portfolio_system_prompt(message.portfolio_context)
    # response = client.messages.create(
    #     model="claude-3-5-sonnet-20241022",
    #     max_tokens=1024,
    #     system=system_prompt,
    #     messages=[{"role": "user", "content": message.message}]
    # )
    # return ChatResponse(reply=response.content[0].text, source="claude", enabled=True)

    return ChatResponse(reply="AI feature enabled but not yet implemented.", source="scaffold", enabled=True)
