
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Book, LibraryState } from '../types';
import { loadLibrary, saveBook, removeBook, saveReorder } from '../services/storageService';
import { getBookPageTotal, getEffectiveAverageSecondsPerPage, getLocalDateString, normalizeDateToYMD } from '../utils';
import { createClientId } from '../services/id';

interface LibraryContextType {
  books: Book[];
  isLoading: boolean;
  addBook: (book: Book) => void;
  updateBook: (book: Book) => void;
  deleteBook: (id: string) => void;
  reorderBooks: (books: Book[]) => void;
  refreshLibrary: () => Promise<void>;
  
  // Shared UI State that was previously drilled
  filterTag: string;
  setFilterTag: (tag: string) => void;
}

const LibraryContext = createContext<LibraryContextType | undefined>(undefined);

export const useLibrary = () => {
  const context = useContext(LibraryContext);
  if (!context) {
    throw new Error('useLibrary must be used within a LibraryProvider');
  }
  return context;
};

export const LibraryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<LibraryState>({ books: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [filterTag, setFilterTag] = useState('');
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const reorderSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bookSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBookSavesRef = useRef<Map<string, Book>>(new Map());

  const refreshLibrary = useCallback(async () => {
    const data = await loadLibrary();
    setState(data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  const enqueueTask = useCallback((task: () => Promise<void>) => {
    writeQueueRef.current = writeQueueRef.current
      .then(task)
      .catch((e) => {
        console.error('Queued save failed', e);
      });
  }, []);

  const flushPendingBookSaves = useCallback(() => {
    const booksToSave: Book[] = Array.from(pendingBookSavesRef.current.values());
    pendingBookSavesRef.current.clear();
    if (booksToSave.length === 0) return;

    enqueueTask(async () => {
      for (const book of booksToSave) {
        await saveBook(book);
      }
    });
  }, [enqueueTask]);

  const scheduleBookSave = useCallback((book: Book) => {
    pendingBookSavesRef.current.set(book.id, book);
    if (bookSaveTimerRef.current) {
      clearTimeout(bookSaveTimerRef.current);
      bookSaveTimerRef.current = null;
    }
    flushPendingBookSaves();
  }, [flushPendingBookSaves]);

  useEffect(() => {
    const handleVisibilityOrPageHide = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingBookSaves();
      }
    };
    const handlePageHide = () => {
      flushPendingBookSaves();
    };

    document.addEventListener('visibilitychange', handleVisibilityOrPageHide);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrPageHide);
      window.removeEventListener('pagehide', handlePageHide);
      if (bookSaveTimerRef.current) clearTimeout(bookSaveTimerRef.current);
      if (reorderSaveTimerRef.current) clearTimeout(reorderSaveTimerRef.current);
      flushPendingBookSaves();
    };
  }, [flushPendingBookSaves]);

  const addBook = useCallback((book: Book) => {
    setState((prev) => {
      let finalBook = { ...book };
      if (finalBook.status === 'Completed') {
        if (!finalBook.completedAt) {
          finalBook.completedAt = new Date().toISOString();
        }
        if (!finalBook.readingStartedAt) {
          finalBook.readingStartedAt = finalBook.completedAt;
        }
        const dates = finalBook.completedDates || [];
        if (!dates.includes(finalBook.completedAt)) {
          finalBook.completedDates = [...dates, finalBook.completedAt];
        }
        const totalPages = getBookPageTotal(finalBook);
        const existingSessions = finalBook.sessions || [];
        const readPages = existingSessions.reduce((acc, s) => acc + (Number(s.pages) || 0), 0);
        if (readPages < totalPages && totalPages > 0) {
          const remainingPages = totalPages - readPages;
          const avgSecondsPerPage = getEffectiveAverageSecondsPerPage(finalBook, prev.books);
          const durationSeconds = Math.round(remainingPages * avgSecondsPerPage);
          const dateStr = normalizeDateToYMD(finalBook.completedAt) || getLocalDateString();
          finalBook.sessions = [
            ...existingSessions,
            {
              id: createClientId(),
              date: dateStr,
              duration: durationSeconds,
              pages: remainingPages,
              format: finalBook.selectedReadingFormat || finalBook.formats[0] || 'Paper',
              cycleIndex: finalBook.currentCycleIndex || 0,
            }
          ];
        }
        if ((!finalBook.pagesRead || finalBook.pagesRead < totalPages) && totalPages > 0) {
          finalBook.pagesRead = totalPages;
        }
      }
      const orderedBook = { ...finalBook, customOrder: prev.books.length };
      if (orderedBook.formats.includes('Sold') && !orderedBook.soldAt) {
        orderedBook.soldAt = new Date().toISOString();
      }
      try {
        scheduleBookSave(orderedBook);
      } catch (error) {
        console.error('Failed to schedule save for new book', error);
      }
      return { ...prev, books: [...prev.books, orderedBook] };
    });
  }, [scheduleBookSave]);

  const updateBook = useCallback((updatedBook: Book) => {
    setState((prev) => {
      let finalBook = { ...updatedBook };
      
      // 1. Logic for STARTING reading
      if (finalBook.status === 'Reading' && (!finalBook.readingStartedAt)) {
        finalBook.readingStartedAt = new Date().toISOString();
      }

      // Logic for tracking Sold format date
      if (finalBook.formats.includes('Sold')) {
        if (!finalBook.soldAt) {
          finalBook.soldAt = new Date().toISOString();
        }
      } else {
        finalBook.soldAt = undefined;
      }

      // 2. Logic for RESETTING (False starts or moving back to shelf)
      if (finalBook.status === 'Wishlist' || finalBook.status === 'Unread') {
        finalBook.readingStartedAt = undefined;
        finalBook.completedAt = undefined;
        finalBook.completedDates = undefined;
        finalBook.currentCycleIndex = undefined;
        finalBook.pagesRead = 0;
        finalBook.sessions = []; // Clear reading history
        if (updatedBook.rating === undefined) {
          finalBook.rating = undefined;
        }
        if (!updatedBook.selectedReadingFormat) {
          finalBook.selectedReadingFormat = undefined;
        }
        if (!updatedBook.readingPagesTotal) {
          finalBook.readingPagesTotal = undefined;
        }
        
        if (finalBook.status === 'Wishlist') {
          finalBook.addedAt = '';
          if (!finalBook.wishlistedAt) {
            finalBook.wishlistedAt = new Date().toISOString();
          }
        }
      } else if (finalBook.status === 'Reading') {
        // If currently reading, it cannot be completed in this cycle
        finalBook.completedAt = undefined;
      } else if (finalBook.status === 'Completed') {
        if (!finalBook.completedAt) {
          finalBook.completedAt = new Date().toISOString();
        }
        if (!finalBook.readingStartedAt) {
          finalBook.readingStartedAt = finalBook.completedAt;
        }
        const targetDateStr = normalizeDateToYMD(finalBook.completedAt) || getLocalDateString();
        const currentCycle = finalBook.currentCycleIndex || 0;
        const otherCycleDates = (finalBook.completedDates || []).filter(
          (d) => normalizeDateToYMD(d) !== targetDateStr
        );
        finalBook.completedDates = [...otherCycleDates, finalBook.completedAt];

        const totalPages = getBookPageTotal(finalBook);
        const existingSessions = finalBook.sessions || [];
        const readPages = existingSessions.reduce((acc, s) => acc + (Number(s.pages) || 0), 0);
        if (readPages < totalPages && totalPages > 0) {
          const remainingPages = totalPages - readPages;
          const avgSecondsPerPage = getEffectiveAverageSecondsPerPage(finalBook, prev.books);
          const durationSeconds = Math.round(remainingPages * avgSecondsPerPage);
          finalBook.sessions = [
            ...existingSessions,
            {
              id: createClientId(),
              date: targetDateStr,
              duration: durationSeconds,
              pages: remainingPages,
              format: finalBook.selectedReadingFormat || finalBook.formats[0] || 'Paper',
              cycleIndex: finalBook.currentCycleIndex || 0,
            }
          ];
        } else if (existingSessions.length > 0) {
          // If sessions already exist, synchronize the last session date for the current cycle with targetDateStr
          const currentCycle = finalBook.currentCycleIndex || 0;
          const currentCycleSessions = existingSessions.filter(s => (s.cycleIndex || 0) === currentCycle);
          if (currentCycleSessions.length > 0) {
            const lastSession = currentCycleSessions[currentCycleSessions.length - 1];
            if (lastSession.date !== targetDateStr) {
              finalBook.sessions = existingSessions.map(s => s.id === lastSession.id ? { ...s, date: targetDateStr } : s);
            }
          }
        }
        if ((!finalBook.pagesRead || finalBook.pagesRead < totalPages) && totalPages > 0) {
          finalBook.pagesRead = totalPages;
        }
      }

      let bookToPersist: Book | null = null;
      const nextBooks = prev.books.map((b) => {
        if (b.id !== finalBook.id) return b;
        
        // Handle transition from Wishlist to Library
        if (b.status === 'Wishlist' && finalBook.status !== 'Wishlist') {
          finalBook.addedAt = new Date().toISOString();
        }

        const rating = finalBook.rating !== undefined ? finalBook.rating : b.rating;

        bookToPersist = { ...b, ...finalBook, rating, customOrder: b.customOrder };
        return bookToPersist;
      });

      if (bookToPersist) {
        scheduleBookSave(bookToPersist as Book);
      }

      return { ...prev, books: nextBooks };
    });
  }, [scheduleBookSave]);

  const deleteBook = useCallback((id: string) => {
    setState((prev) => ({ ...prev, books: prev.books.filter((b) => b.id !== id) }));
    pendingBookSavesRef.current.delete(id);
    enqueueTask(() => removeBook(id));
  }, [enqueueTask]);

  const reorderBooks = useCallback((newBooks: Book[]) => {
    setState((prev) => ({ ...prev, books: newBooks }));
    if (reorderSaveTimerRef.current) {
      clearTimeout(reorderSaveTimerRef.current);
    }
    reorderSaveTimerRef.current = setTimeout(() => {
      flushPendingBookSaves();
      enqueueTask(() => saveReorder(newBooks.map((b) => b.id)));
      reorderSaveTimerRef.current = null;
    }, 250);
  }, [enqueueTask, flushPendingBookSaves]);

  return (
    <LibraryContext.Provider value={{ 
      books: state.books, 
      isLoading, 
      addBook, 
      updateBook, 
      deleteBook, 
      reorderBooks, 
      refreshLibrary,
      filterTag,
      setFilterTag
    }}>
      {children}
    </LibraryContext.Provider>
  );
};
