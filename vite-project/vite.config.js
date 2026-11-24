import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig, loadEnv } from 'vite'
import { readFileSync } from 'node:fs'
import process from 'node:process'

// Every build gets its own version. It is baked into the app and also written
// to /version.json; a running app compares the two to know an update is out.
const APP_VERSION = new Date().toISOString()
// The number people see (avatar menu): package.json "version", bumped with every release.
const APP_NUMBER = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version

function versionFile() {
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: APP_VERSION }) })
    },
  }
}

// Content Security Policy for the built site: scripts only from this site,
// data only to this site and the API it was built for, no frames, no plugins.
// Styles allow inline because Mantine sets them at runtime. Off while
// developing (Vite's dev server needs inline scripts).
// frame-ancestors can't go in a <meta> tag: Render sends it as a header
// (Static Site > Settings > Headers).
function securityPolicy(apiBase) {
  const api = new URL(apiBase).origin
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    `connect-src 'self' ${api}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'none'",
  ].join('; ')
  return {
    name: 'security-policy',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => ({
  plugins: [
    react(),
    securityPolicy(loadEnv(mode, process.cwd(), '').VITE_API_BASE || 'https://pharma-payment.onrender.com'),
    babel({ presets: [reactCompilerPreset()] }),
    versionFile(),
  ],
  define: {
    // "dev" while running locally: the update check stays off.
    __APP_VERSION__: JSON.stringify(command === 'build' ? APP_VERSION : 'dev'),
    __APP_NUMBER__: JSON.stringify(APP_NUMBER),
  },
}))
