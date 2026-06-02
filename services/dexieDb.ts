import Dexie, { Table } from 'dexie';
import { Book } from '../types';

export type BookMetaRow = Omit<Book, 'coverBlob' | 'coverUrl'> & {
  updatedAt: string;
  version: number;
};

export interface CoverRow {
  bookId: string;
  coverBlob?: Blob;
  coverUrl?: string;
  updatedAt: string;
}

export interface MetaRow {
  key: string;
  value: string;
  updatedAt: string;
}

class LibraDexieDb extends Dexie {
  books!: Table<BookMetaRow, string>;
  covers!: Table<CoverRow, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super('LibraDexieDB');
    this.version(1).stores({
      books: 'id,status,customOrder,addedAt,updatedAt,publisher,genre,[status+customOrder]',
      covers: 'bookId,updatedAt',
    });
    this.version(2).stores({
      books: 'id,status,customOrder,addedAt,updatedAt,publisher,genre,[status+customOrder]',
      covers: 'bookId,updatedAt',
      meta: 'key,updatedAt',
    });
  }
}

export const dexieDb = new LibraDexieDb();
