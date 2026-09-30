import React from 'react';
import { renderToString } from 'react-dom/server';
import App from './App';

export { preloadAllTools } from './components/tools/lazyTools';

export function render(url: string): string {
  return renderToString(<App initialPath={url} />);
}
