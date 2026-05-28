/**
 * Typed message protocol used between the popup, background service worker
 * and the offscreen document.
 *
 * Every message has a `type` discriminant and a `target` so each context can
 * cheaply ignore messages that aren't meant for it.
 */

export type MessageTarget = 'background' | 'offscreen' | 'popup'

export interface CameraStatus {
  active: boolean
  /** Number of frames successfully delivered to the backend this session. */
  framesSent: number
  /** Last error message, if any. */
  error?: string
}

export type Message =
  // popup/background -> background: start the camera pipeline
  | { type: 'START_CAMERA'; target: 'background' }
  // popup/background -> background: stop the camera pipeline
  | { type: 'STOP_CAMERA'; target: 'background' }
  // popup -> background: ask for the current status
  | { type: 'GET_STATUS'; target: 'background' }
  // background -> offscreen: begin/stop capturing
  | { type: 'OFFSCREEN_START'; target: 'offscreen' }
  | { type: 'OFFSCREEN_STOP'; target: 'offscreen' }
  // offscreen -> background: status updates from the capture loop
  | { type: 'OFFSCREEN_STATUS'; target: 'background'; status: CameraStatus }

export type StatusResponse = CameraStatus

/** Narrow a message to a given target. */
export function isFor<T extends MessageTarget>(
  msg: unknown,
  target: T,
): msg is Extract<Message, { target: T }> {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'target' in msg &&
    (msg as { target: unknown }).target === target
  )
}
