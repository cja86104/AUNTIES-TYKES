/**
 * Site-wide SEO configuration and the per-route metadata map.
 *
 * Indexability follows DEMO_MODE in src/lib/config.ts — see the launch
 * checklist there. While the site shows placeholder business information,
 * indexing it would put a fake license number and address into Google under
 * this domain, so it stays out of search results on purpose.
 */
import { DEMO_MODE } from './config'

export const SITE = {
  name: 'Aunties Tykes',
  /** Update to the customer's real domain at launch. */
  url: 'https://aunties-tykes.vercel.app',
  locale: 'en_US',
  ogImage: '/og-image.png',
  twitterCard: 'summary_large_image',
  /** Driven by DEMO_MODE — never set this directly. */
  indexable: !DEMO_MODE,
} as const

export interface PageSeo {
  title: string
  description: string
}

/** Routes that must never be indexed, whatever `SITE.indexable` says. */
export const PRIVATE_PREFIXES = ['/admin', '/parent', '/login', '/enroll'] as const

export const DEFAULT_SEO: PageSeo = {
  title: 'Aunties Tykes — Licensed Home Daycare in Camp Hill, PA',
  description:
    'A small, licensed home daycare in Camp Hill, PA. Play-based learning, infant to preschool, tiny group sizes, and real daily reports for every family.',
}

export const PAGE_SEO: Record<string, PageSeo> = {
  '/': DEFAULT_SEO,
  '/parent-portal-guide': {
    title: 'Parent Portal Guide | Aunties Tykes Daycare, Camp Hill PA',
    description:
      'A walkthrough of the Aunties Tykes parent portal — daily reports, attendance, billing, documents, and messaging, all explained in plain language.',
  },
  '/tuition-policies': {
    title: 'Tuition & Policies | Aunties Tykes Daycare, Camp Hill PA',
    description:
      'Full-time, part-time, and drop-in rates with a live cost estimator, plus our sick policy, late pickup rules, holiday closures, and potty learning approach.',
  },
  '/faq': {
    title: 'Frequently Asked Questions | Aunties Tykes Daycare',
    description:
      'Hours, what to pack, meals, nap schedules, potty training, sick policy, licensing, and how the waitlist works — the questions parents ask us most.',
  },
  '/contact': {
    title: 'Contact Us | Aunties Tykes, Camp Hill PA',
    description:
      'Get in touch with Aunties Tykes in Camp Hill, PA. Tell us your child’s age and when you need care, and we will tell you honestly where you stand.',
  },
  '/enroll': {
    title: 'Enrollment Form | Aunties Tykes Daycare',
    description:
      'Enroll your child at Aunties Tykes in Camp Hill, PA. Tell us about your family, your children, and their care schedule.',
  },
  '/login': {
    title: 'Parent Login | Aunties Tykes',
    description: 'Sign in to the Aunties Tykes parent portal for daily reports, attendance, invoices, and documents.',
  },
}

export function isPrivateRoute(pathname: string): boolean {
  return PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** Portal pages get a plain, honest title rather than a marketing one. */
export function seoForPath(pathname: string): PageSeo {
  const exact = PAGE_SEO[pathname]
  if (exact) return exact

  if (pathname.startsWith('/admin')) {
    return { title: `Admin Console | ${SITE.name}`, description: 'Private administration area.' }
  }
  if (pathname.startsWith('/parent')) {
    return { title: `Parent Portal | ${SITE.name}`, description: 'Private family portal.' }
  }
  return { title: `Page not found | ${SITE.name}`, description: DEFAULT_SEO.description }
}
