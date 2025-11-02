/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./public/**/*.{html,js}",
  ],
  theme: {
    extend: {
      colors: {
        brand: '#ffca28',
        surface: {
          DEFAULT: '#141416',
          soft: '#18182d',
        },
      },
      fontFamily: {
        sans: ["Helvetica Neue", "Arial", "sans-serif"],
      },
      borderRadius: {
        xl: '1.25rem',
      },
    },
  },
  // Avoid resets that might conflict with existing base styles; enable later if desired
  corePlugins: {
    preflight: false,
  },
};
