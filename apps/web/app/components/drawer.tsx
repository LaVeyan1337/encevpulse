import { useEffect, useRef, type ReactNode } from 'react';

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
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Lock body scroll and handle Escape key when drawer is open
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    // Focus the drawer panel or close button on open
    const focusTimer = setTimeout(() => {
      if (panelRef.current) {
        const autofocusElement = panelRef.current.querySelector<HTMLElement>('[autofocus]');
        if (autofocusElement) {
          autofocusElement.focus();
        } else if (closeBtnRef.current) {
          closeBtnRef.current.focus();
        }
      }
    }, 50);

    return () => {
      clearTimeout(focusTimer);
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="drawer-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <aside
        ref={panelRef}
        className={`drawer-panel drawer-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
      >
        {/* Fixed / Sticky Header */}
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
            onClick={onClose}
            aria-label="Paneli kapat (Escape)"
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

        {/* Scrollable Content Body */}
        <div className="drawer-body">{children}</div>

        {/* Fixed / Sticky Footer */}
        {footer && <div className="drawer-footer">{footer}</div>}
      </aside>
    </div>
  );
}
