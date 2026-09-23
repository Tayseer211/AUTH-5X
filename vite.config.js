import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Modules that only define data and pure functions. Marking them free of side
// effects lets Rollup drop them from the browser bundle when nothing the app
// runs uses them: the fraud model's training-time feature spec pulls in the
// synthetic-data generator's schema and vocabulary, which the app never needs.
const PURE_MODULES = [/\/src\/fraud\/synthetic\//, /\/src\/fraud\/ml\/featureSpec\.js$/]
const isPureModule = (id) => PURE_MODULES.some((pattern) => pattern.test(id.split('\\').join('/')))

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      treeshake: {
        moduleSideEffects: (id) => !isPureModule(id),
      },
    },
  },
})
