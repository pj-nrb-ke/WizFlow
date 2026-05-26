const WEB_APP = (process.env.EXPO_PUBLIC_WEB_URL || "https://app.wizflow.biz").replace(/\/$/, "");

export function buildRequestShareMessage(id: string, referenceNumber?: string | null): string {
  const ref = referenceNumber || id;
  const web = `${WEB_APP}/requests/${id}`;
  const deep = `wizflow://request/${id}`;
  return `WizFlow request ${ref}\nOpen in app: ${deep}\nWeb: ${web}`;
}

export function buildRequestWebUrl(id: string): string {
  return `${WEB_APP}/requests/${id}`;
}
