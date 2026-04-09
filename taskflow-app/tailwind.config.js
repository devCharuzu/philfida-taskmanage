/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    screens: {
      'xs': '475px',
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
      '3xl': '1920px',
    },
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        display: ['DM Sans', 'sans-serif'],
      },
      colors: {
        // Primary: Dark forest green — PhilFIDA brand
        green: {
          50:  '#f0faf0',
          100: '#dcf0dc',
          200: '#b8e2b8',
          300: '#86cc86',
          400: '#52b052',
          500: '#2d8c2d',
          600: '#1e6e1e',
          700: '#155415',
          800: '#0e3d0e',
          900: '#082908',
          950: '#041604',
        },
        // Accent: warm gold for highlights
        gold: {
          400: '#f5c842',
          500: '#e6b020',
          600: '#c9940a',
        },
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.06)',
        'card-hover': '0 4px 6px rgba(0,0,0,0.07), 0 10px 30px rgba(0,0,0,0.10)',
        'modal': '0 20px 60px rgba(0,0,0,0.18)',
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      maxWidth: {
        '8xl': '88rem',
        '9xl': '96rem',
      },
      zIndex: {
        '60': '60',
        '70': '70',
        '80': '80',
        '90': '90',
        '100': '100',
      },
    },
  },
  plugins: [],
}
