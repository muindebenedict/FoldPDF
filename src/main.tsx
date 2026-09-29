import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
// Fonts are served from our own site, so visitors' browsers never contact Google Fonts.
import '@fontsource-variable/inter';
import '@fontsource-variable/outfit';
import './index.css';
import { Analytics } from '@vercel/analytics/react';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
);
