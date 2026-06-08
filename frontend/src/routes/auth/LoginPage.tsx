import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { withTimeoutProfile } from '@/services/api/core';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { GlassPanel, TacticalBackdrop, Reveal } from '@/components/command';

export default function LoginPage() {
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.post<{ access_token: string; refresh_token?: string }>(
        '/infrastructure/auth/login',
        // Backend LoginRequest expects `subject` (not `username`); see
        // backend/app/api/v1/endpoints/infrastructure/auth_routes.py:LoginRequest.
        { subject: username, password },
        withTimeoutProfile('standard'),
      );
      setSession(res.data);
      navigate('/pricing', { replace: true });
    } catch (err) {
      setError((err as { userMessage?: string }).userMessage ?? '登录失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="relative overflow-hidden min-h-screen bg-background text-foreground flex items-center justify-center p-6"
      style={{ background: 'var(--cmd-grad), var(--background)' }}
    >
      <TacticalBackdrop grid radar />
      <Reveal>
        <GlassPanel className="w-[360px] p-7 shadow-[0_24px_70px_-24px_var(--cmd-glow-amber)]">
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
                ◢ 宏观错价指挥台
              </div>
              <h1 className="mt-1.5 text-xl font-bold tracking-tight">超级定价系统</h1>
              <p className="mt-1 text-xs text-[var(--cmd-ink2)]">A 股 / 港股 / 美股 · 量化定价研究平台</p>
            </div>
            <input
              className="rounded-md border border-[var(--cmd-glass-border)] bg-secondary/60 px-3 py-2 text-sm outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/40"
              placeholder="用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              type="password"
              className="rounded-md border border-[var(--cmd-glass-border)] bg-secondary/60 px-3 py-2 text-sm outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/40"
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <p className="text-neg text-xs">{error}</p>}
            <Button
              type="submit"
              disabled={busy}
              className="shadow-[0_8px_24px_-8px_var(--cmd-glow-amber)]"
            >
              {busy ? '登录中…' : '登录'}
            </Button>
          </form>
        </GlassPanel>
      </Reveal>
    </div>
  );
}
