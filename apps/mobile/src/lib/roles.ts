export function canAccessAnalytics(roles?: string[]): boolean {
  if (!roles) return false;
  return roles.includes("company_admin") || roles.includes("manager");
}
