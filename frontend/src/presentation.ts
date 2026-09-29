/**
 * Presentation mode for the research workspace: show members, constituencies
 * and payees as aliases on screen, for a demonstration in front of people.
 *
 * It changes what this browser displays and nothing else. The records keep
 * their real names; this is not anonymisation of the data. Kept in the
 * browser session so it survives moving between pages.
 */

import { useEffect, useState } from 'react'

const KEY = 'sns.present'
const EVENT = 'sns-presentation'

export function presenting(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setPresenting(on: boolean) {
  try {
    if (on) sessionStorage.setItem(KEY, '1')
    else sessionStorage.removeItem(KEY)
  } catch {
    /* storage refused: the switch simply will not persist */
  }
  window.dispatchEvent(new Event(EVENT))
}

export function usePresenting(): boolean {
  const [on, setOn] = useState(presenting)
  useEffect(() => {
    const update = () => setOn(presenting())
    window.addEventListener(EVENT, update)
    return () => window.removeEventListener(EVENT, update)
  }, [])
  return on
}
