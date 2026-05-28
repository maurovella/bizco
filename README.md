# Bizco

Chrome extension (Manifest V3) built with **React + Vite + CRXJS + TypeScript**.

It captures webcam frames in the background and streams them to a backend — the
camera lives in an MV3 **offscreen document** so the stream survives even when
the popup is closed.

## Architecture

```
popup (React)  ──START/STOP──▶  background (service worker)
     ▲                                   │
   status                          creates / drives
     │                                   ▼
     └──────────────────────────  offscreen document
                                   getUserMedia → canvas → POST /api/frames
```

| Piece | Path | Role |
|-------|------|------|
| Popup | `src/popup/` | React UI: start/stop, live frame counter, grant permission |
| Background | `src/background/index.ts` | Service worker: owns offscreen lifecycle + status |
| Offscreen | `src/offscreen/` | Hidden page holding the camera stream + capture loop |
| Content script | `src/content/index.ts` | Injected into pages (placeholder for now) |
| Messaging | `src/lib/messages.ts` | Typed message protocol between contexts |
| Config | `src/lib/config.ts` | Backend URL, capture interval/quality |

## Develop

```bash
npm install
npm run dev          # Vite dev server with HMR
```

Then load the extension:

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select the `dist/` folder (created by `dev`/`build`).

For a production bundle:

```bash
npm run build        # typecheck + bundle into dist/
npm run zip          # build + zip into bizco.zip
```

## Test the camera → backend flow

1. Start the test backend (zero dependencies):

   ```bash
   node dev-backend/server.mjs
   # → listening on http://localhost:3000/api/frames
   ```

2. Load the extension (`dist/`) and open the popup.
3. Click **Grant camera permission** once — the offscreen document can't show a
   prompt, so this authorizes the extension origin first.
4. Click **Start**. The frame counter should climb (~1/sec).
5. The backend logs each frame and writes the latest to
   `dev-backend/last-frame.jpg` — open it to confirm the image arrives.

Point the extension at a different backend via `.env.local`:

```bash
cp .env.example .env.local
# VITE_BACKEND_URL=https://your-host/api/frames
```

> Remember to add your production backend host to `host_permissions` in
> `src/manifest.ts`.

## Notes / next steps

- Icons in `icons/` are 1×1 placeholders — replace with real 16/48/128 PNGs.
- Capture cadence and JPEG quality live in `src/lib/config.ts`.
- The content script is a stub; add page-DOM logic there as needed.
