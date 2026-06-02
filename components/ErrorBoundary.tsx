
import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCcw, Trash2 } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  declare props: Readonly<Props>;

  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
      // Emergency data reset
      if (window.confirm("Увага! Це видалить всі локальні дані бібліотеки та налаштування. Використовуйте це лише якщо додаток не працює. Продовжити?")) {
          try {
              localStorage.clear();
              const req = indexedDB.deleteDatabase('LibraDB');
              req.onsuccess = () => window.location.reload();
              req.onerror = () => {
                  alert("Не вдалося очистити базу даних. Спробуйте очистити дані сайту через налаштування браузера.");
                  window.location.reload();
              };
              req.onblocked = () => {
                  alert("Будь ласка, закрийте інші вкладки з цим додатком і спробуйте знову.");
              };
          } catch (e) {
              console.error("Reset failed", e);
              window.location.reload();
          }
      }
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50 text-center font-sans">
          <div className="bg-red-50 p-6 rounded-full text-red-500 mb-6 shadow-sm border border-red-100 animate-bounce">
            <AlertTriangle size={48} />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Ой, щось пішло не так</h1>
          <p className="text-gray-500 mb-8 max-w-xs text-sm leading-relaxed">
            Виникла неочікувана помилка. Ми вже записали її (в консоль). Спробуйте оновити сторінку.
          </p>
          
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <button 
                onClick={this.handleReload}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg shadow-indigo-200"
            >
                <RefreshCcw size={20} /> Оновити сторінку
            </button>
            <button 
                onClick={this.handleReset}
                className="w-full py-4 bg-white border border-gray-200 text-gray-500 hover:text-red-500 hover:border-red-200 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
                <Trash2 size={20} /> Скинути дані
            </button>
          </div>
          
          {this.state.error && (
              <div className="mt-8 p-4 bg-gray-100 rounded-xl text-left w-full max-w-sm overflow-auto border border-gray-200">
                  <p className="text-[10px] font-mono text-gray-500 break-all">{this.state.error.toString()}</p>
              </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
