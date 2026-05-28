/**
 * Runtime configuration shared across the extension.
 *
 * `VITE_BACKEND_URL` can be set in a `.env` / `.env.local` file at build time,
 * e.g. `VITE_BACKEND_URL=http://localhost:3000/api/frames`.
 */
export const BACKEND_URL: string =
  import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000/api/frames'

/** How often (ms) the offscreen document captures and uploads a frame. */
export const CAPTURE_INTERVAL_MS = 1000

/** JPEG quality (0–1) used when encoding captured frames. */
export const CAPTURE_QUALITY = 0.7
