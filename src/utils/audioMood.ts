/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PALETTES, ColorPalette } from './palettes';

export type MoodCategory = 'energetic' | 'euphoric' | 'ambient' | 'melancholic' | 'mystic' | 'minimalist';

export interface AudioFeatures {
  spectralCentroid: number; // 0 (dark/sub-bass) to 1 (bright/treble)
  bassEnergy: number; // 0 to 1
  midEnergy: number; // 0 to 1
  trebleEnergy: number; // 0 to 1
  rms: number; // 0 to 1
  spectralFlux: number; // 0 to 1 (rate of change)
}

export interface AudioMood {
  category: MoodCategory;
  label: string;
  description: string;
  recommendedPaletteId: string;
  confidence: number;
}

const MOOD_PALETTE_MAPPINGS: Record<MoodCategory, string[]> = {
  energetic: ['cyber_velvet', 'solar_flare', 'tokyo_rain'],
  euphoric: ['celestial_gold', 'solar_flare'],
  ambient: ['bioluminescence', 'nordic_aurora', 'monochrome_silver'],
  melancholic: ['ethereal_dusk', 'tokyo_rain', 'monochrome_silver'],
  mystic: ['ethereal_dusk', 'nordic_aurora', 'celestial_gold'],
  minimalist: ['monochrome_silver', 'tokyo_rain'],
};

export class AudioMoodAnalyzer {
  private prevFreqData: Uint8Array | null = null;
  private historyCentroids: number[] = [];
  private historyRms: number[] = [];
  private historyMax = 30; // ~0.5 second smoothing

  /**
   * Extract spectral features from raw frequency data
   */
  public extractFeatures(freqData: Uint8Array, sampleRate = 44100): AudioFeatures {
    const len = freqData.length;
    if (len === 0) {
      return {
        spectralCentroid: 0.5,
        bassEnergy: 0,
        midEnergy: 0,
        trebleEnergy: 0,
        rms: 0,
        spectralFlux: 0,
      };
    }

    const nyquist = sampleRate / 2;
    const binWidth = nyquist / len;

    let weightedSum = 0;
    let magnitudeSum = 0;
    let sumSquares = 0;
    let fluxSum = 0;

    // Energy band bins
    const bassEndBin = Math.min(len - 1, Math.floor(250 / binWidth));
    const midEndBin = Math.min(len - 1, Math.floor(2500 / binWidth));

    let bassSum = 0;
    let midSum = 0;
    let trebleSum = 0;

    for (let i = 0; i < len; i++) {
      const mag = freqData[i] / 255.0;
      const freq = i * binWidth;

      weightedSum += freq * mag;
      magnitudeSum += mag;
      sumSquares += mag * mag;

      if (i <= bassEndBin) {
        bassSum += mag;
      } else if (i <= midEndBin) {
        midSum += mag;
      } else {
        trebleSum += mag;
      }

      if (this.prevFreqData && this.prevFreqData.length === len) {
        const prevMag = this.prevFreqData[i] / 255.0;
        const diff = mag - prevMag;
        if (diff > 0) fluxSum += diff;
      }
    }

    // Save previous frame
    if (!this.prevFreqData || this.prevFreqData.length !== len) {
      this.prevFreqData = new Uint8Array(len);
    }
    this.prevFreqData.set(freqData);

    const centroidHz = magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
    const normalizedCentroid = Math.min(1, Math.max(0, centroidHz / 5000));
    const rms = Math.sqrt(sumSquares / len);

    const numBassBins = Math.max(1, bassEndBin + 1);
    const numMidBins = Math.max(1, midEndBin - bassEndBin);
    const numTrebleBins = Math.max(1, len - 1 - midEndBin);

    const bassDensity = bassSum / numBassBins;
    const midDensity = midSum / numMidBins;
    const trebleDensity = trebleSum / numTrebleBins;

    const totalDensity = bassDensity + midDensity + trebleDensity + 0.0001;
    const bassRatio = bassDensity / totalDensity;
    const midRatio = midDensity / totalDensity;
    const trebleRatio = trebleDensity / totalDensity;
    const normalizedFlux = Math.min(1, fluxSum / (len * 0.15));

    // Smooth centroid & RMS
    this.historyCentroids.push(normalizedCentroid);
    this.historyRms.push(rms);
    if (this.historyCentroids.length > this.historyMax) this.historyCentroids.shift();
    if (this.historyRms.length > this.historyMax) this.historyRms.shift();

    const smoothCentroid =
      this.historyCentroids.reduce((a, b) => a + b, 0) / this.historyCentroids.length;
    const smoothRms = this.historyRms.reduce((a, b) => a + b, 0) / this.historyRms.length;

    return {
      spectralCentroid: smoothCentroid,
      bassEnergy: bassRatio,
      midEnergy: midRatio,
      trebleEnergy: trebleRatio,
      rms: smoothRms,
      spectralFlux: normalizedFlux,
    };
  }

  /**
   * Classify audio mood and recommend harmonious palette
   */
  public classifyMood(features: AudioFeatures, currentBpm = 120): AudioMood {
    // If audio is practically silent
    if (features.rms < 0.015) {
      return {
        category: 'minimalist',
        label: 'Calm Silence',
        description: 'Deep silent pause or minimal ambient floor',
        recommendedPaletteId: 'monochrome_silver',
        confidence: 0.9,
      };
    }

    // Heuristics:
    // 1. Energetic: punchy bass, high flux, or driving tempo (>124 BPM)
    if (features.bassEnergy > 0.35 && (features.rms > 0.08 || currentBpm >= 122 || features.spectralFlux > 0.25)) {
      const paletteCandidates = MOOD_PALETTE_MAPPINGS.energetic;
      const paletteId = paletteCandidates[Math.floor((features.spectralCentroid * 10) % paletteCandidates.length)];
      return {
        category: 'energetic',
        label: 'High Energy & Drive',
        description: 'Vibrant punchy bass with rhythmic intensity',
        recommendedPaletteId: paletteId,
        confidence: 0.88,
      };
    }

    // 2. Euphoric: bright centroid, rich mid/trebles, moderate-to-high RMS
    if (features.spectralCentroid > 0.35 && features.trebleEnergy > 0.22 && features.rms > 0.05) {
      const paletteCandidates = MOOD_PALETTE_MAPPINGS.euphoric;
      const paletteId = paletteCandidates[Math.floor((features.spectralCentroid * 10) % paletteCandidates.length)];
      return {
        category: 'euphoric',
        label: 'Euphoric & Uplifting',
        description: 'Radiant harmonic highs and uplifting acoustic warmth',
        recommendedPaletteId: paletteId,
        confidence: 0.84,
      };
    }

    // 3. Melancholic / Deep: dark centroid, low-mid dominance, slower BPM
    if (features.spectralCentroid < 0.25 && features.midEnergy > 0.32) {
      const paletteCandidates = MOOD_PALETTE_MAPPINGS.melancholic;
      const paletteId = paletteCandidates[Math.floor((features.midEnergy * 10) % paletteCandidates.length)];
      return {
        category: 'melancholic',
        label: 'Melancholic Resonance',
        description: 'Introspective low-mid tones and nocturnal velvet depth',
        recommendedPaletteId: paletteId,
        confidence: 0.8,
      };
    }

    // 4. Ambient: low flux, low-to-moderate RMS, spacious sound
    if (features.spectralFlux < 0.15 && features.rms < 0.1) {
      const paletteCandidates = MOOD_PALETTE_MAPPINGS.ambient;
      const paletteId = paletteCandidates[Math.floor((features.spectralCentroid * 10) % paletteCandidates.length)];
      return {
        category: 'ambient',
        label: 'Dreamy Ambient',
        description: 'Gentle atmospheric swells and organic bioluminescence',
        recommendedPaletteId: paletteId,
        confidence: 0.82,
      };
    }

    // 5. Mystic / Ethereal: balanced harmonic richness
    const paletteCandidates = MOOD_PALETTE_MAPPINGS.mystic;
    const paletteId = paletteCandidates[Math.floor((features.bassEnergy * 10) % paletteCandidates.length)];
    return {
      category: 'mystic',
      label: 'Ethereal Harmony',
      description: 'Layered frequencies resonating in cosmic equilibrium',
      recommendedPaletteId: paletteId,
      confidence: 0.75,
    };
  }

  public getPaletteForMood(mood: AudioMood): ColorPalette {
    return PALETTES[mood.recommendedPaletteId] || PALETTES['monochrome_silver'];
  }
}
