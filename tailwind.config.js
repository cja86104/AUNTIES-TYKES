/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#3F8570',
          ink: '#1F4A3D',
          deep: '#356F5C',
          tint: '#E8F3EE',
        },
        sunny: {
          DEFAULT: '#F5B942',
          ink: '#8a6112',
          deep: '#efad2b',
          tint: '#FDF1DC',
        },
        sage: {
          DEFAULT: '#D98B9B',
          ink: '#7A3B47',
          deep: '#C97686',
          tint: '#FBEEF1',
        },
        ink: '#2b2f3a',
        canvas: '#FCF7EA',
        console: '#1F2537',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        script: ['Caveat', 'cursive'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
