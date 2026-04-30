/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    borderRadius: {
      'none': '0',
      'sm':   '0',
      DEFAULT: '0',
      'md':   '0',
      'lg':   '0',
      'xl':   '0',
      '2xl':  '0',
      '3xl':  '0',
      'full': '0',
    },
    extend: {
      colors: {
        brand: {
          50:  '#f0f4ff',
          100: '#dce6ff',
          500: '#3b5fc0',
          600: '#2f4da8',
          700: '#243d90',
          900: '#0f1f52',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
