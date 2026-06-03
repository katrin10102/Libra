import { Capacitor, CapacitorHttp } from '@capacitor/core';

export interface ParsedBook {
  title: string;
  coverImage: string;
  authorSeries?: string;
  orderInSeries?: string;
  pages?: number;
  publisher?: string;
  isbn: string;
  bookUrl: string;
  author?: string;
}

export class MBooksParser {
  private fetchHtml: (url: string) => Promise<string>;

  constructor(fetchHtml: (url: string) => Promise<string>) {
    this.fetchHtml = fetchHtml;
  }

  /**
   * Крок 1: Пошук книги за ISBN та повернення відносного шляху URL
   */
  async searchByIsbn(isbn: string): Promise<string | null> {
    const cleanIsbn = isbn.replace(/[-\s]/g, '');
    const url = `/api/search/?query=${encodeURIComponent(cleanIsbn)}`;
    const html = await this.fetchHtml(url);

    if (typeof DOMParser !== 'undefined') {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const link = doc.querySelector('a.product-image, a[href*="/book/"]');
        if (link) {
          const href = link.getAttribute('href');
          if (href) return href;
        }
      } catch (e) {
        console.warn('DOMParser failed, falling back to regex:', e);
      }
    }

    // Резервний варіант 1: Пошук посилання в HTML за допомогою regex
    const hrefRegex = /<a[^>]+href="([^"]*\/book\/[^"]*)"[^>]*>/i;
    const hrefMatch = html.match(hrefRegex);
    if (hrefMatch) return hrefMatch[1];

    // Резервний варіант 2: Пошук збігів у JSON-стейті Next.js (__next_f)
    const slugRegex = /\\?"slug\\?":\\?"([^"\\]+)\\?"/g;
    let match;
    while ((match = slugRegex.exec(html)) !== null) {
      const slug = match[1];
      if (/^\d+-/.test(slug)) {
        return `/book/${slug}/`;
      }
    }

    return null;
  }

  /**
   * Крок 2: Отримання детальних метаданих книги
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
    const imageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
    if (imageMatch) result.coverImage = imageMatch[1];

    // Парсинг характеристик по парах
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

    if (!result.isbn) {
      const isbnMatch = html.match(/ISBN\s*([\d-]+)/i);
      if (isbnMatch) result.isbn = isbnMatch[1].replace(/[-\s]/g, '');
    }

    if (!result.title) result.title = 'Невідома назва';
    if (!result.coverImage) result.coverImage = '';

    return result as ParsedBook;
  }
}

const fetchHtml = async (url: string): Promise<string> => {
  if (Capacitor.isNativePlatform()) {
    // Мобільний додаток (CapacitorHttp обходить CORS безпосередньо)
    const fullUrl = url.replace(/^\/api\//, 'https://mbooks.com.ua/');
    const response = await CapacitorHttp.get({ url: fullUrl });
    // response.data could be string or object depending on content-type, coerce to string
    if (typeof response.data === 'string') {
      return response.data;
    }
    return JSON.stringify(response.data);
  } else {
    // Локальний браузер через проксі Vite
    const response = await fetch(url);
    if (!response.ok) throw new Error('Помилка мережі');
    return response.text();
  }
};

export const parserInstance = new MBooksParser(fetchHtml);
