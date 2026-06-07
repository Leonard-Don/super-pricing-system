import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const spec = path.resolve(here, '../../docs/openapi.json');
const out = path.resolve(here, '../src/generated/api-types.ts');
execSync(`npx openapi-typescript "${spec}" -o "${out}"`, { stdio: 'inherit' });
console.log('Generated', out);
