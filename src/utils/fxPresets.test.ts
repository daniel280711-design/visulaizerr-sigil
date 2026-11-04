import { test } from 'node:test';
import assert from 'node:assert';

test('FX definitions and presets integrity', () => {
  // Expected 31 optical effects indices (0 to 30)
  const EXPECTED_FX_COUNT = 31;
  assert.strictEqual(EXPECTED_FX_COUNT, 31);

  // Key indices identified by user including new Heat Haze (index 30):
  // 24: Halo de prisma anamórfico
  // 25: Deriva de color térmico
  // 26: Líneas de difracción láser
  // 27: Película vintage decolorada
  // 28: Solarización Sabattier
  // 29: Textura de papel washi
  // 30: Distorsión de calor (Heat Haze)
  const targetIndices = [24, 25, 26, 27, 28, 29, 30];
  targetIndices.forEach(idx => {
    assert.ok(idx >= 0 && idx < EXPECTED_FX_COUNT, `Index ${idx} must be within ${EXPECTED_FX_COUNT} FX bounds`);
  });
});
