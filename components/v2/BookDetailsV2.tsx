import React from 'react';
import {
  ArrowLeft,
  BookOpen,
  Building2,
  Calendar as CalendarIcon,
  CalendarDays,
  Clock,
  Layers,
  MessageSquare,
  Pencil,
  Smile,
  Tag,
  Trash2,
  Zap,
} from 'lucide-react';
import { Book, BookFormat, BookStatus } from '../../types';
import {
  calculateAverageSpeed,
  calculateProgress,
  calculateTotalReadingTime,
  getBookPageTotal,
  getRatingColor,
  getSeasonColorClass,
  normalizeSeason,
} from '../../utils';
import { BookCover } from '../ui/BookCover';
import { useI18n } from '../../contexts/I18nContext';
import { MessageKey } from '../../i18n/messages';

interface BookDetailsV2Props {
  book: Book;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStartReadingWishlist: () => void;
  onOpenReadingMode: () => void;
  onTagClick?: (tag: string) => void;
  isBusy?: boolean;
}

const formatDate = (value: string | undefined, locale: string, fallback: string): string => {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toLocaleDateString(locale);
};

export const BookDetailsV2: React.FC<BookDetailsV2Props> = ({
  book,
  onBack,
  onEdit,
  onDelete,
  onStartReadingWishlist,
  onOpenReadingMode,
  onTagClick,
  isBusy = false,
}) => {
  const { t, locale } = useI18n();
  const isWishlist = book.status === 'Wishlist';
  const totalPages = book.pagesTotal || getBookPageTotal(book);
  const progress = calculateProgress(book.pagesRead, totalPages);
  const fallback = t('common.unknown');

  const runTagFilter = (value?: string) => {
    const normalized = (value || '').trim();
    if (!normalized || isBusy) return;
    onTagClick?.(normalized);
  };

  const statusLabel = (status: BookStatus) => t(`status.${status}` as MessageKey);
  const formatLabel = (format: BookFormat) => t(`format.${format}` as MessageKey);

  return (
    <div className="h-[100dvh] overflow-y-auto overscroll-contain p-4 pb-8 text-gray-800 space-y-4">
      <button
        onClick={onBack}
        disabled={isBusy}
        className="flex items-center gap-2 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
      >
        <ArrowLeft size={20} />
        <span className="text-sm font-bold">{t('common.back')}</span>
      </button>

      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <div className="flex gap-5">
            <div className="w-32 aspect-[2/3] rounded-xl border border-gray-100 overflow-hidden bg-gray-50 flex-shrink-0 shadow-lg">
              <BookCover book={book} className="w-full h-full" iconSize={32} />
            </div>
            <div className="min-w-0 flex-1 flex flex-col justify-end">
              {isWishlist ? (
                <button
                  onClick={onStartReadingWishlist}
                  disabled={isBusy}
                  className="w-full bg-indigo-600 text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 mb-3 shadow-lg shadow-indigo-200 active:scale-95 transition-all disabled:opacity-60"
                >
                  <BookOpen size={16} />
                  <span className="text-xs">{t('details.addToLibrary')}</span>
                </button>
              ) : (
                <button
                  onClick={onOpenReadingMode}
                  disabled={isBusy}
                  className="w-full bg-indigo-600 text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 mb-3 shadow-lg shadow-indigo-200 active:scale-95 transition-all disabled:opacity-60"
                >
                  <BookOpen size={16} />
                  <span className="text-xs">{t('details.openReading')}</span>
                </button>
              )}

              <div className="mb-2">
                <span
                  className={`inline-block w-fit px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                    book.status === 'Completed'
                      ? 'bg-emerald-50 text-emerald-600'
                      : book.status === 'Wishlist'
                        ? 'bg-pink-50 text-pink-600'
                        : 'bg-indigo-50 text-indigo-600'
                  }`}
                >
                  {statusLabel(book.status)}
                </span>
              </div>
              
              <h1 className="text-xl font-bold text-gray-800 leading-tight line-clamp-3">{book.title}</h1>
              {book.author ? (
                <button
                  type="button"
                  onClick={() => runTagFilter(book.author)}
                  disabled={isBusy}
                  className="text-sm font-medium text-gray-500 mt-1 truncate hover:text-indigo-600 transition-colors text-left active:scale-95"
                >
                  {book.author}
                </button>
              ) : (
                <p className="text-sm text-gray-500 mt-1">{fallback}</p>
              )}
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => runTagFilter(book.publisher)}
              disabled={!book.publisher || isBusy}
              className="bg-gray-50 p-3 rounded-2xl border border-gray-100 flex items-center gap-3 text-left disabled:opacity-70"
            >
              <Building2 size={16} className="text-gray-400" />
              <div className="min-w-0">
                <p className="text-[10px] text-gray-400 uppercase font-bold">{t('details.publisher')}</p>
                <p className="text-xs font-bold text-gray-700 truncate">{book.publisher || fallback}</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => runTagFilter(book.genre)}
              disabled={!book.genre || isBusy}
              className="bg-gray-50 p-3 rounded-2xl border border-gray-100 flex items-center gap-3 text-left disabled:opacity-70"
            >
              <Tag size={16} className="text-gray-400" />
              <div className="min-w-0">
                <p className="text-[10px] text-gray-400 uppercase font-bold">{t('details.genre')}</p>
                <p className="text-xs font-bold text-gray-700 truncate">{book.genre || fallback}</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => runTagFilter(book.seasons?.join(', '))}
              disabled={!book.seasons || book.seasons.length === 0 || isBusy}
              className="col-span-2 bg-gray-50 p-3 rounded-2xl border border-gray-100 flex items-center gap-3 text-left disabled:opacity-70"
            >
              <CalendarDays size={16} className="text-gray-400" />
              <div className="min-w-0">
                <p className="text-[10px] text-gray-400 uppercase font-bold">{t('details.seasons')}</p>
                {book.seasons && book.seasons.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {book.seasons.map((season) => (
                      <span key={season} className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${getSeasonColorClass(season)}`}>
                        {t(`season.${normalizeSeason(season)}` as MessageKey)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs font-bold text-gray-700">{fallback}</p>
                )}
              </div>
            </button>

            <button
              type="button"
              onClick={() => runTagFilter(book.series)}
              disabled={!book.series || isBusy}
              className="col-span-2 bg-gray-50 p-3 rounded-2xl border border-gray-100 flex items-center gap-3 text-left disabled:opacity-70"
            >
              <Layers size={16} className="text-gray-400" />
              <div className="min-w-0 flex-1 flex justify-between items-center gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-400 uppercase font-bold">{t('details.series')}</p>
                  <p className="text-xs font-bold text-gray-700 truncate">{book.series || fallback}</p>
                </div>
                {book.seriesPart && (
                  <div className="bg-white px-2 py-1 rounded-lg border border-gray-200 text-[10px] font-black text-indigo-600">#{book.seriesPart}</div>
                )}
              </div>
            </button>
          </div>

          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-2">
            <div className="flex justify-between items-center border-b border-gray-200 pb-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase">{t('details.status')}</span>
              <span
                className={`text-xs font-bold ${
                  book.status === 'Completed'
                    ? 'text-emerald-600'
                    : book.status === 'Wishlist'
                      ? 'text-pink-600'
                      : 'text-indigo-600'
                }`}
              >
                {statusLabel(book.status)}
              </span>
            </div>

            {(book.rating || 0) > 0 && (
              <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase">{t('details.rating')}</span>
                <span className="text-xs font-black px-2 py-0.5 rounded bg-white border border-gray-100 shadow-sm" style={{ color: getRatingColor(book.rating || 0) }}>
                  {book.rating}/10
                </span>
              </div>
            )}

            <div className="flex justify-between items-center border-b border-gray-200 pb-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase">{t('details.pages')}</span>
              <span className="text-xs font-bold text-gray-700">{totalPages || fallback}</span>
            </div>

            {!isWishlist && (
              <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase">{t('details.added')}</span>
                <span className="text-xs font-bold text-gray-700">{formatDate(book.addedAt, locale, fallback)}</span>
              </div>
            )}

            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold text-gray-400 uppercase">{t('details.formats')}</span>
              <span className="text-xs font-bold text-gray-700 text-right">{(book.formats || []).map((format) => formatLabel(format)).join(', ') || fallback}</span>
            </div>
          </div>

          {book.status === 'Completed' || (book.completedDates && book.completedDates.length > 0) ? (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-50/50 p-3 rounded-2xl border border-emerald-100 flex flex-col items-center">
                <CalendarIcon size={16} className="text-emerald-500 mb-1" />
                <span className="text-[10px] font-bold text-emerald-400 uppercase text-center">{t('details.completed')}</span>
                <div className="text-[11px] font-bold text-emerald-700 text-center flex flex-col gap-0.5 max-h-[60px] overflow-y-auto">
                  {book.completedDates && book.completedDates.length > 0 ? (
                    book.completedDates.map((date, idx) => (
                      <div key={`${date}-${idx}`}>{formatDate(date, locale, fallback)}</div>
                    ))
                  ) : (
                    <div>{formatDate(book.completedAt, locale, fallback)}</div>
                  )}
                </div>
              </div>
              <div className="bg-indigo-50/50 p-3 rounded-2xl border border-indigo-100 flex flex-col items-center">
                <Clock size={16} className="text-indigo-500 mb-1" />
                <span className="text-[10px] font-bold text-indigo-400 uppercase">{t('details.time')}</span>
                <span className="text-[11px] font-bold text-indigo-700">{calculateTotalReadingTime(book)} {t('details.unit.minutes')}</span>
              </div>
              <div className="bg-amber-50/50 p-3 rounded-2xl border border-amber-100 flex flex-col items-center">
                <Zap size={16} className="text-amber-500 mb-1" />
                <span className="text-[10px] font-bold text-amber-400 uppercase">{t('details.speed')}</span>
                <span className="text-[11px] font-bold text-amber-700">{calculateAverageSpeed(book)} {t('details.unit.pagesPerHour')}</span>
              </div>
            </div>
          ) : isWishlist ? (
            <div className="bg-pink-50/50 p-4 rounded-3xl border border-pink-100 flex items-center gap-3">
              <div className="p-2 bg-pink-100 rounded-full text-pink-500">
                <CalendarDays size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-pink-400 uppercase">{t('details.inWishlistSince')}</p>
                <p className="text-xs font-bold text-pink-700">{formatDate(book.wishlistedAt || book.addedAt, locale, fallback)}</p>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 p-4 rounded-3xl border border-gray-100">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('details.progress')}</h4>
                <span className="text-xs font-bold text-indigo-600">{progress}%</span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-600 transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {(book.notes || book.comment) && (
            <div className="space-y-3 pt-1">
              {book.notes && (
                <div className="bg-gray-50 p-4 rounded-3xl border border-gray-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Smile size={14} className="text-gray-400" />
                    <span className="text-[10px] font-bold text-gray-400 uppercase">{t('details.notes')}</span>
                  </div>
                  <div className="text-xl tracking-wide leading-relaxed text-gray-800">{book.notes}</div>
                </div>
              )}
              {book.comment && (
                <div className="bg-gray-50 p-4 rounded-3xl border border-gray-100">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare size={14} className="text-gray-400" />
                    <span className="text-[10px] font-bold text-gray-400 uppercase">{t('details.comment')}</span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap break-words leading-relaxed">{book.comment}</p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2 pt-1">
            <div className="flex gap-2">
              <button
                onClick={onEdit}
                disabled={isBusy}
                className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Pencil size={16} />
                <span>{t('common.edit')}</span>
              </button>

              <button
                onClick={onDelete}
                disabled={isBusy}
                className="w-12 bg-red-50 text-red-600 py-3 rounded-2xl font-bold flex items-center justify-center disabled:opacity-60"
                aria-label={t('details.deleteAria')}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
