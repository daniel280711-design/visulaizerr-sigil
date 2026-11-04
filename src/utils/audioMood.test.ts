/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioMoodAnalyzer } from './audioMood';
import { PALETTES } from './palettes';

test('AudioMoodAnalyzer handles silent frame gracefully', () => {
  const analyzer = new AudioMoodAnalyzer();
  const silentData = new Uint8Array(1024).fill(0);
  const features = analyzer.extractFeatures(silentData);

  assert.equal(features.rms, 0);
  const mood = analyzer.classifyMood(features, 120);
  assert.equal(mood.category, 'minimalist');
  assert.equal(mood.recommendedPaletteId, 'monochrome_silver');
});

test('AudioMoodAnalyzer identifies energetic heavy bass audio', () => {
  const analyzer = new AudioMoodAnalyzer();
  const bassHeavy = new Uint8Array(1024).fill(10);
  // Heavy sub & kick
  for (let i = 1; i <= 20; i++) {
    bassHeavy[i] = 230;
  }

  const features = analyzer.extractFeatures(bassHeavy);
  assert.ok(features.bassEnergy > 0.4, `Bass ratio should be > 0.4, got ${features.bassEnergy}`);

  const mood = analyzer.classifyMood(features, 130);
  assert.equal(mood.category, 'energetic');
  assert.ok(PALETTES[mood.recommendedPaletteId]);
  // Verify it never defaults to a harsh neon blue
  assert.notEqual(mood.recommendedPaletteId, 'neon_cyan');
});

test('AudioMoodAnalyzer maps euphoric bright highs correctly', () => {
  const analyzer = new AudioMoodAnalyzer();
  const brightAudio = new Uint8Array(1024).fill(5);
  // High frequencies (air, shimmer, strings)
  for (let i = 200; i < 600; i++) {
    brightAudio[i] = 180;
  }

  const features = analyzer.extractFeatures(brightAudio);
  assert.ok(features.spectralCentroid > 0.4, `Centroid should be bright, got ${features.spectralCentroid}`);

  const mood = analyzer.classifyMood(features, 120);
  assert.equal(mood.category, 'euphoric');
  assert.ok(PALETTES[mood.recommendedPaletteId]);
});
