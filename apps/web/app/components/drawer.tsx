import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: ReactNode;
  children: ReactNode;
  ariaLabelledBy?: string;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function Drawer({
  isOpen,
  onClose,
  title,
  subtitle,
  badge,
  size = 'md',
  footer,
  children,
  ariaLabelledBy = 'drawer-title',
}: DrawerProps) {
  const [portalTarget,setPortalTarget]=useState<HTMLElement|null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(()=>{setPortalTarget(document.body);},[]);

  // Keep the latest callback without restarting the scroll/focus lifecycle on every parent render.
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen || !portalTarget) return;

    const panel = panelRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    function getFocusableElements(): HTMLElement[] {
      if (!panel) return [];
      return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) =>
          element.getAttribute('aria-hidden') !== 'true' &&
          element.getClientRects().length > 0,
      );
    }

    function handleKeyDown(event: KeyboardEvent) {
      // Only the visually top-most drawer owns keyboard interaction.
      const layers = Array.from(document.querySelectorAll<HTMLElement>('.drawer-backdrop'));
      const topLayer = layers[layers.length - 1];
      if (topLayer && panel && !topLayer.contains(panel)) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab' || !panel) return;

      const focusable = getFocusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    const focusTimer = window.setTimeout(() => {
      if (!panel) return;
      const autofocusElement = panel.querySelector<HTMLElement>('[autofocus]');
      if (autofocusElement && autofocusElement.getClientRects().length > 0) {
        autofocusElement.focus();
      } else {
        closeBtnRef.current?.focus();
      }
    }, 40);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;

      // Return focus to the element that opened this drawer, including a control
      // inside a still-open parent drawer.
      if (opener?.isConnected) {
        window.requestAnimationFrame(() => {
          if (!opener.isConnected) return;
          const layers = Array.from(document.querySelectorAll<HTMLElement>('.drawer-backdrop'));
          const topLayer = layers[layers.length - 1];
          if (!topLayer || topLayer.contains(opener)) opener.focus();
        });
      }
    };
  }, [isOpen,portalTarget]);

  if (!isOpen || !portalTarget) return null;

  return createPortal((
    <div
      className="drawer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current();
      }}
    >
      <aside
        ref={panelRef}
        className={`drawer-panel drawer-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
      >
        <div className="drawer-header">
          <div className="drawer-header-content">
            <div className="drawer-header-title-row">
              {badge && <div className="drawer-badge-wrap">{badge}</div>}
              <h2 id={ariaLabelledBy} className="drawer-title">
                {title}
              </h2>
            </div>
            {subtitle && <p className="drawer-subtitle">{subtitle}</p>}
          </div>

          <button
            ref={closeBtnRef}
            type="button"
            className="drawer-close-btn"
            onClick={() => onCloseRef.current()}
            aria-label="Paneli kapat"
            title="Kapat (Esc)"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="drawer-body">{children}</div>

        {footer && <div className="drawer-footer">{footer}</div>}
      </aside>
    </div>
  ),portalTarget);
}
