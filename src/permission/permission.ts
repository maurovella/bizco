// Standalone extension page used purely to obtain camera permission.
//
// The popup can't be used for this: interacting with the permission prompt
// closes the popup, which dismisses the prompt ("Permission dismissed").
// A full tab stays open, so the user can actually click "Allow". Once granted,
// the permission sticks for the extension origin and the offscreen document
// reuses it without prompting.
import type { CameraStatus, Message, StatusResponse } from '@/lib/messages'

const statusEl = document.getElementById('status') as HTMLDivElement
const videoEl = document.getElementById('preview') as HTMLVideoElement
const retryEl = document.getElementById('retry') as HTMLButtonElement
const posturaEl = document.getElementById('postura') as HTMLDivElement

async function request(): Promise<void> {
  statusEl.className = ''
  statusEl.textContent = 'Requesting camera…'
  retryEl.hidden = true
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    // Show a brief preview so the user sees it works, then release the stream
    // (the offscreen document opens its own once you press Start).
    videoEl.srcObject = stream
    statusEl.className = 'ok'
    statusEl.textContent = 'Camera permission granted ✓  You can close this tab and press Start in the popup.'
  } catch (err) {
    statusEl.className = 'err'
    statusEl.textContent = `Camera permission failed: ${String(err)}`
    retryEl.hidden = false
  }
}

// Panel de postura en vivo: consulta el estado al background cada 400ms.
function pintarPostura(s: CameraStatus): void {
  if (!s?.active) {
    posturaEl.className = ''
    posturaEl.innerHTML = 'Postura: — <small>Activá Bizco en el popup para verla.</small>'
    return
  }
  const mal = (s.nivel ?? 0) > 0 || s.encorvado
  posturaEl.className = mal ? 'mal' : 'ok'
  const titulo = mal ? 'Estás mal sentado, ¡acomodate! ❌' : 'Buena postura ✅'
  const sep = s.sep !== undefined ? s.sep.toFixed(3) : '—'
  const ancho = s.ancho !== undefined ? Math.round(s.ancho) : '—'
  posturaEl.innerHTML =
    `${titulo} <small>nivel ${s.nivel ?? 0} · ancho ${ancho}px · ` +
    `sep hombros-mentón ${sep} · encorvado: ${s.encorvado ? 'sí' : 'no'}</small>`
}

async function pollPostura(): Promise<void> {
  try {
    const s = (await chrome.runtime.sendMessage<Message, StatusResponse>({
      type: 'GET_STATUS',
      target: 'background',
    })) as CameraStatus
    pintarPostura(s)
  } catch {
    /* background aún no listo */
  }
}

retryEl.addEventListener('click', () => void request())
void request()
void pollPostura()
window.setInterval(() => void pollPostura(), 400)
