from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/requests", tags=["Requests"])


def _not_implemented(name: str) -> None:
    raise HTTPException(status_code=501, detail=f"{name} — implemented in P3+")


@router.get("")
def list_requests() -> None:
    _not_implemented("List my requests")


@router.get("/{request_id}")
def get_request(request_id: str) -> None:
    _not_implemented("Get request")


@router.get("/{request_id}/events")
def get_request_events(request_id: str) -> None:
    _not_implemented("Request events")
