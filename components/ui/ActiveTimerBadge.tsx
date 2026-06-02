
import React, { useState, useEffect } from 'react';
import { formatTime } from '../../utils';

interface ActiveTimerBadgeProps {
  bookId: string;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}

export const ActiveTimerBadge: React.FC<ActiveTimerBadgeProps> = ({ bookId, onClick, className }) => {
  const [displaySeconds, setDisplaySeconds] = useState<number | null>(null);

  useEffect(() => {
    const updateTimer = () => {
      const saved = localStorage.getItem(`libra_session_${bookId}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.isActive) {
            let currentSecs = parsed.accumulatedTime;
            if (!parsed.isPaused && parsed.startTime) {
              currentSecs += Math.floor((Date.now() - parsed.startTime) / 1000);
            }
            setDisplaySeconds(currentSecs);
            return;
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
      setDisplaySeconds(null);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    
    // Listen for storage changes to sync across tabs/components
    window.addEventListener('storage', updateTimer);
    window.addEventListener('libra_session_update', updateTimer as EventListener);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', updateTimer);
      window.removeEventListener('libra_session_update', updateTimer as EventListener);
    };
  }, [bookId]);

  if (displaySeconds === null) return null;

  return (
    <div 
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      className={`absolute top-1 right-1 w-16 h-16 bg-red-600 text-white text-xs font-bold rounded-full shadow-lg z-20 flex items-center justify-center cursor-pointer hover:scale-105 transition-transform active:scale-95 border-4 border-white ring-1 ring-gray-100 ${className || ''}`}
    >
      {formatTime(displaySeconds)}
    </div>
  );
};
