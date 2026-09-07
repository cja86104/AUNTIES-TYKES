/**
 * Site-wide SEO configuration and the per-route metadata map.
 *
 * ── BEFORE LAUNCH ──────────────────────────────────────────────────────────
 * 1. Set `SITE.url` to the live domain.
 * 2. Set `SITE.indexable` to true.
 * 3. Remove the `<meta name="robots" content="noindex, nofollow" />` line from
 *    index.html, and switch public/robots.txt to the allow rules noted there.
 * Until all three happen the site stays out of search results on purpose —
 * the demo content is placeholder business information, and indexing it would
 * put a fake license number and address into Google under this domain.
 * ───────────────────────────────────────────────────────────────────────────
 */

export const SITE = {
  name: 'Aunties Tykes',
  /** Update to the customer's real domain at launch. */
  url: 'https://aunties-tykes.vercel.app',
  locale: 'en_US',
  ogImage: '/og-image.png',
  twitterCard: 'summary_large_image',
  /** Keep false while the site shows demo content. See the note above. */
  indexable: false,
} as const

export interface PageSeo {
  title: string
  description: string
}

/** Routes that must never be indexed, whatever `SITE.indexable` says. */
export const PRIVATE_PREFIXES = ['/admin', '/parent', '/login', '/enroll'] as const

export const DEFAULT_SEO: PageSeo = {
  title: 'Aunties Tykes — Licensed Home Daycare in Durham, NC',
  description:
    'A small, licensed home daycare in Durham, NC. Play-based learning, infant to preschool, tiny group sizes, and a daily photo report for every family.',
}

export const PAGE_SEO: Record<string, PageSeo> = {
  '/': DEFAULT_SEO,
  '/about': {
    title: 'About Auntie Roz | Aunties Tykes Daycare, Durham NC',
    description:
      'Meet Rosalind “Auntie Roz” Hayes and the team. Nineteen years in early childhood education, licensed and CPR certified, caring for twelve children at a time.',
  },
  '/programs': {
    title: 'Infant, Toddler & Preschool Programs | Aunties Tykes',
    description:
      'Three age groups with their own rhythm and ratios — infants 1:3, toddlers 1:4, preschool 1:6. See the daily routine for each room and what a day really looks like.',
  },
  '/tuition-policies': {
    title: 'Tuition & Policies | Aunties Tykes Daycare, Durham NC',
    description:
      'Full-time, part-time, and drop-in rates with a live cost estimator, plus our sick policy, late pickup rules, holiday closures, and potty learning approach.',
  },
  '/gallery': {
    title: 'Photo Gallery | Aunties Tykes Daycare, Durham NC',
    description:
      'Look inside our home daycare — the reading loft, morning circle rug, garden beds, mud kitchen, and the messy art days families hear about at pickup.',
  },
  '/faq': {
    title: 'Frequently Asked Questions | Aunties Tykes Daycare',
    description:
      'Hours, what to pack, meals, nap schedules, potty training, sick policy, licensing, and how the waitlist works — the questions parents ask us most.',
  },
  '/contact': {
    title: 'Schedule a Tour | Contact Aunties Tykes, Durham NC',
    description:
      'Book a tour or join the waitlist at Aunties Tykes in Durham, NC. Tell us your child’s age and when you need care, and we will tell you honestly where you stand.',
  },
  '/enroll': {
    title: 'Enrollment Form | Aunties Tykes Daycare',
    description:
      'Enroll your child at Aunties Tykes in Durham, NC. Tell us about your family, your children, and their care schedule.',
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
