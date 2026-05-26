const PREFIX = "wizflow_draft_";

export type RequestDraft = {
  workflowId: string;
  form: Record<string, unknown>;
  savedAt: string;
};

export function draftKey(workflowId: string): string {
  return `${PREFIX}${workflowId}`;
}

export function saveDraft(workflowId: string, form: Record<string, unknown>): void {
  const payload: RequestDraft = {
    workflowId,
    form,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(draftKey(workflowId), JSON.stringify(payload));
}

export function loadDraft(workflowId: string): RequestDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(workflowId));
    if (!raw) return null;
    return JSON.parse(raw) as RequestDraft;
  } catch {
    return null;
  }
}

export function clearDraft(workflowId: string): void {
  localStorage.removeItem(draftKey(workflowId));
}
