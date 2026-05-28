// src/lib/storage.ts
// Acceso tipado a chrome.storage.local con defaults sensatos.
// Si el usuario salta el onboarding, la extensión igual funciona con estos valores.

import type { PuntoCurva } from '@/lib/zoom'

export interface BizcoSettings {
  /** On/off de toda la extensión (botón Activar/Desactivar del popup). */
  activo: boolean
  /** Marca de wizard completado (controla si se reabre al instalar). */
  onboardingCompleto: boolean
  /** Curva de calibración Capa A: 1 punto = tamaño angular constante; N = tramos. */
  curva: PuntoCurva[]
  /** Ancho facial (px) a partir del cual estás "demasiado cerca" (dispara Capa B). */
  umbralBizco: number
  /** 0..1 — cuán pronto/sensible dispara Bizco (factor sobre el ancho cómodo). */
  sensibilidad: number
  /**
   * Umbral de encorvamiento: separación normalizada (0..1) entre la línea de
   * hombros y el mentón. Si la separación cae por debajo, está encorvado.
   * (Los hombros "suben" hacia el mentón al encorvarse.)
   */
  umbralEncorvado: number
  /** 0..1 — cuán agresivos los efectos (de "sutil" a "fiesta psicodélica"). */
  intensidad: number
  /** Zoom base preferido (preview de tamaño de texto en onboarding). */
  tamanoTexto: number
  /** Habilita calibración multi-punto en options. */
  modoAvanzado: boolean
}

// Valores iniciales. Los de px (curva/umbral) son aproximados; la calibración
// los reemplaza por valores reales en cuanto el usuario calibra.
export const DEFAULTS: BizcoSettings = {
  activo: false,
  onboardingCompleto: false,
  curva: [{ ancho: 180, zoom: 1.0 }],
  umbralBizco: 225,
  sensibilidad: 0.5,
  umbralEncorvado: 0.12,
  intensidad: 0.6,
  tamanoTexto: 1.0,
  modoAvanzado: false,
}

/** Lee toda la config, completando con defaults lo que falte. */
export async function getSettings(): Promise<BizcoSettings> {
  const stored = await chrome.storage.local.get(DEFAULTS)
  return { ...DEFAULTS, ...stored } as BizcoSettings
}

/** Guarda un parche de config (merge superficial). */
export async function setSettings(patch: Partial<BizcoSettings>): Promise<void> {
  await chrome.storage.local.set(patch)
}

/** Suscribe a cambios de config; devuelve una función para desuscribirse. */
export function onSettingsChanged(cb: (s: BizcoSettings) => void): () => void {
  const listener = (
    _changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area !== 'local') return
    void getSettings().then(cb)
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}

/** Margen de acercamiento (en px de ancho facial) antes de disparar Bizco. */
export const MARGEN_BIZCO = 0.25

/**
 * Deriva el umbral Bizco (px) desde el ancho cómodo calibrado.
 * Acercarte un 25% en px ya implica posible encorvamiento, así que a partir
 * de ahí arrancan las alertas y el blur. (El _sensibilidad sigue disponible
 * para ajustes finos futuros; hoy usamos el 25% fijo que pidió el usuario.)
 */
export function derivarUmbral(anchoComodo: number, _sensibilidad: number): number {
  return Math.round(anchoComodo * (1 + MARGEN_BIZCO))
}
