
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Book, LibraryState } from '../types';
import { loadLibrary, saveBook, removeBook, saveReorder } from '../services/storageService';

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
    }
    bookSaveTimerRef.current = setTimeout(() => {
      bookSaveTimerRef.current = null;
      flushPendingBookSaves();
    }, 120);
  }, [enqueueTask, flushPendingBookSaves]);

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
      const orderedBook = { ...book, customOrder: prev.books.length };
      try {
        scheduleBookSave(orderedBook);
      } catch (error) {
        console.error('Failed to schedule save for new book', error);
      }
      return { ...prev, books: [...prev.books, orderedBook] };
    });
  }, [scheduleBookSave]);

  const updateBook = useCallback((updatedBook: Book) => {
    let finalBook = { ...updatedBook };
    
    // 1. Logic for STARTING reading
    // If moving to Reading state and no start date exists, set it.
    if (finalBook.status === 'Reading' && (!finalBook.readingStartedAt)) {
         finalBook.readingStartedAt = new Date().toISOString();
    }

    // 2. Logic for RESETTING (False starts or moving back to shelf)
    // If moving to Wishlist or Unread, we must clean up any reading progress
    // so it doesn't pollute statistics or sessions.
    if (finalBook.status === 'Wishlist' || finalBook.status === 'Unread') {
        finalBook.readingStartedAt = undefined;
        finalBook.completedAt = undefined;
        finalBook.pagesRead = 0;
        finalBook.sessions = []; // Clear reading history
        finalBook.rating = undefined; // Clear rating as it's not read
        finalBook.selectedReadingFormat = undefined;
        finalBook.readingPagesTotal = undefined;
        
        if (finalBook.status === 'Wishlist') {
          finalBook.addedAt = '';
          if (!finalBook.wishlistedAt) {
            finalBook.wishlistedAt = new Date().toISOString();
          }
        }
    }

    setState((prev) => {
      let bookToPersist: Book | null = null;
      const nextBooks = prev.books.map((b) => {
        if (b.id !== finalBook.id) return b;
        
        // Handle transition from Wishlist to Library
        if (b.status === 'Wishlist' && finalBook.status !== 'Wishlist') {
          finalBook.addedAt = new Date().toISOString();
        }

        bookToPersist = { ...b, ...finalBook, customOrder: b.customOrder };
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
