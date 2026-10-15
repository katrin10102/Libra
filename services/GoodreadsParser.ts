import type { ParsedBook } from './MBooksParser';

export interface GoodreadsPreview {
  title?: string;
  author?: string;
  coverImage?: string;
  numPages?: number;
  bookUrl?: string;
}

export class GoodreadsParser {
  private fetchHtml: (url: string) => Promise<string>;
  private lastSearchHtml: string | null = null;
  private lastPreview: GoodreadsPreview | null = null;

  constructor(fetchHtml: (url: string) => Promise<string>) {
    this.fetchHtml = fetchHtml;
  }

  /**
   * Stage 1: Search for the book by ISBN on Goodreads.
   * Query format specified by user:
   * https://www.goodreads.com/search?utf8=%E2%9C%93&query={ISBN}&tab=books&filter=all&page=1&q={ISBN}
   */
  async searchByIsbn(isbn: string): Promise<string | null> {
    const cleanIsbn = isbn.replace(/[-\s]/g, '');
    this.lastSearchHtml = null;
    this.lastPreview = null;

    // 1. Fast & reliable path: Official Goodreads Autocomplete API
    try {
      const acUrl = `/goodreads-api/book/auto_complete?format=json&q=${encodeURIComponent(cleanIsbn)}`;
      const jsonText = await this.fetchHtml(acUrl);
      if (jsonText && jsonText.trim().startsWith('[')) {
        const list = JSON.parse(jsonText);
        if (Array.isArray(list) && list.length > 0 && list[0].bookUrl) {
          this.lastPreview = {
            title: list[0].title,
            author: list[0].author?.name,
            coverImage: list[0].imageUrl ? list[0].imageUrl.replace(/\._S[XY]\d+_/, '') : '',
            numPages: list[0].numPages,
            bookUrl: list[0].bookUrl
          };
          return list[0].bookUrl;
        }
      }
    } catch {
      // Fallback to HTML search page if autocomplete produces no match
    }

    // 2. Fallback: Search page query
    const searchUrl = `/goodreads-api/search?utf8=%E2%9C%93&query=${encodeURIComponent(cleanIsbn)}&tab=books&filter=all&page=1&q=${encodeURIComponent(cleanIsbn)}`;

    try {
      const html = await this.fetchHtml(searchUrl);

      // Check if not blocked by WAF challenge
      if (html && !html.includes('awsWaf')) {
        // If Goodreads search redirected directly to the book page
        if (html.includes('data-testid="bookTitle"') || html.includes('application/ld+json')) {
          this.lastSearchHtml = html;
          // Extract canonical book href
          const canonicalMatch = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i) ||
                                 html.match(/<meta[^>]+property="og:url"[^>]+content="([^"]+)"/i);
          if (canonicalMatch) {
            const urlObj = new URL(canonicalMatch[1]);
            return urlObj.pathname;
          }
          return `/book/isbn/${cleanIsbn}`;
        }

        // Check if search results list contains book links
        if (typeof DOMParser !== 'undefined') {
          try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const link = doc.querySelector('a.bookTitle, a.bookCover, a[href*="/book/show/"]');
            if (link) {
              const href = link.getAttribute('href');
              if (href && !href.includes('/reviews')) return href;
            }
          } catch {}
        }

        const bookHrefMatch = html.match(/<a[^>]+class="[^"]*bookTitle[^"]*"[^>]+href="([^"?]+)"/i) ||
                              html.match(/href="(\/book\/show\/[^\/?"#]+)/i);
        if (bookHrefMatch && !bookHrefMatch[1].includes('/reviews')) {
          return bookHrefMatch[1];
        }
      }
    } catch {
      // Non-fatal, gracefully returns null to allow next provider fallback
    }

    return null;
  }

  /**
   * Stage 2: Fetch Goodreads book detail page and extract metadata
   */
  async getBookDetails(href: string, fallbackIsbn?: string): Promise<ParsedBook | null> {
    const cleanIsbn = fallbackIsbn?.replace(/[-\s]/g, '') || '';
    const cleanHref = href.startsWith('/') ? href : `/${href}`;

    let html = '';

    // If Stage 1 already loaded the book page directly, reuse it!
    if (this.lastSearchHtml && (this.lastSearchHtml.includes('data-testid="bookTitle"') || this.lastSearchHtml.includes('application/ld+json'))) {
      html = this.lastSearchHtml;
    } else {
      // Use .xml suffix to bypass AWS WAF challenges!
      const xmlUrl = `/goodreads-api${cleanHref.replace(/\.xml$/, '')}.xml`;
      try {
        html = await this.fetchHtml(xmlUrl);
      } catch (e) {
        // Fallback to normal URL if .xml fails
        try {
          html = await this.fetchHtml(`/goodreads-api${cleanHref}`);
        } catch (err) {
          console.warn('Failed to fetch book details HTML:', err);
        }
      }
    }

    const result: ParsedBook = {
      title: this.lastPreview?.title || '',
      author: this.lastPreview?.author || '',
      coverImage: this.lastPreview?.coverImage || '',
      authorSeries: '',
      orderInSeries: '',
      pages: this.lastPreview?.numPages,
      publisher: '',
      isbn: cleanIsbn,
      bookUrl: `https://www.goodreads.com${cleanHref.replace(/\.xml$/, '')}`
    };

    if (html && !html.includes('awsWaf')) {
      // 1. JSON-LD structured data (Primary Schema.org source)
      const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
      if (jsonLdMatch) {
        try {
          const ld = JSON.parse(jsonLdMatch[1]);
          if (ld.name) result.title = ld.name;
          if (ld.image) result.coverImage = ld.image;
          if (ld.numberOfPages) result.pages = parseInt(ld.numberOfPages, 10) || result.pages;
          if (ld.isbn) result.isbn = ld.isbn;
          if (ld.publisher) result.publisher = typeof ld.publisher === 'string' ? ld.publisher : ld.publisher.name || result.publisher;
          if (ld.author) {
            if (Array.isArray(ld.author)) {
              result.author = ld.author.map((a: any) => a.name).filter(Boolean).join(', ');
            } else if (ld.author.name) {
              result.author = ld.author.name;
            }
          }
        } catch (e) {
          console.warn('JSON-LD parse error in Goodreads:', e);
        }
      }

      // 2. Title fallback
      if (!result.title) {
        const titleMatch = html.match(/<h1[^>]*data-testid="bookTitle"[^>]*>([\s\S]*?)<\/h1>/i) ||
                           html.match(/<meta property="og:title" content="([^"]+)"/i);
        if (titleMatch) {
          result.title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
        }
      }

      // 3. Author fallback
      if (!result.author) {
        const authorMatches: string[] = [];
        const authorRegex = /class="ContributorLink__name"[^>]*>([\s\S]*?)<\/span>/gi;
        let m;
        while ((m = authorRegex.exec(html)) !== null) {
          const name = m[1].replace(/<[^>]+>/g, '').trim();
          if (name && !authorMatches.includes(name)) authorMatches.push(name);
        }
        if (authorMatches.length > 0) result.author = authorMatches.join(', ');
      }

      // 4. Cover image fallback & upgrade to original high resolution
      if (!result.coverImage) {
        const imgMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) ||
                         html.match(/<img[^>]+class="[^"]*ResponsiveImage[^"]*"[^>]+src="([^"]+)"/i);
        if (imgMatch) result.coverImage = imgMatch[1];
      }
      if (result.coverImage) {
        result.coverImage = result.coverImage.replace(/\._S[XY]\d+_/, '');
      }

      // 5. Series & Order in Series
      const seriesAriaMatch = html.match(/aria-label="Book\s*([^"]*?)\s+in the\s+([^"]+?)\s+series"/i);
      if (seriesAriaMatch) {
        result.orderInSeries = seriesAriaMatch[1]?.trim() || '';
        result.authorSeries = seriesAriaMatch[2]?.trim() || '';
      } else {
        const seriesLinkMatch = html.match(/<a[^>]+href="https:\/\/www\.goodreads\.com\/series\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i) ||
                                html.match(/<a[^>]+href="\/series\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
        if (seriesLinkMatch) {
          const text = seriesLinkMatch[1].replace(/<[^>]+>/g, '').trim();
          const numMatch = text.match(/(.*?)\s*#(\d+(?:\.\d+)?)/);
          if (numMatch) {
            result.authorSeries = numMatch[1].trim();
            result.orderInSeries = numMatch[2].trim();
          } else {
            result.authorSeries = text;
          }
        }
      }

      // Fallback for series from __NEXT_DATA__ Apollo State
      if (!result.authorSeries) {
        const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i);
        if (nextDataMatch) {
          try {
            const nextData = JSON.parse(nextDataMatch[1]);
            const apollo = nextData.props?.pageProps?.apolloState || {};
            for (const k of Object.keys(apollo)) {
              if (k.startsWith('Series:') && apollo[k]?.title) {
                result.authorSeries = apollo[k].title;
                break;
              }
            }
          } catch (e) {}
        }
      }

      // 6. Pages fallback
      if (!result.pages) {
        const pagesMatch = html.match(/data-testid="pagesFormat">([\s\S]*?)<\/p>/i);
        if (pagesMatch) {
          const p = parseInt(pagesMatch[1].replace(/<[^>]+>/g, '').trim(), 10);
          if (p) result.pages = p;
        }
      }

      // 7. Publisher fallback
      if (!result.publisher) {
        const pubInfoMatch = html.match(/data-testid="publicationInfo">([\s\S]*?)<\/p>/i);
        if (pubInfoMatch) {
          const text = pubInfoMatch[1].replace(/<[^>]+>/g, '').trim();
          const byIdx = text.lastIndexOf(' by ');
          if (byIdx !== -1) {
            result.publisher = text.slice(byIdx + 4).trim();
          }
        }
      }
      if (!result.publisher) {
        const pubJsonMatch = html.match(/"publisher":\s*"([^"]+)"/);
        if (pubJsonMatch) {
          result.publisher = pubJsonMatch[1].trim();
        }
      }

      // 8. Canonical book URL
      const canonicalMatch = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i) ||
                             html.match(/<meta[^>]+property="og:url"[^>]+content="([^"]+)"/i);
      if (canonicalMatch) {
        result.bookUrl = canonicalMatch[1];
      }
    }

    if (!result.title) result.title = 'Невідома назва';

    return result;
  }
}
