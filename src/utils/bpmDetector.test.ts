/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { BpmDetector } from './bpmDetector';

test('BpmDetector initializes with sensible defaults', () => {
  const detector = new BpmDetector();
  assert.equal(detector.getSensitivity(), 1.35);

  detector.setSensitivity(1.8);
  assert.equal(detector.getSensitivity(), 1.8);

  detector.setSensitivity(0.5); // clamps to 1.05
  assert.equal(detector.getSensitivity(), 1.05);
});

test('BpmDetector accurately computes BPM from periodic pulse trains', () => {
  const detector = new BpmDetector(1.2);
  const sampleRate = 44100;
  const fftSize = 2048;
  const targetBpm = 120; // 0.5s interval
  const beatInterval = 60 / targetBpm; // 0.5s

  const silentFrame = new Uint8Array(1024).fill(2);
  const kickFrame = new Uint8Array(1024);
  // Put high energy in kick bins (around bins 2 to 7)
  for (let i = 2; i <= 7; i++) {
    kickFrame[i] = 240;
  }

  let currentTime = 0;
  const fps = 60;
  const dt = 1 / fps;
  let detectedBeats = 0;

  // Simulate 8 seconds of 120 BPM audio (kick every 30 frames at 60fps)
  for (let frame = 0; frame < 480; frame++) {
    currentTime = frame * dt;
    // Kick lasts 3 frames with decay
    const kickAge = frame % 30;
    const isKick = kickAge < 3;
    const frameData = new Uint8Array(1024);
    if (isKick) {
      const amp = Math.max(80, 240 - kickAge * 50);
      for (let i = 2; i <= 7; i++) {
        frameData[i] = amp;
      }
    } else {
      frameData.fill(4);
    }

    const state = detector.processFrame(frameData, currentTime, sampleRate, fftSize);
    if (state.isBeat) {
      detectedBeats++;
    }
  }

  // 8 seconds at 120 BPM should yield around 15-16 beats
  assert.ok(detectedBeats >= 12, `Expected at least 12 beats, got ${detectedBeats}`);

  // Test tap tempo
  const tapTimes = [1.0, 1.5, 2.0, 2.5, 3.0]; // 120 BPM
  let finalTap = 0;
  for (const t of tapTimes) {
    finalTap = detector.tap(t);
  }
  assert.equal(finalTap, 120);
});
