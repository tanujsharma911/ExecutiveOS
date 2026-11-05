/** Loads the repo-root .env first, then server/.env (if present) for overrides. */
import { config } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
config({ path: [resolve(here, '../../.env'), resolve(here, '../.env')], quiet: true })
