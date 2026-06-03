
export type BookFormat = 'Paper' | 'E-book' | 'Audio' | 'Pirate' | 'Expected' | 'Sold';
export type BookStatus = 'Reading' | 'Completed' | 'Wishlist' | 'Unread';

export interface ReadingSessionData {
  id: string;
  date: string; // YYYY-MM-DD
  duration: number; // in seconds
  pages: number; // number of pages read in this session (or percentage points for Audio)
  format?: BookFormat;
  cycleIndex?: number;
}

export interface Book {
  id: string;
  version?: number;
  updatedAt?: string;
  customOrder?: number;
  title: string;
  author: string;
  formats: BookFormat[];
  status: BookStatus;
  isbn?: string;
  genre?: string;
  seasons?: string[];
  publisher?: string;
  series?: string; // Series Name (e.g. Harry Potter)
  seriesPart?: string; // Series Number (e.g. Vol 1)
  
  coverUrl?: string; // Used for UI display (blob:...) OR external links (https:...)
  coverBlob?: Blob;  // Stored in IndexedDB for optimized local images
  
  pagesTotal?: number;
  pagesRead?: number;
  rating?: number;
  description?: string;
  notes?: string; // Emoji only notes
  comment?: string; // Text comment
  
  // Reading tracking specifics
  selectedReadingFormat?: BookFormat; // The format user is currently reading
  readingPagesTotal?: number; // Specific page count for the selected format (e.g. e-book pages differ from paper)

  addedAt: string;
  timestamp?: string;
  wishlistedAt?: string;
  readingStartedAt?: string;
  completedAt?: string;
  completedDates?: string[];
  currentCycleIndex?: number;
  // readingDates removed in favor of sessions
  sessions: ReadingSessionData[]; // Detailed history
}

export type ViewType = 'statistics' | 'library' | 'reading' | 'add' | 'calendar' | 'wishlist' | 'settings' | 'history';

export interface LibraryState {
  books: Book[];
}

export type AccentColor = 'indigo' | 'rose' | 'amber' | 'emerald' | 'violet' | 'sky' | 'pink' | 'gold' | 'black' | 'white';
export type BackgroundTone = 'cool' | 'warm' | 'pink' | 'peach' | 'mint' | 'dark' | 'midnight' | 'forest';
export type AppLanguage = 'en' | 'uk';

export interface AppSettings {
  accent: AccentColor;
  bg: BackgroundTone;
  language?: AppLanguage;
}

export type SortKey = 'title' | 'author' | 'addedAt' | 'genre' | 'custom';
export type SortDirection = 'asc' | 'desc';
