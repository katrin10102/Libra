
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { X, Check, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { createClientId } from '../services/id';

// --- Types ---
type ToastType = 'success' | 'error' | 'info';

interface ToastState {
  id: string;
  message: string;
  type: ToastType;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'info';
}

interface UIContextType {
  toast: {
    show: (message: string, type?: ToastType) => void;
  };
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export const useUI = () => {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
};

// --- Components ---

const ToastContainer: React.FC<{ toasts: ToastState[], removeToast: (id: string) => void }> = ({ toasts, removeToast }) => {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[150] flex flex-col gap-2 w-[90%] max-w-sm pointer-events-none">
      {toasts.map(t => (
        <div 
          key={t.id} 
          className="pointer-events-auto bg-white/90 backdrop-blur-md shadow-lg border border-gray-100 p-4 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top-5 fade-in duration-300"
        >
          {t.type === 'success' && <div className="p-1 bg-emerald-100 rounded-full text-emerald-600"><CheckCircle2 size={16} /></div>}
          {t.type === 'error' && <div className="p-1 bg-red-100 rounded-full text-red-600"><AlertTriangle size={16} /></div>}
          {t.type === 'info' && <div className="p-1 bg-indigo-100 rounded-full text-indigo-600"><Info size={16} /></div>}
          
          <p className="text-sm font-bold text-gray-800 flex-1">{t.message}</p>
          <button onClick={() => removeToast(t.id)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
      ))}
    </div>
  );
};

const ConfirmModal: React.FC<{ 
  isOpen: boolean; 
  options: ConfirmOptions | null; 
  onClose: (result: boolean) => void 
}> = ({ isOpen, options, onClose }) => {
  if (!isOpen || !options) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex flex-col items-center text-center mb-6">
            {options.type === 'danger' ? (
                <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mb-4 text-red-500">
                    <AlertTriangle size={24} />
                </div>
            ) : (
                <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mb-4 text-indigo-500">
                    <Info size={24} />
                </div>
            )}
            <h3 className="text-xl font-bold text-gray-800 mb-2">{options.title}</h3>
            <p className="text-sm text-gray-500">{options.message}</p>
        </div>
        
        <div className="flex gap-3">
            <button 
                onClick={() => onClose(false)} 
                className="flex-1 py-3 bg-gray-50 text-gray-700 font-bold rounded-xl hover:bg-gray-100 active:scale-95 transition-all"
            >
                {options.cancelText || 'Cancel'}
            </button>
            <button 
                onClick={() => onClose(true)} 
                className={`flex-1 py-3 font-bold rounded-xl text-white shadow-lg active:scale-95 transition-all ${options.type === 'danger' ? 'bg-red-500 shadow-red-200' : 'bg-indigo-600 shadow-indigo-200'}`}
            >
                {options.confirmText || 'Confirm'}
            </button>
        </div>
      </div>
    </div>
  );
};

// --- Provider ---

export const UIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Toast State
  const [toasts, setToasts] = useState<ToastState[]>([]);
  
  // Confirm State
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    options: ConfirmOptions | null;
    resolver: ((value: boolean) => void) | null;
  }>({ isOpen: false, options: null, resolver: null });

  // --- Toast Logic ---
  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = createClientId();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // --- Confirm Logic ---
  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({
        isOpen: true,
        options,
        resolver: resolve
      });
    });
  }, []);

  const handleConfirmClose = (result: boolean) => {
    if (confirmState.resolver) {
      confirmState.resolver(result);
    }
    setConfirmState({ isOpen: false, options: null, resolver: null });
  };

  return (
    <UIContext.Provider value={{ toast: { show: showToast }, confirm }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <ConfirmModal 
        isOpen={confirmState.isOpen} 
        options={confirmState.options} 
        onClose={handleConfirmClose} 
      />
    </UIContext.Provider>
  );
};
