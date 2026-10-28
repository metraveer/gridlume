import { useEffect } from 'react'

/**
 * One floating tooltip for the whole app. Any element with data-tip="…" shows it after a short delay.
 * Long explanations live here, so the interface itself stays short.
 */
export function TooltipLayer() {
  useEffect(() => {
    const tip = document.createElement('div')
    tip.className = 'gl-tip'
    tip.setAttribute('role', 'tooltip')
    document.body.appendChild(tip)
    let current: Element | null = null
    let timer: number | undefined

    const place = (el: Element) => {
      const r = el.getBoundingClientRect()
      const t = tip.getBoundingClientRect()
      const x = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), window.innerWidth - t.width - 8)
      let y = r.bottom + 8
      if (y + t.height > window.innerHeight - 8) y = r.top - t.height - 8
      tip.style.left = `${x}px`
      tip.style.top = `${y}px`
    }

    const over = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-tip]') ?? null
      if (el === current) return
      current = el
      window.clearTimeout(timer)
      tip.classList.remove('show')
      if (!el) return
      timer = window.setTimeout(() => {
        // While a menu is open, only its own items explain themselves: nothing from underneath covers it.
        if (document.querySelector('[role="menu"]') && !el.closest('[role="menu"]')) return
        tip.textContent = el.getAttribute('data-tip') ?? ''
        place(el)
        tip.classList.add('show')
      }, 350)
    }
    const hide = () => tip.classList.remove('show')

    document.addEventListener('mouseover', over)
    document.addEventListener('scroll', hide, true)
    document.addEventListener('mousedown', hide, true) // a click (or right click) starts something else
    return () => {
      document.removeEventListener('mouseover', over)
      document.removeEventListener('scroll', hide, true)
      document.removeEventListener('mousedown', hide, true)
      window.clearTimeout(timer)
      tip.remove()
    }
  }, [])
  return null
}
