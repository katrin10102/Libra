
import { useMemo } from 'react';
import { Book, SortKey, SortDirection } from '../types';

export const useBookSort = (
  books: Book[], 
  activeKey: SortKey, 
  activeDirection: SortDirection
) => {
  const compareText = (a?: string, b?: string) => {
    return (a || '').trim().toLowerCase().localeCompare((b || '').trim().toLowerCase(), 'uk');
  };

  const compareSeriesPart = (a?: string, b?: string) => {
    const numA = Number((a || '').replace(',', '.'));
    const numB = Number((b || '').replace(',', '.'));
    const hasNumA = Number.isFinite(numA);
    const hasNumB = Number.isFinite(numB);

    if (hasNumA && hasNumB) return numA - numB;
    if (hasNumA) return -1;
    if (hasNumB) return 1;
    return compareText(a, b);
  };

  const sortedBooks = useMemo(() => {
    if (activeKey === 'custom') return books;

    return [...books].sort((a, b) => {
      let result = 0;

      switch (activeKey) {
        case 'title':
          result = compareText(a.title, b.title);
          break;
        case 'author':
          result = compareText(a.author, b.author);
          break;
        case 'addedAt':
          result = new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
          break;
        case 'genre':
          const hasGenreA = Boolean((a.genre || '').trim());
          const hasGenreB = Boolean((b.genre || '').trim());
          if (hasGenreA !== hasGenreB) {
            return hasGenreA ? -1 : 1; // Books without genre are always last
          }
          result =
            compareText(a.genre, b.genre) ||
            compareText(a.author, b.author) ||
            compareText(a.series, b.series) ||
            compareSeriesPart(a.seriesPart, b.seriesPart) ||
            compareText(a.title, b.title);
          break;
      }

      return activeDirection === 'asc' ? result : -result;
    });
  }, [books, activeKey, activeDirection]);

  return { sortedBooks };
};
