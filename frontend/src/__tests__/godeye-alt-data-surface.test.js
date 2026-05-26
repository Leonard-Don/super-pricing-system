import fs from 'fs';
import path from 'path';

describe('GodEye alt-data diagnostic surface wiring', () => {
  it('mounts the advanced diagnostics tile in the alt-data section', () => {
    const sourcePath = path.join(__dirname, '../components/GodEyeDashboard/index.js');
    const source = fs.readFileSync(sourcePath, 'utf8');

    expect(source).toContain("import AltDataAdvancedDiagnosticsTile from './AltDataAdvancedDiagnosticsTile';");
    expect(source).toContain('<AltDataAdvancedDiagnosticsTile />');
  });
});
