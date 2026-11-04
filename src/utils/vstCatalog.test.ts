import { test } from 'node:test';
import assert from 'node:assert';
import { VST_CATALOG } from '../vstCatalog.ts';

test('VST Catalog has exactly 60 distinct instruments', () => {
  assert.strictEqual(VST_CATALOG.length, 60);

  const ids = new Set<string>();
  const nums = new Set<string>();

  VST_CATALOG.forEach(vst => {
    assert.ok(vst.id, 'Instrument must have an ID');
    assert.ok(!ids.has(vst.id), `Duplicate VST ID detected: ${vst.id}`);
    ids.add(vst.id);

    assert.ok(vst.num, 'Instrument must have a sequence number');
    assert.ok(!nums.has(vst.num), `Duplicate VST number detected: ${vst.num}`);
    nums.add(vst.num);

    assert.ok(vst.title && vst.title.length > 2, `Instrument ${vst.id} must have a valid title`);
    assert.ok(vst.w >= 200 && vst.w <= 600, `Instrument ${vst.id} width must be in range`);
    assert.ok(vst.h >= 140 && vst.h <= 400, `Instrument ${vst.id} height must be in range`);
    assert.strictEqual(typeof vst.draw, 'function', `Instrument ${vst.id} must have a valid draw function`);
  });
});

test('VST Catalog categories and priority favorites are preserved', () => {
  // Check the 4 highlighted favorites
  const favIds = ['rack', 'cym', 'vec', 'osc'];
  favIds.forEach(fid => {
    const vst = VST_CATALOG.find(x => x.id === fid);
    assert.ok(vst, `Favorite instrument ${fid} must exist`);
    assert.strictEqual(vst.isFavorite, true, `Instrument ${fid} must be marked as favorite`);
  });

  // Check the 3 secondary/reorganized instruments are present in their target categories
  const fallingSpec = VST_CATALOG.find(x => x.id === 'fallingspec');
  assert.ok(fallingSpec, 'Espectrograma de Caída must exist in catalog');
  assert.strictEqual(fallingSpec.catIndex, 5, 'Espectrograma de Caída must be in category 5 (Acústica & Diagnóstico Máster)');

  const stereoField = VST_CATALOG.find(x => x.id === 'stereofield');
  assert.ok(stereoField, 'Campo Estéreo must exist in catalog');
  assert.strictEqual(stereoField.catIndex, 2, 'Campo Estéreo must be in category 2 (Imagen Estéreo & Fase)');

  const noteRadar = VST_CATALOG.find(x => x.id === 'noteradar');
  assert.ok(noteRadar, 'Radar de Notas must exist in catalog');
  assert.strictEqual(noteRadar.catIndex, 4, 'Radar de Notas must be in category 4 (Estructura & Música)');

  // Verify all 6 categories have exactly 10 instruments each (total 60)
  for (let c = 0; c < 6; c++) {
    const items = VST_CATALOG.filter(x => x.catIndex === c);
    assert.strictEqual(items.length, 10, `Category ${c} must contain exactly 10 instruments`);
  }
});
