/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        main: 'color-mix(in srgb, var(--bg-main) calc(<alpha-value> * 100%), transparent)',
        surface: 'color-mix(in srgb, var(--bg-surface) calc(<alpha-value> * 100%), transparent)',
        elevated: 'color-mix(in srgb, var(--bg-elevated) calc(<alpha-value> * 100%), transparent)',
        muted: 'color-mix(in srgb, var(--text-muted) calc(<alpha-value> * 100%), transparent)',
        strong: 'color-mix(in srgb, var(--border-strong) calc(<alpha-value> * 100%), transparent)'
      }
    }
  },
  plugins: []
};
