export const DEFAULT_SLA_HOURS = 48;

/** True when submitted_at + sla_hours is in the past (in_progress only by default). */
export function isRequestOverdue(
  submittedAt: string | null | undefined,
  slaHours?: number | null,
  status?: string
): boolean {
  if (!submittedAt) return false;
  if (status && status !== "in_progress") return false;
  const hours = slaHours ?? DEFAULT_SLA_HOURS;
  const deadline = new Date(submittedAt).getTime() + hours * 3600 * 1000;
  return Date.now() > deadline;
}
