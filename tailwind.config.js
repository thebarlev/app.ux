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
        // Design Tokens - Semantic Color System
        bg: 'var(--bg)',
        fg: 'var(--fg)',

        card: 'var(--card)',
        'card-fg': 'var(--card-fg)',

        muted: 'var(--muted)',
        'muted-fg': 'var(--muted-fg)',

        border: 'var(--border)',
        ring: 'var(--ring)',

        primary: 'var(--primary)',
        'primary-fg': 'var(--primary-fg)',
        'primary-hover': 'var(--primary-hover)',

        secondary: 'var(--secondary)',
        'secondary-fg': 'var(--secondary-fg)',

        danger: 'var(--danger)',
        'danger-fg': 'var(--danger-fg)',

        input: 'var(--input)',
        'input-fg': 'var(--input-fg)',
        placeholder: 'var(--placeholder)',

        success: 'var(--success)',
        'success-fg': 'var(--success-fg)',

        warning: 'var(--warning)',
        'warning-fg': 'var(--warning-fg)',

        overlay: 'var(--overlay)',

        sidebar: 'var(--sidebar-bg)',
        'sidebar-fg': 'var(--sidebar-fg)',
        'sidebar-muted-fg': 'var(--sidebar-muted-fg)',
        'sidebar-muted-bg': 'var(--sidebar-muted-bg)',
        'sidebar-border': 'var(--sidebar-border)',
        'sidebar-hover': 'var(--sidebar-hover)',
        'sidebar-active': 'var(--sidebar-active)',
        'sidebar-active-fg': 'var(--sidebar-active-fg)',
        'sidebar-ring': 'var(--sidebar-ring)',

        'table-header': 'var(--table-header-bg)',
        'table-header-fg': 'var(--table-header-fg)',
        'table-row-hover': 'var(--table-row-hover)',
        'table-stripe': 'var(--table-stripe)',
        'table-positive': 'var(--table-positive)',
        'table-negative': 'var(--table-negative)',
      },
      borderRadius: {
        ui: 'var(--radius)',
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
