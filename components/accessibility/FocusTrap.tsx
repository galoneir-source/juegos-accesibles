'use client'

import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])'

export default function FocusTrap({ children, active = true }: { children: React.ReactNode; active?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active || !ref.current) return
    const el = ref.current
    const focusable = () => Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE))

    const first = focusable()[0]
    first?.focus()

    function handler(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const items = focusable()
      if (!items.length) return
      const last = items[items.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === items[0]) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          items[0].focus()
        }
      }
    }

    el.addEventListener('keydown', handler)
    return () => el.removeEventListener('keydown', handler)
  }, [active])

  return <div ref={ref}>{children}</div>
}
