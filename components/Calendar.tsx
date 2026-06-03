
import React, { useMemo, useState } from 'react';
import { Book } from '../types';
import { ChevronLeft, ChevronRight, BookOpen, Calendar as CalendarIcon, Grid, Clock, FileText, Loader2 } from 'lucide-react';
import { BookDetailsV2 } from './v2/BookDetailsV2';
import { EditBookV2 } from './v2/EditBookV2';
import { ReadingMode } from './ReadingMode';
import { useLibrary } from '../contexts/LibraryContext';
import { useUI } from '../contexts/UIContext';
import { useI18n } from '../contexts/I18nContext';
import { formatTime } from '../utils';
import { BookCover } from './ui/BookCover';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';

type ViewMode = 'month' | 'year';

export const Calendar: React.FC = () => {
  const { books, updateBook, deleteBook } = useLibrary();
  const { toast, confirm } = useUI();
  const { t, locale } = useI18n();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [readingModeOpen, setReadingModeOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

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
  
  // Specific date selection within a month
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // --- Swipe Logic ---
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      handleNext();
    }
    if (isRightSwipe) {
      handlePrev();
    }
  };

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  const adjustedFirstDay = (firstDayOfMonth + 6) % 7; 

  const monthName = currentDate.toLocaleString(locale, { month: 'long' });
  const year = currentDate.getFullYear();

  const isBookReadInMonth = (book: Book, yearStr: number, monthIndex: number) => {
     const prefix = `${yearStr}-${String(monthIndex + 1).padStart(2, '0')}`;
     const hasSession = book.sessions?.some(s => s.date.startsWith(prefix));
     const completedInMonth = book.completedAt && book.completedAt.startsWith(prefix);
     const completedDatesInMonth = book.completedDates?.some(d => d.startsWith(prefix));
     return hasSession || completedInMonth || completedDatesInMonth;
  };

  const dailyReadingMap = useMemo(() => {
    const map: Record<string, Book[]> = {};
    const monthPrefix = `${year}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

    books.forEach(book => {
      book.sessions?.forEach(session => {
        if (session.date.startsWith(monthPrefix)) {
            if (!map[session.date]) map[session.date] = [];
            if (!map[session.date].some(b => b.id === book.id)) map[session.date].push(book);
        }
      });
    });
    return map;
  }, [books, currentDate, year]);

  const handlePrev = () => {
    setSelectedDay(null);
    if (viewMode === 'month') {
        setCurrentDate(new Date(year, currentDate.getMonth() - 1, 1));
    } else {
        setCurrentDate(new Date(year - 1, currentDate.getMonth(), 1));
    }
  };

  const handleNext = () => {
    setSelectedDay(null);
    if (viewMode === 'month') {
        setCurrentDate(new Date(year, currentDate.getMonth() + 1, 1));
    } else {
        setCurrentDate(new Date(year + 1, currentDate.getMonth(), 1));
    }
  };

  const handleMonthClick = (monthIndex: number) => {
      setCurrentDate(new Date(year, monthIndex, 1));
      setViewMode('month');
      setSelectedDay(null);
  };

  // --- Daily Stats Calculation ---
  const activeStats = useMemo(() => {
    const targetDateStr = selectedDay 
        ? `${year}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`
        : null;

    let totalPages = 0;
    let totalSeconds = 0;
    let activeBooks = new Set<string>();
    let bookList: Book[] = [];

    if (viewMode === 'month' && !targetDateStr) {
        // Month total
        const monthPrefix = `${year}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
        books.forEach(b => {
            let bookAdded = false;
            b.sessions?.forEach(s => {
                if (s.date.startsWith(monthPrefix)) {
                    totalPages += Number(s.pages) || 0;
                    totalSeconds += Number(s.duration) || 0;
                    if (!bookAdded) {
                        activeBooks.add(b.id);
                        bookList.push(b);
                        bookAdded = true;
                    }
                }
            });
        });
    } else if (viewMode === 'month' && targetDateStr) {
        // Specific day total
        books.forEach(b => {
             let bookAdded = false;
             b.sessions?.forEach(s => {
                 if (s.date === targetDateStr) {
                     totalPages += Number(s.pages) || 0;
                     totalSeconds += Number(s.duration) || 0;
                     if (!bookAdded) {
                        activeBooks.add(b.id);
                        bookList.push(b);
                        bookAdded = true;
                     }
                 }
             });
        });
    } else {
        // Year total
        const yearPrefix = `${year}-`;
        books.forEach(b => {
            let bookAdded = false;
            b.sessions?.forEach(s => {
                if (s.date.startsWith(yearPrefix)) {
                    if (!bookAdded) {
                        activeBooks.add(b.id);
                        bookList.push(b);
                        bookAdded = true;
                    }
                }
            });
        });
    }

    return { 
        count: activeBooks.size, 
        pages: totalPages, 
        time: totalSeconds,
        list: bookList 
    };
  }, [books, viewMode, currentDate, year, selectedDay]);

  // Apply Infinite Scroll to stats list (especially for Year view which can be long)
  const { visibleItems: visibleStatsBooks, observerTarget, hasMore } = useInfiniteScroll(
      activeStats.list, 
      10,
      [viewMode, currentDate.toISOString(), selectedDay]
  );

  const renderMonthView = () => {
      const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
      const padding = Array.from({ length: adjustedFirstDay }, (_, i) => null);

      return (
        <>
            <div className="grid grid-cols-7 gap-1 mb-2">
            {[t('calendar.mon'), t('calendar.tue'), t('calendar.wed'), t('calendar.thu'), t('calendar.fri'), t('calendar.sat'), t('calendar.sun')].map(d => (
                <div key={d} className="text-center text-[10px] font-bold text-gray-400 uppercase">{d}</div>
            ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
            {padding.map((_, i) => <div key={`p-${i}`} className="aspect-[2/3]" />)}
            {days.map(day => {
                const dateStr = `${year}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const reads = dailyReadingMap[dateStr] || [];
                const isSelected = selectedDay === day;
                
                return (
                <div 
                    key={day} 
                    onClick={() => setSelectedDay(isSelected ? null : day)}
                    className={`aspect-[2/3] relative rounded-xl overflow-hidden border flex flex-col items-center justify-center transition-all cursor-pointer ${
                        isSelected 
                            ? 'ring-2 ring-indigo-500 border-indigo-500 z-10 scale-105 shadow-md' 
                            : reads.length > 0 
                                ? 'border-indigo-200 bg-white shadow-sm hover:border-indigo-300' 
                                : 'border-gray-50 bg-gray-50/50'
                    }`}
                >
                    {reads.length === 1 && (
                      <div className="w-full h-full relative">
                        <BookCover book={reads[0]} className="w-full h-full" iconSize={12} />
                      </div>
                    )}
                    {reads.length >= 2 && (
                      <div className="w-full h-full flex gap-[1px] bg-gray-100">
                        <div className="flex-1 h-full relative">
                          <BookCover book={reads[0]} className="w-full h-full" iconSize={10} />
                        </div>
                        <div className="flex-1 h-full relative">
                          <BookCover book={reads[1]} className="w-full h-full" iconSize={10} />
                          {reads.length > 2 && (
                            <div className="absolute bottom-0 right-0 bg-indigo-600 px-1 rounded-tl-lg text-[7px] font-bold text-white shadow-sm z-10">
                              +{reads.length - 2}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    <span className={`absolute top-1 left-1 font-extrabold z-20 transition-all ${
                        reads.length > 0 
                            ? 'text-[9px] bg-black/40 backdrop-blur-md text-white shadow-sm px-1 py-[1px] rounded-md' 
                            : 'text-[10px] text-gray-500'
                    }`}>
                      {day}
                    </span>
                </div>
                );
            })}
            </div>
        </>
      );
  };

  const renderYearView = () => {
      const months = Array.from({ length: 12 }, (_, i) => {
          const d = new Date(year, i, 1);
          const name = d.toLocaleString(locale, { month: 'long' });
          return name.charAt(0).toUpperCase() + name.slice(1);
      });

      return (
          <div className="grid grid-cols-3 gap-3">
              {months.map((mName, idx) => {
                  const booksInMonth = books.filter(b => isBookReadInMonth(b, year, idx));
                  const isCurrentMonth = new Date().getMonth() === idx && new Date().getFullYear() === year;

                  return (
                      <button 
                        key={mName} 
                        onClick={() => handleMonthClick(idx)}
                        className={`aspect-[4/5] bg-gray-50 rounded-2xl border flex flex-col items-center p-2 relative overflow-hidden transition-all hover:border-indigo-300 active:scale-95 ${isCurrentMonth ? 'border-indigo-500 ring-1 ring-indigo-500 bg-indigo-50/30' : 'border-gray-100'}`}
                      >
                          <span className={`text-[10px] font-bold uppercase mb-2 ${isCurrentMonth ? 'text-indigo-600 font-extrabold' : 'text-gray-800'}`}>{mName}</span>
                          
                          {booksInMonth.length > 0 ? (
                              <div className="grid grid-cols-2 gap-1 w-full flex-1 content-start">
                                  {booksInMonth.slice(0, 4).map(b => (
                                      <div key={b.id} className="aspect-[2/3] bg-white rounded-md overflow-hidden shadow-sm">
                                          <BookCover book={b} className="w-full h-full" iconSize={12} />
                                      </div>
                                  ))}
                              </div>
                          ) : (
                              <div className="flex-1 flex items-center justify-center">
                                  <div className="w-1.5 h-1.5 rounded-full bg-gray-200" />
                              </div>
                          )}

                          {booksInMonth.length > 0 && (
                              <div className="absolute bottom-2 right-2 bg-white/90 backdrop-blur rounded-md px-1.5 py-0.5 text-[8px] font-black text-gray-800 shadow-sm border border-gray-100">
                                  {booksInMonth.length}
                              </div>
                          )}
                      </button>
                  );
              })}
          </div>
      );
  };

  return (
    <>
      <div className="p-4 space-y-6 pb-24 text-gray-800 animate-in fade-in duration-500">
        <header className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 tracking-tight">{t('calendar.title')}</h1>
            <p className="text-gray-500 text-sm mt-1">{t('calendar.subtitle')}</p>
          </div>
        </header>

        {/* Main Calendar Card */}
        <div 
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-gray-100 transition-all duration-300 select-none"
        >
          <div className="flex justify-between items-center mb-4">
            <button onClick={handlePrev} className="w-10 h-10 flex items-center justify-center hover:bg-gray-50 rounded-xl transition-colors text-gray-400">
              <ChevronLeft size={24} />
            </button>
            
            <button 
               onClick={() => setViewMode(viewMode === 'month' ? 'year' : 'month')}
               className="text-xl font-bold capitalize flex items-center gap-2 px-4 py-2 rounded-2xl hover:bg-gray-50 transition-colors"
            >
               {viewMode === 'month' && <span className="text-gray-400 font-medium">{year}</span>}
               <span className="text-gray-800">{viewMode === 'month' ? monthName : year}</span>
            </button>

            <button onClick={handleNext} className="w-10 h-10 flex items-center justify-center hover:bg-gray-50 rounded-xl transition-colors text-gray-400">
              <ChevronRight size={24} />
            </button>
          </div>

          <div className="animate-in fade-in slide-in-from-top-2 duration-300">
            {viewMode === 'month' ? renderMonthView() : renderYearView()}
          </div>
        </div>

        {/* Activity Stats */}
        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 transition-all duration-300">
           <div className="flex justify-between items-start mb-6">
               <div>
                  <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{t('calendar.activity')}</h3>
                  <p className="text-sm font-bold text-gray-800 flex items-center gap-2">
                      {selectedDay ? (
                          <span className="text-indigo-600 bg-indigo-50/50 border border-indigo-100/30 px-2 py-0.5 rounded-lg">{selectedDay} {monthName}</span>
                      ) : (
                          <span className="text-gray-800">{viewMode === 'month' ? t('calendar.forMonth', { month: monthName.toLowerCase() }) : t('calendar.forYear', { year: year })}</span>
                      )}
                  </p>
               </div>
               <div className="flex flex-col items-end">
                   <span className="text-4xl font-black text-indigo-600 tracking-tighter leading-none">{activeStats.count}</span>
                   <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">{t('calendar.books')}</span>
               </div>
           </div>


           <div className="space-y-3">
              {activeStats.list.length === 0 ? (
                 <div className="text-center py-10 text-gray-300 flex flex-col items-center">
                     <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-3 border border-gray-100">
                        <BookOpen size={28} className="opacity-20" />
                     </div>
                     <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t('calendar.noActivity')}</p>
                 </div>
              ) : (
                 <div className="grid grid-cols-1 gap-3">
                     {visibleStatsBooks.map(book => (
                        <div 
                          key={book.id} 
                          onClick={() => setSelectedBook(book)}
                          className="flex items-center gap-4 p-3 bg-gray-50/50 rounded-[1.5rem] group cursor-pointer active:scale-[0.98] transition-all hover:bg-indigo-50 border border-gray-100/50 hover:border-indigo-100 shadow-sm"
                        >
                          <div className="w-12 h-16 bg-white rounded-xl overflow-hidden flex-shrink-0 shadow-sm border border-gray-100 group-hover:scale-105 transition-transform">
                             <BookCover book={book} className="w-full h-full" iconSize={18} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-sm text-gray-800 truncate mb-0.5">{book.title}</h4>
                            <p className="text-[11px] text-gray-500 truncate font-medium">{book.author}</p>
                          </div>
                          {(book.rating || 0) > 0 && (
                              <div className="w-8 h-8 bg-white rounded-xl shadow-sm text-xs font-black text-indigo-600 border border-gray-100 flex items-center justify-center">
                                  {book.rating}
                              </div>
                          )}
                        </div>
                      ))}
                      
                      {hasMore && (
                          <div ref={observerTarget} className="flex justify-center py-4">
                              <Loader2 className="animate-spin text-indigo-300" size={20} />
                          </div>
                      )}
                 </div>
              )}
           </div>
        </div>
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
          onClose={() => setReadingModeOpen(false)}
        />
      )}
    </>
  );
};
