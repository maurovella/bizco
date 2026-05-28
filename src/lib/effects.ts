// src/lib/effects.ts
// Capa B (Bizco mode): función PURA que decide el nivel de efectos (0..3).
// Nunca toca el zoom. El nivel sale de combinar "qué tan cerca" (ancho vs umbral)
// con "cuánto tiempo sostenido" estuviste demasiado cerca.

/** A partir de cuánto exceso de proximidad apuntamos a cada nivel. */
const EXCESO_NIVEL_2 = 0.06 // 6% más cerca que el umbral
const EXCESO_NIVEL_3 = 0.18 // 18% más cerca que el umbral

/** Cuánto tiempo sostenido hace falta para escalar (evita disparos instantáneos). */
const MS_NIVEL_2 = 1200
const MS_NIVEL_3 = 2500

/**
 * Decide el nivel de efectos Bizco.
 * Dispara por DOS motivos (cualquiera de los dos): estar demasiado cerca
 * (ancho > umbral, +25% sobre el cómodo) o estar encorvado (hombros a la
 * altura del mentón). Escala con el tiempo sostenido de mala postura.
 * @param ancho        Ancho facial actual (px), suavizado/promediado.
 * @param umbral       Ancho a partir del cual estás "demasiado cerca".
 * @param msSostenido  Milisegundos sostenidos de mala postura (cerca o encorvado).
 * @param encorvado    True si la línea de hombros llega a la altura del mentón.
 * @returns 0 (postura ok) .. 3 (caos total).
 */
export function nivelBizco(
  ancho: number,
  umbral: number,
  msSostenido: number,
  encorvado = false,
): number {
  const cerca = ancho > umbral
  // Buena postura (ni cerca ni encorvado): nada. Reversible al instante.
  if (!cerca && !encorvado) return 0

  // Nivel objetivo por proximidad: cuanto más cerca, más alto.
  const exceso = cerca ? (ancho - umbral) / umbral : 0
  let objetivo = 1
  if (exceso > EXCESO_NIVEL_2) objetivo = 2
  if (exceso > EXCESO_NIVEL_3) objetivo = 3
  // Encorvado sostenido es señal fuerte: asegura al menos nivel 2.
  if (encorvado) objetivo = Math.max(objetivo, 2)

  // Techo por tiempo: primero avisa (1), recién si sostenés escala a 2 y 3.
  let porTiempo = 1
  if (msSostenido > MS_NIVEL_2) porTiempo = 2
  if (msSostenido > MS_NIVEL_3) porTiempo = 3

  return Math.min(objetivo, porTiempo)
}
