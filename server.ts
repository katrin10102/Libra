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

const cleanAuthorString = (authorStr: string): string => {
  if (!authorStr) return 'Невідомий автор';
  const names = authorStr.split(/[,;\/&]/).map(s => s.trim()).filter(Boolean);
  const filtered = names.filter(n => !n.toLowerCase().includes('переклад') && !n.toLowerCase().includes('іллюстратор'));
  return filtered.length > 0 ? filtered.join(', ') : authorStr.trim();
};

const normalizeIsbn = (input?: string | null): string => {
  if (!input) return '';
  return input
    .replace(/^ISBN[-:\s]*/i, '')
    .replace(/^EAN[-:\s]*/i, '')
    .replace(/[^0-9Xx]/g, '')
    .trim();
};

// API: Direct Server-Side ISBN Lookup
app.get('/api/lookup-isbn', async (req, res) => {
  const rawIsbn = req.query.isbn as string;
  const cleanIsbn = normalizeIsbn(rawIsbn);

  if (!cleanIsbn) {
    return res.status(400).json({ error: 'ISBN is required' });
  }

  // 1. Try MBooks Search
  try {
    const searchUrl = `https://mbooks.com.ua/search/?query=${encodeURIComponent(cleanIsbn)}`;
    const searchRes = await fetch(searchUrl, { headers: BROWSER_HEADERS });
    const searchHtml = await searchRes.text();

    const slugRegex = /[\\"]*slug[\\"]*:\s*[\\"]*(\d+-[^"\\\s,]+)/g;
    let match;
    let bookSlug: string | null = null;

    while ((match = slugRegex.exec(searchHtml)) !== null) {
      const slug = match[1].replace(/\\+$/, '');
      if (/^\d+-/.test(slug)) {
        bookSlug = slug;
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
      const authorRegex = /<a[^>]+href="\/authors\/[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
      const authors: string[] = [];
      let authorMatch;
      while ((authorMatch = authorRegex.exec(bookHtml)) !== null) {
        const aName = authorMatch[1].replace(/<[^>]+>/g, '').trim();
        if (aName && !authors.includes(aName)) authors.push(aName);
      }
      if (authors.length > 0) {
        result.author = cleanAuthorString(authors.join(', '));
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

  // 2. Fallback to Open Library
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

  return res.status(404).json({ success: false, message: 'Book not found' });
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
    if (!target || (!target.startsWith('https://mbooks.com.ua') && !target.startsWith('https://openlibrary.org'))) {
      return res.status(400).send('Invalid target URL');
    }
    const response = await fetch(target, { headers: BROWSER_HEADERS });
    const text = await response.text();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
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
