/** Loads the repo-root .env first, then server/.env (if present) for overrides. */
import { config } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
config({ path: [resolve(here, '../../.env'), resolve(here, '../.env')], quiet: true })

// On Render the web app is served by this same service, so its public URL (RENDER_EXTERNAL_URL, set by Render)
// is also the app URL used in emails and intake links. An explicit APP_URL still wins.
if (!process.env.APP_URL && process.env.RENDER_EXTERNAL_URL) process.env.APP_URL = process.env.RENDER_EXTERNAL_URL
