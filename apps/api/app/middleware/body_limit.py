"""Reject oversized request bodies before handlers run."""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.config import settings


_UPLOAD_MAX = 11 * 1024 * 1024  # 10 MB file + multipart overhead


class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        if request.method in ("POST", "PUT", "PATCH"):
            raw = request.headers.get("content-length")
            if raw:
                try:
                    is_upload = "/public/forms/" in request.url.path and request.url.path.endswith("/upload")
                    limit = _UPLOAD_MAX if is_upload else settings.max_request_body_bytes
                    if int(raw) > limit:
                        return JSONResponse(
                            status_code=413,
                            content={"detail": "Request body too large"},
                        )
                except ValueError:
                    pass
        return await call_next(request)
