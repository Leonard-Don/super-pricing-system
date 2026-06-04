import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { setApiAuthToken } from '@/services/api/core';

function Probe() {
  const { isAuthenticated, setSession, logout } = useAuth();
  return (
    <div>
      <span data-testid="state">{isAuthenticated ? 'in' : 'out'}</span>
      <button onClick={() => setSession({ access_token: 'a', refresh_token: 'r' })}>login</button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setApiAuthToken('');
  });

  it('reflects login and logout', async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByTestId('state').textContent).toBe('out');
    await act(async () => { screen.getByText('login').click(); });
    expect(screen.getByTestId('state').textContent).toBe('in');
    await act(async () => { screen.getByText('logout').click(); });
    expect(screen.getByTestId('state').textContent).toBe('out');
  });
});
