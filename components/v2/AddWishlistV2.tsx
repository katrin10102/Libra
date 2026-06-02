import React from 'react';
import { Image as ImageIcon, Loader2, Wand2 } from 'lucide-react';
import { Book } from '../../types';
import { createClientId } from '../../services/id';
import { BookCover } from '../ui/BookCover';
import { useI18n } from '../../contexts/I18nContext';
import { fetchBookCover } from '../../services/storageService';
import { useUI } from '../../contexts/UIContext';

interface AddWishlistV2Props {
  onAdd: (book: Book) => void;
  onCancel: () => void;
}

export const AddWishlistV2: React.FC<AddWishlistV2Props> = ({ onAdd, onCancel }) => {
  const { t } = useI18n();
  const { toast } = useUI();
  const [title, setTitle] = React.useState('');
  const [author, setAuthor] = React.useState('');
  const [coverUrl, setCoverUrl] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isMagicLoading, setIsMagicLoading] = React.useState(false);
  const previewBook = React.useMemo<Book>(
    () => ({
      id: '__wishlist_preview__',
      title: title || t('bookForm.preview'),
      author: author || '',
      formats: ['Paper'],
      status: 'Wishlist',
      genre: '',
      publisher: '',
      series: '',
      seriesPart: '',
      pagesTotal: 0,
      pagesRead: 0,
      coverUrl: coverUrl.trim(),
      wishlistedAt: new Date().toISOString(),
      addedAt: '',
      sessions: [],
    }),
    [author, coverUrl, t, title]
  );

  const handleMagicSearch = async () => {
    const titleValue = title.trim();
    const authorValue = author.trim();
    if (!titleValue) {
      toast.show(t('bookForm.toast.coverNeedTitle'), 'info');
      return;
    }
    setIsMagicLoading(true);
    try {
      const url = await fetchBookCover(titleValue, authorValue);
      if (url) {
        setCoverUrl(url);
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

  return (
    <div className="h-[100dvh] overflow-y-auto overscroll-contain p-4 pb-8 text-gray-800">
      <button onClick={onCancel} className="flex items-center gap-2 text-gray-400 hover:text-gray-600 transition-colors">
        <span className="text-sm font-bold">{t('common.back')}</span>
      </button>

      <div className="mt-4 bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <h1 className="text-2xl font-bold text-gray-800">{t('bookForm.addWishlistTitle')}</h1>
        <p className="text-xs text-gray-500 mt-1">{t('bookForm.addWishlistSubtitle')}</p>

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (isSubmitting) return;
            if (!title.trim() || !author.trim()) return;
            setIsSubmitting(true);
            try {
              const nowIso = new Date().toISOString();
              onAdd({
                id: createClientId(),
                title: title.trim(),
                author: author.trim(),
                formats: ['Paper'],
                status: 'Wishlist',
                genre: '',
                publisher: '',
                series: '',
                seriesPart: '',
                pagesTotal: 0,
                pagesRead: 0,
                coverUrl: coverUrl.trim(),
                wishlistedAt: nowIso,
                addedAt: '',
                sessions: [],
              });
            } finally {
              setIsSubmitting(false);
            }
          }}
        >
          <div className="flex justify-center">
            <div className="relative w-24">
              <div className="w-24 aspect-[2/3] bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                {coverUrl.trim() ? (
                  <BookCover book={previewBook} className="w-full h-full" iconSize={20} />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-300">
                    <ImageIcon size={22} />
                    <span className="text-[9px] font-bold uppercase tracking-wide">{t('bookForm.cover')}</span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleMagicSearch}
                disabled={isSubmitting || isMagicLoading}
                className="absolute top-0 -right-14 bg-white p-3 rounded-2xl text-indigo-600 shadow-lg border border-indigo-50 active:scale-95 transition-all disabled:opacity-50"
                title={t('bookForm.magicSearch')}
                aria-label={t('bookForm.magicSearch')}
              >
                {isMagicLoading ? <Loader2 className="animate-spin" size={20} /> : <Wand2 size={20} />}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">{t('bookForm.title')}</label>
            <input
              required
              maxLength={180}
              className="w-full bg-gray-50 p-3 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 border-none text-sm font-bold"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">{t('bookForm.author')}</label>
            <input
              required
              maxLength={140}
              className="w-full bg-gray-50 p-3 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 border-none text-sm font-bold"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">{t('bookForm.coverUrl')}</label>
            <input
              maxLength={1024}
              className="w-full bg-gray-50 p-3 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 border-none text-xs font-medium"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              placeholder={t('bookForm.coverUrlPlaceholder')}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-100 mt-2 active:scale-95 transition-all disabled:opacity-60"
          >
            {t('bookForm.saveWishlist')}
          </button>
        </form>
      </div>
    </div>
  );
};
