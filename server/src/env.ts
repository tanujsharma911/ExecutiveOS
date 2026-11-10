/** Loads the repo-root .env first, then server/.env (if present) for overrides. */
import { config } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
config({ path: [resolve(here, '../../.env'), resolve(here, '../.env')], quiet: true })

// On Render the web app is served by this same service, so its public URL is available as RENDER_EXTERNAL_URL.
// appUrl() uses it when APP_URL is absent or was accidentally left on a localhost value.
if (!process.env.APP_URL && process.env.RENDER_EXTERNAL_URL) process.env.APP_URL = process.env.RENDER_EXTERNAL_URL
