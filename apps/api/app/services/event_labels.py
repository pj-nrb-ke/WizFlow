"""Human-readable labels for workflow events (UI + MIS)."""

EVENT_LABELS: dict[str, str] = {
    "request.submitted": "Request submitted",
    "step.started": "Approval step started",
    "step.approved": "Step approved",
    "step.rejected": "Step rejected",
    "step.returned": "Returned to originator",
    "step.claimed": "Task claimed",
    "workflow.completed": "Workflow completed",
    "file.uploaded": "File uploaded",
}


def label_for_event(event_type: str) -> str:
    return EVENT_LABELS.get(event_type, event_type.replace(".", " ").replace("_", " ").title())
