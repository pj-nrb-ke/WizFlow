export type SavedFilter = {
  name: string;
  filters: Record<string, unknown>;
};

export type SavedFilterPage = "inbox" | "myrequests";

const STORAGE_PREFIX = "wf:savedFilters:";

function storageKey(page: SavedFilterPage): string {
  return `${STORAGE_PREFIX}${page}`;
}

export function getSavedFilters(page: SavedFilterPage): SavedFilter[] {
  try {
    const raw = localStorage.getItem(storageKey(page));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (f): f is SavedFilter =>
        f && typeof f.name === "string" && typeof f.filters === "object" && f.filters !== null
    );
  } catch {
    return [];
  }
}

export function saveFilter(
  page: SavedFilterPage,
  name: string,
  filters: Record<string, unknown>
): SavedFilter[] {
  const trimmed = name.trim();
  if (!trimmed) return getSavedFilters(page);
  const existing = getSavedFilters(page).filter((f) => f.name !== trimmed);
  const next = [...existing, { name: trimmed, filters }];
  try {
    localStorage.setItem(storageKey(page), JSON.stringify(next));
  } catch {
    /* ignore quota / unavailable */
  }
  return next;
}

export function deleteFilter(page: SavedFilterPage, name: string): SavedFilter[] {
  const next = getSavedFilters(page).filter((f) => f.name !== name);
  try {
    localStorage.setItem(storageKey(page), JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
