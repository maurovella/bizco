// Standalone extension page used purely to obtain camera permission.
//
// The popup can't be used for this: interacting with the permission prompt
// closes the popup, which dismisses the prompt ("Permission dismissed").
// A full tab stays open, so the user can actually click "Allow". Once granted,
// the permission sticks for the extension origin and the offscreen document
// reuses it without prompting.
import './permission.css'
import type { CameraStatus, Message, StatusResponse } from '@/lib/messages'

const statusEl = document.getElementById('status') as HTMLDivElement
const videoEl = document.getElementById('preview') as HTMLVideoElement
const retryEl = document.getElementById('retry') as HTMLButtonElement
const posturaEl = document.getElementById('postura') as HTMLDivElement

async function request(): Promise<void> {
  statusEl.className = ''
  statusEl.textContent = 'Pidiendo acceso a la cámara…'
  retryEl.hidden = true
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    // Preview corto para que se vea que anda; el documento offscreen abre su
    // propia pista cuando tocás "Activar" en el popup.
    videoEl.srcObject = stream
    statusEl.className = 'ok'
    statusEl.textContent = 'Permiso concedido ✓  Cerrá esta pestaña y tocá Activar en el popup.'
  } catch (err) {
    statusEl.className = 'err'
    statusEl.textContent = `No se pudo acceder a la cámara: ${String(err)}`
    retryEl.hidden = false
  }
}

// Panel de postura en vivo: consulta el estado al background cada 400ms.
function pintarPostura(s: CameraStatus): void {
  if (!s?.active) {
    posturaEl.className = ''
    posturaEl.innerHTML = 'Postura: — <small>Activá Bizcocho en el popup para verla.</small>'
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

// ---- Gesto de marca: los ojos del logo siguen el cursor y se cruzan al acercarse ----
const mark = document.getElementById('mark') as SVGSVGElement | null
const pL = document.getElementById('pL') as SVGCircleElement | null
const pR = document.getElementById('pR') as SVGCircleElement | null

if (mark && pL && pR) {
  const baseLeft = { x: 44, y: 62 }
  const baseRight = { x: 88, y: 62 }

  window.addEventListener('mousemove', (event) => {
    const rect = mark.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const dx = event.clientX - centerX
    const dy = event.clientY - centerY
    const near = Math.max(0, 1 - Math.hypot(dx, dy) / 420)
    const angle = Math.atan2(dy, dx)
    const reach = 7 * (1 - near)
    const cross = 9 * near

    pL.setAttribute('cx', String(baseLeft.x + Math.cos(angle) * reach + cross))
    pL.setAttribute('cy', String(baseLeft.y + Math.sin(angle) * reach))
    pR.setAttribute('cx', String(baseRight.x + Math.cos(angle) * reach - cross))
    pR.setAttribute('cy', String(baseRight.y + Math.sin(angle) * reach))
  })
}
