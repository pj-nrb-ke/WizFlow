import AsyncStorage from "@react-native-async-storage/async-storage";
import { secureGet, secureSet } from "./secureStorage";

const DRAFT_PREFIX = "wf_draft_";
const QUEUE_KEY = "wf_submit_queue";

export type RequestDraft = {
  workflowId: string;
  workflowName: string;
  form: Record<string, string>;
  savedAt: string;
};

export type QueuedSubmit = {
  id: string;
  workflowId: string;
  data: Record<string, unknown>;
  comment?: string;
  createdAt: string;
};

export async function saveDraft(draft: RequestDraft): Promise<void> {
  await AsyncStorage.setItem(`${DRAFT_PREFIX}${draft.workflowId}`, JSON.stringify(draft));
}

export async function loadDraft(workflowId: string): Promise<RequestDraft | null> {
  const raw = await AsyncStorage.getItem(`${DRAFT_PREFIX}${workflowId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RequestDraft;
  } catch {
    return null;
  }
}

export async function clearDraft(workflowId: string): Promise<void> {
  await AsyncStorage.removeItem(`${DRAFT_PREFIX}${workflowId}`);
}

export async function loadQueue(): Promise<QueuedSubmit[]> {
  const raw = (await secureGet(QUEUE_KEY)) ?? (await AsyncStorage.getItem(QUEUE_KEY));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as QueuedSubmit[];
    if (!(await secureGet(QUEUE_KEY)) && parsed.length) {
      await secureSet(QUEUE_KEY, raw);
      await AsyncStorage.removeItem(QUEUE_KEY);
    }
    return parsed;
  } catch {
    return [];
  }
}

export async function enqueueSubmit(
  workflowId: string,
  data: Record<string, unknown>,
  comment?: string
): Promise<void> {
  const q = await loadQueue();
  q.push({
    id: `${Date.now()}`,
    workflowId,
    data,
    comment,
    createdAt: new Date().toISOString(),
  });
  // ponytail: expo-secure-store values cap ~2KB on Android — drop oldest to stay under.
  let serialized = JSON.stringify(q);
  while (q.length > 1 && serialized.length > 1800) {
    q.shift();
    serialized = JSON.stringify(q);
  }
  await secureSet(QUEUE_KEY, serialized);
}

export async function dequeueSubmit(id: string): Promise<void> {
  const q = (await loadQueue()).filter((x) => x.id !== id);
  await secureSet(QUEUE_KEY, JSON.stringify(q));
}

export function draftFromFields(
  workflowId: string,
  workflowName: string,
  form: Record<string, string>
): RequestDraft {
  return { workflowId, workflowName, form, savedAt: new Date().toISOString() };
}
