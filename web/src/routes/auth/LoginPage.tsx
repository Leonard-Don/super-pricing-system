import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { withTimeoutProfile } from '@/services/api/core';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/button';

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
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <form onSubmit={onSubmit} className="bg-card border border-border rounded-lg p-6 w-80 flex flex-col gap-3">
        <h1 className="text-primary font-bold text-lg">超级定价系统</h1>
        <input
          className="bg-secondary border border-border rounded-md px-3 py-2 text-sm"
          placeholder="用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="password"
          className="bg-secondary border border-border rounded-md px-3 py-2 text-sm"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-neg text-xs">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? '登录中…' : '登录'}</Button>
      </form>
    </div>
  );
}
