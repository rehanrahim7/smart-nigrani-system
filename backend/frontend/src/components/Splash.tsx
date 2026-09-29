/**
 * A short introduction, once per browser session, on the front page only.
 *
 * It never blocks: it fades out by itself after under two seconds, any click
 * or key skips it, and with "reduce motion" set it does not appear at all.
 */

import { useEffect, useState } from 'react'
import { Mark } from './Brand'

const KEY = 'sns.intro'

function shouldShow(): boolean {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
    if (sessionStorage.getItem(KEY)) return false
    sessionStorage.setItem(KEY, '1')
    return true
  } catch {
    return false
  }
}

export function Splash() {
  const [visible, setVisible] = useState(shouldShow)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (!visible) return
    const fade = window.setTimeout(() => setLeaving(true), 1500)
    const done = window.setTimeout(() => setVisible(false), 1850)
    const skip = () => setVisible(false)
    window.addEventListener('keydown', skip)
    return () => {
      window.clearTimeout(fade)
      window.clearTimeout(done)
      window.removeEventListener('keydown', skip)
    }
  }, [visible])

  if (!visible) return null

  return (
    <div className={`splash${leaving ? ' leaving' : ''}`} onClick={() => setVisible(false)} role="presentation">
      <div className="splash-orbit">
        <Mark size={62} />
      </div>
      <strong className="splash-name">
        Smart <em>Nigrani</em> System
      </strong>
      <p>People. Works. Evidence.</p>
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setVisible(false)}>
        Skip introduction
      </button>
    </div>
  )
}
