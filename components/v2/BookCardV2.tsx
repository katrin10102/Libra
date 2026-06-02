import React from 'react';
import {
  BookMarked,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Clock,
  Ghost,
  Headphones,
  Library,
  ShoppingCart,
  Star,
  Tablet,
  Trophy,
} from 'lucide-react';
import { Book, BookFormat, BookStatus } from '../../types';
import { getSeasonColorClass, normalizeSeason } from '../../utils';
import { BookCover } from '../ui/BookCover';
import { useI18n } from '../../contexts/I18nContext';
import { MessageKey } from '../../i18n/messages';

interface BookCardV2Props {
  book: Book;
  onOpen: (book: Book) => void;
  reorderMode?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

const FormatIcon: React.FC<{ format: BookFormat }> = ({ format }) => {
  switch (format) {
    case 'Paper':
      return <BookOpen size={14} />;
    case 'Audio':
      return <Headphones size={14} />;
    case 'E-book':
      return <Tablet size={14} />;
    case 'Pirate':
      return <Ghost size={14} />;
    case 'Expected':
      return <Clock size={14} />;
    case 'Sold':
      return <ShoppingCart size={14} />;
    default:
      return null;
  }
};

const StatusIcon: React.FC<{ status: BookStatus; rating?: number }> = ({ status, rating }) => {
  if (status === 'Completed') {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className="w-6 h-6 rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-600 flex items-center justify-center">
          <Trophy size={13} />
        </span>
        {rating && rating > 0 && (
          <span className="text-[9px] font-black text-emerald-600 leading-none">{rating}</span>
        )}
      </div>
    );
  }
  if (status === 'Reading') {
    return (
      <span className="w-6 h-6 rounded-lg border border-amber-100 bg-amber-50 text-amber-600 flex items-center justify-center">
        <BookMarked size={13} />
      </span>
    );
  }
  return (
    <span className="w-6 h-6 rounded-lg border border-gray-200 bg-gray-50 text-gray-500 flex items-center justify-center">
      <Library size={13} />
    </span>
  );
};

export const BookCardV2: React.FC<BookCardV2Props> = ({
  book,
  onOpen,
  reorderMode = false,
  canMoveUp = false,
  canMoveDown = false,
  onMoveUp,
  onMoveDown,
}) => {
  const { t } = useI18n();

  return (
    <div className="w-full bg-white p-4 rounded-3xl shadow-sm border border-gray-100 flex gap-3 items-center">
      <button
        type="button"
        onClick={() => onOpen(book)}
        disabled={reorderMode}
        className="min-w-0 flex-1 text-left flex gap-4 items-center disabled:cursor-default active:scale-[0.99] transition-transform cursor-pointer select-none"
      >
        <div className="w-12 h-16 bg-gray-50 rounded-xl overflow-hidden flex-shrink-0 border border-gray-100">
          <BookCover key={book.id} book={book} className="w-full h-full" iconSize={18} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-bold text-gray-800 text-sm truncate">{book.title}</h3>
          </div>
          <p className="text-[11px] text-gray-500 truncate">{book.author}</p>

          {book.seasons && book.seasons.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {book.seasons.map((season) => (
                <span key={season} className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${getSeasonColorClass(season)}`}>
                  {t(`season.${normalizeSeason(season)}` as MessageKey)}
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2 mt-1.5 items-center min-w-0">
            {book.formats.map((format) => (
              <span key={format} className={format === 'Sold' ? 'text-red-500' : 'text-gray-400'}>
                <FormatIcon format={format} />
              </span>
            ))}

            {book.notes && (
              <span className="text-[13px] leading-none truncate max-w-[110px] text-gray-700">{book.notes}</span>
            )}
          </div>
        </div>
      </button>

      {reorderMode ? (
        <div className="w-8 h-8 flex-shrink-0" />
      ) : (
        <span className="flex-shrink-0" aria-label={`status-${book.status}`}>
          <StatusIcon status={book.status} rating={book.rating} />
        </span>
      )}
    </div>
  );
};
