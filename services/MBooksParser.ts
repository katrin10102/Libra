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

export const decodeHtmlEntities = (str?: string): string => {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .trim();
};

export const cleanAuthorString = (authorStr?: string): string => {
  if (!authorStr) return 'Невідомий автор';
  const names = authorStr.split(/[,;\/&]/).map((s) => s.trim()).filter(Boolean);
  const filteredNames = names.filter((name) => {
    const lower = name.toLowerCase();
    return (
      !lower.includes('переклад') &&
      !lower.includes('іллюстратор') &&
      !lower.includes('ілюстратор') &&
      !lower.includes('редактор') &&
      !lower.includes('дизайн') &&
      !lower.includes('укладач') &&
      !lower.includes('художник')
    );
  });

  if (filteredNames.length === 0) return decodeHtmlEntities(authorStr.trim());
  return decodeHtmlEntities(filteredNames.join(', '));
};

export class MBooksParser {
  private fetchHtml: (url: string) => Promise<string>;

  constructor(fetchHtml: (url: string) => Promise<string>) {
    this.fetchHtml = fetchHtml;
  }

  /**
   * Stage 1: Search for the book by ISBN on MBooks and return its relative URL path
   */
  async searchByIsbn(isbn: string): Promise<string | null> {
    const cleanIsbn = normalizeIsbn(isbn);
    if (!cleanIsbn) return null;

    const url = `/api/search/?query=${encodeURIComponent(cleanIsbn)}`;
    let html: string;
    try {
      html = await this.fetchHtml(url);
    } catch {
      return null;
    }

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

    // Strategy 3: DOM parser if available
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
    let html: string;
    try {
      html = await this.fetchHtml(url);
    } catch {
      return null;
    }

    if (!html) return null;

    const result: Partial<ParsedBook> = {
      bookUrl: `https://mbooks.com.ua${cleanHref}`
    };

    // 1. Title
    const dataCyTitleMatch = html.match(/<h1[^>]*data-cy="book-title"[^>]*>([\s\S]*?)<\/h1>/i);
    if (dataCyTitleMatch) {
      result.title = decodeHtmlEntities(dataCyTitleMatch[1].replace(/<[^>]+>/g, '').trim());
    } else {
      const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
                         html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) {
        const rawTitle = titleMatch[1].replace(/<[^>]+>/g, '').replace(/ - .*?MEGOGO BOOKS.*$/i, '').trim();
        result.title = decodeHtmlEntities(rawTitle);
      }
    }

    // 2. Author (from /authors/ link or RSC state)
    const authorRegex = /<a[^>]+href="\/authors\/[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    const authors: string[] = [];
    let authorMatch;
    while ((authorMatch = authorRegex.exec(html)) !== null) {
      const authorName = decodeHtmlEntities(authorMatch[1].replace(/<[^>]+>/g, '').trim());
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
      const label = matchPair[1].replace(/<[^>]+>/g, '').trim();
      const value = decodeHtmlEntities(matchPair[2].replace(/<[^>]+>/g, '').trim());

      if (label.includes('Кількість сторінок')) {
        const pages = parseInt(value, 10);
        if (!isNaN(pages)) result.pages = pages;
      } else if (label.includes('Видавництво')) {
        result.publisher = value;
      } else if (label.includes('Серія автора') || label.includes('Серія')) {
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
        result.title = decodeHtmlEntities(stateTitleMatch[1].trim());
      }
    }

    if (!result.author) {
      const stateAuthorMatch = html.match(/[\\"]*firstName[\\"]*:\s*[\\"]*([^"\\]+)[\\"]*,\s*[\\"]*lastName[\\"]*:\s*[\\"]*([^"\\]+)[\\"]*/i);
      if (stateAuthorMatch) {
        result.author = cleanAuthorString(`${stateAuthorMatch[1]} ${stateAuthorMatch[2]}`);
      }
    }

    if (!result.coverImage) {
      const stateCoverMatch = html.match(/[\\"]*(?:frontCover|coverUrl|imageUrl)[\\"]*:\s*[\\"]*(https?:[^"\\]+)[\\"]*/i);
      if (stateCoverMatch) {
        let cover = stateCoverMatch[1].replace(/\\/g, '');
        if (cover.startsWith('http:')) cover = cover.replace('http:', 'https:');
        result.coverImage = cover;
      }
    }

    if (!result.pages) {
      const pagesMatch = html.match(/[\\"]*(?:pagesCount|pageCount|pages|pages_count)[\\"]*:\s*(\d+)/i);
      if (pagesMatch) {
        const p = parseInt(pagesMatch[1], 10);
        if (!isNaN(p)) result.pages = p;
      }
    }

    if (!result.isbn) {
      const isbnMatch = html.match(/ISBN\s*([\d-]+)/i);
      if (isbnMatch) {
        result.isbn = normalizeIsbn(isbnMatch[1]);
      }
    }

    return {
      title: result.title || 'Невідома назва',
      author: cleanAuthorString(result.author || '-'),
      coverImage: result.coverImage || '',
      authorSeries: result.authorSeries || '',
      orderInSeries: result.orderInSeries || '',
      pages: result.pages,
      publisher: result.publisher || '',
      isbn: result.isbn || '',
      bookUrl: result.bookUrl || `https://mbooks.com.ua${cleanHref}`
    };
  }

  /**
   * Fallback: Search in Google Books API by ISBN (Direct CORS support)
   */
  async searchGoogleBooks(isbn: string): Promise<ParsedBook | null> {
    const cleanIsbn = normalizeIsbn(isbn);
    if (!cleanIsbn) return null;

    const urls = [
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}`,
      `https://www.googleapis.com/books/v1/volumes?q=${cleanIsbn}`
    ];

    for (const url of urls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) continue;
        const data = await res.json();
        if (!data.items || data.items.length === 0) continue;

        const volumeInfo = data.items[0].volumeInfo;
        if (!volumeInfo) continue;

        let parsedIsbn = cleanIsbn;
        if (volumeInfo.industryIdentifiers) {
          const idObj = volumeInfo.industryIdentifiers.find((id: any) => id.type === 'ISBN_13') ||
                        volumeInfo.industryIdentifiers.find((id: any) => id.type === 'ISBN_10');
          if (idObj) {
            parsedIsbn = normalizeIsbn(idObj.identifier);
          }
        }

        let cover = '';
        if (volumeInfo.imageLinks) {
          cover = volumeInfo.imageLinks.thumbnail || volumeInfo.imageLinks.smallThumbnail || volumeInfo.imageLinks.medium || '';
          if (cover.startsWith('http:')) {
            cover = cover.replace('http:', 'https:');
          }
          cover = cover.replace('&edge=curl', '');
        }

        return {
          title: decodeHtmlEntities(volumeInfo.title || 'Невідома назва'),
          author: cleanAuthorString(volumeInfo.authors ? volumeInfo.authors.join(', ') : 'Невідомий автор'),
          coverImage: cover,
          pages: volumeInfo.pageCount || undefined,
          publisher: decodeHtmlEntities(volumeInfo.publisher || 'Google Books'),
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
   * Fallback: Search in Open Library API by ISBN (Direct CORS support)
   */
  async searchOpenLibrary(isbn: string): Promise<ParsedBook | null> {
    const cleanIsbn = normalizeIsbn(isbn);
    if (!cleanIsbn) return null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const bibKey = `ISBN:${cleanIsbn}`;
        if (data[bibKey]) {
          const bookInfo = data[bibKey];
          const title = decodeHtmlEntities(bookInfo.title || 'Невідома назва');
          const author = cleanAuthorString(bookInfo.authors ? bookInfo.authors.map((a: any) => a.name).join(', ') : 'Невідомий автор');

          let cover = '';
          if (bookInfo.cover) {
            cover = bookInfo.cover.large || bookInfo.cover.medium || bookInfo.cover.small || '';
            if (cover.startsWith('http:')) cover = cover.replace('http:', 'https:');
          }

          const publisher = decodeHtmlEntities(bookInfo.publishers ? bookInfo.publishers.map((p: any) => p.name).join(', ') : 'Open Library');
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

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const searchUrl = `https://openlibrary.org/search.json?isbn=${cleanIsbn}`;
      const sRes = await fetch(searchUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (sRes.ok) {
        const sData = await sRes.json();
        if (sData.docs && sData.docs.length > 0) {
          const doc = sData.docs[0];
          const title = decodeHtmlEntities(doc.title || 'Невідома назва');
          const author = cleanAuthorString(doc.author_name ? doc.author_name.join(', ') : 'Невідомий автор');
          let cover = '';
          if (doc.cover_i) {
            cover = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
          }
          const pub = doc.publisher ? (Array.isArray(doc.publisher) ? doc.publisher[0] : doc.publisher) : 'Open Library';
          const pages = doc.number_of_pages_median || undefined;

          return {
            title,
            author,
            coverImage: cover,
            pages,
            publisher: decodeHtmlEntities(pub),
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
   * Fallback: Search in Apple Books / iTunes API by ISBN (Direct CORS support)
   */
  async searchITunes(isbn: string): Promise<ParsedBook | null> {
    const cleanIsbn = normalizeIsbn(isbn);
    if (!cleanIsbn) return null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanIsbn)}&entity=ebook&limit=5`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          const item = data.results[0];
          let cover = item.artworkUrl100 || '';
          if (cover) {
            cover = cover.replace('100x100', '600x600');
          }
          return {
            title: decodeHtmlEntities(item.trackName || 'Невідома назва'),
            author: cleanAuthorString(item.artistName || 'Невідомий автор'),
            coverImage: cover,
            publisher: 'Apple Books',
            isbn: cleanIsbn,
            bookUrl: item.trackViewUrl || '',
            authorSeries: '',
            orderInSeries: ''
          };
        }
      }
    } catch (e) {
      console.warn('iTunes book search failed:', e);
    }

    return null;
  }

  /**
   * Unified search method:
   * 1. Direct MBooks search (instant via Capacitor on mobile or Vite proxy in dev/preview)
   * 2. Parallel fallback to Google Books, Open Library, iTunes
   */
  async searchWithFallback(
    isbn: string,
    onStep?: (step: number) => void
  ): Promise<ParsedBook | null> {
    const cleanIsbn = normalizeIsbn(isbn);
    if (!cleanIsbn) return null;

    if (onStep) onStep(1); // Крок 1: Пошук посилання / книги

    // Stage 1: Try MBooks
    try {
      const href = await this.searchByIsbn(cleanIsbn);
      if (href) {
        if (onStep) onStep(2); // Крок 2: Отримання деталей книги
        const book = await this.getBookDetails(href);
        if (book && book.title && book.title !== 'Невідома назва') {
          return book;
        }
      }
    } catch (e) {
      console.warn('MBooks parser failed, proceeding to fallback providers...', e);
    }

    // Stage 2: Parallel search across Google Books, Open Library, iTunes
    if (onStep) onStep(2); // Крок 2: Отримання деталей книги

    try {
      const results = await Promise.allSettled([
        this.searchGoogleBooks(cleanIsbn),
        this.searchOpenLibrary(cleanIsbn),
        this.searchITunes(cleanIsbn),
      ]);

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value && result.value.title && result.value.title !== 'Невідома назва') {
          return result.value;
        }
      }
    } catch (e) {
      console.warn('Fallback providers search failed:', e);
    }

    return null;
  }
}

/**
 * Fetch HTML with robust multi-platform support:
 * 1. Capacitor Native App (iOS/Android APK) -> CapacitorHttp with browser headers (bypasses CORS natively)
 * 2. Web Browser (Dev/Preview/Production) -> Direct /api proxy with CORS proxy fallback
 */
const fetchHtml = async (url: string): Promise<string> => {
  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Mobile; rv:124.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,application/json,*/*;q=0.8',
    'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'https://mbooks.com.ua/'
  };

  // 1. Capacitor Native Platform (Android / iOS app)
  const isNative =
    (typeof Capacitor !== 'undefined' && (Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'web')) ||
    (typeof (window as any)?.Capacitor !== 'undefined' && typeof (window as any)?.Capacitor?.isNativePlatform === 'function' && (window as any).Capacitor.isNativePlatform());

  if (isNative) {
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
        responseType: 'text',
        connectTimeout: 10000,
        readTimeout: 10000
      });

      if (response && response.data) {
        return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      }
    } catch (e) {
      console.warn('CapacitorHttp native get failed for:', fullUrl, e);
    }
  }

  // 2. Web Browser (Dev / Preview / Production)
  if (url.startsWith('/api')) {
    // 2.1 First try direct /api (works on Vite dev server and proxy backend)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const text = await res.text();
        // Check if response is NOT the app's SPA fallback HTML (index.html)
        const isSpaFallback =
          (text.includes('<div id="root">') || text.includes('src="/src/main.tsx"') || text.includes('src="/index.tsx"')) &&
          !text.includes('mbooks') &&
          !text.includes('megogo') &&
          !text.includes('data-cy');

        if (!isSpaFallback && text.length > 200) {
          return text;
        }
      }
    } catch (e) {
      console.warn('Direct /api relative fetch failed, trying CORS proxies...', e);
    }

    // 2.2 If running on static hosting (GitHub Pages or Mobile browser), try public CORS proxies with fast timeouts
    const targetUrl = `https://mbooks.com.ua${url.replace(/^\/api/, '')}`;
    const proxyConfigs = [
      {
        url: `https://proxy.cors.sh/${targetUrl}`,
        headers: { 'x-cors-grida-api-key': 'c734bbd8-4f15-4606-9216-9502b4fa3906' },
        isJson: false
      },
      {
        url: `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`,
        headers: {},
        isJson: true
      },
      {
        url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
        headers: {},
        isJson: false
      }
    ];

    for (const p of proxyConfigs) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const pRes = await fetch(p.url, { headers: p.headers, signal: controller.signal });
        clearTimeout(timeoutId);
        if (pRes.ok) {
          let text = '';
          if (p.isJson) {
            const j = await pRes.json();
            text = j?.contents || '';
          } else {
            text = await pRes.text();
          }
          if (text && text.length > 500 && !text.includes('id="root"')) {
            return text;
          }
        }
      } catch {
        // proceed to next proxy
      }
    }

    throw new Error('All fetch methods for /api failed');
  }

  // Direct absolute external URL
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    return await response.text();
  } catch (err) {
    throw err;
  }
};

export const parserInstance = new MBooksParser(fetchHtml);

