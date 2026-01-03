/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Flat UI Kit - Zero transparency colors
        'ui-bg': '#F5F6F7',          // Light tint background (NOT white)
        'ui-surface': '#FDFCFB',     // Off-white for cards/inputs
        'ui-border': '#E0E2E5',      // Subtle borders
        'ui-border-light': '#EAECEF',
        'ui-text': '#1A1D23',        // Primary text
        'ui-text-muted': '#6B7280',  // Secondary text
        'ui-text-light': '#9CA3AF',  // Tertiary text
        
        // Primary actions (blue)
        'ui-primary': '#3B82F6',
        'ui-primary-hover': '#2563EB',
        'ui-primary-active': '#1D4ED8',
        'ui-primary-light': '#DBEAFE',
        
        // Success (green)
        'ui-success': '#10B981',
        'ui-success-hover': '#059669',
        'ui-success-light': '#D1FAE5',
        
        // Warning (amber)
        'ui-warning': '#F59E0B',
        'ui-warning-hover': '#D97706',
        'ui-warning-light': '#FEF3C7',
        
        // Danger (red)
        'ui-danger': '#EF4444',
        'ui-danger-hover': '#DC2626',
        'ui-danger-light': '#FEE2E2',
        
        // Modal overlay - solid, not transparent
        'ui-overlay': '#0F172A',     // Solid dark for overlays
      },
      borderRadius: {
        'ui': '12px',
        'ui-sm': '8px',
        'ui-lg': '16px',
      },
      boxShadow: {
        'ui': '0 1px 3px 0 rgba(0, 0, 0, 0.08)',
        'ui-md': '0 4px 6px -1px rgba(0, 0, 0, 0.08)',
        'ui-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.08)',
      },
      spacing: {
        'ui-input-y': '14px',
        'ui-input-x': '16px',
        'ui-page': '50px',
      },
    },
  },
  plugins: [],
}
