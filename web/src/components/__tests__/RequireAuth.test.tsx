import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthContext';
import { RequireAuth } from '@/components/RequireAuth';
import { setApiAuthToken } from '@/services/api/core';

function renderWithToken(token: string) {
  setApiAuthToken(token);
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/secret']}>
        <Routes>
          <Route path="/login" element={<div>LOGIN PAGE</div>} />
          <Route
            path="/secret"
            element={
              <RequireAuth>
                <div>SECRET CONTENT</div>
              </RequireAuth>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('RequireAuth', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setApiAuthToken('');
  });

  it('redirects to /login when unauthenticated', () => {
    renderWithToken('');
    expect(screen.queryByText('SECRET CONTENT')).toBeNull();
    expect(screen.getByText('LOGIN PAGE')).toBeTruthy();
  });

  it('renders children when authenticated', () => {
    renderWithToken('valid-token');
    expect(screen.getByText('SECRET CONTENT')).toBeTruthy();
    expect(screen.queryByText('LOGIN PAGE')).toBeNull();
  });
});
