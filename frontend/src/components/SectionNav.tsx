/**
 * The little menu that follows you down the "How it works" page.
 *
 * Three things it has to do, in order of how much they matter:
 *
 *   1. Jump to a section without a page reload and without a jolt.
 *   2. Always show which section you are actually in, including when you
 *      scroll there by hand rather than by clicking.
 *   3. Never get in the way. It is one line tall, it scrolls sideways when
 *      there is not enough room, and it keeps the active item in view.
 *
 * The items are buttons rather than links on purpose. The whole site is
 * routed on the part of the address after the "#", so an anchor pointing at
 * "#the-four-checks" would look to the router like a page that does not exist
 * and throw you back to the front page.
 *
 * The "which section am I in" part uses IntersectionObserver rather than a
 * scroll handler. A scroll handler runs on every single scroll event and has
 * to measure every section each time, which is exactly the kind of thing that
 * makes a page feel heavy. The observer is told once what to watch for and
 * the browser only calls back when something actually crosses the line.
 */

import { useEffect, useRef, useState } from 'react'

export interface NavSection {
  id: string
  label: string
}

/** Matches the scroll-margin set on the sections in the stylesheet. */
const STICKY_ALLOWANCE = 118

export function SectionNav({ sections }: { sections: NavSection[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? '')
  const stripRef = useRef<HTMLDivElement | null>(null)
  // Set while a click-driven scroll is still travelling, so the observer does
  // not fight the click by highlighting every section it passes through.
  const settling = useRef(false)

  useEffect(() => {
    const targets = sections
      .map((section) => document.getElementById(section.id))
      .filter((el): el is HTMLElement => el !== null)

    if (targets.length === 0) return

    // A band just under the sticky header. A section becomes "current" when
    // its top crosses that band, which is what a reader would say too.
    const observer = new IntersectionObserver(
      (entries) => {
        if (settling.current) return

        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)

        if (visible[0]) setActive(visible[0].target.id)
      },
      {
        rootMargin: `-${STICKY_ALLOWANCE}px 0px -55% 0px`,
        threshold: 0,
      },
    )

    for (const target of targets) observer.observe(target)
    return () => observer.disconnect()
  }, [sections])

  // Keep the current chip visible inside the strip on a narrow screen.
  useEffect(() => {
    const strip = stripRef.current
    if (!strip) return
    const chip = strip.querySelector<HTMLElement>(`[data-for="${active}"]`)
    if (!chip) return

    const left = chip.offsetLeft - strip.clientWidth / 2 + chip.clientWidth / 2
    strip.scrollTo({ left, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [active])

  const go = (id: string) => {
    const target = document.getElementById(id)
    if (!target) return

    setActive(id)
    settling.current = true
    target.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    })

    // Hand control back once the scroll has finished. `scrollend` is the exact
    // signal, and the timer covers browsers that do not have it yet.
    const release = () => {
      settling.current = false
      window.removeEventListener('scrollend', release)
    }
    window.addEventListener('scrollend', release, { once: true })
    window.setTimeout(release, 900)
  }

  return (
    <nav className="section-nav" aria-label="Sections on this page">
      <div className="section-nav-strip" ref={stripRef}>
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            data-for={section.id}
            className={`section-nav-item${active === section.id ? ' is-active' : ''}`}
            aria-current={active === section.id ? 'true' : undefined}
            onClick={() => go(section.id)}
          >
            {section.label}
          </button>
        ))}
      </div>
    </nav>
  )
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
