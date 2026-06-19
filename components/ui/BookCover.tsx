
import React, { useState, useEffect } from 'react';
import { Book } from '../../types';
import { BookOpen, Book as BookIcon } from 'lucide-react';

interface BookCoverProps {
  book: Book;
  className?: string;
  iconSize?: number;
}

export const BookCover: React.FC<BookCoverProps> = ({ book, className, iconSize = 24 }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
    if (!book.coverBlob) {
      setBlobUrl(null);
      return;
    }

    const url = URL.createObjectURL(book.coverBlob);
    setBlobUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [book.coverBlob, book.id]);

  const effectiveUrl = book.coverBlob ? blobUrl : (book.coverUrl || null);

  if (effectiveUrl && !hasError) {
    return (
        <img 
            key={`${book.id}-${effectiveUrl}`}
            src={effectiveUrl} 
            className={`object-cover ${className}`} 
            alt={book.title} 
            loading="lazy" 
            referrerPolicy="no-referrer"
            onError={() => setHasError(true)}
        />
    );
  }

  return (
    <div className={`flex items-center justify-center bg-gray-50 text-gray-300 ${className}`}>
       <BookIcon size={iconSize} />
    </div>
  );
};
