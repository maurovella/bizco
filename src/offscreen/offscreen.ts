import { BACKEND_URL, CAPTURE_INTERVAL_MS, CAPTURE_QUALITY } from '@/lib/config'
import { isFor, type CameraStatus, type Message } from '@/lib/messages'

const video = document.getElementById('preview') as HTMLVideoElement
const canvas = document.getElementById('frame') as HTMLCanvasElement

let stream: MediaStream | null = null
let timer: number | null = null
let framesSent = 0

function reportStatus(partial: Partial<CameraStatus>): void {
  const status: CameraStatus = {
    active: stream !== null,
    framesSent,
    ...partial,
  }
  chrome.runtime.sendMessage<Message>({
    type: 'OFFSCREEN_STATUS',
    target: 'background',
    status,
  })
}

/** Grab the current video frame as a JPEG blob. */
async function captureFrame(): Promise<Blob | null> {
  if (!video.videoWidth || !video.videoHeight) return null
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', CAPTURE_QUALITY),
  )
}

/** Capture one frame and POST it to the backend. */
async function tick(): Promise<void> {
  try {
    const blob = await captureFrame()
    if (!blob) return

    // Send the raw JPEG bytes; the timestamp travels in a header so the
    // backend can store/inspect frames without multipart parsing.
    const res = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'image/jpeg',
        'X-Frame-Ts': String(Date.now()),
      },
      body: blob,
    })
    if (!res.ok) throw new Error(`backend responded ${res.status}`)

    framesSent += 1
    reportStatus({ error: undefined })
  } catch (err) {
    reportStatus({ error: String(err) })
  }
}

async function start(): Promise<void> {
  if (stream) return
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    video.srcObject = stream
    await video.play()
    framesSent = 0
    timer = window.setInterval(() => void tick(), CAPTURE_INTERVAL_MS)
    reportStatus({ active: true, error: undefined })
  } catch (err) {
    stream = null
    reportStatus({ active: false, error: `getUserMedia failed: ${String(err)}` })
  }
}

function stop(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  video.srcObject = null
  reportStatus({ active: false })
}

chrome.runtime.onMessage.addListener((message: Message) => {
  if (!isFor(message, 'offscreen')) return
  if (message.type === 'OFFSCREEN_START') void start()
  if (message.type === 'OFFSCREEN_STOP') stop()
})
