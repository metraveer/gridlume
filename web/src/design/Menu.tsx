import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from './Icon'
import s from './Menu.module.css'

export type MenuItem =
  | { label: string; icon?: IconName; onSelect: () => void; danger?: boolean; disabled?: boolean; tip?: string; hint?: string }
  | { separator: true }
  | { heading: string }

/**
 * A small menu at a point on the screen (right click, a button's corner). Closes on a click outside,
 * Esc, scrolling or resizing; arrows and Enter work. Kept inside the window near its edges.
 */
export function Menu({ x, y, items, onClose, label }: { x: number; y: number; items: MenuItem[]; onClose: () => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ left: Math.min(x, window.innerWidth - r.width - 8), top: Math.min(y, window.innerHeight - r.height - 8) })
    el.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus()
  }, [x, y])

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])]
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
      const next = e.key === 'ArrowDown' ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length
      buttons[next]?.focus()
    }
    window.addEventListener('mousedown', down, true)
    window.addEventListener('keydown', key)
    window.addEventListener('resize', onClose)
    window.addEventListener('wheel', onClose, { passive: true })
    return () => {
      window.removeEventListener('mousedown', down, true)
      window.removeEventListener('keydown', key)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('wheel', onClose)
    }
  }, [onClose])

  return createPortal(
    <div ref={ref} className={s.menu} style={pos} role="menu" aria-label={label} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) =>
        'separator' in it ? (
          <hr key={i} className={s.sep} />
        ) : 'heading' in it ? (
          <div key={i} className={s.heading}>{it.heading}</div>
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            className={it.danger ? s.danger : undefined}
            disabled={it.disabled}
            data-tip={it.tip}
            onClick={() => {
              onClose()
              it.onSelect()
            }}
          >
            {it.icon ? <Icon name={it.icon} /> : <span className={s.noIcon} />}
            <span className={s.label}>{it.label}</span>
            {it.hint && <kbd className={s.hint}>{it.hint}</kbd>}
          </button>
        ),
      )}
    </div>,
    document.body,
  )
}

/** State for a menu that opens at the mouse: [menu or null, open at an event, close]. */
export function useMenu<T>(): [{ x: number; y: number; data: T } | null, (e: { clientX: number; clientY: number }, data: T) => void, () => void] {
  const [m, setM] = useState<{ x: number; y: number; data: T } | null>(null)
  return [m, (e, data) => setM({ x: e.clientX, y: e.clientY, data }), () => setM(null)]
}

export type { ReactNode }
