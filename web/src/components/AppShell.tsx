import { NavLink, Outlet } from 'react-router-dom';

const NAV = [
  { to: '/pricing', label: '定价研究' },
  { to: '/godeye', label: '上帝视角' },
  { to: '/workbench', label: '研究工作台' },
];

export function AppShell() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3">
        <span className="w-3 h-3 rounded bg-primary" />
        <span className="font-bold">超级定价系统</span>
        <span className="text-[10px] text-primary border border-primary rounded-full px-2 py-[1px] bg-primary/10">v5</span>
      </header>
      <div className="flex flex-1 min-h-0">
        <nav aria-label="主导航" className="w-[220px] border-r border-border bg-card p-3 flex flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `px-3 py-2 rounded-md text-sm ${isActive ? 'bg-primary/10 text-primary font-bold' : 'text-muted-foreground hover:text-foreground'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <main className="flex-1 min-w-0 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
