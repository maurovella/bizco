/**
 * Content script — injected into matching pages.
 *
 * Kept minimal for now: it just announces itself. Camera capture runs in the
 * offscreen document (driven by the background worker), not here, so this is
 * the place for page-DOM interactions you add later.
 */
console.log('[bizco] content script loaded on', location.href)

export {}
