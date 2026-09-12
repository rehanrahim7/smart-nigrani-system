/**
 * Light and dark theme.
 *
 * Light is the default. If someone picks a theme we remember it; if they have
 * never picked one they get light, whatever their system is set to. That is a
 * deliberate choice: this is a public dashboard and light is the safer look on
 * a projector or a printout.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'sns.theme'

interface ThemeValue {
  theme: Theme
  toggle: () => void
  /** Increments on every change, so components holding resolved colours can
   *  recompute. The map needs this: its markers are painted onto a canvas and
   *  cannot pick up new CSS on their own. */
  version: number
}

const ThemeContext = createContext<ThemeValue | null>(null)

function readStored(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // Private browsing can refuse storage. Falling back to light is fine.
  }
  return 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readStored)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* ignore */
    }
    setVersion((n) => n + 1)
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((current) => (current === 'light' ? 'dark' : 'light'))
  }, [])

  const value = useMemo(() => ({ theme, toggle, version }), [theme, toggle, version])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeValue {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside ThemeProvider')
  return context
}

/**
 * Read a CSS variable and return the colour it currently resolves to.
 *
 * The map paints its markers onto an HTML canvas, and a canvas cannot
 * understand `var(--critical)`. It needs a real colour like `#bd3743`. Rather
 * than keep a second copy of every colour in JavaScript (which then drifts out
 * of step with the stylesheet, and cannot follow a theme change at all), we
 * ask the browser what the variable is worth right now.
 */
export function cssColour(name: string, fallback = '#888888'): string {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  return value || fallback
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggle } = useTheme()
  const next = theme === 'light' ? 'dark' : 'light'

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn btn-sm"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      style={{ padding: compact ? '5px 8px' : undefined }}
    >
      {theme === 'light' ? <MoonIcon /> : <SunIcon />}
      {!compact && <span>{theme === 'light' ? 'Dark' : 'Light'}</span>}
    </button>
  )
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.1 5.1l1.4 1.4M17.5 17.5l1.4 1.4M18.9 5.1l-1.4 1.4M6.5 17.5l-1.4 1.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}
