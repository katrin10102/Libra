import { Book } from '../../types';
import { deleteLegacyDatabase, getAllBooks, openDB } from '../db';
import { dexieDb } from '../dexieDb';
import { base64ToBlob } from '../imageUtils';
import { replaceAllBooksDexie } from '../repositories/booksRepo';

const MIGRATION_KEY = 'legacy_idb_to_dexie_v1';

type MigrationResult =
  | { migrated: false; reason: 'already_done' | 'no_source_data' }
  | { migrated: true; sourceCount: number; checksum: string };

const checksumBooks = (books: Book[]): string => {
  const raw = books
    .map((b) => `${b.id}|${b.updatedAt || ''}|${b.addedAt}|${b.customOrder ?? ''}`)
    .sort()
    .join('::');
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
};

const normalizeLegacyBook = (book: Book, index: number): Book => {
  const next: Book = { ...book };

  if (!Array.isArray(next.sessions)) {
    next.sessions = [];
  }
  if (typeof next.customOrder !== 'number') {
    next.customOrder = index;
  }
  if (!next.updatedAt) {
    next.updatedAt = new Date().toISOString();
  }
  if (!next.version) {
    next.version = 1;
  }

  if (next.coverUrl?.startsWith('blob:')) {
    next.coverUrl = '';
  }
  if (next.coverUrl?.startsWith('data:image')) {
    next.coverBlob = base64ToBlob(next.coverUrl);
    next.coverUrl = '';
  }

  return next;
};

const markMigrationDone = async (sourceCount: number, checksum: string): Promise<void> => {
  await dexieDb.meta.put({
    key: MIGRATION_KEY,
    value: JSON.stringify({
      migrationVersion: 1,
      migratedAt: new Date().toISOString(),
      sourceCount,
      checksum,
    }),
    updatedAt: new Date().toISOString(),
  });
};

export const migrateLegacyIndexedDbToDexie = async (): Promise<MigrationResult> => {
  const marker = await dexieDb.meta.get(MIGRATION_KEY);
  if (marker) {
    return { migrated: false, reason: 'already_done' };
  }

  const legacyDb = await openDB();
  const legacyBooks = await getAllBooks(legacyDb);
  if (legacyBooks.length === 0) {
    await markMigrationDone(0, '0');
    return { migrated: false, reason: 'no_source_data' };
  }

  const normalized = legacyBooks.map((book, index) => normalizeLegacyBook(book, index));
  const checksum = checksumBooks(normalized);

  await replaceAllBooksDexie(normalized);
  await markMigrationDone(normalized.length, checksum);
  try {
    await deleteLegacyDatabase();
  } catch {
    // ignore cleanup issues, migration already succeeded
  }

  return { migrated: true, sourceCount: normalized.length, checksum };
};
