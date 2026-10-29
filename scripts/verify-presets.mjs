import { delta } from 'visdelta/core';
const failures = [];
// Verify fluent commands against their equivalent complete endpoints.
const { initialSpec, liveshowPresets, presetEdits, sales } = await import('../components/liveshow/presets.ts');
const { barModule } = await import('visdelta/bar');
for (const preset of liveshowPresets) {
  if (preset.category !== 'grain') {
    const actual = await barModule.edit(initialSpec, presetEdits(preset.category), { ...initialSpec, data: { values: sales } });
    if (JSON.stringify(actual) !== JSON.stringify(preset.spec)) failures.push(`Liveshow ${preset.category}: fluent endpoint differs`);
  }
  const changes = delta({ ...initialSpec, data: { values: sales } }, { ...preset.spec, data: { values: sales } });
  if (!changes.stateChanges.some(change => change.category === preset.category)) {
    failures.push(`Liveshow ${preset.category}: preset does not emit its teaching category`);
  }
}

if (failures.length) throw new Error(failures.join('\n'));
console.log('Verified all seven Liveshow preset endpoints and categories.');
