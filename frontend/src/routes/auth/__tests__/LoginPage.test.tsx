import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const post = vi.fn();
vi.mock('@/services/api/core', () => ({
  default: { post: (...a: unknown[]) => post(...a) },
  withTimeoutProfile: (_p: string, c: object = {}) => c,
}));

const setSession = vi.fn();
vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ setSession }),
}));

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

import LoginPage from '@/routes/auth/LoginPage';

describe('LoginPage', () => {
  beforeEach(() => {
    post.mockReset();
    setSession.mockReset();
    navigate.mockReset();
  });

  it('posts the backend-expected `subject` field (not `username`)', async () => {
    // Regression: backend LoginRequest requires `subject`; sending `username`
    // 422s on every attempt so login could never succeed.
    post.mockResolvedValue({ data: { access_token: 'a', refresh_token: 'r' } });
    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('用户名'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByPlaceholderText('密码'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    const [url, body] = post.mock.calls[0];
    expect(url).toBe('/infrastructure/auth/login');
    expect(body).toEqual({ subject: 'alice', password: 'pw' });
    expect(body).not.toHaveProperty('username');

    await waitFor(() => expect(setSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' }));
    expect(navigate).toHaveBeenCalledWith('/pricing', { replace: true });
  });

  it('renders the normalized string error message on failure (no crash)', async () => {
    post.mockRejectedValue({ userMessage: 'body.subject: Field required' });
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    await waitFor(() => expect(screen.getByText('body.subject: Field required')).toBeTruthy());
  });
});
