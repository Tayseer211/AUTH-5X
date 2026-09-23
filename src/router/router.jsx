import { useEffect, useState } from 'react'

// Minimal hash router (#/path?query). Hash routing keeps deep links working
// on any static host without server rewrites, and needs no dependency.

function readLocation() {
  const hash = window.location.hash.replace(/^#/, '') || '/'
  const [path, search = ''] = hash.split('?')
  return { path: path || '/', query: new URLSearchParams(search) }
}

export function useHashLocation() {
  const [location, setLocation] = useState(readLocation)

  useEffect(() => {
    const onHashChange = () => {
      setLocation(readLocation())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHashChange)

    // Catch any hash change that happened between first render and here.
    setLocation((previous) => {
      const next = readLocation()
      return next.path === previous.path && next.query.toString() === previous.query.toString() ? previous : next
    })

    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return location
}

export function navigate(to, { replace = false } = {}) {
  if (replace) {
    window.history.replaceState(null, '', `#${to}`)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = to
  }
}

// Matches "/verify/:id" style patterns; returns params or null.
export function matchRoute(pattern, path) {
  const patternParts = pattern.split('/').filter(Boolean)
  const pathParts = path.split('/').filter(Boolean)
  if (patternParts.length !== pathParts.length) return null

  const params = {}
  for (let i = 0; i < patternParts.length; i += 1) {
    if (patternParts[i].startsWith(':')) params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i])
    else if (patternParts[i] !== pathParts[i]) return null
  }
  return params
}

export function Link({ to, children, ...props }) {
  return (
    <a href={`#${to}`} {...props}>
      {children}
    </a>
  )
}

export function Redirect({ to }) {
  useEffect(() => {
    navigate(to, { replace: true })
  }, [to])
  return null
}
