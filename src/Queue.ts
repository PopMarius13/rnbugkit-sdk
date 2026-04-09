import {
  QueueItem,
  QueueItemType,
  BugReportPayload,
  NetworkBatchPayload,
} from "./types";

const MAX_ITEMS = 50;
const MAX_ATTEMPTS = 3;
const AS_KEY = "__rnbugkit_queue__";

let memoryStore: QueueItem[] = [];
let asyncStorage: any = null;
let persistEnabled = false;

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function saveToAS(): Promise<void> {
  if (!asyncStorage) return;
  try {
    await asyncStorage.setItem(AS_KEY, JSON.stringify(memoryStore));
  } catch {
  }
}

export const Queue = {
  async init(persist: boolean): Promise<void> {
    persistEnabled = persist;

    if (!persist) return;

    try {
      asyncStorage =
        require("@react-native-async-storage/async-storage").default;

      const saved = await asyncStorage.getItem(AS_KEY);
      if (saved) {
        memoryStore = JSON.parse(saved);
      }
    } catch {
      asyncStorage = null;
      persistEnabled = false;
    }
  },

  async add(
    type: QueueItemType,
    payload: BugReportPayload | NetworkBatchPayload,
  ): Promise<void> {
    if (memoryStore.length >= MAX_ITEMS) {
      memoryStore.shift();
    }

    const item: QueueItem = {
      id: generateId(),
      type,
      payload,
      created_at: new Date().toISOString(),
      attempts: 0,
    };

    memoryStore.push(item);
    await saveToAS();
  },

  getAll(): QueueItem[] {
    return [...memoryStore];
  },

  getPending(): QueueItem[] {
    return memoryStore.filter((item) => item.attempts < MAX_ATTEMPTS);
  },

  async markSuccess(id: string): Promise<void> {
    memoryStore = memoryStore.filter((item) => item.id !== id);
    await saveToAS();
  },

  async markFailed(id: string): Promise<void> {
    memoryStore = memoryStore.map((item) =>
      item.id === id ? { ...item, attempts: item.attempts + 1 } : item,
    );
    memoryStore = memoryStore.filter((item) => item.attempts < MAX_ATTEMPTS);
    await saveToAS();
  },

  clear(): void {
    memoryStore = [];
    if (asyncStorage) {
      asyncStorage.removeItem(AS_KEY).catch(() => {});
    }
  },

  size(): number {
    return memoryStore.length;
  },
};
