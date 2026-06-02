import React from 'react';
import { useI18n } from '../../contexts/I18nContext';
import { Book } from '../../types';
import { BookFormV2 } from './BookFormV2';
import { getBookPageTotal } from '../../utils';
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
          const totalPages = getBookPageTotal(merged);
          
          // Calculate already read pages from existing sessions
          const existingSessions = merged.sessions || [];
          const readPages = existingSessions.reduce((acc, s) => acc + s.pages, 0);
          
          // If there are remaining pages, add a final session
          if (readPages < totalPages && totalPages > 0) {
              const remainingPages = totalPages - readPages;
              const durationSeconds = Math.round(remainingPages * 72); // 50 pages/hour = 72 seconds/page
              const dateStr = merged.completedAt.split('T')[0];
              
              merged.sessions = [
                  ...existingSessions,
                  {
                      id: createClientId(),
                      date: dateStr,
                      duration: durationSeconds,
                      pages: remainingPages
                  }
              ];
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
