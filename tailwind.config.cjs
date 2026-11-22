/** @type {import('tailwindcss').Config} */
module.exports = {
  // The app builds most of its UI from JavaScript templates. Scan those files
  // as well as the HTML shell so production CSS retains dynamically rendered
  // utility classes (including the responsive note-grid layout).
  content: ['./index.html', './app.js', './note-*.js'],
  darkMode: 'class',
  theme: {
    extend: {
      backgroundColor: {
        main: 'color-mix(in srgb, var(--bg-main) calc(<alpha-value> * 100%), transparent)',
        surface: 'color-mix(in srgb, var(--bg-surface) calc(<alpha-value> * 100%), transparent)',
        elevated: 'color-mix(in srgb, var(--bg-elevated) calc(<alpha-value> * 100%), transparent)'
      },
      textColor: {
        main: 'color-mix(in srgb, var(--text-main) calc(<alpha-value> * 100%), transparent)',
        muted: 'color-mix(in srgb, var(--text-muted) calc(<alpha-value> * 100%), transparent)'
      },
      borderColor: {
        muted: 'color-mix(in srgb, var(--border-muted) calc(<alpha-value> * 100%), transparent)',
        strong: 'color-mix(in srgb, var(--border-strong) calc(<alpha-value> * 100%), transparent)'
      }
    }
  },
  plugins: []
};
