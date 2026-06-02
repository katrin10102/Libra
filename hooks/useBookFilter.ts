
import { useState, useMemo } from 'react';
import { Book, BookFormat, BookStatus } from '../types';

export const useBookFilter = (
  books: Book[], 
  initialStatuses: BookStatus[] = [], 
  initialFormats: BookFormat[] = []
) => {
  const [search, setSearch] = useState('');
  const [publisherFilter, setPublisherFilter] = useState('');
  const [genreFilter, setGenreFilter] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<BookStatus[]>(initialStatuses);
  const [selectedFormats, setSelectedFormats] = useState<BookFormat[]>(initialFormats);

  const filteredBooks = useMemo(() => {
    return books.filter(b => {
      // 1. Status Filter (Strict: if statuses are selected, book must match one)
      if (selectedStatuses.length > 0 && !selectedStatuses.includes(b.status)) {
         return false;
      }

      // 2. Format Filter
      if (selectedFormats.length > 0 && !b.formats.some(f => selectedFormats.includes(f))) {
         return false;
      }

      // 3. Search Filter
      if (search) {
         const s = search.toLowerCase();
         const matchSearch = 
            b.title.toLowerCase().includes(s) || 
            b.author.toLowerCase().includes(s) || 
            (b.publisher?.toLowerCase().includes(s)) || 
            (b.genre?.toLowerCase().includes(s)) ||
            (b.series?.toLowerCase().includes(s)) ||
            (b.seriesPart?.toLowerCase().includes(s));
         if (!matchSearch) return false;
      }

      // 4. Publisher Filter
      if (publisherFilter.trim()) {
        const s = publisherFilter.toLowerCase().trim();
        if (!(b.publisher || '').toLowerCase().includes(s)) return false;
      }

      // 5. Genre Filter
      if (genreFilter.trim()) {
        const s = genreFilter.toLowerCase().trim();
        if (!(b.genre || '').toLowerCase().includes(s)) return false;
      }

      return true;
    });
  }, [books, search, selectedStatuses, selectedFormats, publisherFilter, genreFilter]);

  const toggleStatusFilter = (status: BookStatus) => {
    setSelectedStatuses(prev => 
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  const toggleFormatFilter = (format: BookFormat) => {
    setSelectedFormats(prev => 
      prev.includes(format) ? prev.filter(f => f !== format) : [...prev, format]
    );
  };
  
  const clearFilters = () => {
      setSearch('');
      setPublisherFilter('');
      setGenreFilter('');
      setSelectedStatuses(initialStatuses);
      setSelectedFormats(initialFormats);
  };

  return {
    filteredBooks,
    search,
    setSearch,
    publisherFilter,
    setPublisherFilter,
    genreFilter,
    setGenreFilter,
    selectedStatuses,
    setSelectedStatuses,
    selectedFormats,
    setSelectedFormats,
    toggleStatusFilter,
    toggleFormatFilter,
    clearFilters
  };
};
