'use client';

import { useEffect } from 'react';

/**
 * ScrollLockFix Component
 * מונע מRadix UI לנעול את ה-scroll ולהעלים את ה-scrollbar
 * עובד עם Select, Dropdown Menu, Dialog, וכל רכיבי Radix UI
 */
export function ScrollLockFix() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // חישוב רוחב ה-scrollbar
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    const observer = new MutationObserver(() => {
      const bodyStyle = document.body.getAttribute('style') || '';
      const bodyOverflow = window.getComputedStyle(document.body).overflow;
      
      // עוקף overflow:hidden של Radix UI + שומר את רוחב ה-scrollbar
      if (bodyOverflow === 'hidden' || bodyStyle.includes('pointer-events: none')) {
        document.body.style.setProperty('overflow', 'auto', 'important');
        // RTL: padding-left במקום padding-right
        document.body.style.setProperty('padding-left', `${scrollbarWidth}px`, 'important');
        document.body.style.setProperty('padding-right', '0px', 'important');
        document.body.style.setProperty('position', 'static', 'important');
        document.body.style.setProperty('width', 'auto', 'important');
      } else if (bodyOverflow === 'visible' || bodyOverflow === 'auto') {
        // נקה את ה-padding כשה-dropdown נסגר
        document.body.style.removeProperty('padding-left');
        document.body.style.removeProperty('padding-right');
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('position');
        document.body.style.removeProperty('width');
      }
    });

    observer.observe(document.body, { 
      attributes: true, 
      attributeFilter: ['style', 'class', 'data-scroll-locked', 'data-remove-scroll-bar'] 
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
