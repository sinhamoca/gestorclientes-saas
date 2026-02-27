/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 400: '#4ba883', 500: '#2d8f6a', 600: '#1f7355', 700: '#1a5c45' },
        surface: {
          0: '#0b0f14', 50: '#111720', 100: '#171f2b', 200: '#1e2836',
          300: '#283445', 400: '#354359', 500: '#4a5a73', 600: '#6b7f9b',
          700: '#94a7c0', 800: '#c1cedf', 900: '#e4eaf2', 950: '#f5f7fa',
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
