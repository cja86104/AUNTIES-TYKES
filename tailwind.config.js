/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#4F77D9',
          ink: '#39569f',
          deep: '#4169c9',
          tint: '#EAF0FC',
        },
        sunny: {
          DEFAULT: '#F5B942',
          ink: '#8a6112',
          deep: '#efad2b',
          tint: '#FDF1DC',
        },
        sage: {
          DEFAULT: '#5DC4A6',
          ink: '#25705c',
          deep: '#4bb797',
          tint: '#E6F6F0',
        },
        ink: '#2b2f3a',
        canvas: '#FBFAF7',
        console: '#1F2537',
      },
      fontFamily: {
        display: ['Nunito', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
