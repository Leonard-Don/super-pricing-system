import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';

describe('AppShell', () => {
  it('renders the three workspace nav links', () => {
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    expect(screen.getByRole('link', { name: '定价研究' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '上帝视角' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '研究工作台' })).toBeInTheDocument();
  });
});
