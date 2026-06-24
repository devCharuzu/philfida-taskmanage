/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    screens: {
      'xs': '320px',
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Inter', 'sans-serif'],
      },
      colors: {
        // Brand aliases — match design-system.css CSS variables
        brand: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#2d8a32',
          600: '#016837',
          700: '#016837',
          800: '#0a2e0a',
          900: '#062106',
          950: '#031403',
        },
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
        'dropdown': '1000',
        'sticky': '1020',
        'fixed': '1030',
        'modal-backdrop': '1040',
        'modal': '1050',
        'popover': '1060',
        'tooltip': '1070',
        'toast': '1080',
      },
    },
  },
  plugins: [],
}
