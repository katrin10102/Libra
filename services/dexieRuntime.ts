import { dexieDb } from "./dexieDb";
import { setDexieStorageFlag } from "./storageFlags";

const DEXIE_FAIL_COUNT_KEY = "libra_dexie_fail_count";
const DEXIE_LAST_OP_KEY = "libra_dexie_last_op";
const DEXIE_AUTO_FALLBACK_THRESHOLD = 3;

const nowIso = () => new Date().toISOString();

const readFailCount = (): number => {
  try {
    const raw = localStorage.getItem(DEXIE_FAIL_COUNT_KEY);
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
};

const writeFailCount = (n: number): void => {
  try {
    localStorage.setItem(DEXIE_FAIL_COUNT_KEY, String(Math.max(0, n)));
  } catch {
    // ignore
  }
};

const setLastOp = (op: string, ok: boolean, durationMs?: number, reason?: string): void => {
  try {
    localStorage.setItem(
      DEXIE_LAST_OP_KEY,
      JSON.stringify({
        op,
        ok,
        durationMs,
        reason,
        at: nowIso(),
      })
    );
  } catch {
    // ignore
  }
};

const writeHealthMeta = async (key: string, payload: Record<string, unknown>): Promise<void> => {
  try {
    await dexieDb.meta.put({
      key,
      value: JSON.stringify(payload),
      updatedAt: nowIso(),
    });
  } catch {
    // ignore
  }
};

export const markDexieSuccess = async (op: string, startedAt: number): Promise<void> => {
  const durationMs = Date.now() - startedAt;
  writeFailCount(0);
  setLastOp(op, true, durationMs);
  await writeHealthMeta("health_last_success", { op, durationMs, at: nowIso() });
};

export const markDexieFailure = async (op: string, error: unknown): Promise<void> => {
  const nextCount = readFailCount() + 1;
  writeFailCount(nextCount);
  const message = error instanceof Error ? error.message : String(error);
  setLastOp(op, false, undefined, message);
  await writeHealthMeta("health_last_failure", { op, error: message, at: nowIso(), failCount: nextCount });

  if (nextCount >= DEXIE_AUTO_FALLBACK_THRESHOLD) {
    setDexieStorageFlag(false);
    await writeHealthMeta("health_auto_fallback", { at: nowIso(), failCount: nextCount });
    console.warn(`[Dexie] Auto-fallback to legacy storage after ${nextCount} failures.`);
  }
};

export const runDualReadCheck = async (
  dexieIds: string[],
  legacyIds: string[],
  context: string
): Promise<void> => {
  try {
    const sortedDexie = [...dexieIds].sort();
    const sortedLegacy = [...legacyIds].sort();
    const sameLength = sortedDexie.length === sortedLegacy.length;
    const sameIds = sameLength && sortedDexie.every((id, i) => id === sortedLegacy[i]);
    const ok = sameLength && sameIds;
    await writeHealthMeta("health_dual_read_last", {
      at: nowIso(),
      context,
      ok,
      dexieCount: dexieIds.length,
      legacyCount: legacyIds.length,
    });
    if (!ok) {
      console.warn("[Dexie dual-read mismatch]", {
        context,
        dexieCount: dexieIds.length,
        legacyCount: legacyIds.length,
      });
    }
  } catch {
    // ignore
  }
};

