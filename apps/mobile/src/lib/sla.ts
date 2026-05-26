const DEFAULT_SLA_HOURS = 48;

export function isOverdue(submittedAt: string | null | undefined, slaHours = DEFAULT_SLA_HOURS): boolean {
  if (!submittedAt) return false;
  const start = new Date(submittedAt).getTime();
  const deadline = start + slaHours * 3600 * 1000;
  return Date.now() > deadline;
}
