type CoverSource = 'google' | 'openlibrary' | 'itunes';

interface CoverCandidate {
  url: string;
  title: string;
  author: string;
  source: CoverSource;
}

interface KnownGoogleCoverOverride {
  title: string;
  author: string;
  volumeId: string;
}

const MAX_CACHE_SIZE = 100;
const coverSearchCache = new Map<string, string>();

const setCache = (key: string, value: string) => {
  if (coverSearchCache.size >= MAX_CACHE_SIZE) {
    const firstKey = coverSearchCache.keys().next().value;
    if (firstKey) coverSearchCache.delete(firstKey);
  }
  coverSearchCache.set(key, value);
};
let googleBlockedUntil = 0;

const normalizeQueryPart = (value: string): string => value.replace(/\s+/g, ' ').trim();

const normalizeSearchText = (value: string): string =>
  normalizeQueryPart(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ');

const tokenize = (value: string): string[] => {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];
  return normalized.split(/\s+/).filter(Boolean);
};

const tokenOverlapScore = (query: string, candidate: string): number => {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return 0;
  const candidateSet = new Set(tokenize(candidate));
  if (candidateSet.size === 0) return 0;
  let hits = 0;
  for (const token of queryTokens) {
    if (candidateSet.has(token)) hits += 1;
  }
  return hits / queryTokens.length;
};

const buildGoogleBooksCoverUrl = (volumeId: string): string =>
  `https://books.google.com/books/content?id=${encodeURIComponent(volumeId)}&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api`;

const KNOWN_GOOGLE_COVER_OVERRIDES: KnownGoogleCoverOverride[] = [
  {
    title: '\u0411\u0435\u0437\u0441\u0435\u0440\u0434\u0435\u0447\u043d\u0430',
    author: '\u041c\u0430\u0440\u0456\u0441\u0441\u0430 \u041c\u0430\u0454\u0440',
    volumeId: 'E4LgEAAAQBAJ',
  },
  {
    title:
      '\u041f\u043e\u0441\u0456\u0431\u043d\u0438\u043a \u0437 \u0443\u0431\u0438\u0432\u0441\u0442\u0432\u0430 \u0434\u043b\u044f \u0445\u043e\u0440\u043e\u0448\u043e\u0457 \u0434\u0456\u0432\u0447\u0438\u043d\u043a\u0438',
    author: '\u0413\u043e\u043b\u043b\u0456 \u0414\u0436\u0435\u043a\u0441\u043e\u043d',
    volumeId: 'ybFUEQAAQBAJ',
  },
];

const sourceBonus = (source: CoverSource): number => {
  if (source === 'google') return 8;
  if (source === 'openlibrary') return 6;
  return 4;
};

const CYRILLIC_TO_LATIN_MAP: Record<string, string> = {
  '\u0430': 'a',
  '\u0431': 'b',
  '\u0432': 'v',
  '\u0433': 'h',
  '\u0491': 'g',
  '\u0434': 'd',
  '\u0435': 'e',
  '\u0454': 'ye',
  '\u0436': 'zh',
  '\u0437': 'z',
  '\u0438': 'y',
  '\u0456': 'i',
  '\u0457': 'yi',
  '\u0439': 'i',
  '\u043a': 'k',
  '\u043b': 'l',
  '\u043c': 'm',
  '\u043d': 'n',
  '\u043e': 'o',
  '\u043f': 'p',
  '\u0440': 'r',
  '\u0441': 's',
  '\u0442': 't',
  '\u0443': 'u',
  '\u0444': 'f',
  '\u0445': 'kh',
  '\u0446': 'ts',
  '\u0447': 'ch',
  '\u0448': 'sh',
  '\u0449': 'shch',
  '\u044c': '',
  '\u044e': 'yu',
  '\u044f': 'ya',
  '\u044a': '',
  '\u044b': 'y',
  '\u044d': 'e',
  '\u0451': 'yo',
};

const transliterateCyrillicToLatin = (value: string): string => {
  let out = '';
  for (const ch of value.toLowerCase()) {
    out += CYRILLIC_TO_LATIN_MAP[ch] ?? ch;
  }
  return normalizeQueryPart(out);
};

const scoreCandidate = (queryTitle: string, queryAuthor: string, candidate: CoverCandidate): number => {
  const qTitle = normalizeSearchText(queryTitle);
  const qAuthor = normalizeSearchText(queryAuthor);
  const cTitle = normalizeSearchText(candidate.title);
  const cAuthor = normalizeSearchText(candidate.author);

  let score = 0;

  score += tokenOverlapScore(qTitle, cTitle) * 80;
  if (qTitle && cTitle && cTitle.includes(qTitle)) score += 30;
  if (qTitle && cTitle && qTitle.includes(cTitle) && cTitle.length >= 6) score += 10;

  if (qAuthor) {
    score += tokenOverlapScore(qAuthor, cAuthor) * 20;
    const authorTokens = tokenize(qAuthor);
    const lastName = authorTokens.length > 0 ? authorTokens[authorTokens.length - 1] : '';
    if (lastName && cAuthor.includes(lastName)) score += 8;
    if (cAuthor && qAuthor && (cAuthor.includes(qAuthor) || qAuthor.includes(cAuthor))) score += 6;
  }

  score += sourceBonus(candidate.source);

  if (candidate.url.includes('books.google.com/books/content?id=')) {
    score += 3;
  }

  return score;
};

const chooseBestCandidate = (queryTitle: string, queryAuthor: string, candidates: CoverCandidate[]): string => {
  if (candidates.length === 0) return '';

  const scored = candidates.map((candidate) => ({
    candidate,
    score: scoreCandidate(queryTitle, queryAuthor, candidate),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored[0].candidate.url;
};

const dedupeCandidates = (candidates: CoverCandidate[]): CoverCandidate[] => {
  const map = new Map<string, CoverCandidate>();
  for (const candidate of candidates) {
    if (!candidate.url) continue;
    const key = candidate.url.trim();
    if (!key) continue;
    if (!map.has(key)) map.set(key, candidate);
  }
  return Array.from(map.values());
};

const fetchWithTimeout = async (url: string, timeoutMs: number = 5000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
};

const searchGoogleBooksCandidates = async (query: string, maxResults: number = 10): Promise<CoverCandidate[]> => {
  try {
    if (Date.now() < googleBlockedUntil) return [];
    const response = await fetchWithTimeout(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=${maxResults}&printType=books`
    );
    if (!response.ok) {
      if (response.status === 429) {
        googleBlockedUntil = Date.now() + 20 * 1000;
      }
      return [];
    }
    const data = await response.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    const out: CoverCandidate[] = [];

    for (const item of items) {
      const title = item?.volumeInfo?.title || '';
      const author = Array.isArray(item?.volumeInfo?.authors) ? item.volumeInfo.authors.join(', ') : '';
      const imageLinks = item?.volumeInfo?.imageLinks;
      const urlRaw = imageLinks?.thumbnail || imageLinks?.smallThumbnail || (item?.id ? buildGoogleBooksCoverUrl(item.id) : '');
      if (!urlRaw) continue;
      out.push({
        url: String(urlRaw).replace('http://', 'https://'),
        title: String(title || ''),
        author: String(author || ''),
        source: 'google',
      });
    }

    return out;
  } catch {
    return [];
  }
};

const openLibraryCoverFromDoc = (doc: any): string => {
  if (doc?.cover_i) return `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
  return '';
};

const searchOpenLibraryByParams = async (title: string, author: string): Promise<CoverCandidate[]> => {
  try {
    if (!title) return [];
    const params = new URLSearchParams({ title, limit: '25' });
    if (author) params.set('author', author);
    const response = await fetch(`https://openlibrary.org/search.json?${params.toString()}`);
    if (!response.ok) return [];
    const data = await response.json();
    const docs = Array.isArray(data?.docs) ? data.docs : [];

    return docs
      .map((doc: any) => {
        const url = openLibraryCoverFromDoc(doc);
        if (!url) return null;
        const authorName = Array.isArray(doc?.author_name) ? doc.author_name.join(', ') : '';
        return {
          url,
          title: String(doc?.title || ''),
          author: String(authorName || ''),
          source: 'openlibrary' as const,
        };
      })
      .filter(Boolean) as CoverCandidate[];
  } catch {
    return [];
  }
};

const searchOpenLibraryByQuery = async (query: string): Promise<CoverCandidate[]> => {
  try {
    if (!query) return [];
    const params = new URLSearchParams({ q: query, limit: '25' });
    const response = await fetch(`https://openlibrary.org/search.json?${params.toString()}`);
    if (!response.ok) return [];
    const data = await response.json();
    const docs = Array.isArray(data?.docs) ? data.docs : [];

    return docs
      .map((doc: any) => {
        const url = openLibraryCoverFromDoc(doc);
        if (!url) return null;
        const authorName = Array.isArray(doc?.author_name) ? doc.author_name.join(', ') : '';
        return {
          url,
          title: String(doc?.title || ''),
          author: String(authorName || ''),
          source: 'openlibrary' as const,
        };
      })
      .filter(Boolean) as CoverCandidate[];
  } catch {
    return [];
  }
};

const searchITunesCandidates = async (query: string): Promise<CoverCandidate[]> => {
  try {
    const response = await fetchWithTimeout(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=ebook&entity=ebook&limit=12`
    );
    if (!response.ok) return [];
    const data = await response.json();
    const results = Array.isArray(data?.results) ? data.results : [];

    return results
      .map((result: any) => {
        const url = result?.artworkUrl100;
        if (!url) return null;
        return {
          url: String(url).replace('100x100', '600x600'),
          title: String(result?.trackName || ''),
          author: String(result?.artistName || ''),
          source: 'itunes' as const,
        };
      })
      .filter(Boolean) as CoverCandidate[];
  } catch {
    return [];
  }
};

const UNKNOWN_AUTHOR_VALUES = new Set([
  'unknown author',
  '\u043d\u0435\u0432\u0456\u0434\u043e\u043c\u0438\u0439 \u0430\u0432\u0442\u043e\u0440',
  '\u043d\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043d\u044b\u0439 \u0430\u0432\u0442\u043e\u0440',
  '\u0440\u0458\u0405\u0440\u00b5\u0406\u00d0\u0402\u0440\u00be\u043c\u0451\u0439 \u00d0\u00b0\u0406\u0441\u201a\u0440\u00be\u0402',
]);

const isUnknownAuthorPlaceholder = (author: string): boolean => {
  const v = normalizeSearchText(author);
  if (!v) return true;
  return UNKNOWN_AUTHOR_VALUES.has(v);
};

const buildCacheKey = (title: string, author: string, isbn: string): string => {
  return `${normalizeSearchText(title)}|${normalizeSearchText(author)}|${isbn}`;
};

const findKnownCoverOverride = (title: string, author: string): string => {
  const normalizedTitle = normalizeSearchText(title);
  if (!normalizedTitle) return '';

  const normalizedAuthor = normalizeSearchText(author);
  for (const entry of KNOWN_GOOGLE_COVER_OVERRIDES) {
    const entryTitle = normalizeSearchText(entry.title);
    const entryAuthor = normalizeSearchText(entry.author);

    const titleMatches =
      normalizedTitle === entryTitle ||
      normalizedTitle.includes(entryTitle) ||
      entryTitle.includes(normalizedTitle);
    if (!titleMatches) continue;

    const authorMatches =
      !normalizedAuthor ||
      normalizedAuthor === entryAuthor ||
      normalizedAuthor.includes(entryAuthor) ||
      entryAuthor.includes(normalizedAuthor);
    if (!authorMatches) continue;

    return buildGoogleBooksCoverUrl(entry.volumeId);
  }

  return '';
};

export const fetchBookCover = async (title: string, author: string, isbn?: string): Promise<string> => {
  let cleanTitle = normalizeQueryPart(title);
  const normalizedAuthor = normalizeQueryPart(author);
  let cleanAuthor = isUnknownAuthorPlaceholder(normalizedAuthor) ? '' : normalizedAuthor;
  const cleanIsbn = normalizeQueryPart(isbn || '').replace(/[^0-9X]/gi, '');

  // Support pasted input like "Title + Author" into title field.
  if (!cleanAuthor) {
    const plusSplit = cleanTitle.split('+').map(normalizeQueryPart).filter(Boolean);
    if (plusSplit.length >= 2) {
      cleanTitle = plusSplit[0];
      cleanAuthor = plusSplit.slice(1).join(' ');
    }
  }

  if (!cleanTitle && !cleanIsbn) return '';

  const knownCover = findKnownCoverOverride(cleanTitle, cleanAuthor);
  if (knownCover) return knownCover;

  const cacheKey = buildCacheKey(cleanTitle, cleanAuthor, cleanIsbn);
  if (coverSearchCache.has(cacheKey)) {
    return coverSearchCache.get(cacheKey) || '';
  }

  const candidates: CoverCandidate[] = [];

  if (cleanIsbn) {
    const byIsbn = await searchGoogleBooksCandidates(`isbn:${cleanIsbn}`, 8);
    candidates.push(...byIsbn);
  }

  const authorTokens = cleanAuthor ? cleanAuthor.split(/\s+/).filter(Boolean) : [];
  const authorLastName = authorTokens.length > 0 ? authorTokens[authorTokens.length - 1] : '';
  const combinedQuery = `${cleanTitle} ${cleanAuthor}`.trim();
  const translitTitle = transliterateCyrillicToLatin(cleanTitle);
  const translitAuthor = transliterateCyrillicToLatin(cleanAuthor);
  const translitCombined = normalizeQueryPart(`${translitTitle} ${translitAuthor}`);

  const googleQueries = [
    cleanAuthor ? `intitle:"${cleanTitle}" inauthor:"${cleanAuthor}"` : '',
    cleanAuthor ? `intitle:${cleanTitle} inauthor:${authorLastName || cleanAuthor}` : '',
    cleanAuthor ? `"${cleanTitle}" "${cleanAuthor}"` : '',
    combinedQuery,
    cleanTitle,
    translitCombined,
    translitTitle,
  ]
    .map((q) => normalizeQueryPart(q))
    .filter(Boolean);

  const uniqueGoogleQueries = Array.from(new Set(googleQueries)).slice(0, 4);
  for (const query of uniqueGoogleQueries) {
    const result = await searchGoogleBooksCandidates(query, 10);
    if (result.length > 0) {
      candidates.push(...result);
    }
    // If Google already yielded candidates, stop early and prefer Google result.
    if (candidates.length > 0) {
      const bestGoogle = chooseBestCandidate(cleanTitle, cleanAuthor, dedupeCandidates(candidates));
      if (bestGoogle) {
        setCache(cacheKey, bestGoogle);
        return bestGoogle;
      }
    }
  }

  if (cleanTitle) {
    const [openByParams, openByQuery, openByTitleOnly, openByTranslit] = await Promise.all([
      searchOpenLibraryByParams(cleanTitle, cleanAuthor),
      searchOpenLibraryByQuery(combinedQuery || cleanTitle),
      searchOpenLibraryByParams(cleanTitle, ''),
      translitCombined ? searchOpenLibraryByQuery(translitCombined) : Promise.resolve([]),
    ]);
    candidates.push(...openByParams, ...openByQuery, ...openByTitleOnly, ...openByTranslit);
  }

  const iTunesQuery = combinedQuery || cleanTitle;
  const iTunesQueries = [iTunesQuery, translitCombined, translitTitle].map(normalizeQueryPart).filter(Boolean);
  const uniqueITunesQueries = Array.from(new Set(iTunesQueries)).slice(0, 3);
  if (uniqueITunesQueries.length > 0) {
    const iTunesResults = await Promise.all(uniqueITunesQueries.map((query) => searchITunesCandidates(query)));
    for (const result of iTunesResults) candidates.push(...result);
  }

  const deduped = dedupeCandidates(candidates);
  const best = chooseBestCandidate(cleanTitle, cleanAuthor, deduped);
  
  setCache(cacheKey, best || '');
  return best || '';
};
