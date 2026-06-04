import { describe, it, expect } from 'vitest';
import { ping } from '@/lib/ping';

describe('test harness', () => {
  it('runs and resolves alias imports', () => {
    expect(ping()).toBe('pong');
  });
});
