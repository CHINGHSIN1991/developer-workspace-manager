from datetime import datetime, timezone
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel

VERSION = "0.1.0"

app = FastAPI(
    title="DevSpace API",
    version=VERSION,
)


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    version: str
    timestamp: datetime


@app.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="devspace-backend",
        version=VERSION,
        timestamp=datetime.now(timezone.utc),
    )