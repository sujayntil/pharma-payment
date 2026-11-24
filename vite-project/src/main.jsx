import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { HashRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
// The app's font, bundled (no calls to Google Fonts).
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dates/styles.css';
import store from './store';
import './index.css';
import App from './App.jsx';
import UpdateRequired from './components/common/UpdateRequired';
import { watchSystemTheme } from './utils/themeColor';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(console.error));
}

watchSystemTheme();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <MantineProvider defaultColorScheme="light" theme={{ primaryColor: 'green', defaultRadius: 'md', fontFamily: 'IBM Plex Sans, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', headings: { fontFamily: 'IBM Plex Sans, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif' }, components: { Badge: { styles: { label: { textTransform: 'none' } } } } }}>
        <Notifications position="top-right" />
        <HashRouter>
          <App />
        </HashRouter>
        {/* A newer version is live: everyone updates before going on. */}
        <UpdateRequired />
      </MantineProvider>
    </Provider>
  </StrictMode>
);

