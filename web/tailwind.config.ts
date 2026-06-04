import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        elevated: 'var(--elevated)',
        line: 'var(--line)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        accent: { DEFAULT: 'var(--accent)', soft: 'var(--accent-soft)' },
        pos: 'var(--pos)',
        neg: 'var(--neg)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"SF Mono"', '"Roboto Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { card: '10px', control: '8px' },
    },
  },
  plugins: [],
} satisfies Config;
