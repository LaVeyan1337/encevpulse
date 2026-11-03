import type { CSSProperties } from 'react';

function GhostLine({ className = '' }: { className?: string }) {
  return <span className={`ghost-line ${className}`} aria-hidden="true" />;
}

/** Real-data-free placeholders. They describe layout only, never sample records. */
export function OverviewSkeleton() {
  return (
    <section className="overview-section page-skeleton" role="status" aria-label="Genel bakış yükleniyor" aria-busy="true">
      <div className="summary-grid" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <div className={`summary-card skeleton-tile skeleton-tile-${index + 1}`} key={index}>
            <div className="skeleton-metric-heading">
              <GhostLine className="ghost-label" />
              <GhostLine className="ghost-icon" />
            </div>
            <GhostLine className="ghost-number" />
          </div>
        ))}
      </div>
      <div className="overview-dual-grid" aria-hidden="true">
        {[0, 1].map((panel) => (
          <section className="overview-panel skeleton-panel" key={panel}>
            <div className="skeleton-panel-heading">
              <GhostLine className="ghost-heading" />
              <GhostLine className="ghost-subheading" />
            </div>
            {Array.from({ length: 4 }, (_, row) => (
              <div className="skeleton-list-row" key={row}>
                <GhostLine className="ghost-list-main" />
                <GhostLine className="ghost-list-side" />
              </div>
            ))}
          </section>
        ))}
      </div>
    </section>
  );
}

function SkeletonTaskCard({ index }: { index: number }) {
  const style = { '--ghost-index': index } as CSSProperties;
  return (
    <div className="skeleton-task-card" style={style} aria-hidden="true">
      <div className="skeleton-card-tags">
        <GhostLine className="ghost-chip" />
        <GhostLine className="ghost-chip ghost-chip-short" />
      </div>
      <GhostLine className="ghost-task-title" />
      <GhostLine className="ghost-task-title ghost-task-title-short" />
      <div className="skeleton-card-footer">
        <GhostLine className="ghost-avatar" />
        <GhostLine className="ghost-person" />
        <GhostLine className="ghost-date" />
      </div>
    </div>
  );
}

export function TaskBoardSkeleton({ layout }: { layout: 'board' | 'list' }) {
  if (layout === 'list') {
    return (
      <div className="task-table-wrap skeleton-table" role="status" aria-label="Görev listesi yükleniyor" aria-busy="true">
        <table className="task-table" aria-hidden="true">
          <thead>
            <tr>
              {Array.from({ length: 6 }, (_, index) => <th key={index}><GhostLine className="ghost-table-heading" /></th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }, (_, row) => (
              <tr key={row}>
                {Array.from({ length: 6 }, (_, cell) => (
                  <td key={cell}><GhostLine className={cell === 0 ? 'ghost-table-cell ghost-table-cell-wide' : 'ghost-table-cell'} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="kanban-board skeleton-board" role="status" aria-label="Görev panosu yükleniyor" aria-busy="true">
      {Array.from({ length: 4 }, (_, column) => (
        <section className="kanban-column skeleton-column" key={column} aria-hidden="true">
          <div className="kanban-heading">
            <GhostLine className="ghost-column-heading" />
            <GhostLine className="ghost-counter" />
          </div>
          <div className="kanban-cards">
            {Array.from({ length: column === 1 ? 3 : 2 }, (_, card) => (
              <SkeletonTaskCard key={card} index={column * 3 + card} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function TimelineSkeleton() {
  return (
    <div className="inline-skeleton-rows" role="status" aria-label="Görev geçmişi yükleniyor" aria-busy="true">
      {[0, 1, 2].map((row) => (
        <div className="inline-skeleton-row" key={row} aria-hidden="true">
          <GhostLine className="ghost-avatar" />
          <div className="inline-skeleton-copy">
            <GhostLine className="ghost-list-main" />
            <GhostLine className="ghost-subheading" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CommentListSkeleton() {
  return (
    <div className="inline-skeleton-rows" role="status" aria-label="Görev yorumları yükleniyor" aria-busy="true">
      {[0, 1, 2].map((row) => (
        <div className="skeleton-comment" key={row} aria-hidden="true">
          <div className="skeleton-comment-meta">
            <GhostLine className="ghost-avatar" />
            <GhostLine className="ghost-person" />
            <GhostLine className="ghost-date" />
          </div>
          <GhostLine className="ghost-task-title" />
          <GhostLine className="ghost-task-title ghost-task-title-short" />
        </div>
      ))}
    </div>
  );
}
