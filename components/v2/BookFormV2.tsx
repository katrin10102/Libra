import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Image as ImageIcon, Loader2, Save, Wand2 } from 'lucide-react';
import { Book, BookFormat, BookStatus } from '../../types';
import { FORMAT_LABELS, getSeasonColorClass, normalizeSeason, SEASON_OPTIONS } from '../../utils';
import { BookCover } from '../ui/BookCover';
import { useI18n } from '../../contexts/I18nContext';
import { MessageKey } from '../../i18n/messages';
import { fetchBookCover } from '../../services/storageService';
import { useUI } from '../../contexts/UIContext';

interface BookFormV2Props {
  title: string;
  submitLabel: string;
  initialValue: Partial<Book>;
  publisherSuggestions: string[];
  genreSuggestions: string[];
  allowedStatuses: BookStatus[];
  onSubmit: (value: Partial<Book>) => void;
  onCancel: () => void;
}

const sanitizeText = (value: string, maxLen: number): string => {
  return value
    .slice(0, maxLen)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\uFEFF]/g, '');
};

const normalizeFormats = (formats?: BookFormat[]): BookFormat[] => {
  if (!formats || formats.length === 0) return ['Paper'];
  const unique = Array.from(new Set(formats));
  return unique.length > 0 ? unique : ['Paper'];
};

const normalizeSeasons = (seasons?: string[]): string[] => {
  if (!seasons || seasons.length === 0) return [];
  return Array.from(
    new Set(
      seasons
        .map((value) => normalizeSeason(value))
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
};

export const BookFormV2: React.FC<BookFormV2Props> = ({
  title,
  submitLabel,
  initialValue,
  publisherSuggestions,
  genreSuggestions,
  allowedStatuses,
  onSubmit,
  onCancel,
}) => {
  const { t } = useI18n();
  const { toast } = useUI();
  const [form, setForm] = useState<Partial<Book>>({
    title: initialValue.title || '',
    author: initialValue.author || '',
    publisher: initialValue.publisher || '',
    genre: initialValue.genre || '',
    series: initialValue.series || '',
    seriesPart: initialValue.seriesPart || '',
    pagesTotal: Number(initialValue.pagesTotal) || 0,
    formats: normalizeFormats(initialValue.formats),
    status: initialValue.status || allowedStatuses[0] || 'Unread',
    coverUrl: initialValue.coverUrl || '',
    coverBlob: initialValue.coverBlob,
    notes: initialValue.notes || '',
    comment: initialValue.comment || '',
    seasons: normalizeSeasons(initialValue.seasons),
    completedAt: initialValue.completedAt,
    rating: initialValue.rating,
    addedAt: initialValue.addedAt,
    wishlistedAt: initialValue.wishlistedAt,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMagicLoading, setIsMagicLoading] = useState(false);
  const [publisherFocused, setPublisherFocused] = useState(false);
  const [genreFocused, setGenreFocused] = useState(false);
  const [blobPreviewUrl, setBlobPreviewUrl] = useState<string | null>(null);

  const publisherRef = useRef<HTMLDivElement>(null);
  const genreRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (publisherFocused && publisherRef.current && !publisherRef.current.contains(event.target as Node)) {
        setPublisherFocused(false);
      }
      if (genreFocused && genreRef.current && !genreRef.current.contains(event.target as Node)) {
        setGenreFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [publisherFocused, genreFocused]);

  useEffect(() => {
    let objectUrl: string | null = null;
    if (form.coverBlob) {
      objectUrl = URL.createObjectURL(form.coverBlob);
      setBlobPreviewUrl(objectUrl);
    } else {
      setBlobPreviewUrl(null);
    }
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [form.coverBlob]);

  const safePublisherSuggestions = useMemo(
    () => Array.from(new Set(publisherSuggestions.filter(Boolean))).slice(0, 100),
    [publisherSuggestions]
  );
  const safeGenreSuggestions = useMemo(
    () => Array.from(new Set(genreSuggestions.filter(Boolean))).slice(0, 100),
    [genreSuggestions]
  );
  const filteredPublisherSuggestions = useMemo(() => {
    const q = (form.publisher || '').trim().toLowerCase();
    if (!q) return safePublisherSuggestions;
    return safePublisherSuggestions.filter((item) => item.toLowerCase().includes(q));
  }, [form.publisher, safePublisherSuggestions]);
  const filteredGenreSuggestions = useMemo(() => {
    const q = (form.genre || '').trim().toLowerCase();
    if (!q) return safeGenreSuggestions;
    return safeGenreSuggestions.filter((item) => item.toLowerCase().includes(q));
  }, [form.genre, safeGenreSuggestions]);

  const closeSuggestions = () => {
    setPublisherFocused(false);
    setGenreFocused(false);
  };

  const updateForm = <K extends keyof Book>(key: K, value: Book[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const previewBook = useMemo<Book>(
    () => ({
      id: '__preview__',
      title: (form.title || t('bookForm.preview')) as string,
      author: (form.author || '') as string,
      formats: normalizeFormats(form.formats),
      status: ((form.status as BookStatus) || allowedStatuses[0] || 'Unread') as BookStatus,
      genre: (form.genre || '') as string,
      publisher: (form.publisher || '') as string,
      series: (form.series || '') as string,
      seriesPart: (form.seriesPart || '') as string,
      pagesTotal: Math.max(0, Number(form.pagesTotal) || 0),
      pagesRead: 0,
      coverUrl: ((form.coverUrl as string) || blobPreviewUrl || '') as string,
      coverBlob: undefined, // Optimization: BookCover will use coverUrl (which is either external or blob URL)
      notes: (form.notes || '') as string,
      comment: (form.comment || '') as string,
      seasons: normalizeSeasons(form.seasons),
      completedAt: form.completedAt,
      rating: form.rating,
      addedAt: form.addedAt || initialValue.addedAt || '',
      wishlistedAt: form.wishlistedAt || initialValue.wishlistedAt,
      sessions: (initialValue.sessions || []) as Book['sessions'],
    }),
    [
      allowedStatuses,
      blobPreviewUrl,
      form.addedAt,
      form.author,
      form.comment,
      form.completedAt,
      form.coverUrl,
      form.formats,
      form.genre,
      form.notes,
      form.pagesTotal,
      form.publisher,
      form.rating,
      form.seasons,
      form.series,
      form.seriesPart,
      form.status,
      form.title,
      form.wishlistedAt,
      initialValue.addedAt,
      initialValue.sessions,
      initialValue.wishlistedAt,
      t,
    ]
  );

  const previewBookForCover = useMemo<Book>(
    () => ({
      id: '__preview__',
      title: (form.title || t('bookForm.preview')) as string,
      coverUrl: ((form.coverUrl as string) || blobPreviewUrl || '') as string,
      coverBlob: undefined,
      // Fill required fields with dummies
      author: '',
      status: 'Unread',
      addedAt: '',
      formats: [],
    } as Book),
    [form.title, form.coverUrl, blobPreviewUrl, t]
  );

  const effectiveCoverUrl = ((form.coverUrl as string) || blobPreviewUrl || '').trim();

  const handleMagicSearch = async () => {
    const titleValue = sanitizeText(form.title || '', 180).trim();
    const authorValue = sanitizeText(form.author || '', 140).trim();
    if (!titleValue) {
      toast.show(t('bookForm.toast.coverNeedTitle'), 'info');
      return;
    }
    setIsMagicLoading(true);
    try {
      const url = await fetchBookCover(titleValue, authorValue);
      if (url) {
        setForm((prev) => ({
          ...prev,
          coverUrl: url,
          coverBlob: undefined,
        }));
        toast.show(t('bookForm.toast.coverFound'), 'success');
      } else {
        toast.show(t('bookForm.toast.coverNotFound'), 'info');
      }
    } catch (error) {
      console.error('Cover search failed', error);
      toast.show(t('bookForm.toast.coverSearchError'), 'error');
    } finally {
      setIsMagicLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // We can use a simple URL.createObjectURL for preview, 
      // but we should store the blob in the form state.
      setForm((prev) => ({
        ...prev,
        coverBlob: file,
        coverUrl: '', // Clear URL if we have a blob
      }));
      toast.show(t('bookForm.toast.coverFound'), 'success');
    } catch (error) {
      console.error('File upload failed', error);
      toast.show(t('bookForm.toast.coverSearchError'), 'error');
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const toggleFormat = (format: BookFormat) => {
    const current = normalizeFormats(form.formats);
    if (current.includes(format)) {
      if (current.length === 1) return;
      updateForm('formats', current.filter((item) => item !== format));
      return;
    }
    updateForm('formats', [...current, format]);
  };

  const toggleSeason = (season: string) => {
    const normalized = normalizeSeason(season);
    const current = normalizeSeasons(form.seasons);
    if (current.includes(normalized)) {
      updateForm(
        'seasons',
        current.filter((value) => value !== normalized)
      );
      return;
    }
    updateForm('seasons', [...current, normalized]);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    closeSuggestions();

    const titleValue = sanitizeText(form.title || '', 180).trim();
    const authorValue = sanitizeText(form.author || '', 140).trim();
    if (!titleValue || !authorValue) return;

    setIsSubmitting(true);
    try {
      onSubmit({
        ...form,
        title: titleValue,
        author: authorValue,
        publisher: sanitizeText(form.publisher || '', 120).trim(),
        genre: sanitizeText(form.genre || '', 160).trim(),
        series: sanitizeText(form.series || '', 120).trim(),
        seriesPart: sanitizeText(form.seriesPart || '', 60).trim(),
        coverUrl: sanitizeText(form.coverUrl || '', 1024).trim(),
        notes: sanitizeText(form.notes || '', 80),
        comment: sanitizeText(form.comment || '', 2000),
        pagesTotal: Math.max(0, Number(form.pagesTotal) || 0),
        formats: normalizeFormats(form.formats),
        seasons: normalizeSeasons(form.seasons),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-[100dvh] overflow-y-auto overscroll-contain p-4 pb-8 text-gray-800">
      <button
        onClick={() => {
          closeSuggestions();
          onCancel();
        }}
        className="flex items-center gap-2 text-gray-400 hover:text-gray-600 transition-colors"
      >
        <ArrowLeft size={20} />
        <span className="text-sm font-bold">{t('common.back')}</span>
      </button>

      <div className="mt-4 bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">{title}</h1>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-5 mb-6">
            <div className="relative w-32 flex-shrink-0">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={triggerFileUpload}
                className="w-32 aspect-[2/3] bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden shadow-sm relative group"
              >
                {effectiveCoverUrl ? (
                  <BookCover book={previewBookForCover} className="w-full h-full" iconSize={32} />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-300">
                    <ImageIcon size={22} />
                    <span className="text-[9px] font-bold uppercase tracking-wide">{t('bookForm.cover')}</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center">
                  <div className="bg-white/90 backdrop-blur-sm p-2 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                    <ImageIcon size={16} className="text-gray-600" />
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={handleMagicSearch}
                disabled={isSubmitting || isMagicLoading}
                className="absolute -top-2 -right-2 bg-white/90 backdrop-blur-sm p-2 rounded-full text-indigo-600 shadow-md border border-indigo-50 active:scale-95 transition-all disabled:opacity-50 z-20"
                title={t('bookForm.magicSearch')}
                aria-label={t('bookForm.magicSearch')}
              >
                {isMagicLoading ? <Loader2 className="animate-spin" size={16} /> : <Wand2 size={16} />}
              </button>
            </div>

            <div className="flex-1 space-y-3 min-w-0">
               <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">{t('bookForm.title')}</label>
                <input
                  required
                  maxLength={180}
                  className="w-full bg-gray-50 p-3 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 border-none text-sm font-bold"
                  value={form.title || ''}
                  onChange={(e) => updateForm('title', sanitizeText(e.target.value, 180))}
                  placeholder={t('bookForm.title')}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">{t('bookForm.author')}</label>
                <input
                  required
                  maxLength={140}
                  className="w-full bg-gray-50 p-3 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 border-none text-sm font-bold"
                  value={form.author || ''}
                  onChange={(e) => updateForm('author', sanitizeText(e.target.value, 140))}
                  placeholder={t('bookForm.author')}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">{t('bookForm.coverUrl')}</label>
            <input
              maxLength={1024}
              className="w-full bg-gray-50 p-3 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 border-none text-xs font-medium"
              value={(form.coverUrl as string) || (form.coverBlob ? blobPreviewUrl || '' : '')}
              onChange={(e) => {
                const nextUrl = sanitizeText(e.target.value, 1024);
                setForm((prev) => ({
                  ...prev,
                  coverUrl: nextUrl,
                  coverBlob: undefined,
                }));
              }}
              placeholder={t('bookForm.coverUrlPlaceholder')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div ref={publisherRef} className="space-y-1 relative">
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">{t('bookForm.publisher')}</label>
              <input
                maxLength={120}
                className="w-full bg-gray-50 p-3 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 border-none text-xs font-bold"
                value={form.publisher || ''}
                onChange={(e) => updateForm('publisher', sanitizeText(e.target.value, 120))}
                onFocus={() => setPublisherFocused(true)}
              />
              {publisherFocused && filteredPublisherSuggestions.length > 0 && (
                <div
                  className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-xl z-30 max-h-48 overflow-y-auto overscroll-contain"
                  style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
                >
                  {filteredPublisherSuggestions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        updateForm('publisher', item);
                        setPublisherFocused(false);
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 border-b border-gray-50 last:border-none"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div ref={genreRef} className="space-y-1 relative">
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">{t('bookForm.genre')}</label>
              <input
                maxLength={160}
                className="w-full bg-gray-50 p-3 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 border-none text-xs font-bold"
                value={form.genre || ''}
                onChange={(e) => updateForm('genre', sanitizeText(e.target.value, 160))}
                onFocus={() => setGenreFocused(true)}
              />
              {genreFocused && filteredGenreSuggestions.length > 0 && (
                <div
                  className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-xl z-30 max-h-48 overflow-y-auto overscroll-contain"
                  style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
                >
                  {filteredGenreSuggestions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        updateForm('genre', item);
                        setGenreFocused(false);
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 border-b border-gray-50 last:border-none"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">{t('bookForm.series')}</label>
              <input
                maxLength={120}
                className="w-full bg-gray-50 p-3 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 border-none text-xs font-bold"
                value={form.series || ''}
                onChange={(e) => updateForm('series', sanitizeText(e.target.value, 120))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">{t('bookForm.seriesPart')}</label>
              <input
                maxLength={60}
                className="w-full bg-gray-50 p-3 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 border-none text-xs font-bold"
                value={form.seriesPart || ''}
                onChange={(e) => updateForm('seriesPart', sanitizeText(e.target.value, 60))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">{t('bookForm.pages')}</label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                className="w-full bg-gray-50 p-3 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 border-none text-xs font-bold"
                value={form.pagesTotal === 0 ? '' : (form.pagesTotal || '')}
                onChange={(e) => updateForm('pagesTotal', Math.max(0, Number(e.target.value) || 0))}
                placeholder="0"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">{t('bookForm.status')}</label>
              <select
                className="w-full bg-gray-50 p-3 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 border-none text-xs font-bold"
                value={(form.status as BookStatus) || allowedStatuses[0]}
                onChange={(e) => {
                  const val = e.target.value as BookStatus;
                  if (val !== 'Wishlist' && !form.addedAt) {
                    setForm((prev) => ({ ...prev, status: val, addedAt: new Date().toISOString() }));
                  } else {
                    updateForm('status', val);
                  }
                }}
              >
                {allowedStatuses.map((status) => (
                  <option key={status} value={status}>
                    {t(`status.${status}` as MessageKey)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {form.status !== 'Wishlist' && (
            <div className="space-y-1 min-w-0 animate-in fade-in slide-in-from-top-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">{t('bookForm.addedAt')}</label>
              <input
                type="date"
                required
                className="w-full block bg-gray-50 p-3 rounded-2xl text-xs font-bold border-none outline-none appearance-none min-w-0 box-border max-w-full"
                value={form.addedAt ? form.addedAt.substring(0, 10) : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  updateForm('addedAt', val ? new Date(val).toISOString() : '');
                }}
              />
            </div>
          )}

          {form.status === 'Completed' && (
            <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-1">
              <div className="space-y-1 min-w-0">
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">{t('details.completed')}</label>
                <input
                  type="date"
                  className="w-full block bg-gray-50 p-3 rounded-2xl text-xs font-bold border-none outline-none appearance-none min-w-0 box-border max-w-full"
                  value={form.completedAt ? form.completedAt.substring(0, 10) : ''}
                  onChange={(e) => updateForm('completedAt', e.target.value ? new Date(e.target.value).toISOString() : undefined)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">{t('details.rating')}</label>
                <select
                  className="w-full bg-gray-50 p-3 rounded-2xl text-xs font-bold border-none outline-none appearance-none"
                  value={form.rating || 0}
                  onChange={(e) => updateForm('rating', parseInt(e.target.value))}
                >
                  <option value={0}>{t('common.unknown')}</option>
                  {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">{t('bookForm.seasons')}</label>
            <div className="grid grid-cols-2 gap-2">
              {SEASON_OPTIONS.map((season) => {
                const active = normalizeSeasons(form.seasons).includes(season);
                return (
                  <button
                    key={season}
                    type="button"
                    onClick={() => toggleSeason(season)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-between ${
                      active ? 'border-indigo-200 bg-indigo-50' : 'bg-gray-50 text-gray-600 border-gray-100'
                    }`}
                  >
                    <span className={`px-2 py-0.5 rounded-full ${getSeasonColorClass(season)}`}>{t(`season.${season}` as MessageKey)}</span>
                    <span className={`w-3 h-3 rounded-full border-2 ${active ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300 bg-transparent'}`} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">{t('bookForm.formats')}</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(FORMAT_LABELS) as BookFormat[]).map((format) => {
                const active = normalizeFormats(form.formats).includes(format);
                return (
                  <button
                    key={format}
                    type="button"
                    onClick={() => toggleFormat(format)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-between ${
                      active ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'bg-gray-50 text-gray-600 border-gray-100'
                    }`}
                  >
                    <span>{t(`format.${format}` as MessageKey)}</span>
                    <span className={`w-3 h-3 rounded-full border-2 ${active ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300 bg-transparent'}`} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">{t('bookForm.notes')}</label>
            <input
              maxLength={80}
              className="w-full bg-gray-50 p-3 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 border-none text-xs font-medium"
              value={form.notes || ''}
              onChange={(e) => {
                const val = e.target.value;
                try {
                  const clean = val.replace(/[^\p{Extended_Pictographic}\s]/gu, '');
                  updateForm('notes', clean);
                } catch (error) {
                  updateForm('notes', val);
                }
              }}
              placeholder={t('bookForm.notesPlaceholder')}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">{t('bookForm.comment')}</label>
            <textarea
              maxLength={2000}
              className="w-full bg-gray-50 p-3 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 border-none text-xs font-medium resize-none h-24"
              value={form.comment || ''}
              onChange={(e) => updateForm('comment', sanitizeText(e.target.value, 2000))}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            onClick={() => closeSuggestions()}
            className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-100 mt-2 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Save size={18} />
            <span>{submitLabel}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
