/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        teal: {
          brand: '#0D7377',
          dark: '#0a5c60',
          light: '#14a8ae',
        },
        amber: {
          brand: '#F4A261',
          dark: '#e8893c',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'Nunito', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
