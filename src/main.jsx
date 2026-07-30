import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Offline support. Registered relative to the page so it works at the domain
// root, in a /french-b2/ subfolder on GitHub Pages, or anywhere else.
if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', window.location.href)).catch(() => {
      // No offline cache is not a failure worth bothering the user about.
    });
  });
}
