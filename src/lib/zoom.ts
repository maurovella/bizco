// src/lib/zoom.ts
// Función pura: convierte el ancho facial actual (px) en un zoomFactor,
// usando una curva de calibración definida por el usuario.
// La "adaptatividad" vive acá: la curva es estática, por eso NO hay loop de feedback.

export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 2.5

/** Un punto de la curva de calibración: a tal ancho facial, tal zoom. */
export interface PuntoCurva {
  ancho: number
  zoom: number
}

// Modelo:
//   - Cara más CERCA  -> ancho facial MÁS GRANDE en px
//   - Cara más LEJOS  -> ancho facial MÁS CHICO en px
//   - Queremos que más lejos => más zoom => zoom es DECRECIENTE del ancho en px.

/**
 * Normaliza los puntos: ordena de lejos a cerca y fuerza monotonía
 * no creciente en el zoom, garantizando estabilidad.
 */
export function normalizarCurva(puntos: PuntoCurva[]): PuntoCurva[] {
  const ordenados = puntos.map((p) => ({ ...p })).sort((a, b) => b.ancho - a.ancho) // lejos -> cerca
  for (let i = 1; i < ordenados.length; i++) {
    if (ordenados[i].zoom > ordenados[i - 1].zoom) {
      ordenados[i].zoom = ordenados[i - 1].zoom
    }
  }
  return ordenados
}

/**
 * Calcula el zoomFactor para un ancho facial dado.
 * @param anchoActual  Ancho facial actual en px (ya suavizado con EMA).
 * @param curva  Puntos de calibración.
 *        1 punto  -> tamaño angular constante (recta al origen).
 *        N puntos -> interpolación lineal por tramos.
 * @returns zoomFactor entre ZOOM_MIN y ZOOM_MAX.
 */
export function calcularZoom(anchoActual: number, curva: PuntoCurva[]): number {
  if (!curva || curva.length === 0 || anchoActual <= 0) return 1

  const pts = normalizarCurva(curva)

  // 1 punto: tamaño angular constante.
  if (pts.length === 1) {
    const { ancho, zoom } = pts[0]
    return clamp(zoom * (ancho / anchoActual), ZOOM_MIN, ZOOM_MAX)
  }

  // Fuera de rango: clamp al extremo.
  if (anchoActual >= pts[pts.length - 1].ancho) {
    return clamp(pts[pts.length - 1].zoom, ZOOM_MIN, ZOOM_MAX) // muy cerca
  }
  if (anchoActual <= pts[0].ancho) {
    return clamp(pts[0].zoom, ZOOM_MIN, ZOOM_MAX) // muy lejos
  }

  // Interpolación lineal por tramos.
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const lo = Math.min(a.ancho, b.ancho)
    const hi = Math.max(a.ancho, b.ancho)
    if (anchoActual >= lo && anchoActual <= hi) {
      const t = (anchoActual - a.ancho) / (b.ancho - a.ancho)
      return clamp(a.zoom + t * (b.zoom - a.zoom), ZOOM_MIN, ZOOM_MAX)
    }
  }
  return 1 // fallback defensivo
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}
