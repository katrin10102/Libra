
import { useState, useEffect, useRef, useMemo } from 'react';

export const useInfiniteScroll = <T,>(
    items: T[], 
    batchSize: number = 20, 
    resetDeps: any[] = [] // New argument to control when to reset
) => {
  const [limit, setLimit] = useState(batchSize);
  const observerTarget = useRef<HTMLDivElement>(null);

  // Reset limit ONLY when specific dependencies change (sort, filter, search),
  // NOT when the items array simply updates (e.g. editing a book).
  useEffect(() => {
    setLimit(batchSize);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchSize, ...resetDeps]);

  const visibleItems = useMemo(() => items.slice(0, limit), [items, limit]);
  const hasMore = limit < items.length;

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          setLimit((prev) => Math.min(prev + batchSize, items.length));
        }
      },
      { threshold: 0.1, rootMargin: '300px' } // Increased margin for smoother scrolling
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  // Re-subscribe observer when reset dependencies change (e.g. exiting reorder mode),
  // otherwise target can be re-mounted without a fresh observer subscription.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, items.length, batchSize, ...resetDeps]);

  return { visibleItems, observerTarget, hasMore };
};
