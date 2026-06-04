import React from 'react';
import { ArrowLeft, Barcode, Camera, Image as ImageIcon, Keyboard, Loader2, Wand2 } from 'lucide-react';
import { Book } from '../../types';
import { createClientId } from '../../services/id';
import { BookCover } from '../ui/BookCover';
import { useI18n } from '../../contexts/I18nContext';
import { fetchBookCover } from '../../services/storageService';
import { useUI } from '../../contexts/UIContext';
import { parserInstance } from '../../services/MBooksParser';
import { Html5Qrcode } from 'html5-qrcode';

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
  const [coverBlob, setCoverBlob] = React.useState<Blob | undefined>(undefined);
  const [blobPreviewUrl, setBlobPreviewUrl] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isMagicLoading, setIsMagicLoading] = React.useState(false);

  const [isbn, setIsbn] = React.useState('');
  const [publisher, setPublisher] = React.useState('');
  const [pagesTotal, setPagesTotal] = React.useState(0);
  const [series, setSeries] = React.useState('');
  const [seriesPart, setSeriesPart] = React.useState('');
  const [timestamp, setTimestamp] = React.useState<string | undefined>(undefined);

  const [showIsbnModal, setShowIsbnModal] = React.useState(false);
  const [isbnInput, setIsbnInput] = React.useState('');
  const [isbnStep, setIsbnStep] = React.useState<number | null>(null);
  const [activeMode, setActiveMode] = React.useState<'manual' | 'scan'>('manual');
  const [scanError, setScanError] = React.useState<string | null>(null);

  const triggerIsbnSearch = async (rawIsbn: string) => {
    const cleanIsbn = rawIsbn.replace(/[-\s]/g, '');
    if (!cleanIsbn) {
      toast.show('ISBN is required', 'info');
      return;
    }

    setIsbnStep(1); // Крок 1: Пошук посилання
    try {
      const href = await parserInstance.searchByIsbn(cleanIsbn);
      if (!href) {
        toast.show(t('bookForm.isbnLookupError'), 'error');
        setIsbnStep(null);
        return;
      }

      setIsbnStep(2); // Крок 2: Отримання деталей
      const parsedBook = await parserInstance.getBookDetails(href);
      if (!parsedBook) {
        toast.show(t('bookForm.isbnLookupError'), 'error');
        setIsbnStep(null);
        return;
      }

      // Success! Populate the form with parsed values
      setTitle(parsedBook.title || title);
      setAuthor(parsedBook.author || parsedBook.authorSeries || author || '-');
      setPublisher(parsedBook.publisher || publisher || '');
      setPagesTotal(parsedBook.pages || pagesTotal || 0);
      setSeries(parsedBook.authorSeries || series || '');
      setSeriesPart(parsedBook.orderInSeries || seriesPart || '');
      setCoverUrl(parsedBook.coverImage || coverUrl || '');
      setIsbn(parsedBook.isbn || cleanIsbn);
      setTimestamp(new Date().toISOString());

      toast.show(t('bookForm.isbnLookupSuccess'), 'success');
      setShowIsbnModal(false);
      setIsbnInput('');
    } catch (err) {
      console.error('ISBN lookup failed:', err);
      toast.show(t('bookForm.isbnLookupError'), 'error');
    } finally {
      setIsbnStep(null);
    }
  };

  const handleIsbnSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    triggerIsbnSearch(isbnInput);
  };

  React.useEffect(() => {
    if (!showIsbnModal || activeMode !== 'scan') return;

    let html5QrCode: Html5Qrcode | null = null;
    const elementId = "wishlist-scanner-reader";
    setScanError(null);

    const timer = setTimeout(() => {
      try {
        html5QrCode = new Html5Qrcode(elementId);
        html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: (width, height) => {
              return {
                width: Math.min(width * 0.85, 280),
                height: Math.min(height * 0.45, 120)
              };
            },
            aspectRatio: 1.777778,
          },
          (decodedText) => {
            if (navigator.vibrate) {
              navigator.vibrate(100);
            }
            toast.show(`${t('bookForm.isbnFound')}: ${decodedText}`, 'success');
            setIsbnInput(decodedText);
            setActiveMode('manual');
            triggerIsbnSearch(decodedText);
          },
          (errorMessage) => {
            // Uncritical stream scanning callbacks
          }
        ).catch((err) => {
          console.error("Scanner startup issue:", err);
          setScanError(t('bookForm.isbnScanError'));
        });
      } catch (err) {
        console.error("Scanner exception:", err);
        setScanError(t('bookForm.isbnScanError'));
      }
    }, 150);

    return () => {
      clearTimeout(timer);
      if (html5QrCode) {
        if (html5QrCode.isScanning) {
          html5QrCode.stop().then(() => {
            html5QrCode?.clear();
          }).catch((err) => {
            console.error("Failed to stop scanner on clean up:", err);
          });
        }
      }
    };
  }, [showIsbnModal, activeMode]);

  React.useEffect(() => {
    let objectUrl: string | null = null;
    if (coverBlob) {
      objectUrl = URL.createObjectURL(coverBlob);
      setBlobPreviewUrl(objectUrl);
    } else {
      setBlobPreviewUrl(null);
    }
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [coverBlob]);

  const previewBook = React.useMemo<Book>(
    () => ({
      id: '__wishlist_preview__',
      title: title || t('bookForm.preview'),
      author: author || '',
      formats: ['Paper'],
      status: 'Wishlist',
      genre: '',
      publisher: publisher.trim(),
      series: series.trim(),
      seriesPart: seriesPart.trim(),
      pagesTotal: Number(pagesTotal) || 0,
      pagesRead: 0,
      coverUrl: coverUrl.trim() || blobPreviewUrl || '',
      wishlistedAt: new Date().toISOString(),
      addedAt: '',
      sessions: [],
      isbn: isbn.trim(),
      timestamp: timestamp,
    }),
    [author, coverUrl, blobPreviewUrl, t, title, publisher, series, seriesPart, pagesTotal, isbn, timestamp]
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setCoverBlob(file);
      setCoverUrl(''); // Clear URL if we have a blob
      toast.show(t('bookForm.toast.coverFound'), 'success');
    } catch (error) {
      console.error('File upload failed', error);
      toast.show(t('bookForm.toast.coverSearchError'), 'error');
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

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
        setCoverBlob(undefined);
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
        <ArrowLeft size={20} />
        <span className="text-sm font-bold">{t('common.back')}</span>
      </button>

      <div className="mt-4 bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <header className="mb-6">
          <div className="flex justify-between items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-800">{t('bookForm.addWishlistTitle')}</h1>
            <button
              type="button"
              onClick={() => setShowIsbnModal(true)}
              className="flex flex-col items-center justify-center p-2 px-3 rounded-2xl border border-gray-100 bg-gray-50/50 hover:bg-indigo-50/30 text-indigo-600 transition-all active:scale-95 shadow-sm hover:border-indigo-100"
            >
              <Barcode size={24} />
              <span className="text-[9px] font-bold uppercase tracking-wider mt-1 text-gray-500 whitespace-nowrap">
                {t('bookForm.addByIsbn')}
              </span>
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">{t('bookForm.addWishlistSubtitle')}</p>
        </header>

        {showIsbnModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <style>{`
              @keyframes scanLaser {
                0% { top: 15%; }
                50% { top: 85%; }
                100% { top: 15%; }
              }
            `}</style>
            <div className="bg-white rounded-[2rem] w-full max-w-sm p-6 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200 text-left">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Barcode size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-800">{t('bookForm.isbnLookup')}</h3>
                  <p className="text-xs text-gray-400 font-medium">mbooks.com.ua</p>
                </div>
              </div>

              {isbnStep !== null ? (
                <div className="py-8 flex flex-col items-center justify-center gap-4">
                  <Loader2 className="animate-spin text-indigo-600" size={36} />
                  <div className="text-center">
                    <p className="text-sm font-bold text-gray-800">
                      {isbnStep === 1 ? t('bookForm.isbnLookupStep1') : t('bookForm.isbnLookupStep2')}
                    </p>
                    <p className="text-xs text-gray-400 mt-1 font-medium">{t('app.loading')}</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-2xl mb-4">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveMode('manual');
                        setScanError(null);
                      }}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-xs transition-all ${
                        activeMode === 'manual'
                          ? 'bg-white text-indigo-600 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <Keyboard size={16} />
                      {t('bookForm.isbnManualMode')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveMode('scan');
                        setScanError(null);
                        setIsbnInput('');
                      }}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-xs transition-all ${
                        activeMode === 'scan'
                          ? 'bg-white text-indigo-600 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <Camera size={16} />
                      {t('bookForm.isbnScanMode')}
                    </button>
                  </div>

                  {activeMode === 'manual' ? (
                    <form onSubmit={handleIsbnSearch} className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">ISBN / {t('bookForm.isbn')}</label>
                        <input
                          required
                          autoFocus
                          type="text"
                          placeholder="978-..."
                          className="w-full bg-gray-50 p-3.5 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 border-none text-sm font-bold placeholder-gray-400/70"
                          value={isbnInput}
                          onChange={(e) => setIsbnInput(e.target.value)}
                        />
                      </div>

                      <div className="flex gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowIsbnModal(false);
                            setIsbnInput('');
                          }}
                          className="flex-1 bg-gray-50 text-gray-500 font-bold py-3 px-4 rounded-xl border border-gray-100 hover:bg-gray-100 active:scale-95 transition-all text-sm"
                        >
                          {t('bookForm.isbnLookupCancel')}
                        </button>
                        <button
                          type="submit"
                          className="flex-1 bg-indigo-600 text-white font-bold py-3 px-4 rounded-xl shadow-md hover:bg-indigo-700 active:scale-95 transition-all text-sm"
                        >
                          {t('bookForm.isbnLookupSearch')}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="space-y-4">
                      <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black border border-gray-100 flex items-center justify-center">
                        <div id="wishlist-scanner-reader" className="absolute inset-0 w-full h-full" />
                        
                        {activeMode === 'scan' && !scanError && (
                          <div className="absolute inset-x-4 top-1/2 h-0.5 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] pointer-events-none z-10" 
                               style={{ animation: 'scanLaser 2.5s linear infinite' }} />
                        )}

                        {scanError && (
                          <div className="absolute inset-0 p-4 bg-gray-950/95 flex flex-col items-center justify-center text-center gap-2 z-20">
                            <Camera size={32} className="text-red-400 animate-pulse" />
                            <p className="text-xs font-bold text-red-150 px-4 leading-normal text-red-300">{scanError}</p>
                            <button 
                              type="button" 
                              onClick={() => {
                                setActiveMode('manual');
                                setScanError(null);
                              }}
                              className="mt-2 text-xs font-bold text-white bg-indigo-600 px-3 py-1.5 rounded-xl hover:bg-indigo-700 active:scale-95 transition-all"
                            >
                              {t('bookForm.isbnManualMode')}
                            </button>
                          </div>
                        )}
                      </div>

                      <p className="text-[11px] font-bold text-gray-400 text-center uppercase tracking-wide">
                        {t('bookForm.isbnFound')}: {isbnInput || '...'}
                      </p>

                      <div className="flex gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowIsbnModal(false);
                            setIsbnInput('');
                          }}
                          className="flex-1 bg-gray-50 text-gray-500 font-bold py-3 px-4 rounded-xl border border-gray-100 hover:bg-gray-100 active:scale-95 transition-all text-sm"
                        >
                          {t('bookForm.isbnLookupCancel')}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <form
          className="space-y-4"
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
                publisher: publisher.trim(),
                series: series.trim(),
                seriesPart: seriesPart.trim(),
                pagesTotal: Number(pagesTotal) || 0,
                pagesRead: 0,
                coverUrl: coverUrl.trim(),
                coverBlob,
                wishlistedAt: nowIso,
                addedAt: '',
                sessions: [],
                isbn: isbn.trim(),
                timestamp: timestamp || new Date().toISOString(),
              });
            } finally {
              setIsSubmitting(false);
            }
          }}
        >
          <div className="flex justify-center">
            <div className="relative w-24">
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
                className="w-24 aspect-[2/3] bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden shadow-sm relative group"
              >
                {(coverUrl.trim() || blobPreviewUrl) ? (
                  <BookCover book={previewBook} className="w-full h-full" iconSize={20} />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-300">
                    <ImageIcon size={22} />
                    <span className="text-[9px] font-bold uppercase tracking-wide">{t('bookForm.cover')}</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center">
                  <div className="bg-white/90 backdrop-blur-sm p-1.5 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                    <ImageIcon size={14} className="text-gray-600" />
                  </div>
                </div>
              </button>
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
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">{t('bookForm.isbn') || 'ISBN'}</label>
            <input
              maxLength={40}
              className="w-full bg-gray-50 p-3 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 border-none text-xs font-bold"
              value={isbn}
              onChange={(e) => setIsbn(e.target.value)}
              placeholder="ISBN / Штрихкод"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">{t('bookForm.coverUrl')}</label>
            <input
              maxLength={1024}
              className="w-full bg-gray-50 p-3 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 border-none text-xs font-medium"
              value={coverUrl || (coverBlob ? blobPreviewUrl || '' : '')}
              onChange={(e) => {
                setCoverUrl(e.target.value);
                setCoverBlob(undefined);
              }}
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
