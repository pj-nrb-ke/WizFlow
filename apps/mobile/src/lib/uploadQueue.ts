import AsyncStorage from "@react-native-async-storage/async-storage";

const UPLOAD_KEY = "wf_upload_queue";

export type QueuedUpload = {
  id: string;
  path: string;
  uri: string;
  filename: string;
  mime: string;
  createdAt: string;
};

export async function loadUploadQueue(): Promise<QueuedUpload[]> {
  const raw = await AsyncStorage.getItem(UPLOAD_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueuedUpload[];
  } catch {
    return [];
  }
}

export async function enqueueUpload(
  path: string,
  uri: string,
  filename: string,
  mime: string
): Promise<void> {
  const q = await loadUploadQueue();
  q.push({
    id: `${Date.now()}`,
    path,
    uri,
    filename,
    mime,
    createdAt: new Date().toISOString(),
  });
  await AsyncStorage.setItem(UPLOAD_KEY, JSON.stringify(q));
}

export async function dequeueUpload(id: string): Promise<void> {
  const q = (await loadUploadQueue()).filter((x) => x.id !== id);
  await AsyncStorage.setItem(UPLOAD_KEY, JSON.stringify(q));
}
