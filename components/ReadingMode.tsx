
import React, { useState, useEffect, useCallback } from 'react';
import { Book, ReadingSessionData, BookFormat } from '../types';
import { BookOpen, X, Play, Pause, Square, CheckCircle2, Save, Edit3, Trash2, Delete, Trophy, Calendar, Clock, Zap, FileText, Smartphone, Headphones, Tablet, RefreshCw, Plus } from 'lucide-react';
import { calculateProgress, formatTime, getRemainingTimeText, getBookPageTotal, FORMAT_LABELS } from '../utils';
import { useLibrary } from '../contexts/LibraryContext';
import { BookCover } from './ui/BookCover';
import { createClientId } from '../services/id';

import { useUI } from '../contexts/UIContext';
import { useI18n } from '../contexts/I18nContext';

interface ReadingModeProps {
  book: Book;
  onClose: () => void;
}

interface ReadingSessionState {
  isActive: boolean;
  isPaused: boolean;
  startPage: number;
  startTime: number | null;
  accumulatedTime: number;
  displaySeconds: number;
}

type SetupStep = 'none' | 'select-format' | 'confirm-pages';

export const ReadingMode: React.FC<ReadingModeProps> = ({ book: initialBook, onClose }) => {
  const { updateBook, books } = useLibrary();
  const book = books.find(b => b.id === initialBook.id) || initialBook;
  const { toast, confirm } = useUI();
  const { t } = useI18n();
  const [diarySessions, setDiarySessions] = useState<ReadingSessionData[]>(() => {
    const currentCycle = book.currentCycleIndex || 0;
    return (book.sessions || []).filter(s => (s.cycleIndex || 0) === currentCycle);
  });

  const [session, setSession] = useState<ReadingSessionState>(() => {
    const saved = localStorage.getItem(`libra_session_${book.id}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        let currentSecs = parsed.accumulatedTime;
        if (!parsed.isPaused && parsed.startTime) {
            currentSecs += Math.floor((Date.now() - parsed.startTime) / 1000);
        }
        return { ...parsed, displaySeconds: currentSecs };
      } catch (e) {
        console.error("Failed to restore session", e);
      }
    }
    return { isActive: false, isPaused: false, startPage: book.pagesRead || 0, startTime: null, accumulatedTime: 0, displaySeconds: 0 };
  });

  const [numpadMode, setNumpadMode] = useState<'start' | 'stop' | null>(null);
  const [numpadValue, setNumpadValue] = useState<string>('');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [showRatingDialog, setShowRatingDialog] = useState(false);
  const [tempRating, setTempRating] = useState<number>(10);
  const [setupStep, setSetupStep] = useState<SetupStep>('none');
  const [tempFormat, setTempFormat] = useState<BookFormat | null>(null);
  const [tempPagesTotal, setTempPagesTotal] = useState<number>(book.pagesTotal || 0);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

  useEffect(() => {
    const currentCycle = book.currentCycleIndex || 0;
    setDiarySessions((book.sessions || []).filter(s => (s.cycleIndex || 0) === currentCycle));
  }, [book.id, book.sessions, book.currentCycleIndex]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    if (session.isActive) {
        const { displaySeconds, ...stateToSave } = session;
        localStorage.setItem(`libra_session_${book.id}`, JSON.stringify(stateToSave));
    } else {
        localStorage.removeItem(`libra_session_${book.id}`);
    }
    window.dispatchEvent(new CustomEvent('libra_session_update', { detail: { bookId: book.id } }));
  }, [session, book.id]);

  const handleFormatSelect = useCallback((format: BookFormat) => {
      setTempFormat(format);
      if (format === 'Audio') {
          updateBook({
              ...book,
              status: 'Reading',
              selectedReadingFormat: 'Audio',
              readingPagesTotal: 100
          });
          setSetupStep('none');
          return;
      }
      setTempPagesTotal(book.pagesTotal || 0);
      setSetupStep('confirm-pages');
  }, [book, updateBook]);

  useEffect(() => {
     if (!book.selectedReadingFormat && book.status !== 'Completed' && book.formats.length > 0) {
         if (book.formats.length > 1) {
             setSetupStep('select-format');
         } else {
             // Auto-select the only format
             handleFormatSelect(book.formats[0]);
         }
     }
  }, [book.formats, book.selectedReadingFormat, book.status, handleFormatSelect]);

  // Handle timer interval
  useEffect(() => {
    let interval: any;
    if (session.isActive && !session.isPaused && session.startTime) {
      interval = setInterval(() => {
        setSession(prev => {
            if (!prev.startTime) return prev;
            const now = Date.now();
            const elapsed = Math.floor((now - prev.startTime) / 1000);
            return { ...prev, displaySeconds: prev.accumulatedTime + elapsed };
        });
      }, 500);
    }
    return () => clearInterval(interval);
  }, [session.isActive, session.isPaused, session.startTime]);

  // Handle visibility change (tab switch / screen off) to prevent timer drift
  useEffect(() => {
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible' && session.isActive && !session.isPaused && session.startTime) {
            const now = Date.now();
            const elapsed = Math.floor((now - session.startTime) / 1000);
            setSession(prev => ({
                ...prev,
                displaySeconds: prev.accumulatedTime + elapsed
            }));
        }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [session.isActive, session.isPaused, session.startTime, session.accumulatedTime]);

  const handlePagesConfirm = () => {
      if (tempFormat && tempPagesTotal > 0) {
          updateBook({
              ...book,
              status: 'Reading',
              selectedReadingFormat: tempFormat,
              readingPagesTotal: tempPagesTotal
          });
      }
      setSetupStep('none');
  };

  const handleReReadClick = async () => {
    const ok = await confirm({
      title: t('reading.reReadTitle' as any),
      message: t('reading.reReadMessage' as any),
      confirmText: t('common.confirm' as any) || 'Так',
      cancelText: t('common.cancel' as any) || 'Ні',
    });
    if (!ok) return;

    const prevCompletedDates = book.completedDates || [];
    const updatedCompletedDates = book.completedAt && !prevCompletedDates.includes(book.completedAt)
      ? [...prevCompletedDates, book.completedAt]
      : prevCompletedDates;

    const nextCycleIndex = (book.currentCycleIndex || 0) + 1;

    updateBook({
      ...book,
      status: 'Reading',
      pagesRead: 0,
      completedAt: undefined,
      selectedReadingFormat: undefined,
      readingPagesTotal: undefined,
      completedDates: updatedCompletedDates,
      currentCycleIndex: nextCycleIndex,
      readingStartedAt: new Date().toISOString()
    });

    toast.show(t('reading.reReadStarted' as any), 'success');
  };

  const handleStartRecordClick = () => {
    if (book.status === 'Completed') return;
    setNumpadValue((book.pagesRead || 0).toString());
    setNumpadMode('start');
  };

  const handlePauseToggle = () => {
    if (session.isPaused) {
        setSession(prev => ({ ...prev, isPaused: false, startTime: Date.now() }));
    } else {
        setSession(prev => {
            if (!prev.startTime) return { ...prev, isPaused: true };
            const now = Date.now();
            const elapsed = Math.floor((now - prev.startTime) / 1000);
            return { ...prev, isPaused: true, startTime: null, accumulatedTime: prev.accumulatedTime + elapsed, displaySeconds: prev.accumulatedTime + elapsed };
        });
    }
  };

  const handleStopRecordClick = () => {
    setNumpadValue((book.pagesRead || session.startPage).toString());
    setNumpadMode('stop');
    setSession(prev => {
        if (prev.isPaused) return prev;
        if (!prev.startTime) return { ...prev, isPaused: true };
        const now = Date.now();
        const elapsed = Math.floor((now - prev.startTime) / 1000);
        return { ...prev, isPaused: true, startTime: null, accumulatedTime: prev.accumulatedTime + elapsed, displaySeconds: prev.accumulatedTime + elapsed };
    });
  };

  const handleNumpadPress = (num: number) => {
    setNumpadValue(prev => prev === '0' ? num.toString() : prev + num.toString());
  };
  
  const handleNumpadBackspace = () => {
    setNumpadValue(prev => prev.slice(0, -1) || '');
  };

  const handleNumpadConfirm = () => {
    const pageVal = parseInt(numpadValue) || 0;
    if (numpadMode === 'start') {
        setSession({ isActive: true, isPaused: false, startPage: pageVal, startTime: Date.now(), accumulatedTime: 0, displaySeconds: 0 });
        if (book.status !== 'Reading') {
            updateBook({ ...book, status: 'Reading' });
        }
        setNumpadMode(null);
    } else if (numpadMode === 'stop') {
        confirmSession(pageVal);
    }
  };

  const confirmSession = (finalPage: number) => {
    const pagesCount = Math.max(0, finalPage - session.startPage);
    const today = new Date().toISOString().split('T')[0];
    const finalDuration = session.accumulatedTime;
    const currentCycle = book.currentCycleIndex || 0;

    const newSession: ReadingSessionData = {
      id: createClientId(),
      date: today,
      duration: finalDuration,
      pages: pagesCount,
      cycleIndex: currentCycle
    };

    const nextSessions = [...(book.sessions || []), newSession];
    // Optimistic UI for filtered sessions
    setDiarySessions(nextSessions.filter(s => (s.cycleIndex || 0) === currentCycle));

    const currentSessions = nextSessions.filter(s => (s.cycleIndex || 0) === currentCycle);
    const totalRead = currentSessions.reduce((acc, s) => acc + (s.pages || 0), 0);
    const total = getBookPageTotal(book);
    const isCompleted = total > 0 && totalRead >= total;

    let updatedBook: Book = {
        ...book,
        pagesRead: totalRead,
        status: isCompleted ? 'Completed' : 'Reading',
        sessions: nextSessions
    };

    if (isCompleted) {
        const nowIso = new Date().toISOString();
        updatedBook.completedAt = nowIso;
        const prevCompletedDates = book.completedDates || [];
        if (!prevCompletedDates.includes(nowIso)) {
            updatedBook.completedDates = [...prevCompletedDates, nowIso];
        }
    }

    updateBook(updatedBook);
    localStorage.removeItem(`libra_session_${book.id}`);
    setSession({ isActive: false, isPaused: false, startPage: 0, startTime: null, accumulatedTime: 0, displaySeconds: 0 });
    setNumpadMode(null);

    if (isCompleted) setShowRatingDialog(true);
  };

  const handleAddSession = () => {
    const currentCycle = book.currentCycleIndex || 0;
    const newSession: ReadingSessionData = {
      id: createClientId(),
      date: new Date().toISOString().split('T')[0],
      duration: 0,
      pages: 0,
      cycleIndex: currentCycle
    };
    
    const nextSessions = [...(book.sessions || []), newSession];
    setDiarySessions(nextSessions.filter(s => (s.cycleIndex || 0) === currentCycle));
    setEditingSessionId(newSession.id);
    
    updateBook({ ...book, sessions: nextSessions });
  };

  const updateSession = (sessionId: string, field: keyof ReadingSessionData, value: any) => {
    const updatedSessions = (book.sessions || []).map(s => s.id === sessionId ? { ...s, [field]: value } : s);
    const currentCycle = book.currentCycleIndex || 0;
    setDiarySessions(updatedSessions.filter(s => (s.cycleIndex || 0) === currentCycle));

    const currentSessions = updatedSessions.filter(s => (s.cycleIndex || 0) === currentCycle);
    const totalRead = currentSessions.reduce((acc, s) => acc + (s.pages || 0), 0);
    const total = getBookPageTotal(book);
    const isCompleted = total > 0 && totalRead >= total;
    
    const updates: Partial<Book> = { sessions: updatedSessions, pagesRead: totalRead };
    
    if (isCompleted && book.status !== 'Completed') {
        const nowIso = new Date().toISOString();
        updates.status = 'Completed';
        updates.completedAt = nowIso;
        const prevCompletedDates = book.completedDates || [];
        if (!prevCompletedDates.includes(nowIso)) {
            updates.completedDates = [...prevCompletedDates, nowIso];
        }
    } else if (!isCompleted && book.status === 'Completed') {
        updates.status = 'Reading';
        updates.completedAt = undefined;
    }

    updateBook({ ...book, ...updates });
  };

  const deleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    setSessionToDelete(sessionId);
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = () => {
    if (!sessionToDelete) return;
    
    const updatedSessions = (book.sessions || []).filter(s => s.id !== sessionToDelete);
    const currentCycle = book.currentCycleIndex || 0;
    setDiarySessions(updatedSessions.filter(s => (s.cycleIndex || 0) === currentCycle));
    
    const currentSessions = updatedSessions.filter(s => (s.cycleIndex || 0) === currentCycle);
    const totalRead = currentSessions.reduce((acc, s) => acc + (s.pages || 0), 0);
    const total = getBookPageTotal(book);
    
    const updatedBook: Book = { ...book, sessions: updatedSessions, pagesRead: totalRead };
    
    if (book.status === 'Completed' && total > 0 && totalRead < total) {
        updatedBook.status = 'Reading';
        updatedBook.completedAt = undefined;
    }
    updateBook(updatedBook);
    setShowDeleteDialog(false);
    setSessionToDelete(null);
  };

  const recalculateProgress = () => {
    const currentCycle = book.currentCycleIndex || 0;
    const currentSessions = (book.sessions || []).filter(s => (s.cycleIndex || 0) === currentCycle);
    const totalRead = currentSessions.reduce((acc, s) => acc + (s.pages || 0), 0);
    const total = getBookPageTotal(book);
    const isCompleted = total > 0 && totalRead >= total;
    
    const updates: Partial<Book> = { pagesRead: totalRead };
    if (isCompleted && book.status !== 'Completed') {
        const nowIso = new Date().toISOString();
        updates.status = 'Completed';
        updates.completedAt = nowIso;
        const prevCompletedDates = book.completedDates || [];
        if (!prevCompletedDates.includes(nowIso)) {
            updates.completedDates = [...prevCompletedDates, nowIso];
        }
    } else if (!isCompleted && book.status === 'Completed') {
        updates.status = 'Reading';
        updates.completedAt = undefined;
    }
    
    updateBook({ ...book, ...updates });
    toast.show(t('details.recalculateToast'), 'success');
  };

  const submitRatingAndFinish = () => {
    updateBook({ ...book, rating: tempRating });
    setShowRatingDialog(false);
  };

  const DiaryCardItem = ({ icon: Icon, label, value, colorClass }: any) => (
    <div className="flex flex-col items-center justify-center bg-gray-50 rounded-xl p-1.5 flex-1 min-w-0">
        <div className="flex items-center gap-1 mb-0.5"><Icon size={10} className="text-gray-400" /><span className="text-[9px] text-gray-400 uppercase font-bold truncate">{label}</span></div>
        <span className={`text-xs font-black truncate ${colorClass}`}>{value}</span>
    </div>
  );

  const getFormatIcon = (format: BookFormat) => {
      switch(format) {
          case 'Paper': return <BookOpen size={24} />;
          case 'E-book': return <Tablet size={24} />;
          case 'Audio': return <Headphones size={24} />;
          case 'Pirate': return <FileText size={24} />;
          default: return <BookOpen size={24} />;
      }
  };

  const effectiveTotal = getBookPageTotal(book);

  return (
    <div className="fixed inset-0 z-[100] bg-[#323238] flex flex-col animate-in fade-in duration-300">
       <div className="flex-none flex flex-col items-center px-4 pt-4 pb-2 w-full h-[55%] min-h-[300px]">
           <div className="w-full flex justify-end items-center mb-2">
             <button onClick={onClose} className="p-2 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors"><X size={20} /></button>
           </div>
           
           <div className="flex flex-col items-center justify-center flex-1 w-full gap-3">
               <div className="flex items-center gap-6 w-full max-w-sm justify-center">
                   <div className="w-20 h-28 rounded-lg overflow-hidden shadow-2xl relative flex-shrink-0 border border-white/10">
                      <BookCover book={book} className="w-full h-full" iconSize={32} />
                      {book.selectedReadingFormat && (<div className="absolute top-1 right-1 bg-black/60 backdrop-blur rounded p-1 text-white">{getFormatIcon(book.selectedReadingFormat)}</div>)}
                   </div>
                   <div className="flex flex-col justify-center">
                       <div className="text-4xl font-bold text-white leading-none mb-2">{calculateProgress(book.pagesRead, effectiveTotal)}%</div>
                       <div className="text-sm font-medium text-gray-300 mb-1">
                         {book.selectedReadingFormat === 'Audio' 
                           ? `${book.pagesRead || 0}%` 
                           : `${book.pagesRead || 0} / ${effectiveTotal} стор.`
                         }
                       </div>
                       <p className="text-xs font-medium text-gray-400 mb-3 max-w-[140px] leading-tight">{getRemainingTimeText(book)}</p>
                       <div className="w-32 h-1.5 bg-gray-600 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${calculateProgress(book.pagesRead, effectiveTotal)}%` }} />
                       </div>
                   </div>
               </div>
           </div>

           <div className="w-full flex justify-center pb-4">
              {!session.isActive ? (
                <button 
                  onClick={book.status === 'Completed' ? handleReReadClick : handleStartRecordClick} 
                  className={`w-20 h-20 rounded-full border-[4px] border-white/10 flex items-center justify-center shadow-xl active:scale-95 transition-all ${book.status === 'Completed' ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-red-600 hover:bg-red-500'}`}
                >
                    {book.status === 'Completed' ? <RefreshCw size={28} className="text-white" /> : <div className="w-6 h-6 bg-white rounded-full" />} 
                </button>
              ) : (
                <div className="flex items-center gap-4 bg-black/30 p-2 rounded-[2.5rem] backdrop-blur-md border border-white/5">
                    <button onClick={handlePauseToggle} className="w-14 h-14 rounded-full bg-amber-400 flex items-center justify-center text-white shadow-lg active:scale-95 transition-all">{session.isPaused ? <Play size={20} fill="currentColor" /> : <Pause size={20} fill="currentColor" />}</button>
                    <div className="text-white font-mono text-2xl font-bold w-24 text-center tracking-wider">{formatTime(session.displaySeconds)}</div>
                    <button onClick={handleStopRecordClick} className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center text-white shadow-lg active:scale-95 transition-all"><Square size={18} fill="currentColor" /></button>
                </div>
              )}
           </div>
       </div>

       <div className="flex-1 bg-white rounded-t-[2rem] shadow-[0_-8px_30px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col w-full">
          <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0 bg-white z-10 flex items-center justify-between">
             <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2"><BookOpen size={18} className="text-indigo-600" /> Щоденник</h3>
             <div className="flex gap-2">
                <button 
                  onClick={handleAddSession}
                  className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                  title="Додати запис"
                >
                  <Plus size={16} />
                </button>
                <button 
                  onClick={recalculateProgress}
                  className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                  title={t('details.recalculate')}
                >
                  <RefreshCw size={16} />
                </button>
             </div>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-2.5">
              {diarySessions.length > 0 ? (
                  [...diarySessions].reverse().map((s) => {
                      const speed = (s.duration > 0 && book.selectedReadingFormat !== 'Audio') ? Math.round(s.pages / (s.duration / 3600)) : 0;
                      const isEditing = editingSessionId === s.id;
                      return (
                          <div key={s.id} className="bg-white border border-gray-100 rounded-2xl p-2 shadow-sm flex items-stretch gap-2">
                              <div className="flex-1 grid grid-cols-4 gap-2">
                                  <div className="flex flex-col items-center justify-center bg-gray-50 rounded-xl p-1.5 min-w-0">
                                      <div className="flex items-center gap-1 mb-0.5"><Calendar size={10} className="text-gray-400" /><span className="text-[9px] text-gray-400 uppercase font-bold truncate">Дата</span></div>
                                      {isEditing ? (<input type="date" className="w-full bg-white text-[10px] rounded border border-gray-200 p-0.5" value={s.date} onChange={(e) => updateSession(s.id, 'date', e.target.value)} />) : (<span className="text-xs font-bold text-gray-700 truncate">{new Date(s.date).toLocaleDateString('uk-UA', {day: '2-digit', month: '2-digit'})}</span>)}
                                  </div>
                                  <div className="flex flex-col items-center justify-center bg-gray-50 rounded-xl p-1.5 min-w-0">
                                      <div className="flex items-center gap-1 mb-0.5"><FileText size={10} className="text-gray-400" /><span className="text-[9px] text-gray-400 uppercase font-bold truncate">{book.selectedReadingFormat === 'Audio' ? 'Відс' : 'Стор'}</span></div>
                                      {isEditing ? (<input inputMode="numeric" pattern="[0-9]*" type="number" className="w-full text-center bg-white text-xs rounded border border-gray-200 p-0.5" value={s.pages === 0 ? '' : s.pages} placeholder="0" onChange={(e) => updateSession(s.id, 'pages', parseInt(e.target.value) || 0)} />) : (<span className="text-xs font-black text-indigo-600">{s.pages}{book.selectedReadingFormat === 'Audio' ? '%' : ''}</span>)}
                                  </div>
                                  <div className="flex flex-col items-center justify-center bg-gray-50 rounded-xl p-1.5 min-w-0">
                                      <div className="flex items-center gap-1 mb-0.5"><Clock size={10} className="text-gray-400" /><span className="text-[9px] text-gray-400 uppercase font-bold truncate">Хв</span></div>
                                      {isEditing ? (<input inputMode="numeric" pattern="[0-9]*" type="number" className="w-full text-center bg-white text-xs rounded border border-gray-200 p-0.5" value={Math.round(s.duration / 60) === 0 ? '' : Math.round(s.duration / 60)} placeholder="0" onChange={(e) => updateSession(s.id, 'duration', (parseInt(e.target.value) || 0) * 60)} />) : (<span className="text-xs font-black text-gray-700">{Math.round(s.duration / 60)}</span>)}
                                  </div>
                                  {book.selectedReadingFormat !== 'Audio' ? (
                                    <DiaryCardItem icon={Zap} label="Швидк" value={`${speed}`} colorClass="text-amber-500" />
                                  ) : (
                                    <div className="flex flex-col items-center justify-center bg-gray-50 rounded-xl p-1.5 flex-1 min-w-0">
                                      <div className="flex items-center gap-1 mb-0.5"><Zap size={10} className="text-gray-400" /><span className="text-[9px] text-gray-400 uppercase font-bold truncate">Аудіо</span></div>
                                      <span className="text-xs font-black text-gray-400 italic">N/A</span>
                                    </div>
                                  )}
                              </div>
                              <div className="flex flex-col gap-1 w-8 flex-shrink-0">
                                  <button onClick={(e) => { e.stopPropagation(); setEditingSessionId(isEditing ? null : s.id); }} className={`flex-1 flex items-center justify-center rounded-lg transition-colors ${isEditing ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-50 text-gray-400 hover:text-indigo-600'}`}>{isEditing ? <Save size={14} /> : <Edit3 size={14} />}</button>
                                  <button onClick={(e) => deleteSession(e, s.id)} className="flex-1 flex items-center justify-center bg-red-50 text-red-400 hover:text-red-600 hover:bg-red-100 rounded-lg transition-colors"><Trash2 size={14} /></button>
                              </div>
                          </div>
                      );
                  })
              ) : (<div className="flex flex-col items-center justify-center py-10 text-gray-300 gap-2"><Clock size={32} opacity={0.2} /><p className="text-xs font-medium">Історія читання порожня</p></div>)}
          </div>
       </div>

       {setupStep === 'select-format' && (
           <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
               <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-300">
                   <h3 className="text-2xl font-bold text-gray-800 mb-2 text-center">Формат читання</h3>
                   <p className="text-gray-500 text-sm mb-6 text-center">Оберіть, в якому форматі ви будете читати цю книгу зараз.</p>
                   <div className="space-y-3">
                       {book.formats.map(f => (
                           <button key={f} onClick={() => handleFormatSelect(f)} className="w-full p-4 bg-gray-50 hover:bg-indigo-50 active:bg-indigo-100 rounded-2xl flex items-center gap-4 transition-all border border-gray-100 hover:border-indigo-200">
                               <div className="p-2.5 bg-white rounded-xl text-indigo-600 shadow-sm">{getFormatIcon(f)}</div><span className="font-bold text-gray-700">{FORMAT_LABELS[f]}</span>
                           </button>
                       ))}
                   </div>
               </div>
           </div>
       )}

       {setupStep === 'confirm-pages' && (
           <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
               <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-300">
                   <h3 className="text-2xl font-bold text-gray-800 mb-2 text-center">Кількість сторінок</h3>
                   <p className="text-gray-500 text-sm mb-6 text-center">Скільки сторінок у форматі <span className="text-indigo-600 font-bold">{tempFormat && FORMAT_LABELS[tempFormat]}</span>?</p>
                   <div className="mb-6">
                       <input inputMode="numeric" pattern="[0-9]*" type="number" className="w-full text-center text-4xl font-black text-gray-800 bg-gray-50 border-2 border-gray-100 rounded-2xl py-4 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all" value={tempPagesTotal === 0 ? '' : tempPagesTotal} placeholder="0" onChange={(e) => setTempPagesTotal(parseInt(e.target.value) || 0)} />
                       <p className="text-center text-xs text-gray-400 mt-2">За замовчуванням: {book.pagesTotal}</p>
                   </div>
                   <button onClick={handlePagesConfirm} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold text-lg shadow-xl shadow-indigo-200 active:scale-95 transition-all">Зберегти</button>
               </div>
           </div>
       )}

       {numpadMode && (
         <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 shadow-2xl animate-in slide-in-from-bottom duration-300">
               <h3 className="text-lg font-bold text-gray-800 text-center mb-6">{book.selectedReadingFormat === 'Audio'
                    ? (numpadMode === 'start' ? 'Скільки відсотків було?' : 'Скільки відсотків зараз?')
                    : (numpadMode === 'start' ? 'З якої сторінки почали?' : 'На якій сторінці зупинились?')
                  }</h3>
               <div className="flex justify-center mb-6"><div className="text-5xl font-black text-gray-800 flex items-center tracking-tight">{numpadValue || '0'}{book.selectedReadingFormat === 'Audio' && <span className="text-2xl ml-1">%</span>}<span className="animate-pulse text-indigo-500 ml-1">|</span></div></div>
               <div className="grid grid-cols-3 gap-3 mb-4">
                   {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (<button key={num} onClick={() => handleNumpadPress(num)} className="h-14 rounded-2xl text-xl font-bold text-gray-800 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors shadow-sm">{num}</button>))}
                   <div /><button onClick={() => handleNumpadPress(0)} className="h-14 rounded-2xl text-xl font-bold text-gray-800 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors shadow-sm">0</button>
                   <button onClick={handleNumpadBackspace} className="h-14 rounded-2xl flex items-center justify-center text-gray-800 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors shadow-sm"><Delete size={20} /></button>
               </div>
               <div className="flex gap-3"><button onClick={() => setNumpadMode(null)} className="flex-1 py-4 bg-gray-100 rounded-2xl font-bold text-gray-600 active:scale-95 transition-all">Скасувати</button><button onClick={handleNumpadConfirm} className="flex-[2] py-4 bg-black text-white rounded-2xl font-bold shadow-lg active:scale-95 transition-all">OK</button></div>
            </div>
         </div>
       )}

       {showRatingDialog && (
         <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-slate-900/90 backdrop-blur-xl">
            <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl flex flex-col items-center">
               <Trophy size={48} className="text-emerald-500 mb-4" /><h3 className="text-2xl font-bold mb-2">Вітаємо!</h3><p className="text-gray-500 text-sm mb-8 text-center">Книга прочитана. Як вам вона?</p>
               <div className="grid grid-cols-5 gap-2 mb-10">{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (<button key={n} onClick={() => setTempRating(n)} className={`w-12 h-12 rounded-2xl text-sm font-bold transition-all ${tempRating === n ? 'bg-indigo-600 text-white shadow-lg' : 'bg-gray-50 text-gray-400'}`}>{n}</button>))}</div>
               <button onClick={submitRatingAndFinish} className="w-full bg-indigo-600 text-white py-5 rounded-[2rem] font-bold shadow-xl active:scale-95">Завершити</button>
            </div>
         </div>
       )}
        {showDeleteDialog && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
             <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 shadow-2xl flex flex-col items-center animate-in zoom-in-95 duration-200">
                <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4 text-red-500">
                    <Trash2 size={32} />
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2 text-center">Видалити запис?</h3>
                <p className="text-gray-500 text-sm mb-8 text-center leading-relaxed px-4">
                    Ви впевнені, що хочете видалити цей запис із щоденника читання? Цю дію неможливо скасувати.
                </p>
                <div className="flex gap-3 w-full">
                    <button 
                        onClick={() => { setShowDeleteDialog(false); setSessionToDelete(null); }} 
                        className="flex-1 py-4 bg-gray-100 text-gray-700 rounded-2xl font-bold hover:bg-gray-200 active:scale-95 transition-all"
                    >
                        Скасувати
                    </button>
                    <button 
                        onClick={handleConfirmDelete} 
                        className="flex-1 py-4 bg-red-500 text-white rounded-2xl font-bold shadow-lg shadow-red-200 hover:bg-red-600 active:scale-95 transition-all"
                    >
                        Видалити
                    </button>
                </div>
             </div>
          </div>
        )}
    </div>
  );
};
