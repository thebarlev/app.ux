import * as React from 'react'
import { cn } from '@/lib/utils'

/* ============================================
   Sidebar Utility Classes & Components
   ============================================ */

/**
 * Sidebar Container
 * Usage: <aside className="ui-sidebar ...">
 */
export const sidebarBaseClasses = "bg-sidebar text-sidebar-fg border-r border-sidebar-border";

/**
 * Sidebar Item (link/button)
 * Usage: <a className="ui-sidebar-item ...">
 */
export const sidebarItemClasses = "flex items-center gap-3 px-4 py-3 rounded-[10px] text-sidebar-fg hover:bg-sidebar-hover transition-colors focus:outline-none focus:ring-2 focus:ring-sidebar-ring focus:ring-offset-2";

/**
 * Sidebar Active Item
 * Usage: <a className="ui-sidebar-item ui-sidebar-item-active ...">
 */
export const sidebarItemActiveClasses = "bg-sidebar-active text-sidebar-active-fg";

/**
 * Sidebar Sub Item (aligned to text, not icon)
 * Usage: <a className="ui-sidebar-item ui-sidebar-sub-item ...">
 */
export const sidebarSubItemClasses = "pr-12"; // Aligns text to parent item text, not icon

interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode
}

export function Sidebar({ className, children, ...props }: SidebarProps) {
  return (
    <aside
      className={cn(sidebarBaseClasses, className)}
      {...props}
    >
      {children}
    </aside>
  )
}

interface SidebarItemProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  active?: boolean
  subItem?: boolean
  icon?: React.ReactNode
  children: React.ReactNode
}

export function SidebarItem({ 
  className, 
  active = false, 
  subItem = false,
  icon,
  children,
  ...props 
}: SidebarItemProps) {
  return (
    <a
      className={cn(
        sidebarItemClasses,
        active && sidebarItemActiveClasses,
        subItem && sidebarSubItemClasses,
        className
      )}
      {...props}
    >
      {icon && <span className="flex-shrink-0 text-sidebar-fg">{icon}</span>}
      <span>{children}</span>
    </a>
  )
}
