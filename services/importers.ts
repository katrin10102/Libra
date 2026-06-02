
import { Book, BookFormat } from "../types";
import { saveLibrary, loadLibrary } from "./storageService";
import { fetchBookCover } from "./api";
import { base64ToBlob } from "./imageUtils";
import { normalizeSeason } from "../utils";
import { createClientId } from "./id";

const parseSeasonList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => String(item).trim())
      .filter(Boolean)
      .map((item) => normalizeSeason(item));
    return Array.from(new Set(normalized));
  }

  if (typeof value !== "string") return [];

  const normalized = value
    .split(/[,;/\n]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => normalizeSeason(item));

  return Array.from(new Set(normalized));
};

export const importLibraryFromJSON = async (file: File): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const jsonString = e.target?.result as string;
        const parsedData = JSON.parse(jsonString);

        if (!parsedData || !Array.isArray(parsedData.books)) {
          throw new Error("Невірний формат файлу Libra");
        }

        const booksToImport = parsedData.books.map((book: any) => {
            if (book.coverUrl && book.coverUrl.startsWith('data:image')) {
                book.coverBlob = base64ToBlob(book.coverUrl);
                book.coverUrl = ''; 
            }
            if (book.seasons !== undefined) {
                book.seasons = parseSeasonList(book.seasons);
            }
            // Ensure sessions array exists
            if (!book.sessions) book.sessions = [];
            return book;
        });

        await saveLibrary({ books: booksToImport });
        resolve(true);
      } catch (err) {
        console.error("Import failed", err);
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
};

// Robust CSV Line Parser
const parseCSVLine = (line: string, delimiter: string): string[] => {
    const values: string[] = [];
    let current = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
            if (insideQuotes && nextChar === '"') {
                // Handle escaped quote "" -> "
                current += '"';
                i++; 
            } else {
                // Toggle quote state
                insideQuotes = !insideQuotes;
            }
        } else if (char === delimiter && !insideQuotes) {
            // Found delimiter outside quotes -> end of cell
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    values.push(current.trim());
    return values;
};

export const importLibraryFromCSV = async (file: File): Promise<number> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        let csvText = e.target?.result as string;
        if (csvText.charCodeAt(0) === 0xFEFF) {
          csvText = csvText.slice(1);
        }

        const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length < 2) throw new Error("Файл порожній або не містить даних");

        const firstLine = lines[0];
        const commaCount = (firstLine.match(/,/g) || []).length;
        const semicolonCount = (firstLine.match(/;/g) || []).length;
        const delimiter = semicolonCount > commaCount ? ';' : ',';
        
        // Use the robust parser for headers too
        const headers = parseCSVLine(firstLine, delimiter).map(h => h.toLowerCase().replace(/^\ufeff/, ''));
        const newBooks: Book[] = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) continue;

            // Use robust parser for data rows
            const row = parseCSVLine(line, delimiter);
            if (row.length < 1) continue;

            const book: Partial<Book> = {
                id: createClientId(),
                addedAt: new Date().toISOString(),
                formats: ['Paper'],
                status: 'Unread', 
                sessions: []
            };

            let hasTitle = false;

            // First pass: extract data regardless of order
            headers.forEach((header, index) => {
                const value = row[index];
                if (!value) return;

                if (header.includes('title') || header.includes('назва') || header.includes('книга') || header.includes('name')) {
                    book.title = value;
                    hasTitle = true;
                }
                else if (header.includes('author') || header.includes('автор')) book.author = value;
                else if (header.includes('publisher') || header.includes('видавництво')) book.publisher = value;
                else if (header.includes('series') || header.includes('серія')) book.seriesPart = value;
                else if (header.includes('pages') || header.includes('сторін')) book.pagesTotal = parseInt(value.replace(/\D/g, '')) || 0;
                else if (header.includes('rating') || header.includes('оцінка')) {
                    const parsedRating = parseInt(value);
                    if (!isNaN(parsedRating)) book.rating = parsedRating * 2;
                }
                else if (header.includes('isbn')) book.isbn = value;
                else if (header.includes('genre') || header.includes('жанр')) book.genre = value;
                else if (header.includes('season') || header.includes('сезон')) book.seasons = parseSeasonList(value);
                else if (header.includes('cover') || header.includes('фото')) book.coverUrl = value;
                else if (header.includes('date') || header.includes('дата') || header.includes('finished')) {
                     let dateStr = value.trim();
                     let parsedDate: Date | null = null;
                     const dmy = dateStr.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
                     if (dmy) {
                         parsedDate = new Date(parseInt(dmy[3]), parseInt(dmy[2]) - 1, parseInt(dmy[1]));
                     } else {
                         const d = new Date(dateStr);
                         if (!isNaN(d.getTime())) parsedDate = d;
                     }
                     if (parsedDate && !isNaN(parsedDate.getTime())) {
                         book.completedAt = parsedDate.toISOString();
                         book.status = 'Completed';
                     }
                }
                else if (header.includes('status') || header.includes('статус')) {
                    const s = value.toLowerCase();
                    if (s.includes('read') || s.includes('прочитано') || s.includes('completed')) {
                         book.status = 'Completed';
                         if (!book.completedAt) book.completedAt = new Date().toISOString();
                    }
                    else if (s.includes('reading') || s.includes('читаю')) book.status = 'Reading';
                    else if (s.includes('wish') || s.includes('бажання')) book.status = 'Wishlist';
                    else book.status = 'Unread';
                }
                else if (header.includes('format') || header.includes('формат')) {
                    const f = value.toLowerCase();
                    const formats: BookFormat[] = [];
                    if (f.includes('paper') || f.includes('папер')) formats.push('Paper');
                    if (f.includes('ebook') || f.includes('ел')) formats.push('E-book');
                    if (f.includes('audio') || f.includes('аудіо')) formats.push('Audio');
                    if (formats.length > 0) book.formats = formats;
                }
            });

            // Post-processing
            if (book.status === 'Completed') {
                 if (!book.completedAt) book.completedAt = new Date().toISOString();
                 
                 if (!book.pagesTotal && book.pagesRead) {
                    book.pagesTotal = book.pagesRead;
                 }
                 
                 if (book.pagesTotal) {
                     book.pagesRead = book.pagesTotal;
                 } else {
                     book.pagesRead = 0;
                 }
                 
                 // Create history session
                 const pages = book.pagesTotal || 0;
                 const estimatedDurationSeconds = pages > 0 ? Math.round(pages * 72) : 0;
                 const completionDate = book.completedAt ? book.completedAt.split('T')[0] : new Date().toISOString().split('T')[0];
                 
                 book.sessions = [{
                     id: createClientId(),
                     date: completionDate,
                     duration: estimatedDurationSeconds,
                     pages: pages
                 }];
            } else if (book.status === 'Reading') {
                if (book.pagesTotal && !book.pagesRead) {
                     book.pagesRead = 0;
                }
            }

            if (hasTitle) {
                if (!book.author) book.author = "Невідомий автор";
                newBooks.push(book as Book);
            }
        }
        
        // Fetch covers for imported books
        for (const b of newBooks) {
             if (!b.coverUrl || !b.coverUrl.trim()) {
                 try {
                     const foundCover = await fetchBookCover(b.title, b.author, b.isbn);
                     if (foundCover) b.coverUrl = foundCover;
                 } catch (e) { console.warn(e); }
             }
        }

        if (newBooks.length === 0) throw new Error("Не знайдено коректних книг.");

        const currentLibrary = await loadLibrary();
        const mergedLibrary = { books: [...currentLibrary.books, ...newBooks] };
        
        await saveLibrary(mergedLibrary);
        resolve(newBooks.length);
      } catch (err) {
        console.error("Import CSV failed", err);
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
};
