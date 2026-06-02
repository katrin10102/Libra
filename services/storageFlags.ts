const DEXIE_FLAG_KEY = 'libra_use_dexie_storage';
const DEXIE_DUAL_RUN_KEY = 'libra_dexie_dual_run';

const envFlag = (() => {
  try {
    return String((import.meta as any).env?.VITE_USE_DEXIE_STORAGE || '').toLowerCase() === 'true';
  } catch {
    return false;
  }
})();

export const isDexieStorageEnabled = (): boolean => {
  try {
    const raw = localStorage.getItem(DEXIE_FLAG_KEY);
    if (raw === null) return envFlag;
    return raw.toLowerCase() === 'true';
  } catch {
    return envFlag;
  }
};

export const setDexieStorageFlag = (enabled: boolean): void => {
  try {
    localStorage.setItem(DEXIE_FLAG_KEY, String(enabled));
  } catch {
    // ignore
  }
};

export const isDexieDualRunEnabled = (): boolean => {
  try {
    const env = String((import.meta as any).env?.VITE_DEXIE_DUAL_RUN || '').toLowerCase() === 'true';
    const raw = localStorage.getItem(DEXIE_DUAL_RUN_KEY);
    if (raw === null) return env;
    return raw.toLowerCase() === 'true';
  } catch {
    return false;
  }
};

export const setDexieDualRunFlag = (enabled: boolean): void => {
  try {
    localStorage.setItem(DEXIE_DUAL_RUN_KEY, String(enabled));
  } catch {
    // ignore
  }
};
