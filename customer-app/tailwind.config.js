/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        teal: { brand: '#0D7377', dark: '#0a5c60', light: '#14a8ae' },
        amber: { brand: '#F4A261', dark: '#e8893c' },
      },
      fontFamily: {
        sans: ['DM Sans', 'Nunito', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        pulse_amber: {
          '0%, 100%': { backgroundColor: '#F4A261' },
          '50%': { backgroundColor: '#e8893c' },
        },
        bounce_in: {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        pulse_amber: 'pulse_amber 1.5s ease-in-out infinite',
        bounce_in: 'bounce_in 0.4s ease-out',
      },
    },
  },
  plugins: [],
}
