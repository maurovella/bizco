import { useEffect, useState } from 'react'
import type { CameraStatus, Message, StatusResponse } from '@/lib/messages'
import { BizcoEyes } from './BizcoEyes'

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
  const active = status.active
  const nivel = status.nivel ?? 0
  const malaPostura = active && (nivel > 0 || !!status.encorvado)

  // El logo se cruza ("se pone bizco") proporcional al nivel actual.
  const crossBias = Math.min(1, nivel / 3)

  const pill = !active
    ? { txt: 'En pausa', cls: 'pill--off' }
    : malaPostura
      ? { txt: `Bizco nivel ${nivel}`, cls: 'pill--alert' }
      : { txt: 'Postura OK', cls: 'pill--ok' }

  return (
    <main className="popup">
      <header className="hd">
        <BizcoEyes size={40} crossBias={crossBias} />
        <span className="wordmark">b<span className="i-eye">i</span>zco</span>
        <span className={`pill ${pill.cls}`}>
          <span className="pill-dot" />
          {pill.txt}
        </span>
      </header>

      <div className="body">
        <p className="tag">
          {active
            ? 'Te estoy mirando para que no te pegues a la pantalla.'
            : 'Activame y te aviso cuando estés quedando bizco.'}
        </p>

        {/* Indicadores en vivo (datos reales del motor) */}
        <div className="stats">
          <div className="stat">
            <span>Distancia (ancho px)</span>
            <b className="num">{status.ancho ? Math.round(status.ancho) : '—'}</b>
          </div>
          <div className="stat">
            <span>Postura</span>
            <b>{status.encorvado ? 'Encorvado 🙇' : 'OK ✅'}</b>
          </div>
          <div className="stat">
            <span>Nivel Bizco</span>
            <b className="num">{nivel}</b>
          </div>
        </div>

        {denegado && <p className="error">Permiso de cámara denegado.</p>}
        {status.error && !denegado && <p className="error">{status.error}</p>}

        <div className="actions">
          <button className="btn btn--ok" onClick={start} disabled={active}>
            Activar
          </button>
          <button className="btn btn--alert" onClick={stop} disabled={!active}>
            Desactivar
          </button>
        </div>

        <button className="btn btn--calibrar" onClick={calibrar} disabled={!active}>
          Calibrar
        </button>

        <button className="link" onClick={grantPermission}>
          Conceder permiso de cámara…
        </button>
      </div>
    </main>
  )
}
