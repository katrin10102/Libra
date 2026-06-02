
import React, { useState, useEffect } from 'react';
import { Book } from '../../types';
import { BookOpen, Book as BookIcon } from 'lucide-react';

interface BookCoverProps {
  book: Book;
  className?: string;
  iconSize?: number;
}

export const BookCover: React.FC<BookCoverProps> = ({ book, className, iconSize = 24 }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
    setObjectUrl(null); // Clear previous URL immediately
    
    let url: string | null = null;

    if (book.coverBlob) {
      // Create lazy URL only when component mounts
      url = URL.createObjectURL(book.coverBlob);
      setObjectUrl(url);
    } else if (book.coverUrl) {
      // Use external URL directly
      setObjectUrl(book.coverUrl);
    } else {
      setObjectUrl(null);
    }

    // Cleanup memory when component unmounts or book changes
    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [book.coverBlob, book.coverUrl, book.id]);

  if (objectUrl && !hasError) {
    return (
        <img 
            key={`${book.id}-${objectUrl}`}
            src={objectUrl} 
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
