import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
// Fonts are served from our own site, so visitors' browsers never contact Google Fonts.
import '@fontsource-variable/inter';
import '@fontsource-variable/outfit';
import './index.css';
import { Analytics } from '@vercel/analytics/react';
import { preloadToolForPath } from './components/tools/lazyTools';

// After a new deploy, a tab opened earlier asks for code files that no longer
// exist. Reload once to pick up the new version (at most once a minute, so a
// real outage can't cause a reload loop).
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem('foldpdf_reloaded_at') || 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem('foldpdf_reloaded_at', String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});

// The prerendered page stays on screen while this tool's code downloads, then
// React takes over with the tool ready, so there is no loading flash.
preloadToolForPath(window.location.pathname)
  .catch(() => {})
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
        <Analytics />
      </StrictMode>,
    );
  });
