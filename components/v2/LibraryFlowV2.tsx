import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowDownUp, ArrowUp, BarChart2, BookOpen, Filter, Plus, Search, X } from 'lucide-react';
import { Book, BookFormat, BookStatus } from '../../types';
import { getBookPageTotal, SEASON_OPTIONS, getSeasonColorClass, normalizeSeason } from '../../utils';
import { createClientId } from '../../services/id';
import { useLibrary } from '../../contexts/LibraryContext';
import { useUI } from '../../contexts/UIContext';
import { loadSortPrefs, saveSortPrefs } from '../../services/storageService';
import { useI18n } from '../../contexts/I18nContext';
import { MessageKey } from '../../i18n/messages';
import { AddBookV2 } from './AddBookV2';
import { AddWishlistV2 } from './AddWishlistV2';
import { EditBookV2 } from './EditBookV2';
import { BookDetailsV2 } from './BookDetailsV2';
import { BookCardV2 } from './BookCardV2';
import { SortableBookItemV2 } from './SortableBookItemV2';
import { ReadingMode } from '../ReadingMode';
import { BookCover } from '../ui/BookCover';

type V2Tab = 'library' | 'wishlist';
type V2SortKey = 'addedAt' | 'title' | 'author' | 'genre' | 'custom';
type V2SortDirection = 'asc' | 'desc';
const LIBRARY_STATUS_FILTERS: BookStatus[] = ['Reading', 'Unread', 'Completed'];
const LIBRARY_DEFAULT_FORMAT_FILTERS: BookFormat[] = ['Paper', 'E-book', 'Audio', 'Pirate', 'Expected'];
const LIBRARY_ALL_FORMAT_FILTERS: BookFormat[] = ['Paper', 'E-book', 'Audio', 'Pirate', 'Expected', 'Sold'];
const LIBRARY_SORT_PREFS_KEY = 'library_sort_prefs';
const WISHLIST_SORT_PREFS_KEY = 'wishlist_sort_prefs';

const normalizeV2SortKey = (value: unknown): V2SortKey => {
  return value === 'addedAt' || value === 'title' || value === 'author' || value === 'genre' || value === 'custom' ? value : 'addedAt';
};

const normalizeV2SortDirection = (value: unknown): V2SortDirection => {
  return value === 'asc' || value === 'desc' ? value : 'desc';
};

const globalScrollPositions: { library: number; wishlist: number } = { library: 0, wishlist: 0 };

const sameItems = <T extends string>(left: T[], right: T[]): boolean => {
  return left.length === right.length && left.every((item) => right.includes(item));
};

const compareText = (left?: string, right?: string, locale: string = 'en-US'): number => {
  return (left || '').trim().toLowerCase().localeCompare((right || '').trim().toLowerCase(), locale);
};

const compareSeriesPart = (left?: string, right?: string, locale: string = 'en-US'): number => {
  const leftNumber = Number((left || '').replace(',', '.'));
  const rightNumber = Number((right || '').replace(',', '.'));
  const hasLeftNumber = Number.isFinite(leftNumber);
  const hasRightNumber = Number.isFinite(rightNumber);

  if (hasLeftNumber && hasRightNumber) return leftNumber - rightNumber;
  if (hasLeftNumber) return -1;
  if (hasRightNumber) return 1;
  return compareText(left, right, locale);
};

type V2Route =
  | { kind: 'list'; tab: V2Tab }
  | { kind: 'add'; tab: V2Tab }
  | { kind: 'details'; tab: V2Tab; bookId: string }
  | { kind: 'edit'; tab: V2Tab; bookId: string }
  | { kind: 'reading'; tab: V2Tab; bookId: string };

interface LibraryFlowV2Props {
  onNavigateToReading?: () => void;
  onNavigateToStatistics?: () => void;
  onToggleNav?: (hidden: boolean) => void;
}

export const LibraryFlowV2: React.FC<LibraryFlowV2Props> = ({ onNavigateToReading, onNavigateToStatistics, onToggleNav }) => {
  const { t, locale } = useI18n();
  const { books, addBook, updateBook, deleteBook, reorderBooks, filterTag, setFilterTag } = useLibrary();
  const { toast, confirm } = useUI();
  const [route, setRoute] = useState<V2Route>({ kind: 'list', tab: 'library' });

  useEffect(() => {
    if (onToggleNav) {
      const isFullScreen = route.kind === 'details' || route.kind === 'edit' || route.kind === 'reading' || route.kind === 'add';
      onToggleNav(isFullScreen);
    }
  }, [route.kind, onToggleNav]);

  const changeRoute = useCallback((newRoute: V2Route | ((prev: V2Route) => V2Route)) => {
    setRoute((prev) => {
      const nextRoute = typeof newRoute === 'function' ? newRoute(prev) : newRoute;
      if (prev.kind === 'list' && (nextRoute.kind !== 'list' || prev.tab !== nextRoute.tab)) {
        globalScrollPositions[prev.tab] = window.scrollY;
      }
      if (prev.tab !== nextRoute.tab) {
        globalScrollPositions[nextRoute.tab] = 0;
      }
      return nextRoute;
    });
  }, []);

  useEffect(() => {
    if (route.kind === 'list') {
      const savedScroll = globalScrollPositions[route.tab];
      if (savedScroll > 0) {
        setTimeout(() => {
          window.scrollTo(0, savedScroll);
        }, 10);
      } else {
        window.scrollTo(0, 0);
      }
    } else {
      window.scrollTo(0, 0);
    }
  }, [route.kind, route.tab]);

  // Also save scroll position when the component unmounts (e.g. switching main app views)
  const currentRouteRef = useRef(route);
  useEffect(() => {
    currentRouteRef.current = route;
  }, [route]);

  useEffect(() => {
    globalScrollPositions.library = 0;
    globalScrollPositions.wishlist = 0;

    return () => {
      if (currentRouteRef.current.kind === 'list') {
        globalScrollPositions[currentRouteRef.current.tab] = window.scrollY;
      }
    };
  }, []);

  const [showSortPanel, setShowSortPanel] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [searchByTab, setSearchByTab] = useState<{ library: string; wishlist: string }>({
    library: '',
    wishlist: '',
  });
  const [selectedStatuses, setSelectedStatuses] = useState<BookStatus[]>(LIBRARY_STATUS_FILTERS);
  const [selectedFormats, setSelectedFormats] = useState<BookFormat[]>(LIBRARY_DEFAULT_FORMAT_FILTERS);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const [pagesFrom, setPagesFrom] = useState('');
  const [pagesTo, setPagesTo] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (showSearchSuggestions && searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showSearchSuggestions]);

  const [sortKeyByTab, setSortKeyByTab] = useState<{ library: V2SortKey; wishlist: V2SortKey }>(() => {
    const librarySort = loadSortPrefs(LIBRARY_SORT_PREFS_KEY);
    const wishlistSort = loadSortPrefs(WISHLIST_SORT_PREFS_KEY);
    return {
      library: normalizeV2SortKey(librarySort.key),
      wishlist: normalizeV2SortKey(wishlistSort.key),
    };
  });
  const [sortDirectionByTab, setSortDirectionByTab] = useState<{ library: V2SortDirection; wishlist: V2SortDirection }>(() => {
    const librarySort = loadSortPrefs(LIBRARY_SORT_PREFS_KEY);
    const wishlistSort = loadSortPrefs(WISHLIST_SORT_PREFS_KEY);
    return {
      library: normalizeV2SortDirection(librarySort.direction),
      wishlist: normalizeV2SortDirection(wishlistSort.direction),
    };
  });
  const [reorderModeByTab, setReorderModeByTab] = useState<{ library: boolean; wishlist: boolean }>({
    library: false,
    wishlist: false,
  });
  const [isActionBusy, setIsActionBusy] = useState(false);

  // Drag and Drop state
  const [draggingBookId, setDraggingBookId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [indicatorTop, setIndicatorTop] = useState<number | null>(null);
  const draggingBookIdRef = useRef<string | null>(null);
  const dropIndexRef = useRef<number | null>(null);
  const pointerYRef = useRef<number | null>(null);
  const autoScrollRafRef = useRef<number | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const reorderDraftRef = useRef<Book[]>([]);

  const statusLabel = useCallback((status: BookStatus) => t(`status.${status}` as MessageKey), [t]);
  const formatLabel = useCallback((format: BookFormat) => t(`format.${format}` as MessageKey), [t]);

  const libraryBooks = useMemo(() => books.filter((b) => b.status !== 'Wishlist'), [books]);
  const wishlistBooks = useMemo(() => books.filter((b) => b.status === 'Wishlist'), [books]);

  const currentTab = route.tab;
  const search = searchByTab[currentTab];
  const sourceBooks = currentTab === 'library' ? libraryBooks : wishlistBooks;

  const filteredBooksList = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sourceBooks.filter((b) => {
      if (currentTab === 'library') {
        if (selectedStatuses.length > 0 && !selectedStatuses.includes(b.status)) {
          return false;
        }
        if (selectedFormats.length > 0 && !b.formats.some((format) => selectedFormats.includes(format))) {
          return false;
        }
        if (selectedSeason) {
          const bookSeasons = (b.seasons || []).map((s) => normalizeSeason(s));
          if (!bookSeasons.includes(selectedSeason)) {
            return false;
          }
        }
        const fromVal = parseInt(pagesFrom, 10);
        if (!isNaN(fromVal) && (b.pagesTotal || 0) < fromVal) {
          return false;
        }
        const toVal = parseInt(pagesTo, 10);
        if (!isNaN(toVal) && (b.pagesTotal || 0) > toVal) {
          return false;
        }
      }

      if (!q) {
        return true;
      }
      const haystack = [
        b.title,
        b.author,
        b.genre || '',
        b.publisher || '',
        b.series || '',
        b.seriesPart || '',
        b.notes || '',
        b.comment || ''
      ]
        .join(' ')
        .toLowerCase();
      
      const normalizedQ = q.replace(/\uFE0F/g, '');
      const normalizedHaystack = haystack.replace(/\uFE0F/g, '');
      return normalizedHaystack.includes(normalizedQ);
    });
  }, [currentTab, pagesFrom, pagesTo, search, selectedFormats, selectedStatuses, selectedSeason, sourceBooks]);

  const sortedBooks = useMemo(() => {
    const sortKey = sortKeyByTab[currentTab];
    const sortDirection = sortDirectionByTab[currentTab];
    if (sortKey === 'custom') {
      return sortDirection === 'asc' ? [...filteredBooksList] : [...filteredBooksList].reverse();
    }
    const copy = [...filteredBooksList];

    copy.sort((a, b) => {
      if (sortKey === 'addedAt') {
        const aTime = Date.parse(a.addedAt || a.wishlistedAt || '');
        const bTime = Date.parse(b.addedAt || b.wishlistedAt || '');
        return (Number.isFinite(aTime) ? aTime : 0) - (Number.isFinite(bTime) ? bTime : 0);
      }
      if (sortKey === 'author') {
        return compareText(a.author, b.author, locale);
      }
      if (sortKey === 'genre') {
        const hasGenreA = Boolean((a.genre || '').trim());
        const hasGenreB = Boolean((b.genre || '').trim());
        if (hasGenreA !== hasGenreB) {
          return hasGenreA ? -1 : 1;
        }
        const result =
          compareText(a.genre, b.genre, locale) ||
          compareText(a.author, b.author, locale) ||
          compareText(a.series, b.series, locale) ||
          compareSeriesPart(a.seriesPart, b.seriesPart, locale) ||
          compareText(a.title, b.title, locale);
        return sortDirection === 'asc' ? result : -result;
      }
      return compareText(a.title, b.title, locale);
    });

    return sortDirection === 'asc' ? copy : copy.reverse();
  }, [currentTab, filteredBooksList, locale, sortDirectionByTab, sortKeyByTab]);

  const uniquePublishers = useMemo(() => {
    const pubs = new Set<string>();
    sourceBooks.forEach((b) => {
      if (b.publisher && b.publisher.trim()) pubs.add(b.publisher.trim());
    });
    return Array.from(pubs).sort((a, b) => a.localeCompare(b, locale));
  }, [sourceBooks, locale]);

  const uniqueGenres = useMemo(() => {
    const genres = new Set<string>();
    sourceBooks.forEach((b) => {
      const value = (b.genre || '').trim();
      if (value) genres.add(value);
    });
    return Array.from(genres).sort((a, b) => a.localeCompare(b, locale));
  }, [sourceBooks, locale]);

  const openList = useCallback((tab: V2Tab) => {
    changeRoute({ kind: 'list', tab });
  }, [changeRoute]);

  const hasActiveLibraryFilters = useMemo(() => {
    return (
      !sameItems(selectedStatuses, LIBRARY_STATUS_FILTERS) ||
      !sameItems(selectedFormats, LIBRARY_DEFAULT_FORMAT_FILTERS) ||
      selectedSeason !== null ||
      pagesFrom.trim().length > 0 ||
      pagesTo.trim().length > 0
    );
  }, [pagesFrom, pagesTo, selectedFormats, selectedStatuses, selectedSeason]);

  const toggleStatusFilter = useCallback((status: BookStatus) => {
    setSelectedStatuses((prev) => (prev.includes(status) ? prev.filter((item) => item !== status) : [...prev, status]));
  }, []);

  const toggleFormatFilter = useCallback((format: BookFormat) => {
    setSelectedFormats((prev) => (prev.includes(format) ? prev.filter((item) => item !== format) : [...prev, format]));
  }, []);

  const toggleSeasonFilter = useCallback((season: string) => {
    const normalized = normalizeSeason(season);
    setSelectedSeason((prev) => (prev === normalized ? null : normalized));
  }, []);

  const clearFilters = useCallback(() => {
    setSelectedStatuses(LIBRARY_STATUS_FILTERS);
    setSelectedFormats(LIBRARY_DEFAULT_FORMAT_FILTERS);
    setSelectedSeason(null);
    setPagesFrom('');
    setPagesTo('');
  }, []);

  const searchSuggestions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query.length < 2) return [];

    const values = new Set<string>();
    sourceBooks.forEach((book) => {
      const title = (book.title || '').trim();
      const author = (book.author || '').trim();
      const publisher = (book.publisher || '').trim();
      const genre = (book.genre || '').trim();

      if (title && title.toLowerCase().includes(query)) values.add(title);
      if (author && author.toLowerCase().includes(query)) values.add(author);
      if (publisher && publisher.toLowerCase().includes(query)) values.add(publisher);
      if (genre && genre.toLowerCase().includes(query)) values.add(genre);
    });

    return Array.from(values).slice(0, 8);
  }, [search, sourceBooks]);

  const setSearchForCurrentTab = useCallback(
    (value: string) => {
      setSearchByTab((prev) => ({
        ...prev,
        [currentTab]: value,
      }));
      if (currentTab === 'library' && value.trim().length === 0) {
        setFilterTag('');
      }
    },
    [currentTab, setFilterTag]
  );

  const handleSortChange = useCallback(
    (sortKey: Exclude<V2SortKey, 'custom'>) => {
      if (reorderModeByTab[currentTab]) {
        setReorderModeByTab((prev) => ({ ...prev, [currentTab]: false }));
      }
      if (sortKeyByTab[currentTab] === sortKey) {
        setSortDirectionByTab((prev) => ({
          ...prev,
          [currentTab]: prev[currentTab] === 'asc' ? 'desc' : 'asc',
        }));
      } else {
        setSortKeyByTab((prev) => ({
          ...prev,
          [currentTab]: sortKey,
        }));
        setSortDirectionByTab((prev) => ({
          ...prev,
          [currentTab]: sortKey === 'addedAt' ? 'desc' : 'asc',
        }));
      }
    },
    [currentTab, reorderModeByTab, sortKeyByTab]
  );

  const isCustomSort = sortKeyByTab[currentTab] === 'custom';
  const isReorderMode = reorderModeByTab[currentTab] && isCustomSort && search.trim().length === 0;

  useEffect(() => {
    if (isReorderMode) {
      reorderDraftRef.current = sortedBooks;
    }
  }, [isReorderMode, sortedBooks]);

  const EDGE_THRESHOLD_PX = 120;
  const MAX_SCROLL_STEP_PX = 22;

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRafRef.current !== null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  }, []);

  const computeDropFromPointer = useCallback((clientY: number, draggedId: string) => {
    const ordered = reorderDraftRef.current;
    const remaining = ordered.filter((b) => b.id !== draggedId);
    if (remaining.length === 0) {
      setDropIndex(0);
      setIndicatorTop(0);
      return;
    }

    const measured = remaining
      .map((b) => {
        const el = itemRefs.current.get(b.id);
        if (!el) return null;
        return { id: b.id, rect: el.getBoundingClientRect() };
      })
      .filter(Boolean) as { id: string; rect: DOMRect }[];

    if (measured.length === 0) return;

    const GAP_FALLBACK = 12;
    let nextDropIndex = measured.length;
    let nextTop = measured[measured.length - 1].rect.bottom + GAP_FALLBACK / 2;

    for (let i = 0; i < measured.length; i++) {
      const { rect } = measured[i];
      if (clientY < rect.top + rect.height / 2) {
        nextDropIndex = i;
        if (i === 0) {
          nextTop = rect.top - GAP_FALLBACK / 2;
        } else {
          const prevRect = measured[i - 1].rect;
          nextTop = (prevRect.bottom + rect.top) / 2;
        }
        break;
      }
    }

    dropIndexRef.current = nextDropIndex;
    setDropIndex((prev) => (prev === nextDropIndex ? prev : nextDropIndex));
    setIndicatorTop((prev) => (prev === nextTop ? prev : nextTop));
  }, []);

  const autoScrollStep = useCallback(() => {
    const pointerY = pointerYRef.current;
    const draggedId = draggingBookIdRef.current;
    if (pointerY === null || !draggedId) {
      stopAutoScroll();
      return;
    }

    const viewportHeight = window.innerHeight;
    let delta = 0;
    if (pointerY < EDGE_THRESHOLD_PX) {
      const proximity = (EDGE_THRESHOLD_PX - pointerY) / EDGE_THRESHOLD_PX;
      delta = -Math.ceil(MAX_SCROLL_STEP_PX * Math.min(1, proximity));
    } else if (pointerY > viewportHeight - EDGE_THRESHOLD_PX) {
      const proximity = (pointerY - (viewportHeight - EDGE_THRESHOLD_PX)) / EDGE_THRESHOLD_PX;
      delta = Math.ceil(MAX_SCROLL_STEP_PX * Math.min(1, proximity));
    }

    if (delta !== 0) {
      window.scrollBy(0, delta);
      computeDropFromPointer(pointerY, draggedId);
    }

    autoScrollRafRef.current = requestAnimationFrame(autoScrollStep);
  }, [computeDropFromPointer, stopAutoScroll]);

  const commitReorder = useCallback(() => {
    const draftOrder = reorderDraftRef.current;
    if (draftOrder.length === 0) return;
    const currentTabBooks = currentTab === 'library' ? books.filter(b => b.status !== 'Wishlist') : books.filter(b => b.status === 'Wishlist');
    const isSameOrder = draftOrder.length === currentTabBooks.length && draftOrder.every((b, idx) => b.id === currentTabBooks[idx]?.id);
    if (isSameOrder) return;

    const otherTabBooks = currentTab === 'library' ? books.filter(b => b.status === 'Wishlist') : books.filter(b => b.status !== 'Wishlist');
    const newGlobalList = currentTab === 'library' ? [...draftOrder, ...otherTabBooks] : [...otherTabBooks, ...draftOrder];
    
    try {
      reorderBooks(newGlobalList);
    } catch (error) {
      console.error(error);
      toast.show(t('library.failedReorder'), 'error');
    }
  }, [books, currentTab, reorderBooks, t, toast]);

  const finishDrag = useCallback(() => {
    const draggedId = draggingBookIdRef.current;
    const targetIndex = dropIndexRef.current;

    if (draggedId !== null && targetIndex !== null) {
      const current = reorderDraftRef.current;
      const draggedBook = current.find((b) => b.id === draggedId);
      if (draggedBook) {
        const withoutDragged = current.filter((b) => b.id !== draggedId);
        const safeIndex = Math.max(0, Math.min(targetIndex, withoutDragged.length));
        const nextOrder = [
          ...withoutDragged.slice(0, safeIndex),
          draggedBook,
          ...withoutDragged.slice(safeIndex),
        ];
        reorderDraftRef.current = nextOrder;
        commitReorder();
      }
    }

    draggingBookIdRef.current = null;
    pointerYRef.current = null;
    setDraggingBookId(null);
    setDropIndex(null);
    dropIndexRef.current = null;
    setIndicatorTop(null);
    window.removeEventListener('pointermove', handleGlobalPointerMove);
    window.removeEventListener('pointerup', finishDrag);
    stopAutoScroll();
  }, [commitReorder, stopAutoScroll]);

  const handleGlobalPointerMove = useCallback((event: PointerEvent) => {
    const draggedId = draggingBookIdRef.current;
    if (!draggedId) return;
    pointerYRef.current = event.clientY;
    computeDropFromPointer(event.clientY, draggedId);
  }, [computeDropFromPointer]);

  const startDragFromHandle = useCallback((event: React.PointerEvent<HTMLDivElement>, itemId: string) => {
    if (!isReorderMode) return;
    event.preventDefault();
    event.stopPropagation();
    draggingBookIdRef.current = itemId;
    pointerYRef.current = event.clientY;
    setDraggingBookId(itemId);
    computeDropFromPointer(event.clientY, itemId);
    window.addEventListener('pointermove', handleGlobalPointerMove, { passive: true });
    window.addEventListener('pointerup', finishDrag);
    if (autoScrollRafRef.current === null) {
      autoScrollRafRef.current = requestAnimationFrame(autoScrollStep);
    }
  }, [autoScrollStep, computeDropFromPointer, finishDrag, handleGlobalPointerMove, isReorderMode]);

  const setItemRef = useCallback((itemId: string, el: HTMLDivElement | null) => {
    if (el) {
      itemRefs.current.set(itemId, el);
    } else {
      itemRefs.current.delete(itemId);
    }
  }, []);

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', finishDrag);
      stopAutoScroll();
    };
  }, [finishDrag, handleGlobalPointerMove, stopAutoScroll]);

  const toggleReorderMode = useCallback(() => {
    if (search.trim().length > 0) {
      setSearchByTab((prev) => ({ ...prev, [currentTab]: '' }));
    }
    if (currentTab === 'library' && hasActiveLibraryFilters) {
      clearFilters();
    }
    setSortKeyByTab((prev) => ({
      ...prev,
      [currentTab]: 'custom',
    }));
    setSortDirectionByTab((prev) => ({
      ...prev,
      [currentTab]: 'asc',
    }));
    setReorderModeByTab((prev) => ({
      ...prev,
      [currentTab]: !prev[currentTab],
    }));
  }, [clearFilters, currentTab, hasActiveLibraryFilters, search]);

  const moveBookInTab = useCallback(
    (bookId: string, direction: 'up' | 'down') => {
      if (isActionBusy) return;
      const tabBooks = currentTab === 'library' ? books.filter((b) => b.status !== 'Wishlist') : books.filter((b) => b.status === 'Wishlist');
      const index = tabBooks.findIndex((book) => book.id === bookId);
      if (index < 0) return;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= tabBooks.length) return;

      const nextTabBooks = [...tabBooks];
      [nextTabBooks[index], nextTabBooks[targetIndex]] = [nextTabBooks[targetIndex], nextTabBooks[index]];

      const nextGlobalBooks =
        currentTab === 'library'
          ? [...nextTabBooks, ...books.filter((b) => b.status === 'Wishlist')]
          : [...books.filter((b) => b.status !== 'Wishlist'), ...nextTabBooks];

      try {
        reorderBooks(nextGlobalBooks);
      } catch (error) {
        console.error(error);
        toast.show(t('library.failedReorder'), 'error');
      }
    },
    [books, currentTab, isActionBusy, reorderBooks, t, toast]
  );

  useEffect(() => {
    if (search.trim().length === 0) return;
    if (!reorderModeByTab[currentTab]) return;
    setReorderModeByTab((prev) => ({ ...prev, [currentTab]: false }));
  }, [currentTab, reorderModeByTab, search]);

  useEffect(() => {
    if (!hasActiveLibraryFilters) return;
    if (!reorderModeByTab.library) return;
    setReorderModeByTab((prev) => ({ ...prev, library: false }));
  }, [hasActiveLibraryFilters, reorderModeByTab.library]);

  useEffect(() => {
    if (sortKeyByTab[currentTab] === 'custom') return;
    if (!reorderModeByTab[currentTab]) return;
    setReorderModeByTab((prev) => ({ ...prev, [currentTab]: false }));
  }, [currentTab, reorderModeByTab, sortKeyByTab]);

  useEffect(() => {
    if (currentTab === 'library') return;
    setShowSortPanel(false);
    setShowFilters(false);
    setShowSearchSuggestions(false);
  }, [currentTab]);

  useEffect(() => {
    const normalized = filterTag.trim();
    if (!normalized) return;

    changeRoute((prev) => (prev.kind === 'list' && prev.tab === 'library' ? prev : { kind: 'list', tab: 'library' }));
    setSearchByTab((prev) => (prev.library === normalized ? prev : { ...prev, library: normalized }));
  }, [filterTag]);

  useEffect(() => {
    saveSortPrefs(LIBRARY_SORT_PREFS_KEY, sortKeyByTab.library, sortDirectionByTab.library);
  }, [sortDirectionByTab.library, sortKeyByTab.library]);

  useEffect(() => {
    saveSortPrefs(WISHLIST_SORT_PREFS_KEY, sortKeyByTab.wishlist, sortDirectionByTab.wishlist);
  }, [sortDirectionByTab.wishlist, sortKeyByTab.wishlist]);

  const handleSaveInEdit = useCallback(
    (updatedBook: Book, tab: V2Tab) => {
      if (isActionBusy) return;
      setIsActionBusy(true);
      let finalBook = { ...updatedBook };
      if (finalBook.status === 'Completed') {
        if (!finalBook.completedAt) {
          finalBook.completedAt = new Date().toISOString();
        }
        const totalPages = getBookPageTotal(finalBook);
        if ((!finalBook.pagesRead || finalBook.pagesRead < totalPages) && totalPages > 0) {
          finalBook.pagesRead = totalPages;
        }
        if ((!finalBook.sessions || finalBook.sessions.length === 0) && totalPages > 0) {
          const durationSeconds = Math.round(totalPages * 72);
          const dateStr = finalBook.completedAt.split('T')[0];
          finalBook.sessions = [
            {
              id: createClientId(),
              date: dateStr,
              duration: durationSeconds,
              pages: totalPages,
            },
          ];
        }
      }
      try {
        updateBook(finalBook);
        changeRoute({ kind: 'details', tab, bookId: finalBook.id });
        toast.show(t('library.saved'), 'success');
      } catch (error) {
        console.error(error);
        toast.show(t('library.failedSave'), 'error');
      } finally {
        setIsActionBusy(false);
      }
    },
    [isActionBusy, t, toast, updateBook]
  );

  if (route.kind === 'add') {
    if (route.tab === 'library') {
      return (
        <AddBookV2
          publisherSuggestions={uniquePublishers}
          genreSuggestions={uniqueGenres}
          onAdd={(book) => {
            if (isActionBusy) return;
            setIsActionBusy(true);
            try {
              addBook(book);
              toast.show(t('library.bookAdded'), 'success');
              openList('library');
            } catch (error) {
              console.error(error);
              toast.show(t('library.failedAddBook'), 'error');
            } finally {
              setIsActionBusy(false);
            }
          }}
          onCancel={() => openList('library')}
        />
      );
    }
    return (
      <AddWishlistV2
        onAdd={(book) => {
          if (isActionBusy) return;
          setIsActionBusy(true);
          try {
            addBook(book);
            toast.show(t('library.wishlistAdded'), 'success');
            openList('wishlist');
          } catch (error) {
            console.error(error);
            toast.show(t('library.failedAddWishlist'), 'error');
          } finally {
            setIsActionBusy(false);
          }
        }}
        onCancel={() => openList('wishlist')}
      />
    );
  }

  if (route.kind === 'details') {
    const liveBook = books.find((b) => b.id === route.bookId);
    if (!liveBook) {
      return (
        <div className="p-4 pb-8 text-gray-800">
          <p className="text-sm text-gray-500">{t('library.bookNotFound')}</p>
          <button className="mt-3 px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold" onClick={() => openList(route.tab)}>
            {t('common.back')}
          </button>
        </div>
      );
    }

    return (
      <BookDetailsV2
          book={liveBook}
          onBack={() => openList(route.tab)}
          onOpenReadingMode={() => changeRoute({ kind: 'reading', tab: route.tab, bookId: liveBook.id })}
          onEdit={() => changeRoute({ kind: 'edit', tab: route.tab, bookId: liveBook.id })}
          onTagClick={(tag) => {
            const normalized = (tag || '').trim();
            if (!normalized) return;
            setFilterTag(normalized);
            changeRoute({ kind: 'list', tab: 'library' });
          }}
          onDelete={() => {
            if (isActionBusy) return;
            void (async () => {
              const ok = await confirm({
                title: t('library.deleteTitle'),
                message: t('library.deleteMessage', { title: liveBook.title }),
                type: 'danger',
                confirmText: t('common.delete'),
                cancelText: t('common.cancel'),
              });
              if (!ok) return;
              setIsActionBusy(true);
              try {
                deleteBook(liveBook.id);
                toast.show(t('library.bookDeleted'), 'success');
                openList(route.tab);
              } catch (error) {
                console.error(error);
                toast.show(t('library.failedDelete'), 'error');
              } finally {
                setIsActionBusy(false);
              }
            })();
          }}
          onStartReadingWishlist={() => {
            if (isActionBusy) return;
            setIsActionBusy(true);
            try {
              updateBook({
                ...liveBook,
                status: 'Unread',
              });
              toast.show(t('library.bookAdded'), 'success');
              openList('library');
            } catch (error) {
              console.error(error);
              toast.show(t('library.failedUpdateStatus'), 'error');
            } finally {
              setIsActionBusy(false);
            }
          }}
          isBusy={isActionBusy}
      />
    );
  }

  if (route.kind === 'reading') {
    const liveBook = books.find((b) => b.id === route.bookId);
    if (!liveBook) {
      return (
        <div className="p-4 pb-8 text-gray-800">
          <p className="text-sm text-gray-500">{t('library.bookNotFound')}</p>
          <button className="mt-3 px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold" onClick={() => openList(route.tab)}>
            {t('common.back')}
          </button>
        </div>
      );
    }

    return <ReadingMode book={liveBook} onClose={() => changeRoute({ kind: 'details', tab: route.tab, bookId: liveBook.id })} />;
  }

  if (route.kind === 'edit') {
    const liveBook = books.find((b) => b.id === route.bookId);
    if (!liveBook) {
      return (
        <div className="p-4 pb-8 text-gray-800">
          <p className="text-sm text-gray-500">{t('library.bookNotFound')}</p>
          <button className="mt-3 px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold" onClick={() => openList(route.tab)}>
            {t('common.back')}
          </button>
        </div>
      );
    }

    return (
      <EditBookV2
          book={liveBook}
          onCancel={() => changeRoute({ kind: 'details', tab: route.tab, bookId: liveBook.id })}
          onSave={(book) => handleSaveInEdit(book, route.tab)}
          publisherSuggestions={uniquePublishers}
          genreSuggestions={uniqueGenres}
      />
    );
  }

  return (
    <div className="px-4 pb-24 text-gray-800 space-y-4">
      <div className="sticky top-0 z-30 -mx-4 px-4 pt-4 pb-2 bg-slate-50/95 backdrop-blur-sm border-b border-gray-100 space-y-4">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => openList('library')}
              className={`text-3xl font-bold transition-colors ${currentTab === 'library' ? 'text-gray-800' : 'text-gray-300'}`}
            >
              {t('library.tab.library')}
            </button>
            <button
              onClick={() => openList('wishlist')}
              className={`text-3xl font-bold transition-colors ${currentTab === 'wishlist' ? 'text-gray-800' : 'text-gray-300'}`}
            >
              {t('library.tab.wishlist')}
            </button>
          </div>
          <button
            onClick={onNavigateToStatistics}
            className="w-10 h-10 rounded-xl bg-white border border-gray-100 shadow-sm flex items-center justify-center text-indigo-600 hover:bg-gray-50/50 transition-all active:scale-95"
            title={t('nav.statistics')}
          >
            <BookOpen size={20} />
          </button>
        </header>

        <div className="flex gap-2 h-12">
          <button
            onClick={() => changeRoute({ kind: 'add', tab: currentTab })}
            className="h-12 w-12 flex-shrink-0 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200 active:scale-95 transition-all"
            title={currentTab === 'library' ? t('library.addBook') : t('library.addWishlist')}
          >
            <Plus size={24} />
          </button>
          <div ref={searchRef} className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder={t('library.searchPlaceholder')}
              className="w-full h-full pl-10 pr-10 bg-white rounded-xl border-none shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium"
              value={search}
              onChange={(e) => {
                setSearchForCurrentTab(e.target.value);
                setShowSearchSuggestions(true);
              }}
              onFocus={() => setShowSearchSuggestions(true)}
            />
            {search.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSearchForCurrentTab('');
                  setShowSearchSuggestions(false);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1.5"
                aria-label={t('library.clearSearch')}
              >
                <X size={16} />
              </button>
            )}
            {showSearchSuggestions && searchSuggestions.length > 0 && (
              <div
                className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl z-50 overflow-hidden border border-gray-100 max-h-48 overflow-y-auto overscroll-contain"
                style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
              >
                {searchSuggestions.map((item) => (
                  <button
                    key={`${currentTab}-${item}`}
                    type="button"
                    onClick={() => {
                      setSearchForCurrentTab(item);
                      setShowSearchSuggestions(false);
                    }}
                    className="w-full text-left px-4 py-3 text-xs font-bold text-gray-700 hover:bg-gray-50 border-b border-gray-50 last:border-none"
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setShowSortPanel((prev) => !prev);
              setShowFilters(false);
            }}
            className={`relative h-12 w-12 flex-shrink-0 border rounded-xl flex items-center justify-center shadow-sm active:scale-95 transition-all ${
              showSortPanel ? 'bg-white text-indigo-600 border-indigo-200' : 'bg-white text-gray-400 border-gray-100'
            }`}
            title={t('library.sort')}
          >
            <ArrowDownUp size={20} />
          </button>
          {currentTab === 'library' && (
            <button
              type="button"
              onClick={() => {
                setShowFilters((prev) => !prev);
                setShowSortPanel(false);
              }}
              className={`relative h-12 w-12 flex-shrink-0 border rounded-xl flex items-center justify-center shadow-sm active:scale-95 transition-all ${
                showFilters || hasActiveLibraryFilters ? 'bg-white text-indigo-600 border-indigo-200' : 'bg-white text-gray-400 border-gray-100'
              }`}
              title={t('library.filters')}
            >
              <Filter size={20} />
              {hasActiveLibraryFilters && !showFilters && <div className="absolute top-3 right-3 w-2 h-2 bg-indigo-600 rounded-full border border-white" />}
            </button>
          )}
        </div>
        {showSortPanel && (
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-4">
            <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest ml-1">{t('sort.sortBy')}</h3>
            <div className="grid grid-cols-3 gap-2">
              {(['title', 'author', 'addedAt', 'genre'] as Exclude<V2SortKey, 'custom'>[]).map((key) => {
                const isActive = sortKeyByTab[currentTab] === key && !isReorderMode;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleSortChange(key)}
                    className={`py-2.5 rounded-xl font-bold text-xs transition-all border flex items-center justify-center gap-1.5 ${
                      isActive ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-gray-50 text-gray-400 border-gray-100 hover:bg-gray-100/50'
                    }`}
                  >
                    <span>{key === 'title' ? t('sort.title') : key === 'author' ? t('sort.author') : key === 'addedAt' ? t('sort.date') : t('sort.genre')}</span>
                    {isActive && (sortDirectionByTab[currentTab] === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={toggleReorderMode}
                disabled={sortedBooks.length < 2}
                className={`py-2.5 rounded-xl font-bold text-xs transition-all border ${
                  isReorderMode || sortKeyByTab[currentTab] === 'custom'
                    ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
                    : 'bg-gray-50 text-gray-400 border-gray-100 hover:bg-gray-100/50'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {t('sort.customOrder')}
              </button>
            </div>
          </div>
        )}
        {isCustomSort && search.trim().length > 0 && (
          <div className="text-[11px] text-gray-500">{t('library.reorder.clearSearch')}</div>
        )}
        {currentTab === 'library' && isCustomSort && hasActiveLibraryFilters && (
          <div className="text-[11px] text-gray-500">{t('library.reorder.clearFilters')}</div>
        )}
        {currentTab === 'library' && showFilters && (
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-4">
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('library.filter.status')}</div>
              <div className="flex flex-wrap gap-2">
                {LIBRARY_STATUS_FILTERS.map((status) => {
                  const active = selectedStatuses.includes(status);
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => toggleStatusFilter(status)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                        active ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-gray-50 text-gray-400 border-gray-100'
                      }`}
                    >
                      {statusLabel(status)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('library.filter.format')}</div>
              <div className="flex flex-wrap gap-2">
                {LIBRARY_ALL_FORMAT_FILTERS.map((format) => {
                  const active = selectedFormats.includes(format);
                  return (
                    <button
                      key={format}
                      type="button"
                      onClick={() => toggleFormatFilter(format)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                        active ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-gray-50 text-gray-400 border-gray-100'
                      }`}
                    >
                      {formatLabel(format)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('library.filter.season')}</div>
              <div className="flex flex-wrap gap-2">
                {SEASON_OPTIONS.map((season) => {
                  const normalized = normalizeSeason(season);
                  const active = selectedSeason === normalized;
                  return (
                    <button
                      key={normalized}
                      type="button"
                      onClick={() => toggleSeasonFilter(normalized)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                        active ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-gray-50 text-gray-400 border-gray-100'
                      }`}
                    >
                      {t(`season.${normalized}` as MessageKey)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('library.filter.pages')}</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-gray-400 uppercase ml-1">{t('library.filter.pagesFrom')}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={pagesFrom}
                    onChange={(e) => setPagesFrom(e.target.value)}
                    placeholder="0"
                    className="w-full bg-gray-50 px-3 py-2.5 rounded-xl text-xs font-bold border border-gray-100 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-gray-400 uppercase ml-1">{t('library.filter.pagesTo')}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={pagesTo}
                    onChange={(e) => setPagesTo(e.target.value)}
                    placeholder="9999"
                    className="w-full bg-gray-50 px-3 py-2.5 rounded-xl text-xs font-bold border border-gray-100 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            {hasActiveLibraryFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="w-full py-3 flex items-center justify-center gap-2 text-sm font-bold text-red-500 bg-red-50 rounded-2xl hover:bg-red-100 transition-colors"
              >
                <X size={18} />
                <span>{t('library.clearFilters')}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {sortedBooks.length === 0 ? (
        <div className="py-8 text-sm text-gray-500">{t('library.empty')}</div>
      ) : (
        <div className="space-y-3 relative">
          {sortedBooks.map((book, index) => (
            <SortableBookItemV2
              key={book.id}
              itemId={book.id}
              showHandle={isReorderMode}
              isDragging={draggingBookId === book.id}
              onHandlePointerDown={startDragFromHandle}
              setItemRef={setItemRef}
            >
              <BookCardV2
                book={book}
                onOpen={(selectedBook) =>
                  changeRoute({
                    kind: 'details',
                    tab: currentTab,
                    bookId: selectedBook.id,
                  })
                }
                reorderMode={isReorderMode}
              />
            </SortableBookItemV2>
          ))}
          {draggingBookId && indicatorTop !== null && (
            <div
              className="pointer-events-none fixed z-40 h-1.5 rounded-full"
              style={{
                left: '1.25rem',
                right: '1.25rem',
                top: `${Math.round(indicatorTop)}px`,
                transform: 'translateY(calc(-50% - 12px))',
                backgroundColor: 'var(--accent-600)',
                boxShadow: '0 0 0 3px var(--bg-main), 0 0 12px var(--accent-600)',
              }}
            />
          )}
        </div>
      )}
    </div>
  );
};
