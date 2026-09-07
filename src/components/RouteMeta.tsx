import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { SITE, isPrivateRoute, seoForPath } from '../lib/seo'
import type { Settings } from '../types'

const JSON_LD_ID = 'aunties-tykes-jsonld'

function setMeta(attr: 'name' | 'property', key: string, content: string): void {
  const selector = `meta[${attr}="${key}"]`
  let el = document.head.querySelector<HTMLMetaElement>(selector)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.content = content
}

function setLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.rel = rel
    document.head.appendChild(el)
  }
  el.href = href
}

function setJsonLd(data: Record<string, unknown> | null): void {
  const existing = document.getElementById(JSON_LD_ID)
  if (!data) {
    existing?.remove()
    return
  }
  const el = existing ?? document.createElement('script')
  if (!existing) {
    el.id = JSON_LD_ID
    el.setAttribute('type', 'application/ld+json')
    document.head.appendChild(el)
  }
  el.textContent = JSON.stringify(data)
}

/**
 * Structured data for local search. Built from the settings the owner edits in
 * the admin console, so it never drifts from what the site actually says.
 */
function localBusinessSchema(settings: Settings): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ChildCare',
    name: settings.businessName,
    description: settings.tagline,
    url: SITE.url,
    telephone: settings.phone,
    email: settings.email,
    address: { '@type': 'PostalAddress', streetAddress: settings.address, addressCountry: 'US' },
    openingHours: 'Mo,Tu,We,Th,Fr 07:00-17:45',
    founder: { '@type': 'Person', name: settings.director },
    maximumAttendeeCapacity: settings.capacity,
  }
}

/**
 * Applies per-route document metadata. Rendered once inside the router rather
 * than repeated across twenty-four page components, so there is exactly one
 * place where titles, canonicals, and robots rules are decided.
 */
export default function RouteMeta() {
  const { pathname } = useLocation()
  const settings = useStore((s) => s.settings)

  useEffect(() => {
    const { title, description } = seoForPath(pathname)
    const isPrivate = isPrivateRoute(pathname)
    const canonical = `${SITE.url}${pathname}`
    const image = `${SITE.url}${SITE.ogImage}`

    document.title = title
    setMeta('name', 'description', description)
    setMeta('name', 'robots', SITE.indexable && !isPrivate ? 'index, follow' : 'noindex, nofollow')
    setLink('canonical', canonical)

    setMeta('property', 'og:site_name', SITE.name)
    setMeta('property', 'og:type', 'website')
    setMeta('property', 'og:locale', SITE.locale)
    setMeta('property', 'og:title', title)
    setMeta('property', 'og:description', description)
    setMeta('property', 'og:url', canonical)
    setMeta('property', 'og:image', image)

    setMeta('name', 'twitter:card', SITE.twitterCard)
    setMeta('name', 'twitter:title', title)
    setMeta('name', 'twitter:description', description)
    setMeta('name', 'twitter:image', image)

    // Only the marketing home page carries business structured data.
    setJsonLd(pathname === '/' ? localBusinessSchema(settings) : null)
  }, [pathname, settings])

  return null
}
