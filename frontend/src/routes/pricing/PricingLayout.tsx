import { NavLink, Outlet } from 'react-router-dom';

const SUB_NAV = [
  { to: '/pricing', label: '分析', end: true },
  { to: '/pricing/valuation', label: '估值历史', end: false },
  { to: '/pricing/factors', label: '自定义因子', end: false },
];

export function PricingLayout() {
  return (
    <div className="flex flex-col h-full">
      <nav
        aria-label="定价研究子导航"
        className="flex gap-1 px-4 pt-3 pb-0 border-b border-border bg-card"
      >
        {SUB_NAV.map(({ to, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `px-4 py-2 text-sm rounded-t-md border-b-2 -mb-px transition-colors ${
                isActive
                  ? 'text-primary border-primary bg-primary/10 font-semibold'
                  : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-primary/5'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="flex-1 min-h-0 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
