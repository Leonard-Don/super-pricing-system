import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Reveal } from '@/components/command/Reveal';

describe('Reveal', () => {
  it('renders children and the reveal class', () => {
    render(<Reveal>hello</Reveal>);
    const el = screen.getByText('hello');
    expect(el.className).toMatch(/cmd-reveal/);
  });
  it('applies the stagger delay as an inline animation-delay', () => {
    render(<Reveal delay={120}>x</Reveal>);
    expect((screen.getByText('x') as HTMLElement).style.animationDelay).toBe('120ms');
  });
  it('renders as the requested element', () => {
    render(<Reveal as="li">item</Reveal>);
    expect(screen.getByText('item').tagName).toBe('LI');
  });
});
