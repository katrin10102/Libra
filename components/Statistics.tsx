import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Library,
  BookMarked,
  Trophy,
  ChevronRight
} from 'lucide-react';
import { useLibrary } from '../contexts/LibraryContext';
import { useI18n } from '../contexts/I18nContext';
import { FORMAT_LABELS } from '../utils';

interface StatisticsProps {
  onBack?: () => void;
}

export const Statistics: React.FC<StatisticsProps> = ({ onBack }) => {
  const { books } = useLibrary();
  const { t } = useI18n();

  const stats = useMemo(() => {
    const libraryBooks = books.filter(
      b => b.status !== 'Wishlist' && b.formats.includes('Paper')
    );

    const total = libraryBooks.length;
    const read = libraryBooks.filter(b => b.status === 'Completed').length;
    const reading = libraryBooks.filter(b => b.status === 'Reading').length;
    const unread = libraryBooks.filter(b => b.status === 'Unread').length;
    const readPercent = total > 0 ? Math.round((read / total) * 100) : 0;

    const publisherMap: Record<string, { total: number; read: number }> = {};
    libraryBooks.forEach(b => {
      if (!b.publisher) return;
      const pub = b.publisher.trim();
      if (!pub) return;
      if (!publisherMap[pub]) publisherMap[pub] = { total: 0, read: 0 };
      publisherMap[pub].total += 1;
      if (b.status === 'Completed') publisherMap[pub].read += 1;
    });

    const publisherStats = Object.entries(publisherMap)
      .map(([name, data]) => ({
        name,
        total: data.total,
        read: data.read,
        percent: data.total > 0 ? Math.round((data.read / data.total) * 100) : 0
      }))
      .sort((a, b) => b.total - a.total);

    return { total, read, reading, unread, readPercent, publisherStats };
  }, [books]);

  return (
    <div className="p-4 space-y-8 pb-32 animate-in fade-in duration-500">
      <header className="flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-xl border border-gray-100 bg-white text-gray-500 flex items-center justify-center shadow-sm active:scale-95 transition-all"
            aria-label={t('common.back')}
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-gray-800 tracking-tight">{t('stats.title')}</h1>
          <p className="text-gray-500 text-sm mt-1">{t('stats.subtitle')}</p>
        </div>
      </header>

      <section className="space-y-4">
        <div className="bg-indigo-600 p-8 rounded-[2.5rem] shadow-2xl shadow-indigo-200 text-white relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl" />
          <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-indigo-400 opacity-20 rounded-full blur-2xl" />
          <BookOpen className="absolute -right-6 -bottom-6 text-white opacity-10 w-40 h-40 group-hover:scale-110 transition-transform duration-700" />

          <div className="relative z-10">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-7xl font-black tracking-tighter">{stats.total}</span>
              <span className="text-sm font-bold opacity-80 uppercase tracking-widest">{t('stats.addedBooksCount')}</span>
            </div>
            <p className="text-indigo-100 text-xs font-medium mb-8">{t('stats.shelfDesc')}</p>

            <div className="space-y-3">
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest opacity-90">
                <span>{t('stats.shelfProgress')}</span>
                <span>{stats.readPercent}%</span>
              </div>
              <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden backdrop-blur-md">
                <div
                  className="h-full bg-white rounded-full transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(255,255,255,0.6)]"
                  style={{ width: `${stats.readPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-emerald-50 p-5 rounded-[2rem] border border-emerald-100 flex flex-col items-center justify-center gap-2 shadow-sm">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600 mb-1">
              <Trophy size={20} />
            </div>
            <span className="text-3xl font-black text-emerald-700 leading-none">{stats.read}</span>
            <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest">{t('stats.read')}</span>
          </div>

          <div className="bg-amber-50 p-5 rounded-[2rem] border border-amber-100 flex flex-col items-center justify-center gap-2 shadow-sm">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-600 mb-1">
              <BookMarked size={20} />
            </div>
            <span className="text-3xl font-black text-amber-700 leading-none">{stats.reading}</span>
            <span className="text-[9px] font-bold text-amber-400 uppercase tracking-widest">{t('stats.reading')}</span>
          </div>

          <div className="bg-slate-50 p-5 rounded-[2rem] border border-slate-100 flex flex-col items-center justify-center gap-2 shadow-sm">
            <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-1">
              <Library size={20} />
            </div>
            <span className="text-3xl font-black text-slate-700 leading-none">{stats.unread}</span>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t('stats.planned')}</span>
          </div>
        </div>
      </section>

      {stats.publisherStats.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2 ml-1">
            <div className="w-1.5 h-4 bg-indigo-500 rounded-full" />
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t('stats.publishers')}</h2>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {stats.publisherStats.map((pub, idx) => (
              <div
                key={pub.name}
                className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm flex items-center justify-between gap-4 group hover:border-indigo-100 transition-colors"
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <span className="text-3xl font-black text-gray-50 w-8 text-center flex-shrink-0 group-hover:text-indigo-50 transition-colors">{idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-sm text-gray-800 truncate mb-1.5">{pub.name}</h3>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 flex-1 max-w-[120px] bg-gray-50 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-1000 ${pub.percent === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                          style={{ width: `${pub.percent}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-gray-400">{pub.percent}%</span>
                    </div>
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  <div className="flex items-baseline justify-end gap-1">
                    <span className="text-xl font-black text-gray-800">{pub.read}</span>
                    <span className="text-xs font-bold text-gray-400">/ {pub.total}</span>
                  </div>
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{t('stats.addedBooksCount')}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {stats.total === 0 && (
        <div className="text-center py-12 text-gray-300">
          <BookOpen size={48} className="mx-auto mb-2 opacity-20" />
          <p className="text-sm font-medium">{t('stats.empty')}</p>
          <p className="text-xs mt-1">{t('stats.emptyDesc')}</p>
        </div>
      )}
    </div>
  );
};
