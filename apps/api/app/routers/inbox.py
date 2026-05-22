from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["Inbox"])


def _not_implemented(name: str) -> None:
    raise HTTPException(status_code=501, detail=f"{name} — implemented in P4")


@router.get("/inbox")
def get_inbox() -> None:
    _not_implemented("Inbox")


@router.post("/requests/{request_id}/approve")
def approve(request_id: str) -> None:
    _not_implemented("Approve")


@router.post("/requests/{request_id}/reject")
def reject(request_id: str) -> None:
    _not_implemented("Reject")


@router.post("/requests/{request_id}/return")
def return_request(request_id: str) -> None:
    _not_implemented("Return")
