import { describe, it, expectTypeOf } from 'vitest';
import type { paths } from '@/generated/api-types';

// Contract-drift guard. Indexing `paths` with a route literal is checked by
// `tsc --noEmit` (the CI gate): if a registered public route is removed from
// docs/openapi.json and types are regenerated, these lines fail to compile.
// See docs/public_route_surface_registry.md for the route surface.
describe('generated api types', () => {
  it('exposes registered public pricing routes', () => {
    expectTypeOf<paths['/pricing/factor-model']>().not.toBeNever();
    expectTypeOf<paths['/pricing/valuation']>().not.toBeNever();
  });
});
