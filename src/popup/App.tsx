import { useEffect, useState } from 'react'
import type { CameraStatus, Message, StatusResponse } from '@/lib/messages'

function send(message: Message): Promise<StatusResponse> {
  return chrome.runtime.sendMessage<Message, StatusResponse>(message)
}

export function App() {
  const [status, setStatus] = useState<CameraStatus>({ active: false })

  // Poll del estado mientras el popup está abierto, para indicadores en vivo.
  useEffect(() => {
    let mounted = true
    const refresh = async () => {
      const s = await send({ type: 'GET_STATUS', target: 'background' })
      if (mounted && s) setStatus(s)
    }
    void refresh()
    const id = window.setInterval(refresh, 500)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [])

  /**
   * Abre el tab dedicado de permiso. Pedirlo desde el popup falla con
   * "Permission dismissed" porque el clic en el prompt cierra el popup.
   */
  const grantPermission = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/permission/index.html') })
  }

  const start = async () => setStatus(await send({ type: 'START_CAMERA', target: 'background' }))
  const stop = async () => setStatus(await send({ type: 'STOP_CAMERA', target: 'background' }))
  const calibrar = () => void send({ type: 'CALIBRAR', target: 'background' })

  const denegado = status.permiso === 'denegado'

  return (
    <main className="popup">
      <h1>Bizco 👀</h1>

      <div className={`status ${status.active ? 'on' : 'off'}`}>
        <span className="dot" />
        {status.active ? 'Cámara activa' : 'Cámara apagada'}
      </div>

      {/* Indicadores en vivo */}
      <dl className="metrics">
        <div>
          <dt>Distancia (ancho px)</dt>
          <dd>{status.ancho ? Math.round(status.ancho) : '—'}</dd>
        </div>
        <div>
          <dt>Postura</dt>
          <dd>{status.encorvado ? 'Encorvado 🙇' : 'OK ✅'}</dd>
        </div>
        <div>
          <dt>Nivel Bizco</dt>
          <dd>{status.nivel ?? 0}</dd>
        </div>
      </dl>

      {denegado && <p className="error">Permiso de cámara denegado.</p>}
      {status.error && !denegado && <p className="error">{status.error}</p>}

      <div className="actions">
        <button onClick={start} disabled={status.active}>Activar</button>
        <button onClick={stop} disabled={!status.active}>Desactivar</button>
      </div>

      <button onClick={calibrar} disabled={!status.active}>Calibrar</button>

      <button className="link" onClick={grantPermission}>Conceder permiso de cámara…</button>
    </main>
  )
}
