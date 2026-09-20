/**
 * Centralized design tokens for the Aunties Tykes admin/parent console.
 *
 * This is the single source of truth for color, radius, shadow and
 * typography values. `tailwind.config.js` imports directly from this file so
 * Tailwind's generated utility classes (`bg-brand`, `rounded-card`,
 * `shadow-card`, `font-display`, ...) and any non-Tailwind consumer (chart
 * `stroke`/`fill` props, inline styles) always agree.
 *
 * To re-theme the app, change values here -- do not hardcode new hex/shadow
 * literals in components.
 */

export const colors = {
  /** Primary brand teal -- main CTAs, links, focus rings. */
  brand: {
    DEFAULT: '#3F8570',
    ink: '#1F4A3D',
    deep: '#356F5C',
    tint: '#E8F3EE',
  },
  /** Secondary accent -- dusty rose, used for warm highlights and hearts. */
  rose: {
    DEFAULT: '#D98B9B',
    ink: '#7A3B47',
    deep: '#C97686',
    tint: '#FBEEF1',
  },
  /** Tertiary accent -- warm gold, used sparingly for highlights/badges. */
  sunny: {
    DEFAULT: '#F5B942',
    ink: '#8a6112',
    deep: '#efad2b',
    tint: '#FDF1DC',
  },
  ink: '#2b2f3a',
  canvas: '#FCF7EA',
  console: '#1F2537',
} as const

export const radius = {
  chip: '0.5rem',
  control: '0.75rem',
  card: '1rem',
  panel: '1.25rem',
  full: '9999px',
} as const

/** Restrained, neutral elevation scale -- no colored "glow" shadows. */
export const shadow = {
  xs: '0 1px 2px rgba(16, 24, 40, 0.04)',
  card: '0 1px 2px rgba(16, 24, 40, 0.04)',
  raised: '0 12px 28px -16px rgba(16, 24, 40, 0.18)',
  control: '0 1px 2px rgba(16, 24, 40, 0.05)',
  focus: '0 0 0 4px rgba(63, 133, 112, 0.15)',
} as const

export const fontFamily = {
  display: ['"Playfair Display"', 'Georgia', 'serif'],
  script: ['Caveat', 'cursive'],
  sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
} as const

/** Standard icon sizing for primary UI icons (nav, stat cards, headers, empty states). */
export const icon = {
  size: 20,
  strokeWidth: 1.75,
} as const

export const layout = {
  /** Fixed admin sidebar width on desktop. */
  sidebarWidth: '370px',
} as const
