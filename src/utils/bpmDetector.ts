/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface BpmState {
  bpm: number;
  confidence: number; // 0 to 1
  isBeat: boolean;
  beatProgress: number; // 0 to 1 within estimated beat period
  lastBeatTime: number;
}

export class BpmDetector {
  private energyHistory: number[] = [];
  private historySize = 45; // ~0.75 seconds at 60fps
  private onsetTimes: number[] = [];
  private maxOnsetHistory = 24;
  private minInterval = 0.24; // 250 BPM max
  private maxInterval = 1.33; // 45 BPM min
  private lastOnsetTime = 0;
  private currentBpm = 120;
  private confidence = 0;
  private sensitivity = 1.35;
  private beatProgress = 0;

  // Manual tap tempo tracking
  private tapTimes: number[] = [];

  constructor(sensitivity = 1.35) {
    this.sensitivity = sensitivity;
  }

  public setSensitivity(value: number): void {
    this.sensitivity = Math.max(1.05, Math.min(2.5, value));
  }

  public getSensitivity(): number {
    return this.sensitivity;
  }

  /**
   * Process a new audio frame
   * @param freqData Uint8Array of frequency bins
   * @param currentTime Current audio or wall clock time in seconds
   * @param sampleRate Sample rate in Hz (default 44100)
   * @param fftSize FFT size (default 2048)
   */
  public processFrame(
    freqData: Uint8Array,
    currentTime: number,
    sampleRate = 44100,
    fftSize = 2048
  ): BpmState {
    // Extract low-frequency energy (kick & sub-bass: ~40Hz to 140Hz)
    // binHz = sampleRate / fftSize (~21.5 Hz per bin at 44100/2048)
    const binWidth = sampleRate / fftSize;
    const startBin = Math.max(1, Math.floor(40 / binWidth));
    const endBin = Math.min(freqData.length - 1, Math.ceil(150 / binWidth));

    // Calculate root-mean-square energy of low-end
    let instantEnergy = 0;
    let count = 0;
    for (let i = startBin; i <= endBin; i++) {
      const val = freqData[i] / 255.0;
      instantEnergy += val * val;
      count++;
    }
    instantEnergy = count > 0 ? Math.sqrt(instantEnergy / count) : 0;

    // Calculate energy history statistics
    let avgEnergy = 0;
    let variance = 0;
    if (this.energyHistory.length > 0) {
      const sum = this.energyHistory.reduce((acc, v) => acc + v, 0);
      avgEnergy = sum / this.energyHistory.length;
      const varSum = this.energyHistory.reduce((acc, v) => acc + (v - avgEnergy) ** 2, 0);
      variance = varSum / this.energyHistory.length;
    }

    // Dynamic threshold: moving average + C * stdDev
    const stdDev = Math.sqrt(variance);
    const threshold = Math.max(0.06, avgEnergy + stdDev * (this.sensitivity * 0.9));
    const timeSinceLast = currentTime - this.lastOnsetTime;

    // Detect rising edge: current energy must exceed previous energy and threshold
    const prevEnergy = this.energyHistory.length > 0 
      ? this.energyHistory[this.energyHistory.length - 1] 
      : 0;
    const isRising = instantEnergy > prevEnergy * 1.08;

    let isBeat = false;
    if (
      instantEnergy > threshold &&
      isRising &&
      (timeSinceLast >= this.minInterval || this.lastOnsetTime === 0)
    ) {
      isBeat = true;
      this.lastOnsetTime = currentTime;
      this.onsetTimes.push(currentTime);
      if (this.onsetTimes.length > this.maxOnsetHistory) {
        this.onsetTimes.shift();
      }

      this.recalculateBpm();
    }

    // Keep history ring buffer
    this.energyHistory.push(instantEnergy);
    if (this.energyHistory.length > this.historySize) {
      this.energyHistory.shift();
    }

    // Compute beatProgress (0.0 to 1.0)
    const beatPeriod = 60 / Math.max(40, this.currentBpm);
    const elapsedSinceBeat = currentTime - this.lastOnsetTime;
    this.beatProgress = (elapsedSinceBeat % beatPeriod) / beatPeriod;

    return {
      bpm: Math.round(this.currentBpm),
      confidence: this.confidence,
      isBeat,
      beatProgress: this.beatProgress,
      lastBeatTime: this.lastOnsetTime,
    };
  }

  /**
   * Calculate BPM from recorded onset intervals
   */
  private recalculateBpm(): void {
    if (this.onsetTimes.length < 4) {
      this.confidence = Math.min(0.3, this.onsetTimes.length * 0.08);
      return;
    }

    // Calculate inter-onset intervals (IOIs)
    const intervals: number[] = [];
    for (let i = 1; i < this.onsetTimes.length; i++) {
      const interval = this.onsetTimes[i] - this.onsetTimes[i - 1];
      if (interval >= this.minInterval && interval <= this.maxInterval) {
        intervals.push(interval);
      }
    }

    if (intervals.length < 3) {
      return;
    }

    // Cluster intervals into BPM bins
    // Standard dance/pop music ranges from 70 to 175 BPM
    const candidateBpms = intervals.map(interval => {
      let bpm = 60 / interval;
      // Normalize half-time / double-time into 70 - 160 window if applicable
      while (bpm < 68) bpm *= 2;
      while (bpm > 175) bpm /= 2;
      return bpm;
    });

    // Compute median of candidates
    candidateBpms.sort((a, b) => a - b);
    const medianBpm = candidateBpms[Math.floor(candidateBpms.length / 2)];

    // Calculate consistency / variance around median
    let closeCount = 0;
    for (const b of candidateBpms) {
      if (Math.abs(b - medianBpm) <= 5.5) {
        closeCount++;
      }
    }

    const consistency = closeCount / candidateBpms.length;
    this.confidence = Math.max(0.15, Math.min(0.98, consistency * 1.1));

    // Smooth update with exponential filter
    const alpha = this.confidence > 0.6 ? 0.35 : 0.15;
    this.currentBpm = this.currentBpm * (1 - alpha) + medianBpm * alpha;
  }

  /**
   * Manual Tap BPM method
   */
  public tap(currentTime: number): number {
    // Reset if last tap was more than 2.5 seconds ago
    if (this.tapTimes.length > 0) {
      const last = this.tapTimes[this.tapTimes.length - 1];
      if (currentTime - last > 2.5) {
        this.tapTimes = [];
      }
    }

    this.tapTimes.push(currentTime);
    if (this.tapTimes.length > 8) {
      this.tapTimes.shift();
    }

    if (this.tapTimes.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < this.tapTimes.length; i++) {
        intervals.push(this.tapTimes[i] - this.tapTimes[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      if (avgInterval > 0) {
        const computed = 60 / avgInterval;
        if (computed >= 40 && computed <= 240) {
          this.currentBpm = computed;
          this.confidence = 0.95;
          this.lastOnsetTime = currentTime;
        }
      }
    }

    return Math.round(this.currentBpm);
  }

  public reset(): void {
    this.energyHistory = [];
    this.onsetTimes = [];
    this.lastOnsetTime = 0;
    this.confidence = 0;
    this.tapTimes = [];
  }
}
