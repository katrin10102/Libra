export const createClientId = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `id-${hex}`;
    }
  } catch {
    // fall through to non-crypto fallback
  }

  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 12);
  return `id-${ts}-${rnd}`;
};
