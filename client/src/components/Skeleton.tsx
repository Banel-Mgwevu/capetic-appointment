interface SkeletonProps {
  /** Number of placeholder rows to render */
  rows?: number;
  /** Height of each row, e.g. for choice cards vs. slot buttons */
  rowHeight?: number;
}

/**
 * Shimmering placeholder shown while reference data or availability loads.
 * Reserves roughly the space the real content will take, so the layout
 * doesn't jump once it arrives.
 */
export function Skeleton({ rows = 3, rowHeight = 78 }: SkeletonProps) {
  return (
    <div className="skeleton-list" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-row" style={{ height: rowHeight }} />
      ))}
    </div>
  );
}
