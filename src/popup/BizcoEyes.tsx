import { useEffect, useRef } from 'react'

interface BizcoEyesProps {
  /** Tamaño del SVG en px (cuadrado). */
  size?: number
  /**
   * Qué tan "bizcos" están los ojos de base, 0..1.
   * 0 = miran al cursor normalmente · 1 = totalmente cruzados hacia adentro.
   * Lo usamos para reflejar el nivel de alerta (cuanto más cerca de la
   * pantalla estás, más bizco se pone el logo).
   */
  crossBias?: number
}

// Posición base de cada pupila dentro del viewBox 120x120.
const BASE_LEFT = { x: 44, y: 62 }
const BASE_RIGHT = { x: 88, y: 62 }

/**
 * El logo de Bizco: dos ojos que siguen el cursor y se cruzan ("se ponen
 * bizcos") cuando el puntero se acerca. Es el gesto central de la marca.
 */
export function BizcoEyes({ size = 64, crossBias = 0 }: BizcoEyesProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const leftPupil = useRef<SVGCircleElement>(null)
  const rightPupil = useRef<SVGCircleElement>(null)

  useEffect(() => {
    const svg = svgRef.current
    const pL = leftPupil.current
    const pR = rightPupil.current
    if (!svg || !pL || !pR) return

    const onMove = (event: MouseEvent) => {
      const rect = svg.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const dx = event.clientX - centerX
      const dy = event.clientY - centerY
      const distance = Math.hypot(dx, dy)

      // near: 0 cuando el cursor está lejos, 1 cuando está encima.
      const near = Math.max(0, 1 - distance / 420)
      const angle = Math.atan2(dy, dx)

      const reach = 7 * (1 - near)               // siguen al cursor de lejos
      const cross = 9 * near + 9 * crossBias      // se cruzan al acercarse / por alerta

      pL.setAttribute('cx', String(BASE_LEFT.x + Math.cos(angle) * reach + cross))
      pL.setAttribute('cy', String(BASE_LEFT.y + Math.sin(angle) * reach))
      pR.setAttribute('cx', String(BASE_RIGHT.x + Math.cos(angle) * reach - cross))
      pR.setAttribute('cy', String(BASE_RIGHT.y + Math.sin(angle) * reach))
    }

    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [crossBias])

  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      aria-label="Bizco"
      role="img"
    >
      <ellipse cx="44" cy="60" rx="30" ry="33" fill="#FBF5E9" stroke="#1A1714" strokeWidth="5" />
      <ellipse cx="88" cy="60" rx="30" ry="33" fill="#FBF5E9" stroke="#1A1714" strokeWidth="5" />
      <g fill="#1A1714">
        <circle ref={leftPupil} cx={BASE_LEFT.x} cy={BASE_LEFT.y} r="12" />
        <circle ref={rightPupil} cx={BASE_RIGHT.x} cy={BASE_RIGHT.y} r="12" />
      </g>
      <circle cx="40" cy="57" r="3.5" fill="#FBF5E9" />
      <circle cx="84" cy="57" r="3.5" fill="#FBF5E9" />
      <path d="M22 30 q20 -10 40 -2" fill="none" stroke="#1A1714" strokeWidth="5" strokeLinecap="round" />
      <path d="M70 28 q20 -8 40 2" fill="none" stroke="#1A1714" strokeWidth="5" strokeLinecap="round" />
    </svg>
  )
}
