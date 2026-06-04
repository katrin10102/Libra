import { Capacitor, CapacitorHttp } from '@capacitor/core';

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
    const cleanIsbn = isbn.replace(/[-\s]/g, '');
    const url = `/api/search/?query=${encodeURIComponent(cleanIsbn)}`;
    const html = await this.fetchHtml(url);
    
    // Attempt DOM parser if available (e.g. in browser context)
    if (typeof DOMParser !== 'undefined') {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        // Look for the product image link as requested
        const link = doc.querySelector('a.product-image, a[href*="/book/"]');
        if (link) {
          const href = link.getAttribute('href');
          if (href) return href;
        }
      } catch (e) {
        console.warn('DOMParser failed, falling back to regex:', e);
      }
    }

    // Fallback 1: Regex matching simple link
    const hrefRegex = /<a[^>]+href="([^"]*\/book\/[^"]*)"[^>]*>/i;
    const hrefMatch = html.match(hrefRegex);
    if (hrefMatch) {
      return hrefMatch[1];
    }

    // Fallback 2: Next.js script state slug matching
    const slugRegex = /\\?"slug\\?":\\?"([^"\\]+)\\?"/g;
    let match;
    while ((match = slugRegex.exec(html)) !== null) {
      const slug = match[1];
      // Book slugs start with digits (e.g., 753864-numo-...)
      if (/^\d+-/.test(slug)) {
        return `/book/${slug}/`;
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

    const result: Partial<ParsedBook> = {
      bookUrl: `https://mbooks.com.ua${cleanHref}`
    };

    // 1. Title (from data-cy="book-title" or fallback to og:title)
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

    // 2. Author (from /authors/ link)
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
      result.author = authors.join(', ');
    }

    // 3. Cover Image
    const imageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) ||
                       html.match(/<meta\s+name="twitter:image"\s+content="([^"]+)"/i);
    if (imageMatch) {
      result.coverImage = imageMatch[1];
    }

    // 3. Grid-based details parsing
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
        result.isbn = value;
      }
    }

    // Fallbacks
    if (!result.isbn) {
      const isbnMatch = html.match(/ISBN\s*([\d-]+)/i);
      if (isbnMatch) {
        result.isbn = isbnMatch[1].replace(/[-\s]/g, '');
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
    const cleanIsbn = isbn.replace(/[-\s]/g, '');
    const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}`;
    const jsonText = await this.fetchHtml(url);
    
    try {
      const data = JSON.parse(jsonText);
      if (!data.items || data.items.length === 0) return null;
      
      const volumeInfo = data.items[0].volumeInfo;
      
      // Extract ISBN
      let parsedIsbn = cleanIsbn;
      if (volumeInfo.industryIdentifiers) {
        const idObj = volumeInfo.industryIdentifiers.find((id: any) => id.type === 'ISBN_13') || 
                      volumeInfo.industryIdentifiers.find((id: any) => id.type === 'ISBN_10');
        if (idObj) {
          parsedIsbn = idObj.identifier;
        }
      }

      // Extract high-quality cover if available
      let cover = '';
      if (volumeInfo.imageLinks) {
        cover = volumeInfo.imageLinks.thumbnail || volumeInfo.imageLinks.smallThumbnail || '';
        if (cover.startsWith('http:')) {
          cover = cover.replace('http:', 'https:');
        }
      }

      return {
        title: volumeInfo.title || 'Невідома назва',
        author: volumeInfo.authors ? volumeInfo.authors.join(', ') : 'Невідомий автор',
        coverImage: cover,
        pages: volumeInfo.pageCount || undefined,
        publisher: volumeInfo.publisher || 'Google Books',
        isbn: parsedIsbn,
        bookUrl: volumeInfo.infoLink || `https://books.google.com/books?vid=ISBN${cleanIsbn}`,
        authorSeries: '',
        orderInSeries: ''
      };
    } catch (e) {
      console.error('Failed to parse Google Books response:', e);
      return null;
    }
  }

  /**
   * Fallback Stage 2: Search in Open Library API by ISBN
   */
  async searchOpenLibrary(isbn: string): Promise<ParsedBook | null> {
    const cleanIsbn = isbn.replace(/[-\s]/g, '');
    const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`;
    const jsonText = await this.fetchHtml(url);

    try {
      const data = JSON.parse(jsonText);
      const bibKey = `ISBN:${cleanIsbn}`;
      if (!data[bibKey]) return null;

      const bookInfo = data[bibKey];
      
      const title = bookInfo.title || 'Невідома назва';
      const author = bookInfo.authors ? bookInfo.authors.map((a: any) => a.name).join(', ') : 'Невідомий автор';
      
      let cover = '';
      if (bookInfo.cover) {
        cover = bookInfo.cover.large || bookInfo.cover.medium || bookInfo.cover.small || '';
        if (cover.startsWith('http:')) {
          cover = cover.replace('http:', 'https:');
        }
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
    } catch (e) {
      console.error('Failed to parse Open Library response:', e);
      return null;
    }
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
    const cleanIsbn = isbn.replace(/[-\s]/g, '');
    
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
      console.error('Open Library search failed:', e);
    }

    return null;
  }
}

const fetchHtml = async (url: string): Promise<string> => {
  if (Capacitor.isNativePlatform()) {
    // Мобільний додаток (CapacitorHttp обходить CORS безпосередньо)
    const fullUrl = url.replace(/^\/api\//, 'https://mbooks.com.ua/');
    const response = await CapacitorHttp.get({ url: fullUrl });
    if (typeof response.data === 'string') {
      return response.data;
    }
    return JSON.stringify(response.data);
  } else {
    let finalUrl = url;
    
    // Check if we are running in non-local production (like GitHub Pages)
    const isProductionStatic = typeof window !== 'undefined' && 
      !window.location.hostname.includes('localhost') && 
      !window.location.hostname.includes('127.0.0.1') && 
      !window.location.hostname.includes('run.app');

    if (url.startsWith('/api')) {
      if (isProductionStatic) {
        // На GitHub Pages немає бекенду, тому ми використовуємо CORS-проксі для зв'язку з mbooks
        const targetUrl = `https://mbooks.com.ua${url.substring(4)}`;
        finalUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
      }
    }

    const response = await fetch(finalUrl);
    if (!response.ok) throw new Error('Помилка мережі');
    return response.text();
  }
};

export const parserInstance = new MBooksParser(fetchHtml);

