import { AppSettings, BackgroundTone, Book, LibraryState, SortDirection, SortKey } from "../types";
import { markDexieFailure, markDexieSuccess } from "./dexieRuntime";
import { blobToBase64 } from "./imageUtils";
import { migrateLegacyIndexedDbToDexie } from "./migrations/migrateToDexie";
import {
  getAllBooksDexie,
  removeBookDexie,
  reorderBooksDexie,
  replaceAllBooksDexie,
  saveBookDexie,
  updateBookPatchDexie,
} from "./repositories/booksRepo";

const SETTINGS_KEY = "booktracker_settings";

export const loadSettings = (): AppSettings => {
  const defaultSettings: AppSettings = { accent: "indigo", bg: "cool", language: "en" };
  try {
    const data = localStorage.getItem(SETTINGS_KEY);
    if (!data) return defaultSettings;
    const parsed = JSON.parse(data) as Partial<AppSettings>;
    const language = parsed.language === "uk" ? "uk" : "en";
    const bg = parsed.bg === ("neutral" as any) ? "pink" : (parsed.bg as BackgroundTone || "cool");
    return { ...defaultSettings, ...parsed, language, bg };
  } catch {
    return defaultSettings;
  }
};

export const saveSettings = (settings: AppSettings): void => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

export const loadSortPrefs = (
  contextKey: string = "booktracker_sort_prefs"
): { key: SortKey; direction: SortDirection } => {
  const defaultSort: { key: SortKey; direction: SortDirection } = { key: "addedAt", direction: "desc" };
  try {
    const data = localStorage.getItem(contextKey);
    if (!data) return defaultSort;
    return JSON.parse(data);
  } catch {
    return defaultSort;
  }
};

export const saveSortPrefs = (contextKey: string, key: SortKey, direction: SortDirection): void => {
  localStorage.setItem(contextKey, JSON.stringify({ key, direction }));
};

const quotaAlert = (): void => {
  alert("Warning: device storage is full.");
};

export const loadLibrary = async (): Promise<LibraryState> => {
  const started = Date.now();
  try {
    await migrateLegacyIndexedDbToDexie();
    const books = await getAllBooksDexie();
    await markDexieSuccess("loadLibrary", started);
    return { books };
  } catch (e) {
    await markDexieFailure("loadLibrary", e);
    console.error("Failed to load library from Dexie", e);
    return { books: [] };
  }
};

export const saveLibrary = async (state: LibraryState): Promise<void> => {
  const started = Date.now();
  try {
    await replaceAllBooksDexie(state.books);
    await markDexieSuccess("saveLibrary", started);
  } catch (e) {
    await markDexieFailure("saveLibrary", e);
    console.error("Failed to save library to Dexie", e);
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      quotaAlert();
    }
  }
};

export const saveBook = async (book: Book): Promise<void> => {
  const started = Date.now();
  try {
    await saveBookDexie(book);
    await markDexieSuccess("saveBook", started);
  } catch (e) {
    await markDexieFailure("saveBook", e);
    console.error("Failed to save book to Dexie", e);
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      quotaAlert();
    }
  }
};

export const updateBookPatch = async (
  id: string,
  patch: Partial<Book>,
  expectedVersion?: number
): Promise<{ ok: boolean; reason?: "not_found" | "version_conflict" }> => {
  const started = Date.now();
  try {
    const result = await updateBookPatchDexie(id, patch, expectedVersion);
    if (result.ok) {
      await markDexieSuccess("updateBookPatch", started);
    }
    return result;
  } catch (e) {
    await markDexieFailure("updateBookPatch", e);
    console.error("Failed to update book patch in Dexie", e);
    return { ok: false, reason: "not_found" };
  }
};

export const saveReorder = async (idsInOrder: string[]): Promise<void> => {
  const started = Date.now();
  try {
    await reorderBooksDexie(idsInOrder);
    await markDexieSuccess("saveReorder", started);
  } catch (e) {
    await markDexieFailure("saveReorder", e);
    console.error("Failed to save reorder in Dexie", e);
  }
};

export const removeBook = async (id: string): Promise<void> => {
  const started = Date.now();
  try {
    await removeBookDexie(id);
    await markDexieSuccess("removeBook", started);
  } catch (e) {
    await markDexieFailure("removeBook", e);
    console.error("Failed to remove book from Dexie", e);
  }
};

export const exportLibraryToJSON = async (): Promise<void> => {
  try {
    const books = await getAllBooksDexie();
    const booksForExport = await Promise.all(
      books.map(async (book) => {
        const b = { ...book };
        if (b.coverBlob) {
          b.coverUrl = await blobToBase64(b.coverBlob);
          delete b.coverBlob;
        }
        return b;
      })
    );

    const exportData = { books: booksForExport };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().split("T")[0];
    link.href = url;
    link.download = `libra_library_${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error("Export failed", e);
    throw e;
  }
};

export { fetchBookCover } from "./api";
export { processImage } from "./imageUtils";

