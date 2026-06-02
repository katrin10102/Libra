import React, { useMemo, useState, useEffect } from 'react';
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Trophy,
  Maximize2,
  PlusCircle,
  Star,
  Building2,
  Tags,
  Zap,
  TrendingUp,
  FileText
} from 'lucide-react';
import { useLibrary } from '../contexts/LibraryContext';
import { useI18n } from '../contexts/I18nContext';
import { BookCover } from './ui/BookCover';
import { getBookPageTotal } from '../utils';
import { Book } from '../types';

const formatCompletedDate = (date: Date, locale: string) => {
  const lang = locale === 'uk' ? 'uk-UA' : 'en-US';
  return new Intl.DateTimeFormat(lang, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
};

interface MetricSectionProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  emptyMessage?: string;
  hasData: boolean;
}

const MetricSection: React.FC<MetricSectionProps> = ({
  title,
  value,
  icon,
  isOpen,
  onToggle,
  children,
  emptyMessage,
  hasData
}) => {
  return (
    <section className={`bg-white rounded-[2.5rem] border transition-all duration-300 shadow-sm overflow-hidden ${isOpen ? 'border-indigo-100 ring-1 ring-indigo-50/50' : 'border-gray-100'}`}>
      <button
        onClick={onToggle}
        className="w-full p-5 flex items-center justify-between active:scale-[0.99] transition-all group"
      >
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm transition-all duration-300 ${isOpen ? 'bg-indigo-600 text-white scale-110' : 'bg-indigo-50 text-indigo-600 group-hover:scale-110'}`}>
            {icon}
          </div>
          <div className="text-left">
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 transition-colors ${isOpen ? 'text-indigo-400' : 'text-gray-400'}`}>{title}</p>
            <p className="text-2xl font-black text-gray-800 leading-none">{value}</p>
          </div>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isOpen ? 'rotate-90 text-indigo-600 bg-indigo-50' : 'bg-gray-50 text-gray-400'}`}>
          <ChevronRight size={20} />
        </div>
      </button>

      {isOpen && (
        <div className="animate-in slide-in-from-top-2 duration-300 p-4 pt-0 space-y-3">
          <div className="h-px bg-gray-50 mx-2 mb-4" />
          {!hasData ? (
            <div className="bg-gray-50/50 rounded-[1.5rem] border border-dashed border-gray-200 p-8 text-center text-gray-400">
              <p className="text-sm font-medium">{emptyMessage || 'No data'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {children}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

const BookItem: React.FC<{ book: Book; locale: string; t: any; extraInfo?: React.ReactNode }> = ({ book, locale, t, extraInfo }) => (
  <article className="bg-white border border-gray-100 rounded-[2rem] p-4 shadow-sm flex gap-4 items-center group active:scale-[0.98] transition-all">
    <div className="w-14 h-20 flex-shrink-0 shadow-sm rounded-xl overflow-hidden border border-gray-100 group-hover:scale-105 transition-transform">
      <BookCover book={book} className="w-full h-full" iconSize={20} />
    </div>
    <div className="min-w-0 flex-1">
      <h3 className="text-base font-bold text-gray-800 truncate leading-tight mb-1">{book.title}</h3>
      <p className="text-xs text-gray-500 truncate font-medium">{book.author}</p>
    </div>
    {extraInfo}
  </article>
);

export const History: React.FC = () => {
  const { books } = useLibrary();
  const { t, locale } = useI18n();

  const [startDate, setStartDate] = useState(() => {
    const saved = localStorage.getItem('history_start_date');
    if (saved) return saved;
    const d = new Date();
    d.setDate(1); // First day of current month
    return d.toISOString().split('T')[0];
  });

  const [endDate, setEndDate] = useState(() => {
    const saved = localStorage.getItem('history_end_date');
    if (saved) return saved;
    return new Date().toISOString().split('T')[0];
  });

  const [statsMode, setStatsMode] = useState<'month' | 'custom'>(() => {
    return (localStorage.getItem('history_stats_mode') as 'month' | 'custom') || 'month';
  });

  const [selectedMonthDate, setSelectedMonthDate] = useState<Date>(() => {
    const saved = localStorage.getItem('history_selected_month');
    if (saved) {
      const parsed = new Date(saved);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  });

  const [openSection, setOpenSection] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('history_start_date', startDate);
  }, [startDate]);

  useEffect(() => {
    localStorage.setItem('history_end_date', endDate);
  }, [endDate]);

  useEffect(() => {
    localStorage.setItem('history_selected_month', selectedMonthDate.toISOString());
  }, [selectedMonthDate]);

  const stats = useMemo(() => {
    let start: Date;
    let end: Date;

    if (statsMode === 'month') {
      const year = selectedMonthDate.getFullYear();
      const month = selectedMonthDate.getMonth();
      start = new Date(year, month, 1, 0, 0, 0, 0);
      end = new Date(year, month + 1, 0, 23, 59, 59, 999);
    } else {
      start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    }

    // 1. Completed books (including historical reading cycles)
    const completionEvents: { book: Book; completedAt: string; rating: number }[] = [];
    books.forEach(b => {
      if (b.completedDates && b.completedDates.length > 0) {
        b.completedDates.forEach(date => {
          completionEvents.push({
            book: b,
            completedAt: date,
            rating: b.rating ?? 0
          });
        });
      } else if (b.completedAt) {
        completionEvents.push({
          book: b,
          completedAt: b.completedAt,
          rating: b.rating ?? 0
        });
      }
    });

    const completedBooks = completionEvents
      .filter(event => {
        const d = new Date(event.completedAt);
        return d >= start && d <= end;
      })
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
      .map(event => ({
        ...event.book,
        completedAt: event.completedAt,
        rating: event.rating
      }));

    // 2. Largest book read
    const largestBook = [...completedBooks]
      .filter(b => b.selectedReadingFormat !== 'Audio')
      .sort((a, b) => getBookPageTotal(b) - getBookPageTotal(a))[0];

    // 3. Best read (Books with rating 10)
    const bestBooks = completedBooks
      .filter(b => b.rating === 10)
      .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime());
    
    const countRating10 = bestBooks.length;

    // 4. Worst read (Books with rating <= 5)
    const worstBooks = completedBooks
      .filter(b => b.rating !== undefined && b.rating > 0 && b.rating <= 5)
      .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime());

    // 5. Added books
    const addedBooks = books
      .filter(b => b.status !== 'Wishlist' && b.addedAt && b.formats.includes('Paper'))
      .filter(b => {
        const d = new Date(b.addedAt!);
        return d >= start && d <= end;
      })
      .sort((a, b) => new Date(b.addedAt!).getTime() - new Date(a.addedAt!).getTime());

    // 5. Genres distribution
    const genreMap: Record<string, number> = {};
    completedBooks.forEach(b => {
      if (b.genre) {
        genreMap[b.genre] = (genreMap[b.genre] || 0) + 1;
      }
    });
    const genres = Object.entries(genreMap)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    // 6. Publishers distribution
    const publisherMap: Record<string, number> = {};
    completedBooks.forEach(b => {
      if (b.publisher) {
        publisherMap[b.publisher] = (publisherMap[b.publisher] || 0) + 1;
      }
    });
    const publishers = Object.entries(publisherMap)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    // 7. Reading sessions stats
    let totalPagesRead = 0;
    let totalDurationSeconds = 0;
    let totalDurationSecondsForSpeed = 0;
    books.forEach(book => {
      const isAudio = book.selectedReadingFormat === 'Audio';
      book.sessions.forEach(session => {
        const sessionDate = new Date(session.date);
        if (sessionDate >= start && sessionDate <= end) {
          if (!isAudio) {
            totalPagesRead += session.pages;
            totalDurationSecondsForSpeed += session.duration;
          }
          totalDurationSeconds += session.duration;
        }
      });
    });

    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    
    const avgSpeed = totalDurationSecondsForSpeed > 0 ? (totalPagesRead / (totalDurationSecondsForSpeed / 3600)) : 0;
    const avgPagesPerDay = totalPagesRead / diffDays;

    return {
      completedBooks,
      largestBook,
      bestBooks,
      worstBooks,
      countRating10,
      addedBooks,
      genres,
      publishers,
      totalPagesRead,
      avgSpeed,
      avgPagesPerDay
    };
  }, [books, startDate, endDate, statsMode, selectedMonthDate]);

  const toggleSection = (id: string) => {
    setOpenSection(openSection === id ? null : id);
  };

  return (
    <div className="p-4 space-y-6 pb-32 animate-in fade-in duration-500">
      <header>
        <h1 className="text-3xl font-bold text-gray-800 tracking-tight">{t('nav.history')}</h1>
        <p className="text-gray-500 text-sm mt-1">
          {t('stats.completedSubtitle')}
        </p>
      </header>

      {/* Date Range Picker Controls */}
      <div className="space-y-3">
        {/* Mode Switcher */}
        <div className="flex bg-gray-100 p-1 rounded-2xl">
          <button
            onClick={() => {
              setStatsMode('month');
              localStorage.setItem('history_stats_mode', 'month');
            }}
            className={`flex-1 text-center py-2 text-xs font-bold rounded-xl transition-all ${
              statsMode === 'month'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {t('stats.modeMonth' as any)}
          </button>
          <button
            onClick={() => {
              setStatsMode('custom');
              localStorage.setItem('history_stats_mode', 'custom');
            }}
            className={`flex-1 text-center py-2 text-xs font-bold rounded-xl transition-all ${
              statsMode === 'custom'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {t('stats.modeCustom' as any)}
          </button>
        </div>

        {statsMode === 'month' ? (
          <section className="bg-white rounded-[2rem] border border-gray-100 px-5 py-3 shadow-sm flex items-center justify-between">
            <button
              onClick={() => {
                setSelectedMonthDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
              }}
              className="w-10 h-10 rounded-xl bg-gray-50 hover:bg-gray-100 active:scale-95 flex items-center justify-center text-gray-600 transition-all"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-black text-gray-700 uppercase tracking-wider capitalize">
              {selectedMonthDate.toLocaleString(locale, { month: 'long', year: 'numeric' })}
            </span>
            <button
              onClick={() => {
                setSelectedMonthDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
              }}
              className="w-10 h-10 rounded-xl bg-gray-50 hover:bg-gray-100 active:scale-95 flex items-center justify-center text-gray-600 transition-all"
            >
              <ChevronRight size={18} />
            </button>
          </section>
        ) : (
          <section className="bg-white rounded-[2rem] border border-gray-100 px-5 py-4 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 min-w-0">
                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-1">
                  {t('stats.startDate')}
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full block bg-gray-50 border-none rounded-xl px-3 py-2.5 text-xs font-bold text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none min-w-0 text-center box-border max-w-full"
                />
              </div>
              <div className="space-y-1 min-w-0">
                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-1">
                  {t('stats.endDate')}
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full block bg-gray-50 border-none rounded-xl px-3 py-2.5 text-xs font-bold text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none min-w-0 text-center box-border max-w-full"
                />
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Summary Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-3xl border border-gray-100 p-3 shadow-sm flex flex-col items-center text-center">
          <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-2">
            <FileText size={16} />
          </div>
          <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wider mb-1">{t('stats.totalPages')}</p>
          <p className="text-lg font-black text-gray-800 leading-none">{stats.totalPagesRead}</p>
        </div>
        
        <div className="bg-white rounded-3xl border border-gray-100 p-3 shadow-sm flex flex-col items-center text-center">
          <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-2">
            <Zap size={16} />
          </div>
          <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wider mb-1">{t('stats.avgSpeed')}</p>
          <p className="text-lg font-black text-gray-800 leading-none">
            {Math.round(stats.avgSpeed)} <span className="text-[8px] font-bold opacity-40">{t('details.unit.pagesPerHour')}</span>
          </p>
        </div>

        <div className="bg-white rounded-3xl border border-gray-100 p-3 shadow-sm flex flex-col items-center text-center">
          <div className="w-8 h-8 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mb-2">
            <TrendingUp size={16} />
          </div>
          <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wider mb-1">{t('stats.pagesPerDay')}</p>
          <p className="text-lg font-black text-gray-800 leading-none">
            {stats.avgPagesPerDay.toFixed(1)}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* 1. Completed Fully */}
        <MetricSection
          title={t('stats.completedFully')}
          value={stats.completedBooks.length}
          icon={<CalendarDays size={24} />}
          isOpen={openSection === 'completed'}
          onToggle={() => toggleSection('completed')}
          hasData={stats.completedBooks.length > 0}
          emptyMessage={t('stats.noCompleted')}
        >
          {stats.completedBooks.map((book) => (
            <BookItem 
              key={`${book.id}-${book.completedAt}`} 
              book={book} 
              locale={locale} 
              t={t} 
              extraInfo={
                <div className="text-right flex-shrink-0 pl-2 border-l border-gray-50 flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1">
                    <Star size={10} className={`fill-current ${book.rating && book.rating >= 8 ? 'text-emerald-500' : book.rating && book.rating <= 5 ? 'text-red-400' : 'text-amber-400'}`} />
                    <span className="text-xs font-black text-gray-800">{book.rating || '-'}</span>
                  </div>
                  <p className="text-[9px] font-bold text-gray-400">{formatCompletedDate(new Date(book.completedAt!), locale)}</p>
                </div>
              }
            />
          ))}
        </MetricSection>

        {/* 2. Largest Book */}
        <MetricSection
          title={t('stats.largestBook')}
          value={stats.largestBook ? `${getBookPageTotal(stats.largestBook)} ${t('details.unit.pages')}` : 0}
          icon={<Maximize2 size={24} />}
          isOpen={openSection === 'largest'}
          onToggle={() => toggleSection('largest')}
          hasData={!!stats.largestBook}
        >
          {stats.largestBook && (
            <BookItem 
              book={stats.largestBook} 
              locale={locale} 
              t={t} 
              extraInfo={
                <div className="text-right flex-shrink-0 pl-2 border-l border-gray-50">
                  <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">{t('details.pages')}</p>
                  <p className="text-xs font-black text-indigo-600">{getBookPageTotal(stats.largestBook)}</p>
                </div>
              }
            />
          )}
        </MetricSection>

        {/* 3. Best Read */}
        <MetricSection
          title={t('stats.bestRead')}
          value={stats.countRating10}
          icon={<Trophy size={24} />}
          isOpen={openSection === 'best'}
          onToggle={() => toggleSection('best')}
          hasData={stats.bestBooks.length > 0}
        >
          {stats.bestBooks.map((book) => (
            <BookItem 
              key={book.id} 
              book={book} 
              locale={locale} 
              t={t} 
              extraInfo={
                <div className="text-right flex-shrink-0 pl-2 border-l border-gray-50">
                  <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">{t('details.rating')}</p>
                  <div className="flex items-center gap-1 justify-end">
                    <Star size={10} className="fill-amber-400 text-amber-400" />
                    <p className="text-xs font-black text-amber-600">{book.rating}</p>
                  </div>
                </div>
              }
            />
          ))}
        </MetricSection>

        {/* 4. Worst Read */}
        <MetricSection
          title={t('stats.worstRead')}
          value={stats.worstBooks.length}
          icon={<Star size={24} />}
          isOpen={openSection === 'worst'}
          onToggle={() => toggleSection('worst')}
          hasData={stats.worstBooks.length > 0}
        >
          {stats.worstBooks.map((book) => (
            <BookItem 
              key={book.id} 
              book={book} 
              locale={locale} 
              t={t} 
              extraInfo={
                <div className="text-right flex-shrink-0 pl-2 border-l border-gray-50">
                  <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">{t('details.rating')}</p>
                  <div className="flex items-center gap-1 justify-end">
                    <Star size={10} className="fill-red-400 text-red-400" />
                    <p className="text-xs font-black text-red-600">{book.rating}</p>
                  </div>
                </div>
              }
            />
          ))}
        </MetricSection>

        {/* 5. Added Books */}
        <MetricSection
          title={t('stats.addedBooksCount')}
          value={stats.addedBooks.length}
          icon={<PlusCircle size={24} />}
          isOpen={openSection === 'added'}
          onToggle={() => toggleSection('added')}
          hasData={stats.addedBooks.length > 0}
        >
          {stats.addedBooks.map((book) => (
            <BookItem 
              key={book.id} 
              book={book} 
              locale={locale} 
              t={t} 
              extraInfo={
                <div className="text-right flex-shrink-0 pl-2 border-l border-gray-50">
                  <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">{t('details.added')}</p>
                  <p className="text-xs font-black text-indigo-600">{formatCompletedDate(new Date(book.addedAt!), locale)}</p>
                </div>
              }
            />
          ))}
        </MetricSection>

        {/* 6. Genres */}
        <MetricSection
          title={t('library.filter.genre')}
          value={stats.genres.length}
          icon={<Tags size={24} />}
          isOpen={openSection === 'genres'}
          onToggle={() => toggleSection('genres')}
          hasData={stats.genres.length > 0}
        >
          <div className="space-y-2">
            {stats.genres.map(({ name, count }) => (
              <div key={name} className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                <span className="text-sm font-bold text-gray-700">{name}</span>
                <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-xl text-xs font-black">{count}</span>
              </div>
            ))}
          </div>
        </MetricSection>

        {/* 7. Publishers */}
        <MetricSection
          title={t('stats.publishers')}
          value={stats.publishers.length}
          icon={<Building2 size={24} />}
          isOpen={openSection === 'publishers'}
          onToggle={() => toggleSection('publishers')}
          hasData={stats.publishers.length > 0}
        >
          <div className="space-y-2">
            {stats.publishers.map(({ name, count }) => (
              <div key={name} className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                <span className="text-sm font-bold text-gray-700">{name}</span>
                <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-xl text-xs font-black">{count}</span>
              </div>
            ))}
          </div>
        </MetricSection>
      </div>
    </div>
  );
};
