import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,application/json,*/*;q=0.8',
  'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': 'https://mbooks.com.ua/'
};

const GOODREADS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,application/json,*/*;q=0.8',
  'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': 'https://www.goodreads.com/'
};

async function fetchGoodreads(url: string, timeoutMs = 8000): Promise<{ status: number; text: string; finalUrl: string } | null> {
  try {
    let curUrl = url;
    let cookieHeader = '';

    for (let hop = 0; hop < 5; hop++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(curUrl, {
        headers: {
          ...GOODREADS_HEADERS,
          ...(cookieHeader ? { 'Cookie': cookieHeader } : {})
        },
        redirect: 'manual',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      // Collect Set-Cookie headers across redirects to prevent circular redirect loops
      const setCookies = (res.headers as any).getSetCookie ? (res.headers as any).getSetCookie() : [];
      if (Array.isArray(setCookies) && setCookies.length > 0) {
        const newCookies = setCookies.map((c: string) => c.split(';')[0]).join('; ');
        cookieHeader = cookieHeader ? `${cookieHeader}; ${newCookies}` : newCookies;
      } else {
        const singleCookie = res.headers.get('set-cookie');
        if (singleCookie) {
          const cookieVal = singleCookie.split(';')[0];
          cookieHeader = cookieHeader ? `${cookieHeader}; ${cookieVal}` : cookieVal;
        }
      }

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (location) {
          curUrl = new URL(location, curUrl).href;
          continue;
        }
      }

      const text = await res.text();
      return { status: res.status, text, finalUrl: curUrl };
    }
    return null;
  } catch {
    return null;
  }
}

const cleanAuthorString = (authorStr: string): string => {
  if (!authorStr) return 'Невідомий автор';
  
  const names = authorStr
    .split(/[,;\/&|]/)
    .map(s => s.trim())
    .filter(Boolean);

  const filtered = names.filter(name => {
    const lower = name.toLowerCase();
    return (
      !lower.includes('переклад') &&
      !lower.includes('іллюстратор') &&
      !lower.includes('ілюстратор') &&
      !lower.includes('редактор') &&
      !lower.includes('дизайн') &&
      !lower.includes('укладач') &&
      !lower.includes('художник') &&
      !lower.includes('автор:') &&
      !lower.includes('автори:')
    );
  });

  const candidates = filtered.length > 0 ? filtered : [authorStr.trim()];
  const uniqueNames: string[] = [];

  for (let name of candidates) {
    name = name.replace(/^[\s,;.-]+|[\s,;.-]+$/g, '').trim();
    if (!name || name === '-') continue;

    const exists = uniqueNames.some(u => u.toLowerCase() === name.toLowerCase());
    if (exists) continue;

    const hasCorruptedPrefix = uniqueNames.some(u => {
      if (name.length > u.length && name.endsWith(u)) {
        const prefix = name.slice(0, name.length - u.length).trim();
        if (prefix.length <= 2) return true;
      }
      return false;
    });
    if (hasCorruptedPrefix) continue;

    const corruptIndex = uniqueNames.findIndex(u => {
      if (u.length > name.length && u.endsWith(name)) {
        const prefix = u.slice(0, u.length - name.length).trim();
        if (prefix.length <= 2) return true;
      }
      return false;
    });

    if (corruptIndex !== -1) {
      uniqueNames[corruptIndex] = name;
      continue;
    }

    uniqueNames.push(name);
  }

  return uniqueNames.length > 0 ? uniqueNames.join(', ') : 'Невідомий автор';
};

const normalizeIsbn = (input?: string | null): string => {
  if (!input) return '';
  return input
    .replace(/^ISBN[-:\s]*/i, '')
    .replace(/^EAN[-:\s]*/i, '')
    .replace(/[\u0425\u0445]/g, 'X') // Ukrainian/Cyrillic 'Х'/'х' -> Latin 'X'
    .replace(/[^0-9Xx]/g, '')
    .trim();
};

// Disable caching for all API responses so mobile devices never get stale data
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// API: Direct Server-Side ISBN Lookup
app.get('/api/lookup-isbn', async (req, res) => {
  const rawIsbn = req.query.isbn as string;
  const cleanIsbn = normalizeIsbn(rawIsbn);

  if (!cleanIsbn) {
    return res.status(400).json({ error: 'ISBN is required' });
  }

  // 1. Try MBooks Search (Primary Ukrainian source)
  try {
    const searchUrl = `https://mbooks.com.ua/search/?query=${encodeURIComponent(cleanIsbn)}`;
    const searchRes = await fetch(searchUrl, { headers: BROWSER_HEADERS });
    const searchHtml = await searchRes.text();

    let bookSlug: string | null = null;
    const slugRegex = /slug[^:]*:\s*[^0-9]*(\d+-[a-zA-Z0-9_-]+)/gi;
    let match;
    while ((match = slugRegex.exec(searchHtml)) !== null) {
      if (/^\d+-/.test(match[1])) {
        bookSlug = match[1];
        break;
      }
    }

    if (!bookSlug) {
      const hrefRegex = /\/book\/(\d+-[a-zA-Z0-9_-]+)/g;
      let hrefMatch;
      while ((hrefMatch = hrefRegex.exec(searchHtml)) !== null) {
        bookSlug = hrefMatch[1];
        break;
      }
    }

    if (bookSlug) {
      const bookUrl = `https://mbooks.com.ua/book/${bookSlug}/`;
      const bookRes = await fetch(bookUrl, { headers: BROWSER_HEADERS });
      const bookHtml = await bookRes.text();

      const result: any = {
        isbn: cleanIsbn,
        bookUrl
      };

      // Title
      const titleMatch = bookHtml.match(/<h1[^>]*data-cy="book-title"[^>]*>([\s\S]*?)<\/h1>/i) ||
                         bookHtml.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
      if (titleMatch) {
        result.title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
      }

      // Authors from links
      const authorSlugMap = new Map<string, string>();
      const authorRegex = /<a[^>]+href=["'](\/authors\/([^/"']+)\/?)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let authorMatch;
      while ((authorMatch = authorRegex.exec(bookHtml)) !== null) {
        const slug = authorMatch[2];
        const innerHtml = authorMatch[3];
        const pMatch = innerHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
        let name = '';
        if (pMatch) {
          name = pMatch[1].replace(/<[^>]+>/g, '').trim();
        } else {
          const cleaned = innerHtml.replace(/<div[\s\S]*?<\/div>/gi, '').replace(/<[^>]+>/g, '').trim();
          name = cleaned || innerHtml.replace(/<[^>]+>/g, '').trim();
        }
        if (name && slug) {
          if (!authorSlugMap.has(slug) || name.length < authorSlugMap.get(slug)!.length) {
            authorSlugMap.set(slug, name);
          }
        }
      }

      if (authorSlugMap.size > 0) {
        result.author = cleanAuthorString(Array.from(authorSlugMap.values()).join(', '));
      } else {
        const stateAuthorMatch = bookHtml.match(/[\\"]*firstName[\\"]*:\s*[\\"]*([^"\\]+)[\\"]*,\s*[\\"]*lastName[\\"]*:\s*[\\"]*([^"\\]+)[\\"]*/i);
        if (stateAuthorMatch) {
          result.author = cleanAuthorString(`${stateAuthorMatch[1]} ${stateAuthorMatch[2]}`);
        }
      }

      // Cover
      const coverMatch = bookHtml.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) ||
                         bookHtml.match(/<meta\s+name="twitter:image"\s+content="([^"]+)"/i);
      if (coverMatch) {
        let cover = coverMatch[1];
        if (cover.startsWith('http:')) cover = cover.replace('http:', 'https:');
        result.coverImage = cover;
      }

      // Grid-based details
      const pairRegex = /<span\s+[^>]*class="[^"]*opacity-70[^"]*"[^>]*>([^<]+)<\/span>\s*<\/div>\s*<div\s+[^>]*>\s*(?:<a\s+[^>]*>\s*)?<span\s+[^>]*>([\s\S]*?)<\/span>/gi;
      let matchPair;
      while ((matchPair = pairRegex.exec(bookHtml)) !== null) {
        const label = matchPair[1].replace(/<[^>]+>/g, '').trim();
        const value = matchPair[2].replace(/<[^>]+>/g, '').trim();

        if (label.includes('Кількість сторінок')) {
          const num = parseInt(value, 10);
          if (!isNaN(num)) result.pages = num;
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

      if (result.title && result.title !== 'Невідома назва') {
        return res.json({ success: true, source: 'mbooks', data: result });
      }
    }
  } catch (e: any) {
    console.warn('MBooks server search failed:', e?.message || e);
  }

  // 2. Try Goodreads Search (Secondary comprehensive source)
  try {
    let grBookHref: string | null = null;
    let grBookHtml = '';
    let grPreview: any = null;

    // Fast path: Goodreads autocomplete API (instant JSON, handles redirects seamlessly)
    const acUrl = `https://www.goodreads.com/book/auto_complete?format=json&q=${encodeURIComponent(cleanIsbn)}`;
    const acRes = await fetchGoodreads(acUrl, 5000);
    if (acRes && acRes.status === 200) {
      try {
        const acList = JSON.parse(acRes.text);
        if (Array.isArray(acList) && acList.length > 0 && acList[0].bookUrl) {
          grBookHref = acList[0].bookUrl;
          grPreview = acList[0];
        }
      } catch {}
    }

    // If autocomplete identified the book, fetch details (with .xml bypass for speed and reliability)
    if (grBookHref) {
      const cleanPath = grBookHref.startsWith('/') ? grBookHref : '/' + grBookHref;
      const detailXmlUrl = `https://www.goodreads.com${cleanPath.replace(/\.xml$/, '')}.xml`;
      const detailRes = await fetchGoodreads(detailXmlUrl, 8000);
      if (detailRes && detailRes.status === 200 && !detailRes.text.includes('awsWaf')) {
        grBookHtml = detailRes.text;
      } else {
        const detailHtmlUrl = `https://www.goodreads.com${cleanPath}`;
        const detailHtmlRes = await fetchGoodreads(detailHtmlUrl, 8000);
        if (detailHtmlRes && detailHtmlRes.status === 200 && !detailHtmlRes.text.includes('awsWaf')) {
          grBookHtml = detailHtmlRes.text;
        }
      }
    }

    // Fallback: If autocomplete didn't locate the book, attempt HTML search page
    if (!grBookHtml && !grPreview) {
      const grSearchUrl = `https://www.goodreads.com/search?utf8=%E2%9C%93&query=${encodeURIComponent(cleanIsbn)}&tab=books&filter=all&page=1&q=${encodeURIComponent(cleanIsbn)}`;
      const searchRes = await fetchGoodreads(grSearchUrl, 8000);
      if (searchRes && searchRes.status === 200 && !searchRes.text.includes('awsWaf')) {
        const grHtml = searchRes.text;
        if (grHtml.includes('data-testid="bookTitle"') || grHtml.includes('application/ld+json')) {
          grBookHtml = grHtml;
          const canonicalMatch = grHtml.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i) ||
                                 grHtml.match(/<meta[^>]+property="og:url"[^>]+content="([^"]+)"/i);
          grBookHref = canonicalMatch ? new URL(canonicalMatch[1]).pathname : `/book/isbn/${cleanIsbn}`;
        } else {
          const hrefMatch = grHtml.match(/<a[^>]+class="[^"]*bookTitle[^"]*"[^>]+href="([^"?]+)"/i) ||
                            grHtml.match(/href="(\/book\/show\/[^\/?"#]+)/i);
          if (hrefMatch && !hrefMatch[1].includes('/reviews')) {
            grBookHref = hrefMatch[1];
            const detailUrl = `https://www.goodreads.com${grBookHref.startsWith('/') ? grBookHref : '/' + grBookHref}.xml`;
            const detailRes = await fetchGoodreads(detailUrl, 8000);
            if (detailRes && detailRes.status === 200 && !detailRes.text.includes('awsWaf')) {
              grBookHtml = detailRes.text;
            }
          }
        }
      }
    }

    if (grBookHtml || grPreview) {
      const grResult: any = {
        isbn: cleanIsbn,
        bookUrl: grBookHref ? `https://www.goodreads.com${grBookHref.replace(/\.xml$/, '')}` : `https://www.goodreads.com/search?q=${cleanIsbn}`,
        title: grPreview?.title || '',
        author: grPreview?.author?.name || '',
        coverImage: grPreview?.imageUrl ? grPreview.imageUrl.replace(/\._S[XY]\d+_/, '') : '',
        pages: grPreview?.numPages || undefined,
        authorSeries: '',
        orderInSeries: ''
      };

      if (grBookHtml) {
        // 1. JSON-LD structured data
        const jsonLdMatch = grBookHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
        if (jsonLdMatch) {
          try {
            const ld = JSON.parse(jsonLdMatch[1]);
            if (ld.name) grResult.title = ld.name;
            if (ld.image) grResult.coverImage = ld.image;
            if (ld.numberOfPages) grResult.pages = parseInt(ld.numberOfPages, 10) || grResult.pages;
            if (ld.isbn) grResult.isbn = normalizeIsbn(ld.isbn) || grResult.isbn;
            if (ld.publisher) grResult.publisher = typeof ld.publisher === 'string' ? ld.publisher : ld.publisher.name || '';
            if (ld.author) {
              if (Array.isArray(ld.author)) {
                grResult.author = ld.author.map((a: any) => a.name).filter(Boolean).join(', ');
              } else if (ld.author.name) {
                grResult.author = ld.author.name;
              }
            }
          } catch {}
        }

        // Title fallback
        if (!grResult.title) {
          const tMatch = grBookHtml.match(/<h1[^>]*data-testid="bookTitle"[^>]*>([\s\S]*?)<\/h1>/i) ||
                         grBookHtml.match(/<meta property="og:title" content="([^"]+)"/i);
          if (tMatch) grResult.title = tMatch[1].replace(/<[^>]+>/g, '').trim();
        }

        // Author fallback
        if (!grResult.author) {
          const authorList: string[] = [];
          const aRegex = /class="ContributorLink__name"[^>]*>([\s\S]*?)<\/span>/gi;
          let am;
          while ((am = aRegex.exec(grBookHtml)) !== null) {
            const n = am[1].replace(/<[^>]+>/g, '').trim();
            if (n && !authorList.includes(n)) authorList.push(n);
          }
          if (authorList.length > 0) grResult.author = authorList.join(', ');
        }

        // Cover image fallback & high-res upgrade
        if (!grResult.coverImage) {
          const cMatch = grBookHtml.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) ||
                         grBookHtml.match(/<img[^>]+class="[^"]*ResponsiveImage[^"]*"[^>]+src="([^"]+)"/i);
          if (cMatch) grResult.coverImage = cMatch[1];
        }

        // Series & Order in Series
        const seriesAriaMatch = grBookHtml.match(/aria-label="Book\s*([^"]*?)\s+in the\s+([^"]+?)\s+series"/i);
        if (seriesAriaMatch) {
          grResult.orderInSeries = seriesAriaMatch[1]?.trim() || '';
          grResult.authorSeries = seriesAriaMatch[2]?.trim() || '';
        } else {
          const sMatch = grBookHtml.match(/<a[^>]+href="[^"]*\/series\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
          if (sMatch) {
            const st = sMatch[1].replace(/<[^>]+>/g, '').trim();
            const nm = st.match(/(.*?)\s*#(\d+(?:\.\d+)?)/);
            if (nm) {
              grResult.authorSeries = nm[1].trim();
              grResult.orderInSeries = nm[2].trim();
            } else {
              grResult.authorSeries = st;
            }
          }
        }

        // Pages fallback
        if (!grResult.pages) {
          const pMatch = grBookHtml.match(/data-testid="pagesFormat">([\s\S]*?)<\/p>/i) ||
                         grBookHtml.match(/(\d+)\s+pages/i);
          if (pMatch) {
            const num = parseInt(pMatch[1].replace(/\D/g, ''), 10);
            if (!isNaN(num) && num > 0) grResult.pages = num;
          }
        }

        // Publisher fallback
        if (!grResult.publisher) {
          const pubMatch = grBookHtml.match(/Published\s+[^<]*?by\s+([^<.]+)/i) ||
                           grBookHtml.match(/"publisher":\s*"([^"]+)"/);
          if (pubMatch) grResult.publisher = pubMatch[1].trim();
        }
      }

      if (grResult.author) {
        grResult.author = cleanAuthorString(grResult.author);
      }
      if (grResult.coverImage) {
        grResult.coverImage = grResult.coverImage.replace(/\._S[XY]\d+_/, '');
      }

      if (grResult.title && grResult.title !== 'Невідома назва') {
        return res.json({ success: true, source: 'goodreads', data: grResult });
      }
    }
  } catch {
    // Seamless fallback to Open Library and Google Books
  }

  // 3. Fallback to Open Library
  try {
    const olUrl = `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`;
    const olRes = await fetch(olUrl, {
      headers: {
        'User-Agent': 'LibraApp/1.0 (ReadingTracker; contact@libra-app.internal)'
      }
    });
    const olData = await olRes.json();
    const bibKey = `ISBN:${cleanIsbn}`;

    if (olData && olData[bibKey]) {
      const info = olData[bibKey];
      let cover = '';
      if (info.cover) {
        cover = info.cover.large || info.cover.medium || info.cover.small || '';
        if (cover.startsWith('http:')) cover = cover.replace('http:', 'https:');
      }

      return res.json({
        success: true,
        source: 'openlibrary',
        data: {
          title: info.title || 'Невідома назва',
          author: cleanAuthorString(info.authors ? info.authors.map((a: any) => a.name).join(', ') : 'Невідомий автор'),
          coverImage: cover,
          pages: info.number_of_pages || undefined,
          publisher: info.publishers ? info.publishers.map((p: any) => p.name).join(', ') : 'Open Library',
          isbn: cleanIsbn,
          bookUrl: info.url || `https://openlibrary.org/isbn/${cleanIsbn}`,
          authorSeries: '',
          orderInSeries: ''
        }
      });
    }
  } catch (e: any) {
    console.warn('Open Library server search failed:', e?.message || e);
  }

  // 3. Fallback to Open Library search.json
  try {
    const searchUrl = `https://openlibrary.org/search.json?isbn=${cleanIsbn}`;
    const searchRes = await fetch(searchUrl);
    const sData = await searchRes.json();

    if (sData.docs && sData.docs.length > 0) {
      const doc = sData.docs[0];
      let cover = '';
      if (doc.cover_i) {
        cover = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
      }

      return res.json({
        success: true,
        source: 'openlibrary-search',
        data: {
          title: doc.title || 'Невідома назва',
          author: cleanAuthorString(doc.author_name ? doc.author_name.join(', ') : 'Невідомий автор'),
          coverImage: cover,
          pages: doc.number_of_pages_median || undefined,
          publisher: doc.publisher ? (Array.isArray(doc.publisher) ? doc.publisher[0] : doc.publisher) : 'Open Library',
          isbn: cleanIsbn,
          bookUrl: `https://openlibrary.org/isbn/${cleanIsbn}`,
          authorSeries: '',
          orderInSeries: ''
        }
      });
    }
  } catch (e: any) {
    console.warn('Open Library search.json failed:', e?.message || e);
  }

  // 4. Fallback to Google Books API
  try {
    const gbUrl = `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}`;
    const gbRes = await fetch(gbUrl);
    const gbData = await gbRes.json();

    if (gbData.items && gbData.items.length > 0) {
      const volumeInfo = gbData.items[0].volumeInfo;
      let cover = '';
      if (volumeInfo.imageLinks) {
        cover = volumeInfo.imageLinks.thumbnail || volumeInfo.imageLinks.smallThumbnail || '';
        if (cover.startsWith('http:')) cover = cover.replace('http:', 'https:');
      }

      return res.json({
        success: true,
        source: 'googlebooks',
        data: {
          title: volumeInfo.title || 'Невідома назва',
          author: cleanAuthorString(volumeInfo.authors ? volumeInfo.authors.join(', ') : 'Невідомий автор'),
          coverImage: cover,
          pages: volumeInfo.pageCount || undefined,
          publisher: volumeInfo.publisher || 'Google Books',
          isbn: cleanIsbn,
          bookUrl: volumeInfo.infoLink || `https://books.google.com/books?vid=ISBN${cleanIsbn}`,
          authorSeries: '',
          orderInSeries: ''
        }
      });
    }
  } catch (e: any) {
    console.warn('Google Books server search failed:', e?.message || e);
  }

  return res.status(404).json({ success: false, message: 'Book not found' });
});

// Proxy for Goodreads requests (search, book details, autocomplete)
app.use('/goodreads-api', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  try {
    const subPath = req.url;
    const targetUrl = `https://www.goodreads.com${subPath.startsWith('/') ? subPath : '/' + subPath}`;
    const result = await fetchGoodreads(targetUrl, 10000);
    if (!result) {
      return res.status(502).send('Goodreads service unavailable');
    }
    const contentType = subPath.includes('format=json') ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8';
    res.setHeader('Content-Type', contentType);
    res.status(result.status).send(result.text);
  } catch (e: any) {
    res.status(500).send(e?.message || 'Goodreads proxy error');
  }
});

// Proxy for mbooks search and book detail
app.get('/api/search', async (req, res) => {
  try {
    const query = (req.query.query as string) || '';
    const response = await fetch(`https://mbooks.com.ua/search/?query=${encodeURIComponent(query)}`, {
      headers: BROWSER_HEADERS
    });
    const text = await response.text();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(text);
  } catch (e: any) {
    res.status(500).send(e.message || 'Proxy search error');
  }
});

app.use('/api/book', async (req, res) => {
  try {
    const slug = req.url.replace(/^\//, '');
    const response = await fetch(`https://mbooks.com.ua/book/${slug}`, {
      headers: BROWSER_HEADERS
    });
    const text = await response.text();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(text);
  } catch (e: any) {
    res.status(500).send(e.message || 'Proxy book error');
  }
});

// Universal fallback proxy for static clients
app.get('/api/proxy', async (req, res) => {
  try {
    const target = req.query.url as string;
    if (
      !target ||
      (!target.startsWith('https://mbooks.com.ua') &&
       !target.startsWith('https://openlibrary.org') &&
       !target.startsWith('https://www.goodreads.com'))
    ) {
      return res.status(400).send('Invalid target URL');
    }
    if (target.startsWith('https://www.goodreads.com')) {
      const result = await fetchGoodreads(target, 10000);
      if (!result) {
        return res.status(502).send('Goodreads proxy error');
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(result.status).send(result.text);
    }
    const response = await fetch(target, { headers: BROWSER_HEADERS, redirect: 'follow' });
    const text = await response.text();
    const contentType = response.headers.get('content-type') || 'text/html; charset=utf-8';
    res.setHeader('Content-Type', contentType);
    res.send(text);
  } catch (e: any) {
    res.status(500).send(e.message || 'Proxy error');
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use((req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Libra server running on http://localhost:${PORT}`);
  });
}

startServer();
