// Standalone extension page used purely to obtain camera permission.
//
// The popup can't be used for this: interacting with the permission prompt
// closes the popup, which dismisses the prompt ("Permission dismissed").
// A full tab stays open, so the user can actually click "Allow". Once granted,
// the permission sticks for the extension origin and the offscreen document
// reuses it without prompting.
const statusEl = document.getElementById('status') as HTMLDivElement
const videoEl = document.getElementById('preview') as HTMLVideoElement
const retryEl = document.getElementById('retry') as HTMLButtonElement

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

retryEl.addEventListener('click', () => void request())
void request()
