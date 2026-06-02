import React, { useCallback, useEffect, useState } from 'react';
import { BarChart2, Book as BookIcon, Calendar as CalendarIcon, CalendarDays, Library as LibraryIcon, Settings as SettingsIcon } from 'lucide-react';
import { Calendar } from './components/Calendar';
import { History } from './components/History';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ReadingList } from './components/ReadingList';
import { Settings } from './components/Settings';
import { Statistics } from './components/Statistics';
import { LibraryFlowV2 } from './components/v2/LibraryFlowV2';
import { I18nProvider } from './contexts/I18nContext';
import { LibraryProvider, useLibrary } from './contexts/LibraryContext';
import { UIProvider } from './contexts/UIContext';
import { MESSAGES, MessageKey } from './i18n/messages';
import { loadSettings } from './services/storageService';
import { AppSettings, ViewType } from './types';
import { applyTheme } from './utils';

const AppContent: React.FC = () => {
  const [activeView, setActiveView] = useState<ViewType>('library');
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [isNavHidden, setIsNavHidden] = useState(false);
  const { isLoading, filterTag, setFilterTag } = useLibrary();

  const language = settings.language === 'uk' ? 'uk' : 'en';
  const messages = MESSAGES[language];
  const t = (key: MessageKey) => messages[key] || MESSAGES.en[key];

  useEffect(() => {
    applyTheme(settings.accent, settings.bg);
  }, [settings.accent, settings.bg]);

  useEffect(() => {
    if (filterTag) {
      setActiveView('library');
    }
  }, [filterTag]);

  useEffect(() => {
    setIsNavHidden(false);
  }, [activeView]);

  const handleSettingsChange = useCallback((nextSettings: AppSettings) => {
    setSettings(nextSettings);
  }, []);

  const renderView = () => {
    if (isLoading) {
      return (
        <div className="flex h-screen items-center justify-center animate-bounce">
          <LibraryIcon size={48} className="text-indigo-600" aria-label={t('app.loading')} />
        </div>
      );
    }

    switch (activeView) {
      case 'statistics':
        return <Statistics onBack={() => setActiveView('library')} />;
      case 'library':
        return <LibraryFlowV2 
          onNavigateToReading={() => setActiveView('reading')} 
          onNavigateToStatistics={() => setActiveView('statistics')}
          onToggleNav={setIsNavHidden}
        />;
      case 'reading':
        return <ReadingList onToggleNav={setIsNavHidden} />;
      case 'add':
        return <LibraryFlowV2 
          onNavigateToReading={() => setActiveView('reading')} 
          onNavigateToStatistics={() => setActiveView('statistics')}
          onToggleNav={setIsNavHidden}
        />;
      case 'calendar':
        return <Calendar />;
      case 'history':
        return <History />;
      case 'wishlist':
        return null;
      case 'settings':
        return <Settings onSettingsChange={handleSettingsChange} />;
      default:
        return <LibraryFlowV2 
          onNavigateToReading={() => setActiveView('reading')} 
          onNavigateToStatistics={() => setActiveView('statistics')}
          onToggleNav={setIsNavHidden}
        />;
    }
  };

  return (
    <I18nProvider language={language}>
      <div className="w-full min-h-screen bg-slate-50 overflow-x-clip relative transition-colors duration-300">
        <main className="min-h-screen">{renderView()}</main>
        {!isNavHidden && (
          <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[95%] max-w-md bg-white border border-gray-100 rounded-[2.5rem] shadow-2xl p-2 z-50 grid grid-cols-5 gap-1 items-center">
            <NavButton
              active={activeView === 'library' || activeView === 'add'}
              onClick={() => {
                setActiveView('library');
                setFilterTag('');
              }}
              icon={<LibraryIcon size={20} />}
              label={t('nav.library')}
            />
            <NavButton active={activeView === 'reading'} onClick={() => setActiveView('reading')} icon={<BookIcon size={20} />} label={t('nav.reading')} />
            <NavButton active={activeView === 'calendar'} onClick={() => setActiveView('calendar')} icon={<CalendarIcon size={20} />} label={t('nav.calendar')} />
            <NavButton active={activeView === 'history'} onClick={() => setActiveView('history')} icon={<BarChart2 size={20} />} label={t('nav.history')} />
            <NavButton active={activeView === 'settings'} onClick={() => setActiveView('settings')} icon={<SettingsIcon size={20} />} label={t('nav.settings')} />
          </nav>
        )}
      </div>
    </I18nProvider>
  );
};

const NavButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({ active, onClick, icon, label }) => {
  const lastTapTsRef = React.useRef(0);
  const trigger = React.useCallback(() => {
    const now = Date.now();
    if (now - lastTapTsRef.current < 300) return;
    lastTapTsRef.current = now;
    onClick();
  }, [onClick]);

  return (
    <button
      onClick={trigger}
      onTouchEnd={trigger}
      className={`flex flex-col items-center justify-center p-2 rounded-2xl transition-all w-full ${
        active ? 'text-indigo-600 scale-110 font-medium' : 'text-gray-400 hover:bg-gray-50/50'
      }`}
    >
      {icon}
      <span className={`text-[9px] font-bold mt-1 uppercase tracking-tighter transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`}>{label}</span>
    </button>
  );
};

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <UIProvider>
        <LibraryProvider>
          <AppContent />
        </LibraryProvider>
      </UIProvider>
    </ErrorBoundary>
  );
};

export default App;
