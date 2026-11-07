/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F6F4EF',
        card: '#FFFDFB',
        ink: '#1C1917',
        mute: '#6F6A63',
        line: '#E6E1D8',
        pine: {
          50: '#E8F6EE',
          100: '#D3EEDD',
          600: '#1F7A4D',
          700: '#18643E',
          800: '#0F3D27',
        },
      },
      fontFamily: {
        sans: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(28, 25, 23, 0.04), 0 12px 32px rgba(28, 25, 23, 0.04)',
      },
    },
  },
  plugins: [],
}
