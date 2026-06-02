import { Book } from '../../types';
import { base64ToBlob } from '../imageUtils';
import { BookMetaRow, CoverRow, dexieDb } from '../dexieDb';

const nowIso = () => new Date().toISOString();

const splitBook = async (book: Book): Promise<{ meta: BookMetaRow; cover?: CoverRow }> => {
  let coverBlob = book.coverBlob;
  let coverUrl = book.coverUrl || '';

  if (coverBlob && coverUrl.startsWith('blob:')) {
    coverUrl = '';
  }
  if (coverUrl.startsWith('data:image')) {
    coverBlob = base64ToBlob(coverUrl);
    coverUrl = '';
  }

  const { coverBlob: _ignoredBlob, coverUrl: _ignoredUrl, ...metaBase } = book;
  const current = await dexieDb.books.get(book.id);
  const version = (current?.version || 0) + 1;

  const meta: BookMetaRow = {
    ...metaBase,
    updatedAt: nowIso(),
    version,
  };

  if (!coverBlob && !coverUrl) {
    return { meta };
  }

  return {
    meta,
    cover: {
      bookId: book.id,
      coverBlob,
      coverUrl,
      updatedAt: nowIso(),
    },
  };
};

const mergeBook = (meta: BookMetaRow, cover?: CoverRow): Book => {
  const legacyMeta = meta as unknown as { coverBlob?: Blob; coverUrl?: string };
  const resolvedCoverBlob = cover?.coverBlob ?? legacyMeta.coverBlob;
  const resolvedCoverUrl = cover?.coverUrl ?? legacyMeta.coverUrl ?? '';

  return {
    ...meta,
    coverBlob: resolvedCoverBlob,
    coverUrl: resolvedCoverUrl,
  };
};

export const getAllBooksDexie = async (): Promise<Book[]> => {
  return dexieDb.transaction('r', dexieDb.books, dexieDb.covers, async () => {
    const [metaRows, coverRows] = await Promise.all([dexieDb.books.toArray(), dexieDb.covers.toArray()]);
    const coverMap = new Map(coverRows.map((row) => [row.bookId, row]));
    const books = metaRows.map((meta) => mergeBook(meta, coverMap.get(meta.id)));
    const hasStoredCustomOrder = books.some((b) => typeof b.customOrder === 'number');
    if (!hasStoredCustomOrder) return books;

    return [...books].sort((a, b) => {
      const orderA = typeof a.customOrder === 'number' ? a.customOrder : Number.MAX_SAFE_INTEGER;
      const orderB = typeof b.customOrder === 'number' ? b.customOrder : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
    });
  });
};

export const getBookByIdDexie = async (id: string): Promise<Book | undefined> => {
  return dexieDb.transaction('r', dexieDb.books, dexieDb.covers, async () => {
    const meta = await dexieDb.books.get(id);
    if (!meta) return undefined;
    const cover = await dexieDb.covers.get(id);
    return mergeBook(meta, cover);
  });
};

export const createBookDexie = async (book: Book): Promise<void> => {
  const parts = await splitBook(book);
  await dexieDb.transaction('rw', dexieDb.books, dexieDb.covers, async () => {
    await dexieDb.books.put(parts.meta);
    if (parts.cover) {
      await dexieDb.covers.put(parts.cover);
    } else {
      await dexieDb.covers.delete(book.id);
    }
  });
};

export const saveBookDexie = async (book: Book): Promise<void> => {
  await createBookDexie(book);
};

export const updateBookPatchDexie = async (
  id: string,
  patch: Partial<Book>,
  expectedVersion?: number
): Promise<{ ok: boolean; reason?: 'not_found' | 'version_conflict' }> => {
  return dexieDb.transaction('rw', dexieDb.books, dexieDb.covers, async () => {
    const currentMeta = await dexieDb.books.get(id);
    if (!currentMeta) return { ok: false, reason: 'not_found' as const };
    if (typeof expectedVersion === 'number' && currentMeta.version !== expectedVersion) {
      return { ok: false, reason: 'version_conflict' as const };
    }

    const currentCover = await dexieDb.covers.get(id);
    const current: Book = mergeBook(currentMeta, currentCover);
    const next: Book = { ...current, ...patch, id: current.id };
    const parts = await splitBook(next);

    await dexieDb.books.put(parts.meta);
    if (parts.cover) {
      await dexieDb.covers.put(parts.cover);
    } else {
      await dexieDb.covers.delete(id);
    }
    return { ok: true };
  });
};

export const removeBookDexie = async (id: string): Promise<void> => {
  await dexieDb.transaction('rw', dexieDb.books, dexieDb.covers, async () => {
    await dexieDb.books.delete(id);
    await dexieDb.covers.delete(id);
  });
};

export const replaceAllBooksDexie = async (books: Book[]): Promise<void> => {
  await dexieDb.transaction('rw', dexieDb.books, dexieDb.covers, async () => {
    const ids = new Set(books.map((b) => b.id));
    const existingBookIds = await dexieDb.books.toCollection().primaryKeys();
    const existingCoverIds = await dexieDb.covers.toCollection().primaryKeys();

    for (const key of existingBookIds) {
      const id = String(key);
      if (!ids.has(id)) {
        await dexieDb.books.delete(id);
      }
    }
    for (const key of existingCoverIds) {
      const id = String(key);
      if (!ids.has(id)) {
        await dexieDb.covers.delete(id);
      }
    }

    for (let index = 0; index < books.length; index++) {
      const nextBook = { ...books[index], customOrder: index };
      const parts = await splitBook(nextBook);
      await dexieDb.books.put(parts.meta);
      if (parts.cover) {
        await dexieDb.covers.put(parts.cover);
      } else {
        await dexieDb.covers.delete(nextBook.id);
      }
    }
  });
};

export const reorderBooksDexie = async (idsInOrder: string[]): Promise<void> => {
  await dexieDb.transaction('rw', dexieDb.books, async () => {
    for (let i = 0; i < idsInOrder.length; i++) {
      const id = idsInOrder[i];
      const meta = await dexieDb.books.get(id);
      if (!meta) continue;
      await dexieDb.books.put({
        ...meta,
        customOrder: i,
        updatedAt: nowIso(),
        version: (meta.version || 0) + 1,
      });
    }
  });
};
