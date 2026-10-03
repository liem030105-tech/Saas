import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from '@/app/App';
import { env } from '@/config/env';
import { initErrorTracking } from '@/lib/error-tracking';

import './index.css';

initErrorTracking(env);

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
