export const EVENT_LABELS: Record<string, string> = {
  "request.submitted": "Request submitted",
  "step.started": "Approval step started",
  "step.approved": "Step approved",
  "step.rejected": "Step rejected",
  "step.returned": "Returned to originator",
  "step.info_requested": "Information requested",
  "request.info_answered": "Information provided",
  "step.claimed": "Task claimed",
  "workflow.completed": "Workflow completed",
  "file.uploaded": "File uploaded",
};

export function eventLabel(type: string, apiLabel?: string | null): string {
  return apiLabel || EVENT_LABELS[type] || type;
}
