import React from 'react';
import { useI18n } from '../../contexts/I18nContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { Book, BookStatus } from '../../types';
import { createClientId } from '../../services/id';
import { BookFormV2 } from './BookFormV2';
import { getBookPageTotal, getEffectiveAverageSecondsPerPage, getLocalDateString, normalizeDateToYMD } from '../../utils';

interface AddBookV2Props {
  publisherSuggestions: string[];
  genreSuggestions: string[];
  onAdd: (book: Book) => void;
  onCancel: () => void;
}

export const AddBookV2: React.FC<AddBookV2Props> = ({
  publisherSuggestions,
  genreSuggestions,
  onAdd,
  onCancel,
}) => {
  const { t } = useI18n();
  const { books } = useLibrary();

  return (
    <BookFormV2
      title={t('bookForm.addBookTitle')}
      submitLabel={t('bookForm.addBookSubmit')}
      initialValue={{
        status: 'Unread',
        formats: ['Paper'],
        seasons: [],
      }}
      publisherSuggestions={publisherSuggestions}
      genreSuggestions={genreSuggestions}
      allowedStatuses={['Unread', 'Reading', 'Completed', 'Wishlist']}
      onCancel={onCancel}
      onSubmit={(value) => {
        const nowIso = new Date().toISOString();
        const status = (value.status || 'Unread') as BookStatus;
        const pagesTotal = Math.max(0, Number(value.pagesTotal) || 0);
        const isCompleted = status === 'Completed';
        const isReading = status === 'Reading';
        const completedAtValue = isCompleted ? (value.completedAt || nowIso) : undefined;
        const completedDatesValue = isCompleted 
          ? (value.completedDates && value.completedDates.length > 0 ? value.completedDates : (completedAtValue ? [completedAtValue] : [nowIso]))
          : undefined;

        const book: Book = {
          id: createClientId(),
          title: value.title || '',
          author: value.author || '',
          formats: value.formats || ['Paper'],
          status,
          isbn: value.isbn || '',
          genre: value.genre || '',
          seasons: value.seasons || [],
          publisher: value.publisher || '',
          series: value.series || '',
          seriesPart: value.seriesPart || '',
          coverUrl: value.coverUrl || '',
          coverBlob: value.coverBlob,
          pagesTotal,
          pagesRead: isCompleted ? pagesTotal : 0,
          notes: value.notes || '',
          comment: value.comment || '',
          rating: value.rating,
          addedAt: status === 'Wishlist' ? '' : (value.addedAt || nowIso),
          wishlistedAt: status === 'Wishlist' ? (value.wishlistedAt || nowIso) : undefined,
          readingStartedAt: isReading || isCompleted ? (value.readingStartedAt || completedAtValue || nowIso) : undefined,
          completedAt: completedAtValue,
          completedDates: completedDatesValue,
          selectedReadingFormat: value.selectedReadingFormat,
          readingPagesTotal: value.readingPagesTotal,
          sessions: [],
        };

        if (isCompleted) {
          const totalPages = getBookPageTotal(book);
          if (totalPages > 0) {
            const avgSecondsPerPage = getEffectiveAverageSecondsPerPage(book, books);
            const durationSeconds = Math.round(totalPages * avgSecondsPerPage);
            const dateStr = normalizeDateToYMD(completedAtValue) || getLocalDateString();
            book.sessions = [
              {
                id: createClientId(),
                date: dateStr,
                duration: durationSeconds,
                pages: totalPages,
                format: book.selectedReadingFormat || book.formats[0] || 'Paper',
                cycleIndex: 0,
              },
            ];
          }
        }

        onAdd(book);
      }}
    />
  );
};

