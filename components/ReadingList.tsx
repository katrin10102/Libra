
import React, { useState } from 'react';
import { Book } from '../types';
import { BookOpen, Book as BookIcon, Dices } from 'lucide-react';
import { BookDetailsV2 } from './v2/BookDetailsV2';
import { EditBookV2 } from './v2/EditBookV2';
import { ReadingMode } from './ReadingMode';
import { calculateProgress, getBookPageTotal } from '../utils';
import { useLibrary } from '../contexts/LibraryContext';
import { useUI } from '../contexts/UIContext';
import { useI18n } from '../contexts/I18nContext';
import { BookCover } from './ui/BookCover';
import { ActiveTimerBadge } from './ui/ActiveTimerBadge';

interface ReadingListProps {
  onToggleNav?: (hidden: boolean) => void;
}

export const ReadingList: React.FC<ReadingListProps> = ({ onToggleNav }) => {
  const { books, updateBook, deleteBook } = useLibrary();
  const { toast, confirm } = useUI();
  const { t } = useI18n();
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [readingModeOpen, setReadingModeOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  React.useEffect(() => {
    if (onToggleNav) {
      onToggleNav(!!selectedBook || readingModeOpen || isEditing);
    }
  }, [selectedBook, readingModeOpen, isEditing, onToggleNav]);

  const uniquePublishers = React.useMemo(() => {
    const pubs = new Set<string>();
    books.forEach((b) => {
      if (b.publisher && b.publisher.trim()) pubs.add(b.publisher.trim());
    });
    return Array.from(pubs).sort();
  }, [books]);

  const uniqueGenres = React.useMemo(() => {
    const genres = new Set<string>();
    books.forEach((b) => {
      const value = (b.genre || '').trim();
      if (value) genres.add(value);
    });
    return Array.from(genres).sort();
  }, [books]);

  const readingBooks = books.filter(b => b.status === 'Reading');
  
  const handleRandomBook = () => {
    const unreadPaperBooks = books.filter(b => b.status === 'Unread' && b.formats.includes('Paper'));
    if (unreadPaperBooks.length === 0) {
      toast.show(t('library.empty'), 'info');
      return;
    }
    const randomIndex = Math.floor(Math.random() * unreadPaperBooks.length);
    const randomBook = unreadPaperBooks[randomIndex];
    setSelectedBook(randomBook);
    setReadingModeOpen(false);
    setIsEditing(false);
  };

  return (
    <>
      <div className="p-4 space-y-6 pb-24 text-gray-800 animate-in fade-in duration-500">
        <header className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 tracking-tight">{t('reading.title')}</h1>
            <p className="text-gray-500 text-sm mt-1">{t('reading.subtitle')}</p>
          </div>
          <button
            onClick={handleRandomBook}
            className="w-12 h-12 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center justify-center text-indigo-600 active:scale-90 transition-all"
            aria-label="Random unread paper book"
          >
            <Dices size={24} className="rotate-12" />
          </button>
        </header>

        {readingBooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-300">
             <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100">
                <BookOpen size={32} className="opacity-20" />
             </div>
             <p className="text-lg font-bold text-gray-400">{t('reading.empty')}</p>
             <p className="text-xs mt-1">{t('reading.emptyAction')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {readingBooks.map((book) => {
               const progress = calculateProgress(book.pagesRead, getBookPageTotal(book));
               return (
                  <div 
                    key={book.id}
                    onClick={() => {
                      setSelectedBook(book);
                      setReadingModeOpen(true);
                    }}
                    className="bg-white p-4 rounded-[2rem] shadow-sm border border-gray-100 flex gap-4 items-center active:scale-[0.98] transition-all cursor-pointer group relative"
                  >
                    <ActiveTimerBadge 
                      bookId={book.id} 
                      onClick={() => {
                        setSelectedBook(book);
                        setReadingModeOpen(true);
                      }}
                    />
                    <div className="w-16 h-24 bg-gray-50 rounded-2xl overflow-hidden flex-shrink-0 shadow-sm border border-gray-100 group-hover:scale-105 transition-transform">
                      <BookCover book={book} className="w-full h-full" iconSize={24} />
                    </div>
                    
                    <div className="flex-1 min-w-0 py-1 flex flex-col justify-between h-24">
                      <div>
                        <h3 className="font-bold text-gray-800 text-base leading-tight truncate mb-0.5">{book.title}</h3>
                        <p className="text-[11px] text-gray-500 truncate font-medium">{book.author}</p>
                      </div>
                      
                      <div className="space-y-2">
                         <div className="flex justify-between items-end">
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{t('reading.progress')}</span>
                            <span className="text-xs font-black text-indigo-600">{progress}%</span>
                         </div>
                         <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-indigo-600 rounded-full transition-all duration-700 ease-out"
                              style={{ width: `${progress}%` }}
                            />
                         </div>
                         <div className="flex justify-between items-center">
                            <div className="flex gap-1">
                               {book.selectedReadingFormat ? (
                                  <span className="text-[9px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded-md font-bold border border-indigo-100 uppercase">
                                    {t(`format.${book.selectedReadingFormat}` as any)}
                                  </span>
                               ) : (
                                  book.formats.slice(0, 1).map(f => (
                                     <span key={f} className="text-[9px] px-1.5 py-0.5 bg-gray-50 text-gray-400 rounded-md font-bold border border-gray-100 uppercase">{t(`format.${f}` as any)}</span>
                                  ))
                               )}
                            </div>
                            <p className="text-[10px] text-gray-400 font-bold">
                               {book.selectedReadingFormat === 'Audio' ? (
                                  `${book.pagesRead || 0}%`
                               ) : (
                                  `${book.pagesRead || 0} / ${getBookPageTotal(book)} ${t('details.unit.pages')}`
                               )}
                            </p>
                         </div>
                      </div>
                    </div>
                  </div>
               );
            })}
          </div>
        )}
      </div>

      {selectedBook && !readingModeOpen && !isEditing && (
        <div className="fixed inset-0 z-[60] bg-slate-50 animate-in slide-in-from-bottom duration-300">
          <BookDetailsV2 
            book={selectedBook}
            onBack={() => setSelectedBook(null)}
            onOpenReadingMode={() => setReadingModeOpen(true)}
            onEdit={() => setIsEditing(true)}
            onDelete={async () => {
              const ok = await confirm({
                title: t('library.deleteTitle'),
                message: t('library.deleteMessage', { title: selectedBook.title }),
                type: 'danger',
                confirmText: t('common.delete'),
                cancelText: t('common.cancel'),
              });
              if (!ok) return;
              try {
                deleteBook(selectedBook.id);
                toast.show(t('library.bookDeleted'), 'success');
                setSelectedBook(null);
              } catch (error) {
                console.error(error);
                toast.show(t('library.failedDelete'), 'error');
              }
            }}
            onStartReadingWishlist={() => {}}
          />
        </div>
      )}

      {isEditing && selectedBook && (
        <div className="fixed inset-0 z-[70] bg-slate-50">
          <EditBookV2 
            book={selectedBook}
            publisherSuggestions={uniquePublishers}
            genreSuggestions={uniqueGenres}
            onSave={(updated) => {
              try {
                updateBook(updated);
                toast.show(t('library.saved'), 'success');
                setSelectedBook(updated);
                setIsEditing(false);
              } catch (error) {
                console.error(error);
                toast.show(t('library.failedSave'), 'error');
              }
            }}
            onCancel={() => setIsEditing(false)}
          />
        </div>
      )}

      {readingModeOpen && selectedBook && (
        <ReadingMode 
          book={selectedBook}
          onClose={() => {
            setReadingModeOpen(false);
            setSelectedBook(null);
          }}
        />
      )}
    </>
  );
};
