import { colors, radius, shadow, fontFamily } from './src/lib/tokens.ts'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors,
      borderRadius: {
        chip: radius.chip,
        control: radius.control,
        card: radius.card,
        panel: radius.panel,
      },
      boxShadow: {
        card: shadow.card,
        raised: shadow.raised,
        control: shadow.control,
        focus: shadow.focus,
      },
      fontFamily,
    },
  },
  plugins: [],
}
