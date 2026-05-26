import { ApiError, apiFetch } from "./api";
import { getToken } from "./auth";

export const TEMPLATE_CATEGORIES = ["Finance", "HR", "Operations", "Compliance"] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  tags?: string[];
  step_count?: number;
};

export type TemplateCloneResult = {
  workflow_definition_id: string;
};

/** Fallback library when GET /api/v1/templates is not deployed yet. */
export const MOCK_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "tpl-petty-cash",
    name: "Petty cash",
    description: "Small cash reimbursements with manager and finance approval.",
    category: "Finance",
    tags: ["cash", "expense"],
    step_count: 3,
  },
  {
    id: "tpl-purchase",
    name: "Purchase request",
    description: "Capital and operational purchases with budget checks.",
    category: "Finance",
    tags: ["procurement"],
    step_count: 4,
  },
  {
    id: "tpl-leave",
    name: "Leave application",
    description: "Annual, sick, and special leave with line manager sign-off.",
    category: "HR",
    tags: ["leave"],
    step_count: 2,
  },
  {
    id: "tpl-overtime",
    name: "Overtime claim",
    description: "Pre-approved overtime hours and payout routing.",
    category: "HR",
    tags: ["payroll"],
    step_count: 3,
  },
  {
    id: "tpl-travel",
    name: "Travel expense",
    description: "Trip costs, per diem, and receipt attachments.",
    category: "Finance",
    tags: ["travel"],
    step_count: 3,
  },
  {
    id: "tpl-vendor",
    name: "Vendor onboarding",
    description: "New supplier setup with compliance and finance review.",
    category: "Operations",
    tags: ["vendor"],
    step_count: 5,
  },
  {
    id: "tpl-cheque",
    name: "Cheque collection",
    description: "Authorize cheque pickup and custody handover.",
    category: "Finance",
    tags: ["treasury"],
    step_count: 2,
  },
  {
    id: "tpl-contract",
    name: "Contract approval",
    description: "Legal and executive review for agreements.",
    category: "Compliance",
    tags: ["legal"],
    step_count: 4,
  },
  {
    id: "tpl-it-access",
    name: "IT access request",
    description: "Systems, roles, and access provisioning.",
    category: "Operations",
    tags: ["it"],
    step_count: 3,
  },
  {
    id: "tpl-equipment",
    name: "Equipment request",
    description: "Laptops, phones, and assets with asset tagging.",
    category: "Operations",
    tags: ["assets"],
    step_count: 3,
  },
  {
    id: "tpl-month-end",
    name: "Month-end reports",
    description: "Department sign-offs for period close checklists.",
    category: "Finance",
    tags: ["close"],
    step_count: 4,
  },
];

function useMockOnMissing(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 501);
}

export async function fetchTemplates(token?: string | null): Promise<WorkflowTemplate[]> {
  try {
    return await apiFetch<WorkflowTemplate[]>("/api/v1/templates", {}, token ?? getToken());
  } catch (err) {
    if (useMockOnMissing(err)) return MOCK_TEMPLATES;
    throw err;
  }
}

export async function cloneTemplate(
  templateId: string,
  token?: string | null
): Promise<TemplateCloneResult> {
  return apiFetch<TemplateCloneResult>(
    `/api/v1/templates/${templateId}/clone`,
    { method: "POST", body: JSON.stringify({}) },
    token ?? getToken()
  );
}
