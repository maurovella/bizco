import { useEffect, useState } from 'react'
import type { CameraStatus, Message, StatusResponse } from '@/lib/messages'

function send(message: Message): Promise<StatusResponse> {
  return chrome.runtime.sendMessage<Message, StatusResponse>(message)
}

export function App() {
  const [status, setStatus] = useState<CameraStatus>({ active: false, framesSent: 0 })
  const [permissionNote, setPermissionNote] = useState<string>('')

  // Poll status while the popup is open so the frame counter stays live.
  useEffect(() => {
    let mounted = true
    const refresh = async () => {
      const s = await send({ type: 'GET_STATUS', target: 'background' })
      if (mounted && s) setStatus(s)
    }
    void refresh()
    const id = window.setInterval(refresh, 1000)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [])

  /**
   * Trigger the camera permission prompt from a visible page. The offscreen
   * document can't show a prompt, so granting it here authorizes the whole
   * extension origin first.
   */
  const grantPermission = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true })
      s.getTracks().forEach((t) => t.stop())
      setPermissionNote('Camera permission granted ✓')
    } catch (err) {
      setPermissionNote(`Permission error: ${String(err)}`)
    }
  }

  const start = async () => setStatus(await send({ type: 'START_CAMERA', target: 'background' }))
  const stop = async () => setStatus(await send({ type: 'STOP_CAMERA', target: 'background' }))

  return (
    <main className="popup">
      <h1>Bizco</h1>

      <div className={`status ${status.active ? 'on' : 'off'}`}>
        <span className="dot" />
        {status.active ? 'Camera active' : 'Camera stopped'}
      </div>

      <p className="counter">Frames sent: {status.framesSent}</p>
      {status.error && <p className="error">{status.error}</p>}

      <div className="actions">
        <button onClick={start} disabled={status.active}>Start</button>
        <button onClick={stop} disabled={!status.active}>Stop</button>
      </div>

      <button className="link" onClick={grantPermission}>Grant camera permission</button>
      {permissionNote && <p className="note">{permissionNote}</p>}
    </main>
  )
}
