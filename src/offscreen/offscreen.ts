import { FaceLandmarker, FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import { isFor, type CameraStatus, type Message } from '@/lib/messages'

// Nota: los offscreen documents NO tienen acceso a chrome.storage (solo a un
// subconjunto mínimo de APIs). El background nos pasa la config por mensaje.

// El offscreen sostiene el stream de cámara y corre DOS modelos de MediaPipe
// 100% on-device:
//   - FaceLandmarker: ancho facial en px (proxy de distancia) + mentón.
//   - PoseLandmarker: hombros, para detectar encorvamiento.
// Encorvado = la línea de hombros "sube" hasta la altura del mentón.

const video = document.getElementById('preview') as HTMLVideoElement

const LOOP_MS = 80 // ~12 fps (cara, para zoom responsivo)
const POSE_MS = 150 // pose un poco más lento (es más pesado y no necesita fps alto)
const EMA_ALPHA = 0.2 // suavizado del ancho facial
const SEND_THROTTLE_MS = 250 // máx ~4 envíos/seg al background

// Face mesh: costados de la cara (ancho) y mentón (punto más bajo).
const IDX_DERECHA = 234
const IDX_IZQUIERDA = 454
const IDX_MENTON = 152
// Pose: hombros izquierdo/derecho.
const POSE_HOMBRO_IZQ = 11
const POSE_HOMBRO_DER = 12
const VIS_MIN = 0.3 // visibilidad mínima para confiar en un landmark de pose

let stream: MediaStream | null = null
let face: FaceLandmarker | null = null
let pose: PoseLandmarker | null = null
let loop: number | null = null
let anchoEMA = 0
let ultimoEnvio = 0
let ultimaPose = 0
let encorvado = false
let ultimaSep = NaN // última separación hombros-mentón medida (debug)
let umbralEncorvado = 0.12

// Calibración: junta anchos durante ~1s y promedia.
let calibrando = false
let muestrasCalib: number[] = []
let finCalib = 0

function reportStatus(partial: Partial<CameraStatus>): void {
  const status: CameraStatus = { active: stream !== null, ...partial }
  chrome.runtime.sendMessage<Message>({ type: 'OFFSCREEN_STATUS', target: 'background', status })
}

/** Carga los modelos desde vendor/ local (la CSP de MV3 prohíbe assets remotos). */
async function initModels(): Promise<void> {
  if (face && pose) return
  const fileset = await FilesetResolver.forVisionTasks(
    chrome.runtime.getURL('vendor/mediapipe/wasm'),
  )
  face = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: chrome.runtime.getURL('vendor/mediapipe/models/face_landmarker.task'),
    },
    runningMode: 'VIDEO',
    numFaces: 1,
  })
  pose = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: chrome.runtime.getURL('vendor/mediapipe/models/pose_landmarker_lite.task'),
    },
    runningMode: 'VIDEO',
    numPoses: 1,
  })
}

/** Detección de cara: devuelve { ancho px, chinY normalizado } o null. */
function medirCara(tsMs: number): { ancho: number; chinY: number } | null {
  if (!face || !video.videoWidth) return null
  const res = face.detectForVideo(video, tsMs)
  const cara = res.faceLandmarks?.[0]
  if (!cara) return null
  const a = cara[IDX_DERECHA]
  const b = cara[IDX_IZQUIERDA]
  const menton = cara[IDX_MENTON]
  if (!a || !b || !menton) return null
  const dx = (a.x - b.x) * video.videoWidth
  const dy = (a.y - b.y) * video.videoHeight
  return { ancho: Math.hypot(dx, dy), chinY: menton.y }
}

/**
 * Detección de encorvamiento: compara la altura de los hombros con el mentón.
 * En coords de imagen, y crece hacia abajo: los hombros normalmente están MÁS
 * abajo (y mayor) que el mentón. Al encorvarte, los hombros suben (y baja) hacia
 * el mentón => la separación se achica. Encorvado si la separación < umbral.
 */
function medirEncorvado(tsMs: number, chinY: number): void {
  if (!pose) return
  const res = pose.detectForVideo(video, tsMs)
  const cuerpo = res.landmarks?.[0]
  if (!cuerpo) {
    encorvado = false
    console.log('[bizco][offscreen] pose: NO detecta cuerpo (acercá los hombros a cámara)')
    return
  }
  const hi = cuerpo[POSE_HOMBRO_IZQ]
  const hd = cuerpo[POSE_HOMBRO_DER]
  const visI = hi?.visibility ?? 0
  const visD = hd?.visibility ?? 0
  // Usamos los hombros visibles (al menos uno confiable).
  const ys: number[] = []
  if (hi && visI >= VIS_MIN) ys.push(hi.y)
  if (hd && visD >= VIS_MIN) ys.push(hd.y)
  if (ys.length === 0) {
    encorvado = false
    console.log(
      `[bizco][offscreen] pose: hombros poco visibles (visI=${visI.toFixed(2)} visD=${visD.toFixed(2)})`,
    )
    return
  }
  const hombrosY = ys.reduce((s, v) => s + v, 0) / ys.length
  const separacion = hombrosY - chinY // >0: hombros por debajo del mentón (ok)
  ultimaSep = separacion
  encorvado = separacion < umbralEncorvado
  console.log(
    `[bizco][offscreen] sep hombros-mentón = ${separacion.toFixed(3)} (umbral ${umbralEncorvado}, vis ${visI.toFixed(2)}/${visD.toFixed(2)}) → encorvado: ${encorvado}`,
  )
}

function tick(): void {
  const ts = performance.now()
  let cara: { ancho: number; chinY: number } | null = null
  try {
    cara = medirCara(ts)
  } catch (err) {
    reportStatus({ error: `detect cara falló: ${String(err)}` })
    return
  }

  // Sin cara: mantenemos el último valor (no reseteamos), nada que enviar.
  if (!cara) return

  // Pose a menor frecuencia (es más pesada).
  if (ts - ultimaPose >= POSE_MS) {
    ultimaPose = ts
    try {
      medirEncorvado(ts, cara.chinY)
    } catch {
      encorvado = false
    }
  }

  // EMA del ancho: primer valor inicializa, luego suaviza.
  anchoEMA = anchoEMA === 0 ? cara.ancho : EMA_ALPHA * cara.ancho + (1 - EMA_ALPHA) * anchoEMA

  // Calibración en curso: acumular hasta cumplir el tiempo.
  if (calibrando) {
    muestrasCalib.push(anchoEMA)
    if (ts >= finCalib) {
      const prom = muestrasCalib.reduce((s, v) => s + v, 0) / muestrasCalib.length
      chrome.runtime.sendMessage<Message>({
        type: 'OFFSCREEN_CALIBRADO',
        target: 'background',
        ancho: prom,
      })
      calibrando = false
      muestrasCalib = []
    }
  }

  // Throttle de envíos al background.
  if (ts - ultimoEnvio >= SEND_THROTTLE_MS) {
    ultimoEnvio = ts
    chrome.runtime.sendMessage<Message>({
      type: 'FACE',
      target: 'background',
      ancho: anchoEMA,
      encorvado,
      sep: Number.isNaN(ultimaSep) ? undefined : ultimaSep,
    })
  }
}

async function start(): Promise<void> {
  if (stream) return
  try {
    await initModels()
  } catch (err) {
    reportStatus({ active: false, error: `init MediaPipe falló: ${String(err)}` })
    return
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    video.srcObject = stream
    await video.play()
    anchoEMA = 0
    ultimoEnvio = 0
    ultimaPose = 0
    loop = window.setInterval(tick, LOOP_MS)
    reportStatus({ active: true, permiso: 'ok', error: undefined })
  } catch (err) {
    stream = null
    const denegado = String(err).includes('NotAllowed') || String(err).includes('Permission')
    reportStatus({
      active: false,
      permiso: denegado ? 'denegado' : 'desconocido',
      error: `getUserMedia falló: ${String(err)}`,
    })
  }
}

function stop(): void {
  if (loop !== null) {
    clearInterval(loop)
    loop = null
  }
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  video.srcObject = null
  calibrando = false
  muestrasCalib = []
  reportStatus({ active: false })
}

chrome.runtime.onMessage.addListener((message: Message) => {
  if (!isFor(message, 'offscreen')) return
  if (message.type === 'OFFSCREEN_START') {
    umbralEncorvado = message.umbralEncorvado
    void start()
  }
  if (message.type === 'OFFSCREEN_CONFIG') umbralEncorvado = message.umbralEncorvado
  if (message.type === 'OFFSCREEN_STOP') stop()
  if (message.type === 'OFFSCREEN_CALIBRAR') {
    muestrasCalib = []
    calibrando = true
    finCalib = performance.now() + 1000
  }
})
