import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import i18n from './i18n'

// Tests always start in Russian, the primary language.
void i18n.changeLanguage('ru')
afterEach(() => cleanup())

// jsdom has no ResizeObserver; React Flow needs one to measure the canvas.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// jsdom has no EventSource; the live stream stays silent in tests unless a test drives the store.
globalThis.EventSource ??= class {
  onopen: (() => void) | null = null
  onmessage: ((m: MessageEvent) => void) | null = null
  close() {}
} as unknown as typeof EventSource
