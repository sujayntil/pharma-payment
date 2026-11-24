// Open straight into the saved look (Light / Dark / System) - no white flash.
// A file, not inline in index.html, so the page's security policy can refuse
// every inline script.
(function () {
  try {
    var saved = localStorage.getItem('mantine-color-scheme-value') || 'light';
    var dark = saved === 'dark' || (saved === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-mantine-color-scheme', dark ? 'dark' : 'light');
    if (dark) {
      document.documentElement.style.background = '#1f1f1f';
      document.querySelector('meta[name="theme-color"]').setAttribute('content', '#1f1f1f');
    }
  } catch (e) { /* no storage: light */ }
})();
