import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton for the PageHeading component with matching height and typography rhythm.
 */
export function PageHeadingSkeleton({
  hasEyebrow = true,
  hasActions = true,
}: {
  hasEyebrow?: boolean;
  hasActions?: boolean;
}) {
  return (
    <div className="page-heading" aria-hidden="true" style={{ minHeight: '66px' }}>
      <div>
        {hasEyebrow && (
          <Skeleton className="h-3 w-28 mb-2.5 rounded-full bg-[#ebd5db]" />
        )}
        <Skeleton className="h-8 md:h-10 w-64 md:w-80 mb-2 rounded-lg bg-[#e2c7cf]" />
        <Skeleton className="h-3.5 w-80 max-w-full rounded bg-[#f2e2e6]" />
      </div>
      {hasActions && (
        <div className="page-actions hidden sm:flex gap-2">
          <Skeleton className="h-10 w-32 rounded-lg bg-[#ebd5db]" />
          <Skeleton className="h-10 w-32 rounded-lg bg-[#f0e2e5]" />
        </div>
      )}
    </div>
  );
}

/**
 * Skeleton for the 6-card or 4-card KPI summary grid.
 * Uses the exact .kpi-grid and .kpi-card CSS classes to ensure zero layout shift.
 */
export function KpiGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <section className="kpi-grid" aria-label="Loading summary" aria-hidden="true">
      {Array.from({ length: count }).map((_, idx) => (
        <div className="kpi-card pointer-events-none" key={idx} style={{ minHeight: '106px' }}>
          <div className="kpi-icon" style={{ background: '#f8e6ea' }}>
            <Skeleton className="w-5 h-5 rounded-md bg-[#e4cad1]" />
          </div>
          <Skeleton className="h-3 w-24 rounded bg-[#e8d2d9]" />
          <Skeleton className="h-7 w-16 my-1 rounded bg-[#dfb9c3]" />
          <Skeleton className="h-2.5 w-28 rounded bg-[#f0e1e5]" />
        </div>
      ))}
    </section>
  );
}

/**
 * Skeleton for the main 2-column overview grid:
 * - Left: Lifecycle Activity Bar Chart panel (height: 230px chart-box)
 * - Right: Status Distribution Donut panel (height: 190px donut-wrap)
 */
export function OverviewChartsSkeleton() {
  return (
    <div className="overview-grid" aria-hidden="true">
      {/* Chart Panel Skeleton */}
      <section className="panel chart-panel">
        <div className="panel-heading">
          <div>
            <Skeleton className="h-3 w-44 mb-2 rounded bg-[#ebd5db]" />
            <Skeleton className="h-5 w-56 mb-1.5 rounded bg-[#dfb9c3]" />
            <Skeleton className="h-3 w-72 rounded bg-[#f2e2e6]" />
          </div>
          <Skeleton className="h-3.5 w-28 rounded bg-[#ebd5db]" />
        </div>
        <div className="chart-box flex items-end gap-3 pt-6 px-4" style={{ height: '230px' }}>
          {[40, 65, 30, 80, 55, 70].map((h, idx) => (
            <div key={idx} className="flex-1 flex flex-col justify-end items-center gap-2 h-full">
              <Skeleton
                className="w-full rounded-t-md bg-[#ebd5db]"
                style={{ height: `${h}%` }}
              />
              <Skeleton className="h-2.5 w-8 rounded bg-[#f2e2e6]" />
            </div>
          ))}
        </div>
      </section>

      {/* Distribution Panel Skeleton */}
      <section className="panel distribution-panel">
        <div className="panel-heading">
          <div>
            <Skeleton className="h-3 w-36 mb-2 rounded bg-[#ebd5db]" />
            <Skeleton className="h-5 w-44 mb-1.5 rounded bg-[#dfb9c3]" />
            <Skeleton className="h-3 w-60 rounded bg-[#f2e2e6]" />
          </div>
        </div>
        <div className="donut-wrap flex items-center justify-center" style={{ height: '190px' }}>
          <div className="w-36 h-36 rounded-full border-8 border-[#ebd5db] border-t-[#dfabb9] animate-pulse" />
        </div>
        <div className="distribution-legend mt-2">
          {[1, 2, 3, 4].map(idx => (
            <div key={idx} className="flex items-center gap-2 py-1">
              <Skeleton className="w-2.5 h-2.5 rounded-full bg-[#dfabb9]" />
              <Skeleton className="h-3 w-20 rounded bg-[#f0e2e5]" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * Skeleton for the lower 2-column overview grid:
 * - Left: Upcoming Milestones (event list)
 * - Right: Touchpoint Activity
 */
export function OverviewLowerGridSkeleton() {
  return (
    <div className="overview-grid lower-grid" aria-hidden="true">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <Skeleton className="h-3 w-40 mb-2 rounded bg-[#ebd5db]" />
            <Skeleton className="h-5 w-48 mb-1.5 rounded bg-[#dfb9c3]" />
            <Skeleton className="h-3 w-64 rounded bg-[#f2e2e6]" />
          </div>
        </div>
        <div className="event-list mt-3 flex flex-col gap-2">
          {[1, 2, 3, 4].map(idx => (
            <div key={idx} className="event-item flex items-center gap-3">
              <span className="event-node" />
              <div className="event-copy flex-1">
                <Skeleton className="h-3.5 w-36 mb-1 rounded bg-[#dfb9c3]" />
                <Skeleton className="h-3 w-48 rounded bg-[#f2e2e6]" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full bg-[#ebd5db]" />
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <Skeleton className="h-3 w-36 mb-2 rounded bg-[#ebd5db]" />
            <Skeleton className="h-5 w-44 mb-1.5 rounded bg-[#dfb9c3]" />
            <Skeleton className="h-3 w-56 rounded bg-[#f2e2e6]" />
          </div>
        </div>
        <div className="quick-links mt-3 flex flex-col gap-2">
          {[1, 2, 3, 4].map(idx => (
            <Skeleton key={idx} className="h-9 w-full rounded-lg bg-[#f7eff1]" />
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * Full page skeleton for Overview dashboard.
 */
export function OverviewSkeleton() {
  return (
    <div className="overview-skeleton-container" aria-busy="true">
      <PageHeadingSkeleton />
      <KpiGridSkeleton count={6} />
      <OverviewChartsSkeleton />
      <OverviewLowerGridSkeleton />
    </div>
  );
}

/**
 * Full page skeleton for PersonalDashboard.
 */
export function PersonalDashboardSkeleton() {
  return (
    <div className="personal-dashboard-skeleton" aria-busy="true">
      <PageHeadingSkeleton hasActions={false} />
      <KpiGridSkeleton count={4} />
      <div className="overview-grid" aria-hidden="true">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <Skeleton className="h-3 w-32 mb-2 rounded bg-[#ebd5db]" />
              <Skeleton className="h-5 w-44 mb-1.5 rounded bg-[#dfb9c3]" />
              <Skeleton className="h-3 w-64 rounded bg-[#f2e2e6]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            {[1, 2, 3, 4].map(idx => (
              <div key={idx} className="p-3 bg-[#fdfbfa] rounded-lg border border-[#ebdada]">
                <Skeleton className="h-2.5 w-16 mb-1.5 rounded bg-[#ebd5db]" />
                <Skeleton className="h-4 w-28 rounded bg-[#dfb9c3]" />
              </div>
            ))}
          </div>
          <div className="event-list mt-6 flex flex-col gap-2">
            {[1, 2, 3].map(idx => (
              <div key={idx} className="event-item flex items-center gap-3">
                <span className="event-node" />
                <div className="event-copy flex-1">
                  <Skeleton className="h-3.5 w-40 mb-1 rounded bg-[#dfb9c3]" />
                  <Skeleton className="h-3 w-56 rounded bg-[#f2e2e6]" />
                </div>
                <Skeleton className="h-5 w-14 rounded-full bg-[#ebd5db]" />
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-col gap-5">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <Skeleton className="h-3 w-32 mb-2 rounded bg-[#ebd5db]" />
                <Skeleton className="h-5 w-40 mb-1.5 rounded bg-[#dfb9c3]" />
              </div>
            </div>
            <div className="flex flex-col gap-3 mt-3">
              {[1, 2, 3, 4].map(idx => (
                <div key={idx} className="flex justify-between py-2 border-b border-[#f3e8e8]">
                  <Skeleton className="h-3 w-20 rounded bg-[#ebd5db]" />
                  <Skeleton className="h-3 w-32 rounded bg-[#dfb9c3]" />
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <Skeleton className="h-3 w-32 mb-2 rounded bg-[#ebd5db]" />
                <Skeleton className="h-5 w-44 mb-1.5 rounded bg-[#dfb9c3]" />
              </div>
            </div>
            <div className="event-list mt-3 flex flex-col gap-2">
              {[1, 2].map(idx => (
                <div key={idx} className="event-item flex items-center gap-3">
                  <span className="event-node" />
                  <div className="event-copy flex-1">
                    <Skeleton className="h-3.5 w-32 mb-1 rounded bg-[#dfb9c3]" />
                    <Skeleton className="h-3 w-48 rounded bg-[#f2e2e6]" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/**
 * Shell-level skeleton for React.lazy route fallbacks.
 * Matches .dashboard-frame, .dashboard-shell, .dash-sidebar, .dash-topbar, and .dash-content.
 * This guarantees zero layout shift while the dashboard chunk is being downloaded.
 */
export function DashboardShellSkeleton() {
  return (
    <div className="dashboard-frame" aria-busy="true">
      <div className="dashboard-shell">
        <aside className="dash-sidebar pointer-events-none" aria-hidden="true">
          <div className="dash-brand flex items-center gap-2.5 px-3 py-2">
            <span className="dash-brand-symbol" aria-hidden="true"><i /><i /><i /></span>
            <span className="dash-brand-name">people<span>journey</span><small>WORKSPACE</small></span>
          </div>
          <div className="workspace-label">PERSONAL WORKSPACE</div>
          <div className="dash-nav flex flex-col gap-4 mt-2 px-2">
            {[1, 2].map(grp => (
              <div key={grp} className="flex flex-col gap-2">
                <Skeleton className="h-2.5 w-20 rounded bg-[#e8cfd6]/70 mb-1" />
                {[1, 2, 3].map(lnk => (
                  <div key={lnk} className="h-9 rounded-lg bg-[#faedf0]/60 flex items-center gap-2.5 px-3">
                    <Skeleton className="w-4 h-4 rounded bg-[#e4cad1]" />
                    <Skeleton className="h-3 w-24 rounded bg-[#e4cad1]" />
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="sidebar-foot mt-auto p-3 flex items-center gap-2.5">
            <Skeleton className="w-8 h-8 rounded-full bg-[#ebd5db]" />
            <div className="flex flex-col gap-1.5 flex-1">
              <Skeleton className="h-3 w-20 rounded bg-[#ebd5db]" />
              <Skeleton className="h-2 w-28 rounded bg-[#f0e2e5]" />
            </div>
          </div>
        </aside>

        <main className="dash-main">
          <header className="dash-topbar flex items-center justify-between px-6 py-3 border-b border-[#eee4e4]">
            <div className="breadcrumbs flex items-center gap-2">
              <Skeleton className="h-3.5 w-28 rounded bg-[#ebd5db]" />
              <span className="text-stone-300">/</span>
              <Skeleton className="h-3.5 w-20 rounded bg-[#dfb9c3]" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-48 rounded-lg bg-[#f6ebed]" />
              <Skeleton className="w-8 h-8 rounded-lg bg-[#f6ebed]" />
              <Skeleton className="w-24 h-7 rounded-full bg-[#f6ebed]" />
            </div>
          </header>

          <div className="dash-content">
            <OverviewSkeleton />
          </div>
        </main>
      </div>
    </div>
  );
}
