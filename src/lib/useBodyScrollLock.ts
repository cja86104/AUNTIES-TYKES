import { useEffect } from 'react'

/**
 * Freezes the page behind an open overlay.
 *
 * `overflow: hidden` on <body> is not enough on iOS Safari — it keeps scrolling
 * the page under the overlay, so a parent reading a sheet loses their place and
 * the sheet drifts off screen. Pinning the body with `position: fixed` at its
 * current offset is the behaviour that actually holds there, so the offset is
 * captured on open and restored on close.
 *
 * One overlay at a time: the app never stacks a modal on top of the drawer, and
 * a nested pair would restore the outer offset when the inner one closed.
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const { body } = document
    const scrollY = window.scrollY
    const previous = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    }

    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.width = '100%'
    body.style.overflow = 'hidden'

    return () => {
      body.style.position = previous.position
      body.style.top = previous.top
      body.style.width = previous.width
      body.style.overflow = previous.overflow
      window.scrollTo(0, scrollY)
    }
  }, [active])
}
