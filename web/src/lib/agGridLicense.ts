/**
 * AG Grid Enterprise (row grouping, Excel export, master/detail). The key comes from the root .env as
 * VITE_AG_GRID_LICENSE_KEY. Without it the grid still works but shows a trial watermark and console warnings.
 */
import { LicenseManager } from 'ag-grid-enterprise'

const key = (import.meta.env.VITE_AG_GRID_LICENSE_KEY as string | undefined)?.trim()
if (key) LicenseManager.setLicenseKey(key)
