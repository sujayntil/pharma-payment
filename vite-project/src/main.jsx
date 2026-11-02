import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { HashRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import store from './store';
import './index.css';
import App from './App.jsx';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(console.error));
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <MantineProvider theme={{ primaryColor: 'green', defaultRadius: 'md', fontFamily: 'IBM Plex Sans, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', headings: { fontFamily: 'IBM Plex Sans, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif' } }}>
        <Notifications position="top-right" />
        <HashRouter>
          <App />
        </HashRouter>
      </MantineProvider>
    </Provider>
  </StrictMode>
);

