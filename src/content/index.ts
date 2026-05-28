/**
 * Content script — Capa B (Bizco mode).
 * Recibe el nivel (0..3) del background y aplica/quita los efectos en la página
 * vía una clase en <html> + un overlay. NUNCA toca el zoom (eso es Capa A).
 * Los efectos visuales viven en styles/bizco.css.
 */
import { isFor, type Message } from '@/lib/messages'

let nivelActual = -1
let overlay: HTMLElement | null = null

/** Crea (una vez) el overlay con el ícono 👀 y la capa de "visión bizca". */
function asegurarOverlay(): HTMLElement {
  if (overlay) return overlay
  const el = document.createElement('div')
  el.id = 'bizco-overlay'
  el.innerHTML = `<div id="bizco-ojos">👀</div><div id="bizco-aviso">Estás mal sentado, ¡acomodate!</div>`
  document.documentElement.appendChild(el)
  overlay = el
  return el
}

function aplicarNivel(nivel: number): void {
  if (nivel === nivelActual) return
  console.log('[bizco][content] nivel →', nivel)
  nivelActual = nivel
  asegurarOverlay()

  const root = document.documentElement
  // Reemplazar la clase de nivel (0..3); la transición CSS suaviza el cambio.
  root.classList.remove('bizco-nivel-1', 'bizco-nivel-2', 'bizco-nivel-3')
  if (nivel >= 1) root.classList.add(`bizco-nivel-${nivel}`)
}

chrome.runtime.onMessage.addListener((message: Message) => {
  if (!isFor(message, 'content')) return
  if (message.type === 'BIZCO_LEVEL') aplicarNivel(message.nivel)
})
