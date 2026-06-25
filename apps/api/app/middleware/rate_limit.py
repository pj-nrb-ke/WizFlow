"""Simple in-memory rate limiting for auth and submit abuse."""

from __future__ import annotations

import time
from collections import defaultdict
from threading import Lock

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

# path prefix -> (max requests, window seconds)
_LIMITS: dict[str, tuple[int, int]] = {
    "/api/v1/auth/login": (20, 60),
    "/api/v1/auth/refresh": (30, 60),
    "/api/v1/public/approval": (40, 60),
    "/api/v1/invitations/": (10, 60),     # brute-force guard on invite accept
    "/api/v1/public/forms": (30, 60),     # form page loads + submit combined
}

_buckets: dict[str, list[float]] = defaultdict(list)
_lock = Lock()


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    if request.client:
        return request.client.host or "unknown"
    return "unknown"


def _rate_limit_key(request: Request) -> str | None:
    path = request.url.path
    for prefix in _LIMITS:
        if path.startswith(prefix):
            return prefix
    if request.method == "POST" and "/submit" in path:
        return "__submit__"
    return None


def _check(key: str, limit: int, window: int) -> bool:
    now = time.time()
    bucket_key = key
    with _lock:
        hits = _buckets[bucket_key]
        hits[:] = [t for t in hits if now - t < window]
        if len(hits) >= limit:
            return False
        hits.append(now)
    return True


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        prefix = _rate_limit_key(request)
        if prefix:
            if prefix == "__submit__":
                limit, window = 60, 60
            else:
                limit, window = _LIMITS[prefix]
            composite = f"{prefix}:{_client_key(request)}"
            if not _check(composite, limit, window):
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too many requests. Please try again later."},
                )
        return await call_next(request)
