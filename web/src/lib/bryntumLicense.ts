/**
 * Registers the Bryntum license key before any Bryntum component is created.
 * Set VITE_BRYNTUM_LICENSE_KEY in the repo-root .env. Without a key Bryntum runs as a 14-day trial with a
 * banner, then stops rendering. This is Bryntum 8's documented `(globalThis.bryntum ??= {}).licenseKey = '…'`.
 * Import this module before '@bryntum/*' so the key is in place when the library loads.
 */
const licenseKey = import.meta.env.VITE_BRYNTUM_LICENSE_KEY as string | undefined

if (licenseKey) {
  const g = globalThis as unknown as { bryntum?: Record<string, unknown> }
  // Bryntum merges its own API into an existing globalThis.bryntum, so the key survives the library load.
  g.bryntum = Object.assign(g.bryntum ?? {}, { licenseKey })
}

export {}
