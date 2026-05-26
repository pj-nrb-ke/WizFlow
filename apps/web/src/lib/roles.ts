/** Roles that can access MIS reports and analytics hub. */
export function canAccessReports(roles: string[] | undefined): boolean {
  if (!roles?.length) return false;
  return roles.some((r) => r === "company_admin" || r === "manager");
}
