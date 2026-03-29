// Path: tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
    './node_modules/react-tailwindcss-datepicker/dist/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#F4511E',
          hover: '#E64A19',
        },
        secondary: '#1A1A2E',
        shopee: '#EE4D2D',
        line: '#06C755',
        facebook: {
          DEFAULT: '#1877F2',
          hover: '#1565C0',
        },
      },
      fontFamily: {
        sans: ['IBM Plex Sans Thai', 'sans-serif'],
        sarabun: ['var(--font-sarabun)', 'Sarabun', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;