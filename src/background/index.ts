import { isFor, type CameraStatus, type Message } from '@/lib/messages'

const OFFSCREEN_URL = 'src/offscreen/offscreen.html'

let status: CameraStatus = { active: false, framesSent: 0 }

/** Ensure the single offscreen document exists (MV3 allows only one). */
async function ensureOffscreen(): Promise<void> {
  const existing = await chrome.offscreen.hasDocument?.()
  if (existing) return

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: 'Capture webcam frames and stream them to the Bizco backend.',
  })
}

async function startCamera(): Promise<void> {
  await ensureOffscreen()
  chrome.runtime.sendMessage<Message>({ type: 'OFFSCREEN_START', target: 'offscreen' })
}

async function stopCamera(): Promise<void> {
  if (await chrome.offscreen.hasDocument?.()) {
    chrome.runtime.sendMessage<Message>({ type: 'OFFSCREEN_STOP', target: 'offscreen' })
  }
  status = { ...status, active: false }
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

    case 'OFFSCREEN_STATUS':
      // The offscreen document reports its progress; cache it for the popup.
      status = message.status
      return false
  }
})

chrome.runtime.onInstalled.addListener(() => {
  console.log('[bizco] background service worker installed')
})
