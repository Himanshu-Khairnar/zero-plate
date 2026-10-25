"""NLP endpoint used by the offline (no-LLM) assistant.

POST /api/nlp/parse  {text, history?, outletId?, dishes?, ingredients?}
  -> {intent, confidence, intentScores, entities, resolved, language,
      normalizedText, corrections, debug}

The models are trained once per process from app/nlp/data (in a background
thread at startup, ~1-2 s, a few MB of memory) and cached.
"""

from __future__ import annotations

import os
from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.nlp.pipeline import get_models, parse, preload_in_background

router = APIRouter(prefix="/api/nlp", tags=["nlp"])

# Train the models in the background as soon as the service starts, so a
# request arriving right after a cold start is not blocked by training.
# NLP_PRELOAD=0 disables this (training then happens on the first request).
if os.environ.get("NLP_PRELOAD", "1") != "0":
    preload_in_background()


class Turn(BaseModel):
    role: str = Field(description="user | assistant")
    text: str = Field(max_length=2000)


class ParseRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    history: list[Turn] = Field(default_factory=list, max_length=20)
    outletId: str | None = None
    dishes: list[str] | None = Field(default=None, max_length=500)
    ingredients: list[str] | None = Field(default=None, max_length=500)
    today: date | None = Field(default=None, description="Override 'today' (tests); defaults to the server date")


@router.post("/parse")
def parse_endpoint(body: ParseRequest) -> dict:
    if not body.text.strip():
        raise HTTPException(422, "text is empty")
    return parse(
        body.text,
        [t.model_dump() for t in body.history],
        dishes=[d for d in (body.dishes or []) if d and d.strip()] or None,
        ingredients=[i for i in (body.ingredients or []) if i and i.strip()] or None,
        today=body.today,
    )


@router.get("/health")
def nlp_health() -> dict:
    m = get_models()
    return {"status": "ok", "classifier": m.intent.name, "trainSeconds": m.train_seconds, "threshold": m.threshold}
