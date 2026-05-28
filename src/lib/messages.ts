/**
 * Typed message protocol used between the popup, background service worker
 * and the offscreen document.
 *
 * Every message has a `type` discriminant and a `target` so each context can
 * cheaply ignore messages that aren't meant for it.
 */

export type MessageTarget = 'background' | 'offscreen' | 'popup' | 'content'

/**
 * Por qué se disparó el caos (nivel 3), para elegir el mensaje del cartel:
 * - 'cerca'   → estás demasiado pegado a la pantalla → "alejate"
 * - 'postura' → te quedaste en "acomodate" demasiado tiempo → "acomodate te dije"
 */
export type MotivoBizco = 'cerca' | 'postura'

export interface CameraStatus {
  active: boolean
  /** Estado del permiso de cámara (lo reporta el offscreen al intentar abrirla). */
  permiso?: 'ok' | 'denegado' | 'desconocido'
  /** Último ancho facial suavizado (px), proxy de distancia. */
  ancho?: number
  /** Nivel Bizco actual 0..3 (Capa B). */
  nivel?: number
  /** True si la postura está encorvada (hombros a la altura del mentón). */
  encorvado?: boolean
  /** Separación normalizada hombros-mentón (debug/calibración). */
  sep?: number
  /** Last error message, if any. */
  error?: string
}

export type Message =
  // popup/background -> background: start the camera pipeline
  | { type: 'START_CAMERA'; target: 'background' }
  // popup/background -> background: stop the camera pipeline
  | { type: 'STOP_CAMERA'; target: 'background' }
  // popup -> background: ask for the current status
  | { type: 'GET_STATUS'; target: 'background' }
  // popup -> background: arrancar calibración (curva de 1 punto)
  | { type: 'CALIBRAR'; target: 'background' }
  // popup/options -> background: modo demo (inyecta ancho falso; null = off)
  | { type: 'SET_DEMO'; target: 'background'; ancho: number | null }
  // background -> offscreen: begin/stop capturing (el offscreen no puede leer
  // chrome.storage, así que el background le pasa la config por mensaje)
  | { type: 'OFFSCREEN_START'; target: 'offscreen'; umbralEncorvado: number }
  | { type: 'OFFSCREEN_STOP'; target: 'offscreen' }
  // background -> offscreen: actualizar config en caliente (ej. desde options)
  | { type: 'OFFSCREEN_CONFIG'; target: 'offscreen'; umbralEncorvado: number }
  // background -> offscreen: promediar ancho ~1s y devolver OFFSCREEN_CALIBRADO
  | { type: 'OFFSCREEN_CALIBRAR'; target: 'offscreen' }
  // offscreen -> background: status updates from the capture loop
  | { type: 'OFFSCREEN_STATUS'; target: 'background'; status: CameraStatus }
  // offscreen -> background: ancho facial suavizado (proxy de distancia)
  // + postura (encorvado) detectada con los hombros vs el mentón
  | { type: 'FACE'; target: 'background'; ancho: number; encorvado: boolean; sep?: number }
  // offscreen -> background: ancho promedio capturado durante la calibración
  | { type: 'OFFSCREEN_CALIBRADO'; target: 'background'; ancho: number }
  // background -> content: nivel Bizco a aplicar en la página (Capa B)
  // motivo solo importa en nivel 3 (elige el mensaje del cartel).
  | { type: 'BIZCO_LEVEL'; target: 'content'; nivel: number; motivo?: MotivoBizco }

export type StatusResponse = CameraStatus

/** Narrow a message to a given target. */
export function isFor<T extends MessageTarget>(
  msg: unknown,
  target: T,
): msg is Extract<Message, { target: T }> {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'target' in msg &&
    (msg as { target: unknown }).target === target
  )
}
