import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'

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

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    versionFile(),
  ],
  define: {
    // "dev" while running locally: the update check stays off.
    __APP_VERSION__: JSON.stringify(command === 'build' ? APP_VERSION : 'dev'),
    __APP_NUMBER__: JSON.stringify(APP_NUMBER),
  },
}))
