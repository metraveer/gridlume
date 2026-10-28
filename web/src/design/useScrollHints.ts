import { useEffect } from 'react'

/**
 * Scroll hints for the whole app: an element that scrolls gets a soft fade on the edge that still hides
 * content (.fade-top / .fade-bottom), and shows its thin scrollbar only while being scrolled (.is-scrolling).
 */
export function useScrollHints() {
  useEffect(() => {
    const timers = new WeakMap<Element, number>()

    const update = (el: HTMLElement) => {
      el.classList.toggle('fade-top', el.scrollTop > 2)
      el.classList.toggle('fade-bottom', el.scrollTop + el.clientHeight < el.scrollHeight - 2)
    }

    const scrollable = (el: HTMLElement) => {
      const oy = getComputedStyle(el).overflowY
      return (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 2
    }

    const scan = () => {
      document.querySelectorAll<HTMLElement>('#root *').forEach((el) => {
        if (scrollable(el)) update(el)
        else el.classList.remove('fade-top', 'fade-bottom')
      })
    }

    const onScroll = (e: Event) => {
      const el = e.target
      if (!(el instanceof HTMLElement)) return
      update(el)
      el.classList.add('is-scrolling')
      window.clearTimeout(timers.get(el))
      timers.set(el, window.setTimeout(() => el.classList.remove('is-scrolling'), 700))
    }

    let pending = false
    const observer = new MutationObserver(() => {
      if (pending) return
      pending = true
      requestAnimationFrame(() => {
        pending = false
        scan()
      })
    })
    observer.observe(document.getElementById('root') ?? document.body, { childList: true, subtree: true })
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', scan)
    scan()
    return () => {
      observer.disconnect()
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', scan)
    }
  }, [])
}
