import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#FFFDF8',
        card: '#FFFFFF',
        caramel: '#D99A4E',
        honey: '#F8E6C8',
        ink: '#3A2A1A',
        muted: '#7A6A58',
        line: '#EFE1CF',
        warning: '#F0A202',
        danger: '#D9534F',
        success: '#4E9F3D',
        mint: '#E7F4E3',
        sky: '#EAF3F8'
      },
      boxShadow: {
        soft: '0 18px 55px rgba(58, 42, 26, 0.1)'
      }
    }
  },
  plugins: []
};

export default config;
