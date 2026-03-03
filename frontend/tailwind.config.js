/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Bitcoin orange palette
        bitcoin: {
          DEFAULT: '#F7931A',
          dark: '#C87019',
          light: '#FFAA44',
        },
        // Deep navy-black backgrounds
        void: {
          DEFAULT: '#050810',
          '100': '#0a0f1e',
          '200': '#111827',
          '300': '#1a2236',
        },
        // Accent: electric cyan
        neon: {
          DEFAULT: '#00FFD1',
          dim: '#00b890',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'monospace'],
        body: ['var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      backgroundImage: {
        'grid-pattern': `linear-gradient(rgba(0,255,209,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,255,209,0.04) 1px, transparent 1px)`,
      },
      backgroundSize: {
        grid: '40px 40px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        float: 'float 6s ease-in-out infinite',
        'glow-in': 'glow-in 0.6s ease-out forwards',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'glow-in': {
          '0%': { opacity: '0', filter: 'blur(8px)' },
          '100%': { opacity: '1', filter: 'blur(0)' },
        },
      },
    },
  },
  plugins: [],
};
