import { AccentColor, BackgroundTone, Book, BookFormat, BookStatus } from './types';

export const FORMAT_LABELS: Record<BookFormat, string> = {
  Paper: 'Paper',
  'E-book': 'E-book',
  Audio: 'Audio',
  Pirate: 'Pirate',
  Expected: 'Expected',
  Sold: 'Sold',
};

export const STATUS_LABELS: Record<BookStatus, string> = {
  Reading: 'Reading',
  Completed: 'Completed',
  Unread: 'Unread',
  Wishlist: 'Wishlist',
};

export const SEASON_OPTIONS = ['Winter', 'Spring', 'Summer', 'Autumn'] as const;

const UA_SEASONS = {
  winter: '\u0437\u0438\u043c\u0430',
  spring: '\u0432\u0435\u0441\u043d\u0430',
  summer: '\u043b\u0456\u0442\u043e',
  autumn: '\u043e\u0441\u0456\u043d\u044c',
};

const RU_SEASONS = {
  summer: '\u043b\u0435\u0442\u043e',
  autumn: '\u043e\u0441\u0435\u043d\u044c',
};

export const normalizeSeason = (value: string): string => {
  const v = value.trim().toLowerCase();
  if (!v) return '';

  if (v === 'winter' || v === UA_SEASONS.winter || v === 'zyma') return 'Winter';
  if (v === 'spring' || v === UA_SEASONS.spring || v === 'vesna') return 'Spring';
  if (v === 'summer' || v === UA_SEASONS.summer || v === RU_SEASONS.summer || v === 'lito') return 'Summer';
  if (v === 'autumn' || v === 'fall' || v === UA_SEASONS.autumn || v === RU_SEASONS.autumn || v === 'osin') return 'Autumn';

  return value.trim();
};

export const getSeasonColorClass = (season: string): string => {
  switch (normalizeSeason(season)) {
    case 'Winter':
      return 'bg-sky-100 text-sky-700';
    case 'Spring':
      return 'bg-violet-100 text-violet-700';
    case 'Summer':
      return 'bg-emerald-100 text-emerald-700';
    case 'Autumn':
      return 'bg-orange-100 text-orange-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
};

// Helper to get the effective total pages (using reading specific total if set)
export const getBookPageTotal = (book: Book) => {
  if (book.selectedReadingFormat === 'Audio') return 100;
  return book.readingPagesTotal || book.pagesTotal || 0;
};

export const calculateProgress = (read?: number, total?: number) => {
  if (!read || !total) return 0;
  return Math.min(100, Math.round((read / total) * 100));
};

export const formatTime = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export const getRatingColor = (rating: number) => {
  if (rating <= 2) return '#3E2723';
  if (rating <= 4) return '#5D4037';
  if (rating <= 6) return '#8D6E63';
  if (rating <= 8) return '#FBC02D';
  return '#FFD700';
};

export const calculateAverageSpeed = (book: Book) => {
  if (book.selectedReadingFormat === 'Audio') return 0;
  if (!book.sessions || book.sessions.length === 0) return 0;
  const totalPages = book.sessions.reduce((acc, s) => acc + Number(s.pages), 0);
  const totalSeconds = book.sessions.reduce((acc, s) => acc + Number(s.duration), 0);
  return totalSeconds > 0 ? Math.round(totalPages / (totalSeconds / 3600)) : 0;
};

export const calculateTotalReadingTime = (book: Book) => {
  if (!book.sessions) return 0;
  return Math.round(book.sessions.reduce((acc, s) => acc + Number(s.duration), 0) / 60);
};

export const getRemainingTimeText = (book: Book) => {
  const speed = calculateAverageSpeed(book);
  const total = getBookPageTotal(book);
  if (speed === 0 || !total) return 'Unknown';

  const remainingPages = total - (book.pagesRead || 0);
  if (remainingPages <= 0) return 'Completed';

  const hoursDecimal = remainingPages / speed;
  const hours = Math.floor(hoursDecimal);
  const minutes = Math.round((hoursDecimal - hours) * 60);

  if (hours > 0) {
    return `${hours} h ${minutes} min left`;
  }
  return `${minutes} min left`;
};

// --- THEME SYSTEM ---
export const ACCENT_COLORS: Record<AccentColor, { label: string; hex: string; shades: Record<number, string> }> = {
  indigo: {
    label: 'Indigo (Default)',
    hex: '#4f46e5',
    shades: { 50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca' },
  },
  rose: {
    label: 'Rose',
    hex: '#e11d48',
    shades: { 50: '#fff1f2', 100: '#ffe4e6', 200: '#fecdd3', 500: '#f43f5e', 600: '#e11d48', 700: '#be123c' },
  },
  pink: {
    label: 'Pink',
    hex: '#ec4899',
    shades: { 50: '#fdf2f8', 100: '#fce7f3', 200: '#fbcfe8', 500: '#ec4899', 600: '#db2777', 700: '#be185d' },
  },
  amber: {
    label: 'Amber',
    hex: '#d97706',
    shades: { 50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 500: '#f59e0b', 600: '#d97706', 700: '#b45309' },
  },
  gold: {
    label: 'Gold',
    hex: '#eab308',
    shades: { 50: '#fefce8', 100: '#fef9c3', 200: '#fde047', 500: '#eab308', 600: '#ca8a04', 700: '#a16207' },
  },
  emerald: {
    label: 'Emerald',
    hex: '#059669',
    shades: { 50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 500: '#10b981', 600: '#059669', 700: '#047857' },
  },
  violet: {
    label: 'Violet',
    hex: '#7c3aed',
    shades: { 50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9' },
  },
  sky: {
    label: 'Sky',
    hex: '#0284c7',
    shades: { 50: '#f0f9ff', 100: '#e0f2fe', 200: '#bae6fd', 500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1' },
  },
  black: {
    label: 'Black',
    hex: '#18181b',
    shades: { 50: '#f4f4f5', 100: '#e4e4e7', 200: '#d4d4d8', 500: '#3f3f46', 600: '#18181b', 700: '#09090b' },
  },
  white: {
    label: 'White',
    hex: '#ffffff',
    shades: { 50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 500: '#9ca3af', 600: '#4b5563', 700: '#374151' },
  },
};

export const BACKGROUND_TONES: Record<
  BackgroundTone,
  {
    label: string;
    hex: string;
    vars: {
      main: string;
      card: string;
      element: string;
      surface: string;
      border: string;
      textPrimary: string;
      textBody: string;
      textSecondary: string;
      textLight: string;
    };
  }
> = {
  cool: {
    label: 'Cool',
    hex: '#f8fafc',
    vars: {
      main: '#f8fafc',
      card: '#f1f5f9',
      element: '#e2e8f0',
      surface: '#ffffff',
      border: '#cbd5e1',
      textPrimary: '#1e293b',
      textBody: '#334155',
      textSecondary: '#64748b',
      textLight: '#94a3b8',
    },
  },
  warm: {
    label: 'Warm',
    hex: '#fafaf9',
    vars: {
      main: '#fafaf9',
      card: '#f5f5f4',
      element: '#e7e5e4',
      surface: '#ffffff',
      border: '#d6d3d1',
      textPrimary: '#1c1917',
      textBody: '#44403c',
      textSecondary: '#78716c',
      textLight: '#a8a29e',
    },
  },
  pink: {
    label: 'Pink',
    hex: '#fdf2f8',
    vars: {
      main: '#fdf2f8',
      card: '#fce7f3',
      element: '#fbcfe8',
      surface: '#ffffff',
      border: '#f9a8d4',
      textPrimary: '#831843',
      textBody: '#9d174d',
      textSecondary: '#be185d',
      textLight: '#f472b6',
    },
  },
  peach: {
    label: 'Peach',
    hex: '#fff7ed',
    vars: {
      main: '#fff7ed',
      card: '#ffedd5',
      element: '#fed7aa',
      surface: '#ffffff',
      border: '#fdba74',
      textPrimary: '#431407',
      textBody: '#7c2d12',
      textSecondary: '#9a3412',
      textLight: '#c2410c',
    },
  },
  mint: {
    label: 'Mint',
    hex: '#f0fdf4',
    vars: {
      main: '#f0fdf4',
      card: '#dcfce7',
      element: '#bbf7d0',
      surface: '#ffffff',
      border: '#86efac',
      textPrimary: '#022c22',
      textBody: '#064e3b',
      textSecondary: '#065f46',
      textLight: '#047857',
    },
  },
  dark: {
    label: 'Dark',
    hex: '#0f172a',
    vars: {
      main: '#0f172a',
      card: '#1e293b',
      element: '#334155',
      surface: '#1e293b',
      border: '#334155',
      textPrimary: '#f8fafc',
      textBody: '#e2e8f0',
      textSecondary: '#94a3b8',
      textLight: '#64748b',
    },
  },
  midnight: {
    label: 'Midnight',
    hex: '#020617',
    vars: {
      main: '#020617',
      card: '#0f172a',
      element: '#1e293b',
      surface: '#0f172a',
      border: '#1e293b',
      textPrimary: '#f8fafc',
      textBody: '#e2e8f0',
      textSecondary: '#94a3b8',
      textLight: '#64748b',
    },
  },
  forest: {
    label: 'Forest',
    hex: '#022c22',
    vars: {
      main: '#022c22',
      card: '#064e3b',
      element: '#065f46',
      surface: '#064e3b',
      border: '#065f46',
      textPrimary: '#ecfdf5',
      textBody: '#d1fae5',
      textSecondary: '#6ee7b7',
      textLight: '#34d399',
    },
  },
};

export const applyTheme = (accent: AccentColor, bg: BackgroundTone) => {
  const root = document.documentElement;
  const accentData = ACCENT_COLORS[accent];
  const bgData = BACKGROUND_TONES[bg];

  Object.entries(accentData.shades).forEach(([shade, value]) => {
    root.style.setProperty(`--accent-${shade}`, value);
  });

  root.style.setProperty('--bg-main', bgData.vars.main);
  root.style.setProperty('--bg-card', bgData.vars.card);
  root.style.setProperty('--bg-element', bgData.vars.element);
  root.style.setProperty('--bg-surface', bgData.vars.surface);
  root.style.setProperty('--border-color', bgData.vars.border);

  root.style.setProperty('--text-primary', bgData.vars.textPrimary);
  root.style.setProperty('--text-body', bgData.vars.textBody);
  root.style.setProperty('--text-secondary', bgData.vars.textSecondary);
  root.style.setProperty('--text-light', bgData.vars.textLight);
  
  // Update Android status bar color
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.setAttribute('content', bgData.vars.main);
  }
};
