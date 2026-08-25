import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { normalizeIsbn } from '../utils';

export interface ParsedBook {
  title: string;
  author?: string;
  coverImage: string;
  authorSeries?: string;
  orderInSeries?: string;
  pages?: number;
  publisher?: string;
  isbn: string;
  bookUrl: string;
}

export class MBooksParser {
  private fetchHtml: (url: string) => Promise<string>;

  constructor(fetchHtml: (url: string) => Promise<string>) {
    this.fetchHtml = fetchHtml;
  }

  /**
   * Stage 1: Search for the book by ISBN and return its relative URL path
   */
  async searchByIsbn(isbn: string): Promise<string | null> {
    const cleanIsbn = normalizeIsbn(isbn);
    if (!cleanIsbn) return null;

    const url = `/api/search/?query=${encodeURIComponent(cleanIsbn)}`;
    const html = await this.fetchHtml(url);
    if (!html) return null;

    // Strategy 1: Match Next.js RSC state escaped and unescaped slugs
    const slugRegex = /[\\"]*slug[\\"]*:\s*[\\"]*(\d+-[^"\\\s,]+)/g;
    let match;
    const matchedSlugs: string[] = [];
    while ((match = slugRegex.exec(html)) !== null) {
      const slug = match[1].replace(/\\+$/, '');
      if (/^\d+-/.test(slug) && !matchedSlugs.includes(slug)) {
        matchedSlugs.push(slug);
      }
    }

    if (matchedSlugs.length > 0) {
      return `/book/${matchedSlugs[0]}/`;
    }

    // Strategy 2: Direct link matches in HTML (/book/12345-slug/)
    const hrefRegex = /\/book\/(\d+-[a-zA-Z0-9_-]+)/g;
    let hrefMatch;
    while ((hrefMatch = hrefRegex.exec(html)) !== null) {
      const slug = hrefMatch[1];
      if (!matchedSlugs.includes(slug)) {
        return `/book/${slug}/`;
      }
    }

    // Strategy 3: DOM parser if available (e.g. browser context with standard anchor tags)
    if (typeof DOMParser !== 'undefined') {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const link = doc.querySelector('[data-page-type="search-results"] a[href*="/book/"], a.product-image[href*="/book/"], a[href*="/book/"]');
        if (link) {
          const href = link.getAttribute('href');
          if (href) {
            const clean = href.startsWith('/') ? href : `/${href}`;
            return clean.endsWith('/') ? clean : `${clean}/`;
          }
        }
      } catch (e) {
        console.warn('DOMParser fallback in searchByIsbn failed:', e);
      }
    }

    return null;
  }

  /**
   * Stage 2: Fetch the book detail page and parse metadata
   */
  async getBookDetails(href: string): Promise<ParsedBook | null> {
    const cleanHref = href.startsWith('/') ? href : `/${href}`;
    const url = `/api${cleanHref}`;
    const html = await this.fetchHtml(url);
    if (!html) return null;

    const result: Partial<ParsedBook> = {
      bookUrl: `https://mbooks.com.ua${cleanHref}`
    };

    // 1. Title
    const dataCyTitleMatch = html.match(/<h1[^>]*data-cy="book-title"[^>]*>([\s\S]*?)<\/h1>/i);
    if (dataCyTitleMatch) {
      result.title = dataCyTitleMatch[1].replace(/<[^>]+>/g, '').trim();
    } else {
      const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
                         html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) {
        result.title = titleMatch[1].split(' - ')[0].split(' | ')[0].replace(/^Книга\s+/i, '').trim();
      }
    }

    // 2. Author (from /authors/ link or state)
    const authorRegex = /<a[^>]+href="\/authors\/[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    const authors: string[] = [];
    let authorMatch;
    while ((authorMatch = authorRegex.exec(html)) !== null) {
      const authorName = authorMatch[1].replace(/<[^>]+>/g, '').trim();
      if (authorName && !authors.includes(authorName)) {
        authors.push(authorName);
      }
    }
    if (authors.length > 0) {
      result.author = cleanAuthorString(authors.join(', '));
    }

    // 3. Cover Image
    const imageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) ||
                       html.match(/<meta\s+name="twitter:image"\s+content="([^"]+)"/i);
    if (imageMatch) {
      let cover = imageMatch[1];
      if (cover.startsWith('http:')) cover = cover.replace('http:', 'https:');
      result.coverImage = cover;
    }

    // 4. Grid-based details parsing
    const pairRegex = /<span\s+[^>]*class="[^"]*opacity-70[^"]*"[^>]*>([^<]+)<\/span>\s*<\/div>\s*<div\s+[^>]*>\s*(?:<a\s+[^>]*>\s*)?<span\s+[^>]*>([\s\S]*?)<\/span>/gi;
    let matchPair;
    while ((matchPair = pairRegex.exec(html)) !== null) {
      const label = matchPair[1].trim();
      const value = matchPair[2].replace(/<[^>]+>/g, '').trim();
      
      if (label.includes('Видавництво')) {
        result.publisher = value;
      } else if (label.includes('Кількість сторінок')) {
        result.pages = parseInt(value, 10) || undefined;
      } else if (label.includes('Серія автора')) {
        result.authorSeries = value;
      } else if (label.includes('Порядок у серії')) {
        result.orderInSeries = value;
      } else if (label.includes('ISBN') || label.includes('Штрихкод')) {
        result.isbn = normalizeIsbn(value) || value;
      }
    }

    // Fallbacks from Next.js RSC state if missing
    if (!result.title || result.title === 'Невідома назва') {
      const stateTitleMatch = html.match(/[\\"]*title[\\"]*:\s*[\\"]*([^"\\]+)[\\"]*/i);
      if (stateTitleMatch) {
        result.title = stateTitleMatch[1].trim();
      }
    }

    if (!result.author) {
      const stateAuthorMatch = html.match(/[\\"]*firstName[\\"]*:\s*[\\"]*([^"\\]+)[\\"]*,\s*[\\"]*lastName[\\"]*:\s*[\\"]*([^"\\]+)[\\"]*/i);
      if (stateAuthorMatch) {
        result.author = cleanAuthorString(`${stateAuthorMatch[1]} ${stateAuthorMatch[2]}`);
      }
    }

    if (!result.coverImage) {
      const stateCoverMatch = html.match(/[\\"]*frontCover[\\"]*:\s*[\\"]*(https?:[^"\\]+)[\\"]*/i);
      if (stateCoverMatch) {
        let cover = stateCoverMatch[1].replace(/\\/g, '');
        if (cover.startsWith('http:')) cover = cover.replace('http:', 'https:');
        result.coverImage = cover;
      }
    }

    if (!result.isbn) {
      const isbnMatch = html.match(/ISBN\s*([\d-]+)/i);
      if (isbnMatch) {
        result.isbn = normalizeIsbn(isbnMatch[1]);
      }
    }

    if (!result.title) {
      result.title = 'Невідома назва';
    }
    if (!result.coverImage) {
      result.coverImage = '';
    }

    return result as ParsedBook;
  }

  /**
   * Fallback Stage: Search in Google Books API by ISBN
   */
  async searchGoogleBooks(isbn: string): Promise<ParsedBook | null> {
    const cleanIsbn = normalizeIsbn(isbn);
    if (!cleanIsbn) return null;

    // Try isbn query first, then loose query
    const urls = [
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}`,
      `https://www.googleapis.com/books/v1/volumes?q=${cleanIsbn}`
    ];

    for (const url of urls) {
      try {
        const jsonText = await this.fetchHtml(url);
        if (!jsonText) continue;
        
        const data = JSON.parse(jsonText);
        if (!data.items || data.items.length === 0) continue;
        
        const volumeInfo = data.items[0].volumeInfo;
        if (!volumeInfo) continue;
        
        // Extract ISBN
        let parsedIsbn = cleanIsbn;
        if (volumeInfo.industryIdentifiers) {
          const idObj = volumeInfo.industryIdentifiers.find((id: any) => id.type === 'ISBN_13') || 
                        volumeInfo.industryIdentifiers.find((id: any) => id.type === 'ISBN_10');
          if (idObj) {
            parsedIsbn = normalizeIsbn(idObj.identifier);
          }
        }

        // Extract high-quality cover if available
        let cover = '';
        if (volumeInfo.imageLinks) {
          cover = volumeInfo.imageLinks.thumbnail || volumeInfo.imageLinks.smallThumbnail || volumeInfo.imageLinks.medium || '';
          if (cover.startsWith('http:')) {
            cover = cover.replace('http:', 'https:');
          }
          // Remove &edge=curl for cleaner flat cover
          cover = cover.replace('&edge=curl', '');
        }

        return {
          title: volumeInfo.title || 'Невідома назва',
          author: cleanAuthorString(volumeInfo.authors ? volumeInfo.authors.join(', ') : 'Невідомий автор'),
          coverImage: cover,
          pages: volumeInfo.pageCount || undefined,
          publisher: volumeInfo.publisher || 'Google Books',
          isbn: parsedIsbn,
          bookUrl: volumeInfo.infoLink || `https://books.google.com/books?vid=ISBN${cleanIsbn}`,
          authorSeries: '',
          orderInSeries: ''
        };
      } catch (e) {
        console.warn(`Google Books attempt failed for ${url}:`, e);
      }
    }

    return null;
  }

  /**
   * Fallback Stage 2: Search in Open Library API by ISBN
   */
  async searchOpenLibrary(isbn: string): Promise<ParsedBook | null> {
    const cleanIsbn = normalizeIsbn(isbn);
    if (!cleanIsbn) return null;

    // Strategy A: bibkeys data format
    try {
      const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`;
      const jsonText = await this.fetchHtml(url);
      if (jsonText) {
        const data = JSON.parse(jsonText);
        const bibKey = `ISBN:${cleanIsbn}`;
        if (data[bibKey]) {
          const bookInfo = data[bibKey];
          const title = bookInfo.title || 'Невідома назва';
          const author = cleanAuthorString(bookInfo.authors ? bookInfo.authors.map((a: any) => a.name).join(', ') : 'Невідомий автор');
          
          let cover = '';
          if (bookInfo.cover) {
            cover = bookInfo.cover.large || bookInfo.cover.medium || bookInfo.cover.small || '';
            if (cover.startsWith('http:')) cover = cover.replace('http:', 'https:');
          }

          const publisher = bookInfo.publishers ? bookInfo.publishers.map((p: any) => p.name).join(', ') : 'Open Library';
          const pages = bookInfo.number_of_pages || undefined;

          return {
            title,
            author,
            coverImage: cover,
            pages,
            publisher,
            isbn: cleanIsbn,
            bookUrl: bookInfo.url || `https://openlibrary.org/isbn/${cleanIsbn}`,
            authorSeries: '',
            orderInSeries: ''
          };
        }
      }
    } catch (e) {
      console.warn('Open Library bibkeys search failed:', e);
    }

    // Strategy B: search.json endpoint
    try {
      const searchUrl = `https://openlibrary.org/search.json?isbn=${cleanIsbn}`;
      const searchJson = await this.fetchHtml(searchUrl);
      if (searchJson) {
        const sData = JSON.parse(searchJson);
        if (sData.docs && sData.docs.length > 0) {
          const doc = sData.docs[0];
          const title = doc.title || 'Невідома назва';
          const author = cleanAuthorString(doc.author_name ? doc.author_name.join(', ') : 'Невідомий автор');
          let cover = '';
          if (doc.cover_i) {
            cover = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
          }
          const publisher = doc.publisher ? (Array.isArray(doc.publisher) ? doc.publisher[0] : doc.publisher) : 'Open Library';
          const pages = doc.number_of_pages_median || undefined;

          return {
            title,
            author,
            coverImage: cover,
            pages,
            publisher,
            isbn: cleanIsbn,
            bookUrl: `https://openlibrary.org/isbn/${cleanIsbn}`,
            authorSeries: '',
            orderInSeries: ''
          };
        }
      }
    } catch (e) {
      console.warn('Open Library search.json search failed:', e);
    }

    return null;
  }

  /**
   * Unified search method that tries mbooks.com.ua, and if that fails or returns nothing,
   * falls back to Google Books API, and then to Open Library API.
   * Also reports which stage it is currently executing via an optional onStep change handler.
   */
  async searchWithFallback(
    isbn: string,
    onStep?: (step: number) => void
  ): Promise<ParsedBook | null> {
    const cleanIsbn = normalizeIsbn(isbn);
    if (!cleanIsbn) return null;
    
    // Stage 1: Try MBooks parser
    if (onStep) onStep(1); // Stage 1: Search book link on MBooks
    try {
      const href = await this.searchByIsbn(cleanIsbn);
      if (href) {
        if (onStep) onStep(2); // Stage 2: Retrieve details from MBooks
        const book = await this.getBookDetails(href);
        if (book && book.title && book.title !== 'Невідома назва') {
          return book;
        }
      }
    } catch (e) {
      console.warn('MBooks search failed, falling back to Google Books...', e);
    }

    // Stage 2 fallback: Try Google Books API
    if (onStep) onStep(2); // Treat as stage 2 (fetching details)
    try {
      const gBook = await this.searchGoogleBooks(cleanIsbn);
      if (gBook && gBook.title && gBook.title !== 'Невідома назва') {
        return gBook;
      }
    } catch (e) {
      console.warn('Google Books failed, falling back to Open Library...', e);
    }

    // Stage 3 fallback: Try Open Library API
    try {
      const olBook = await this.searchOpenLibrary(cleanIsbn);
      if (olBook && olBook.title && olBook.title !== 'Невідома назва') {
        return olBook;
      }
    } catch (e) {
      console.warn('Open Library search failed:', e);
    }

    return null;
  }
}

/**
 * Fetch HTML or JSON with robust multi-platform fallbacks:
 * 1. Capacitor Native App (iOS/Android) -> CapacitorHttp with full browser headers
 * 2. Web browser -> Direct fetch first, with multi-proxy fallback if relative /api fails or is blocked
 */
const fetchHtml = async (url: string): Promise<string> => {
  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,application/json,*/*;q=0.8',
    'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'https://mbooks.com.ua/'
  };

  if (Capacitor.isNativePlatform()) {
    // Native mobile app: use CapacitorHttp to bypass CORS with proper browser headers
    let fullUrl = url;
    if (url.startsWith('/api/')) {
      fullUrl = url.replace(/^\/api\//, 'https://mbooks.com.ua/');
    } else if (url.startsWith('/api')) {
      fullUrl = url.replace(/^\/api/, 'https://mbooks.com.ua');
    }

    try {
      const response = await CapacitorHttp.get({
        url: fullUrl,
        headers: browserHeaders,
        connectTimeout: 8000,
        readTimeout: 8000
      });

      if (response.status && response.status >= 400) {
        throw new Error(`HTTP ${response.status}`);
      }

      if (typeof response.data === 'string') {
        return response.data;
      }
      return JSON.stringify(response.data);
    } catch (e) {
      console.warn('CapacitorHttp get failed for:', fullUrl, e);
      throw e;
    }
  }

  // Web Browser / PWA / Preview execution
  if (url.startsWith('/api')) {
    // 1st: Try relative API route (handled by Vite proxy in dev/preview or backend server)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(url, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        return await res.text();
      }
    } catch (e) {
      console.warn('Direct /api relative fetch failed, trying CORS proxies...', e);
    }

    // 2nd: If relative /api failed (e.g. running on mobile web or static deployment), try public CORS proxies
    const targetUrl = `https://mbooks.com.ua${url.replace(/^\/api/, '')}`;
    const proxyUrls = [
      `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
      `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`
    ];

    for (const pUrl of proxyUrls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const pRes = await fetch(pUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (pRes.ok) {
          const text = await pRes.text();
          if (text && text.length > 500) {
            return text;
          }
        }
      } catch (err) {
        console.warn(`CORS proxy failed (${pUrl}):`, err);
      }
    }

    throw new Error('All fetch methods for /api failed');
  }

  // Direct absolute external URL (Google Books, Open Library)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    return await response.text();
  } catch (err) {
    // If direct fetch fails (e.g. CORS on third-party URL), try proxy
    try {
      const pUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      const pRes = await fetch(pUrl);
      if (pRes.ok) return await pRes.text();
    } catch (e) {
      // ignore
    }
    throw err;
  }
};

export const parserInstance = new MBooksParser(fetchHtml);

export const cleanAuthorString = (authorStr: string | undefined): string => {
  if (!authorStr) return '';
  
  // Replace HTML entities like &nbsp; and non-breaking spaces with standard space
  const cleaned = authorStr
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
    
  // Split by common separators (comma, semicolon)
  const items = cleaned.split(/[,;]/);
  const uniqueNames: string[] = [];
  const normalizedSet = new Set<string>();
  
  for (const item of items) {
    const trimmed = item.replace(/<[^>]+>/g, '').trim();
    if (!trimmed) continue;
    
    // Normalize to check for duplicate entries regardless of subtle case, punctuation or invisible formatting
    const normalized = trimmed.toLowerCase()
      .replace(/[\s\p{Punctuation}]/gu, '')
      .replace(/\uFE0F/g, ''); // strip emoji variant selector
      
    if (normalized && !normalizedSet.has(normalized)) {
      normalizedSet.add(normalized);
      uniqueNames.push(trimmed);
    }
  }
  
  // Deduplicate case where one name is just another name with a leading character (e.g. avatar letter prefix "М" + "Мосян Тонсьов")
  const filteredNames: string[] = [];
  for (let i = 0; i < uniqueNames.length; i++) {
    const current = uniqueNames[i];
    const currentNorm = current.toLowerCase().replace(/[\s\p{Punctuation}]/gu, '').replace(/\uFE0F/g, '');
    
    let isDuplicated = false;
    for (let j = 0; j < uniqueNames.length; j++) {
      if (i === j) continue;
      const other = uniqueNames[j];
      const otherNorm = other.toLowerCase().replace(/[\s\p{Punctuation}]/gu, '').replace(/\uFE0F/g, '');
      
      if (currentNorm.endsWith(otherNorm) && currentNorm.length > otherNorm.length && currentNorm.length <= otherNorm.length + 2) {
        isDuplicated = true;
        break;
      }
    }
    if (!isDuplicated) {
      filteredNames.push(current);
    }
  }
  
  return filteredNames.join(', ');
};


