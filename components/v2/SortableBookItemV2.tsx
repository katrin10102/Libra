import React from 'react';
import { GripVertical } from 'lucide-react';

interface SortableBookItemV2Props {
  itemId: string;
  children: React.ReactNode;
  showHandle: boolean;
  isDragging?: boolean;
  onHandlePointerDown?: (event: React.PointerEvent<HTMLDivElement>, itemId: string) => void;
  setItemRef?: (itemId: string, el: HTMLDivElement | null) => void;
}

export const SortableBookItemV2: React.FC<SortableBookItemV2Props> = ({ itemId, children, showHandle, isDragging = false, onHandlePointerDown, setItemRef }) => {
  return (
    <div
      ref={(el) => setItemRef?.(itemId, el)}
      className={`relative`}
      style={{ touchAction: 'pan-y' }}
    >
      {/* Content */}
      <div className={`w-full relative z-0 transition-opacity duration-200 ${isDragging ? 'opacity-40' : ''}`}>
        {children}
      </div>
      
      {/* Handle Overlay */}
      {showHandle && (
        <div
            onPointerDown={(e) => onHandlePointerDown?.(e, itemId)}
            className={`absolute right-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-xl text-gray-400 border border-gray-100 cursor-grab active:cursor-grabbing touch-none bg-white/90 backdrop-blur-sm shadow-sm active:text-indigo-600 active:scale-110 transition-all`}
            style={{ touchAction: 'none' }} 
        >
            <GripVertical size={20} />
        </div>
      )}
    </div>
  );
};
