import type { Config } from 'tailwindcss';
const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'hsl(var(--ink))',
        canvas: 'hsl(var(--canvas))',
        panel: 'hsl(var(--panel))',
        subtle: 'hsl(var(--subtle))',
        line: 'hsl(var(--line))',
        brand: 'hsl(var(--brand))'
      },
      boxShadow: {soft: '0 14px 40px -22px rgba(15, 23, 42, .32)'}
    }
  },
  plugins: []
};
export default config;
