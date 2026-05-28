/**
 * Content script — Capa B (Bizco mode).
 * Recibe el nivel (0..3) del background y aplica/quita los efectos en la página
 * vía una clase en <html> + un overlay. NUNCA toca el zoom (eso es Capa A).
 * Los efectos visuales viven en styles/bizco.css.
 */
import { isFor, type Message } from '@/lib/messages'

let nivelActual = -1
let overlay: HTMLElement | null = null
let avisoText: HTMLElement | null = null

// Mensaje del cartel según el nivel (vive ARRIBA A LA DERECHA, junto a los ojos).
const AVISO: Record<number, string> = {
  1: 'Ojo… te estás encorvando',
  2: '¡Acomodate! Estás mal sentado',
  3: '¡PARÁ! Alejate de la pantalla',
}

// Ojos bizcos de la marca (pupilas cruzadas hacia adentro). SVG inline: anda en
// cualquier página sin depender de fuentes ni assets externos.
const OJOS_SVG = `
  <svg viewBox="0 0 120 120" width="30" height="30" aria-hidden="true">
    <ellipse cx="44" cy="60" rx="30" ry="33" fill="#FBF5E9" stroke="#1A1714" stroke-width="6"/>
    <ellipse cx="88" cy="60" rx="30" ry="33" fill="#FBF5E9" stroke="#1A1714" stroke-width="6"/>
    <circle cx="56" cy="64" r="12" fill="#1A1714"/>
    <circle cx="76" cy="64" r="12" fill="#1A1714"/>
    <circle cx="52" cy="59" r="3.4" fill="#FBF5E9"/>
    <circle cx="72" cy="59" r="3.4" fill="#FBF5E9"/>
  </svg>`

/** Crea (una vez) el overlay: badge ojos+cartel (arriba-der) + flash de color. */
function asegurarOverlay(): HTMLElement {
  if (overlay) return overlay
  const el = document.createElement('div')
  el.id = 'bizco-overlay'
  el.innerHTML = `
    <div id="bizco-hud">
      <span id="bizco-ojos">${OJOS_SVG}</span>
      <span id="bizco-aviso"></span>
    </div>
    <div id="bizco-flash"></div>`
  document.documentElement.appendChild(el)
  overlay = el
  avisoText = el.querySelector('#bizco-aviso')
  return el
}

function aplicarNivel(nivel: number): void {
  if (nivel === nivelActual) return
  console.log('[bizco][content] nivel →', nivel)
  nivelActual = nivel
  asegurarOverlay()

  if (avisoText) avisoText.textContent = AVISO[nivel] ?? ''

  const root = document.documentElement
  // Reemplazar la clase de nivel (0..3); la transición CSS suaviza el cambio.
  root.classList.remove('bizco-nivel-1', 'bizco-nivel-2', 'bizco-nivel-3')
  if (nivel >= 1) root.classList.add(`bizco-nivel-${nivel}`)
}

chrome.runtime.onMessage.addListener((message: Message) => {
  if (!isFor(message, 'content')) return
  if (message.type === 'BIZCO_LEVEL') aplicarNivel(message.nivel)
})
