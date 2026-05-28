import { isFor, type CameraStatus, type Message, type MotivoBizco } from '@/lib/messages'
import { nivelBizco } from '@/lib/effects'
import { derivarUmbral, getSettings, setSettings } from '@/lib/storage'

// Orquestador. Recibe ancho facial + postura del offscreen y maneja la Capa B:
//   efectos visuales (blur, alertas, cartel) cuando la persona NO está bien
//   acomodada — sea por estar demasiado cerca (lectura de px) o por encorvarse.
// (El zoom se descartó: no tocamos chrome.tabs.setZoom.)

const OFFSCREEN_URL = 'src/offscreen/offscreen.html'

// --- Muestreo Capa B ---
const EFECTO_SAMPLE_MS = 750 // tomar 1 muestra de efectos cada 0.75s
const EFECTO_VENTANA = 3 // promediar las últimas 3 muestras antes de activar
const MS_ACOMODATE_CHAOS = 3000 // si te quedás >3s en "acomodate" (nivel 2), caos

let status: CameraStatus = { active: false }
let demoAncho: number | null = null // modo demo: ancho simulado

// --- Estado Capa B ---
let cercaDesde = 0 // timestamp en que empezó la mala postura (0 = no)
let nivel2Desde = 0 // timestamp en que entró al nivel "acomodate" (0 = no)
let ultimaMuestra = 0
let ultimoNivel = 0
let bufAncho: number[] = []
let bufEncorvado: boolean[] = []

/** Asegura el único offscreen document (MV3 permite uno solo). */
async function ensureOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument?.()) return
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: 'Procesa la cámara on-device para estimar la distancia y la postura.',
  })
}

async function startCamera(): Promise<void> {
  await setSettings({ activo: true })
  await ensureOffscreen()
  const { umbralEncorvado } = await getSettings()
  chrome.runtime.sendMessage<Message>({
    type: 'OFFSCREEN_START',
    target: 'offscreen',
    umbralEncorvado,
  })
}

async function stopCamera(): Promise<void> {
  await setSettings({ activo: false })
  if (await chrome.offscreen.hasDocument?.()) {
    chrome.runtime.sendMessage<Message>({ type: 'OFFSCREEN_STOP', target: 'offscreen' })
  }
  status = { ...status, active: false }
  cercaDesde = 0
  nivel2Desde = 0
  ultimoNivel = 0
  bufAncho = []
  bufEncorvado = []
  // Quitar los efectos de la pestaña activa.
  const tab = await pestanaActiva()
  if (tab?.id) enviarNivel(tab.id, 0)
}

/** Pestaña activa de la ventana enfocada. */
async function pestanaActiva(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  return tab
}

function enviarNivel(tabId: number, nivel: number, motivo?: MotivoBizco): void {
  chrome.tabs
    .sendMessage<Message>(tabId, { type: 'BIZCO_LEVEL', target: 'content', nivel, motivo })
    .catch(() => {}) // la pestaña puede no tener content script (chrome://, etc.)
}

/**
 * Capa B: muestrea cada 0.75s, promedia las últimas 3 muestras (ancho +
 * voto de encorvamiento) y recién ahí decide el nivel. Evita parpadeos.
 * Mala postura = demasiado cerca (px) O encorvado.
 */
async function aplicarBizco(ancho: number, encorvado: boolean, ahora: number): Promise<void> {
  if (ahora - ultimaMuestra < EFECTO_SAMPLE_MS) return
  ultimaMuestra = ahora

  bufAncho.push(ancho)
  bufEncorvado.push(encorvado)
  if (bufAncho.length > EFECTO_VENTANA) bufAncho.shift()
  if (bufEncorvado.length > EFECTO_VENTANA) bufEncorvado.shift()

  const anchoProm = bufAncho.reduce((s, v) => s + v, 0) / bufAncho.length
  const encorvadoMayoria = bufEncorvado.filter(Boolean).length > bufEncorvado.length / 2

  const { umbralBizco } = await getSettings()
  const malaPostura = anchoProm > umbralBizco || encorvadoMayoria
  if (malaPostura) {
    if (cercaDesde === 0) cercaDesde = ahora
  } else {
    cercaDesde = 0
  }
  const msSostenido = cercaDesde === 0 ? 0 : ahora - cercaDesde
  const nivel = nivelBizco(anchoProm, umbralBizco, msSostenido, encorvadoMayoria)

  // Límite de tiempo en "acomodate" (nivel 2): si te quedás trabado ahí más de
  // 3s sin acomodarte, escalamos al caos con un mensaje más insistente. El caos
  // por proximidad (nivel 3 directo) mantiene el motivo 'cerca' → "alejate".
  let nivelFinal = nivel
  let motivo: MotivoBizco = 'cerca'
  if (nivel === 2) {
    if (nivel2Desde === 0) nivel2Desde = ahora
    if (ahora - nivel2Desde > MS_ACOMODATE_CHAOS) {
      nivelFinal = 3
      motivo = 'postura' // "¡Acomodate te dije!"
    }
  } else {
    nivel2Desde = 0
  }

  status.nivel = nivelFinal

  if (nivelFinal !== ultimoNivel) {
    console.log(
      `[bizco][bg] nivel ${ultimoNivel} → ${nivelFinal} (ancho ${Math.round(anchoProm)}/${umbralBizco}, encorvado ${encorvadoMayoria}, motivo ${motivo})`,
    )
    ultimoNivel = nivelFinal
  }

  const tab = await pestanaActiva()
  if (tab?.id) enviarNivel(tab.id, nivelFinal, motivo)
}

/** Entrada principal: ancho facial + postura nuevos (reales o de demo). */
function onAncho(ancho: number, encorvado: boolean, sep?: number): void {
  const ahora = Date.now()
  status.ancho = ancho
  status.encorvado = encorvado
  if (sep !== undefined) status.sep = sep
  void aplicarBizco(ancho, encorvado, ahora)
}

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (!isFor(message, 'background')) return

  switch (message.type) {
    case 'START_CAMERA':
      startCamera().catch((err) => {
        status = { ...status, active: false, error: String(err) }
      })
      sendResponse(status)
      return true

    case 'STOP_CAMERA':
      stopCamera().catch((err) => {
        status = { ...status, error: String(err) }
      })
      sendResponse(status)
      return true

    case 'GET_STATUS':
      sendResponse(status)
      return true

    case 'CALIBRAR':
      // Reenvía al offscreen, que promedia ~1s y responde OFFSCREEN_CALIBRADO.
      chrome.runtime.sendMessage<Message>({ type: 'OFFSCREEN_CALIBRAR', target: 'offscreen' })
      sendResponse(status)
      return true

    case 'SET_DEMO':
      demoAncho = message.ancho
      if (demoAncho !== null) onAncho(demoAncho, false)
      sendResponse(status)
      return true

    case 'OFFSCREEN_STATUS':
      status = { ...status, ...message.status }
      return false

    case 'FACE':
      // Si el modo demo está activo, ignoramos la cámara real.
      if (demoAncho === null) onAncho(message.ancho, message.encorvado, message.sep)
      return false

    case 'OFFSCREEN_CALIBRADO':
      // Guardar el ancho cómodo y derivar el umbral de proximidad (+25%).
      void (async () => {
        const { sensibilidad } = await getSettings()
        await setSettings({
          curva: [{ ancho: message.ancho, zoom: 1.0 }],
          umbralBizco: derivarUmbral(message.ancho, sensibilidad),
        })
        console.log('[bizco][bg] calibrado: ancho cómodo =', Math.round(message.ancho))
      })()
      return false
  }
})

// Si cambia el umbral de encorvamiento (ej. desde options), reenviarlo al
// offscreen en caliente (el offscreen no puede leer chrome.storage).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.umbralEncorvado) return
  chrome.runtime
    .sendMessage<Message>({
      type: 'OFFSCREEN_CONFIG',
      target: 'offscreen',
      umbralEncorvado: changes.umbralEncorvado.newValue as number,
    })
    .catch(() => {}) // el offscreen puede no existir si está apagado
})

// Al instalar por primera vez, abrir el wizard de onboarding.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/options/index.html') })
  }
})
