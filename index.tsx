
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Fix for iOS Safari to prevent scrolling while dragging issues (handled by dnd-kit mainly, but good safety)
window.addEventListener( 'touchmove', function() {}, {passive: false});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
