import React from 'react';
import { useI18n } from '../../contexts/I18nContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { Book } from '../../types';
import { BookFormV2 } from './BookFormV2';
import { getBookPageTotal, getEffectiveAverageSecondsPerPage, getLocalDateString, normalizeDateToYMD } from '../../utils';
import { createClientId } from '../../services/id';

interface EditBookV2Props {
  book: Book;
  publisherSuggestions: string[];
  genreSuggestions: string[];
  onSave: (book: Book) => void;
  onCancel: () => void;
}

export const EditBookV2: React.FC<EditBookV2Props> = ({
  book,
  publisherSuggestions,
  genreSuggestions,
  onSave,
  onCancel,
}) => {
  const { t } = useI18n();
  const { books } = useLibrary();

  return (
    <BookFormV2
      title={t('bookForm.editBookTitle')}
      submitLabel={t('bookForm.saveSubmit')}
      initialValue={book}
      publisherSuggestions={publisherSuggestions}
      genreSuggestions={genreSuggestions}
      allowedStatuses={['Unread', 'Reading', 'Completed', 'Wishlist']}
      onCancel={onCancel}
      onSubmit={(value) => {
        const merged: Book = {
          ...book,
          ...value,
          id: book.id,
          addedAt: value.addedAt ?? book.addedAt,
          wishlistedAt: value.wishlistedAt ?? book.wishlistedAt,
          sessions: value.sessions || book.sessions || [],
          updatedAt: new Date().toISOString(),
        };

        // Auto-calculate sessions if moving to completed
        if (merged.status === 'Completed') {
          if (!merged.completedAt) {
             merged.completedAt = new Date().toISOString();
          }
          if (!merged.readingStartedAt) {
             merged.readingStartedAt = merged.completedAt;
          }
          const targetDateStr = normalizeDateToYMD(merged.completedAt) || getLocalDateString();
          const currentCycle = merged.currentCycleIndex || 0;
          const otherCycleDates = (merged.completedDates || []).filter(
            (d) => normalizeDateToYMD(d) !== targetDateStr
          );
          merged.completedDates = [...otherCycleDates, merged.completedAt];
          const totalPages = getBookPageTotal(merged);
          
          // Calculate already read pages from existing sessions
          const existingSessions = merged.sessions || [];
          const currentCycleSessions = existingSessions.filter(s => (s.cycleIndex || 0) === currentCycle);
          const readPages = currentCycleSessions.reduce((acc, s) => acc + (Number(s.pages) || 0), 0);
          
          // If there are remaining pages, add a final session
          if (readPages < totalPages && totalPages > 0) {
              const remainingPages = totalPages - readPages;
              const avgSecondsPerPage = getEffectiveAverageSecondsPerPage(book, books);
              const durationSeconds = Math.round(remainingPages * avgSecondsPerPage);
              
              merged.sessions = [
                  ...existingSessions,
                  {
                      id: createClientId(),
                      date: targetDateStr,
                      duration: durationSeconds,
                      pages: remainingPages,
                      format: merged.selectedReadingFormat || merged.formats[0] || 'Paper',
                      cycleIndex: currentCycle,
                  }
              ];
          } else if (currentCycleSessions.length > 0) {
              const lastSession = currentCycleSessions[currentCycleSessions.length - 1];
              if (lastSession.date !== targetDateStr) {
                merged.sessions = existingSessions.map(s => s.id === lastSession.id ? { ...s, date: targetDateStr } : s);
              }
          }
          
          // Ensure pagesRead matches total
          if ((!merged.pagesRead || merged.pagesRead < totalPages) && totalPages > 0) {
             merged.pagesRead = totalPages;
          }
        }

        onSave(merged);
      }}
    />
  );
};

