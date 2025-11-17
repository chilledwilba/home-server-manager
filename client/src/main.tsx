import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { queryClient } from './lib/api-client';
import { initPerformanceMonitoring } from './lib/performance';
import './styles/globals.css';

// Initialize performance monitoring (Web Vitals)
initPerformanceMonitoring();

// biome-ignore lint/style/noNonNullAssertion: root element is guaranteed to exist in index.html
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
