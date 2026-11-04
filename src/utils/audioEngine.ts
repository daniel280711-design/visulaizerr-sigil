/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AudioBands {
  subBass: number; // 20 - 60 Hz
  bass: number; // 60 - 250 Hz
  lowMid: number; // 250 - 500 Hz
  mid: number; // 500 - 2000 Hz
  highMid: number; // 2000 - 4000 Hz
  treble: number; // 4000 - 16000 Hz
}

export interface AudioAnalysisSnapshot {
  freqData: Uint8Array;
  timeData: Uint8Array;
  rms: number;
  bands: AudioBands;
  volume: number;
}

export type AudioSourceType = 'file' | 'mic' | 'synth' | 'none';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;

  // Source nodes
  private mediaElementSource: MediaElementAudioSourceNode | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;

  // Built-in Web Audio Procedural Synth
  private synthInterval: number | null = null;
  private synthGain: GainNode | null = null;
  private synthStep = 0;

  // Buffers
  private freqData: Uint8Array<ArrayBuffer> = new Uint8Array(1024) as unknown as Uint8Array<ArrayBuffer>;
  private timeData: Uint8Array<ArrayBuffer> = new Uint8Array(1024) as unknown as Uint8Array<ArrayBuffer>;

  private currentSourceType: AudioSourceType = 'none';
  private trackName = 'No audio track';
  private duration = 0;
  private currentTime = 0;
  private isPlaying = false;

  constructor() {
    // Lazy AudioContext initialization on first user interaction
  }

  public getContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.82;
      this.analyser.minDecibels = -90;
      this.analyser.maxDecibels = -10;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

      // Connect: masterGain -> analyser -> destination
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);

      this.freqData = new Uint8Array(this.analyser.frequencyBinCount) as unknown as Uint8Array<ArrayBuffer>;
      this.timeData = new Uint8Array(this.analyser.fftSize) as unknown as Uint8Array<ArrayBuffer>;
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    return this.ctx;
  }

  public getAnalyser(): AnalyserNode | null {
    if (!this.analyser) {
      this.getContext();
    }
    return this.analyser;
  }

  public async setVolume(level: number): Promise<void> {
    const ctx = this.getContext();
    if (this.masterGain) {
      const clamped = Math.max(0, Math.min(1.5, level));
      this.masterGain.gain.setTargetAtTime(clamped, ctx.currentTime, 0.05);
    }
  }

  /**
   * Connect to an existing user-provided audio stream (MediaStream)
   */
  public async connectAudioStream(stream: MediaStream): Promise<void> {
    const ctx = this.getContext();
    this.stopAllSources();

    this.micStream = stream;
    this.micSource = ctx.createMediaStreamSource(stream);

    // For live mic input, connect directly to analyser to prevent feedback howl
    if (this.analyser) {
      this.micSource.connect(this.analyser);
    }

    this.currentSourceType = 'mic';
    this.trackName = 'Live Stream / Microphone Input';
    this.isPlaying = true;
  }

  /**
   * Connect to a user-provided File or URL audio source
   */
  public async loadAudioFile(file: File): Promise<void> {
    const ctx = this.getContext();
    this.stopAllSources();

    const objectUrl = URL.createObjectURL(file);
    const audio = new Audio();
    audio.src = objectUrl;
    audio.crossOrigin = 'anonymous';
    audio.loop = true;

    await new Promise<void>((resolve, reject) => {
      audio.oncanplay = () => resolve();
      audio.onerror = (e) => reject(e);
      audio.load();
    });

    this.audioElement = audio;
    this.mediaElementSource = ctx.createMediaElementSource(audio);
    if (this.masterGain) {
      this.mediaElementSource.connect(this.masterGain);
    }

    this.trackName = file.name.replace(/\.[^/.]+$/, '');
    this.duration = audio.duration || 0;
    this.currentSourceType = 'file';

    audio.ontimeupdate = () => {
      this.currentTime = audio.currentTime;
    };

    audio.onended = () => {
      this.isPlaying = false;
    };

    await audio.play();
    this.isPlaying = true;
  }

  /**
   * Built-in Procedural Audio Synthesizer:
   * Generates rhythmic electronic music (kick, bassline, ethereal synth pads)
   * entirely with Web Audio API nodes so user can test the visualizer immediately.
   */
  public startProceduralSynth(): void {
    const ctx = this.getContext();
    this.stopAllSources();

    this.synthGain = ctx.createGain();
    this.synthGain.gain.setValueAtTime(0.7, ctx.currentTime);
    if (this.masterGain) {
      this.synthGain.connect(this.masterGain);
    }

    this.currentSourceType = 'synth';
    this.trackName = 'Sigil Cybernetic Dream (Generative 124 BPM)';
    this.isPlaying = true;
    this.synthStep = 0;

    // 124 BPM = 16th notes every 120.96 ms
    const stepInterval = (60 / 124 / 4) * 1000;

    const bassNotes = [55, 55, 55, 58, 65, 62, 58, 60]; // Hz
    const padFrequencies = [
      [220, 277.18, 329.63, 440], // A minor
      [174.61, 220, 261.63, 349.23], // F major
      [261.63, 329.63, 392, 523.25], // C major
      [196, 246.94, 293.66, 392], // G major
    ];

    const triggerStep = () => {
      if (!this.ctx || this.currentSourceType !== 'synth' || !this.isPlaying) return;

      const now = this.ctx.currentTime;
      const step = this.synthStep % 16;
      const bar = Math.floor(this.synthStep / 16) % 4;

      // Kick drum on beats 0, 4, 8, 12
      if (step % 4 === 0) {
        const kickOsc = this.ctx.createOscillator();
        const kickGain = this.ctx.createGain();
        kickOsc.frequency.setValueAtTime(140, now);
        kickOsc.frequency.exponentialRampToValueAtTime(38, now + 0.12);

        kickGain.gain.setValueAtTime(1.0, now);
        kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        kickOsc.connect(kickGain);
        if (this.synthGain) kickGain.connect(this.synthGain);

        kickOsc.start(now);
        kickOsc.stop(now + 0.3);
      }

      // Snare / clap on beats 4, 12
      if (step === 4 || step === 12) {
        const noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.15, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseBuffer.length; i++) {
          output[i] = Math.random() * 2 - 1;
        }

        const whiteNoise = this.ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(1000, now);

        const snareGain = this.ctx.createGain();
        snareGain.gain.setValueAtTime(0.4, now);
        snareGain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);

        whiteNoise.connect(filter);
        filter.connect(snareGain);
        if (this.synthGain) snareGain.connect(this.synthGain);

        whiteNoise.start(now);
      }

      // Bass synth on offbeats
      if (step % 2 === 1) {
        const bassOsc = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        const bassFilter = this.ctx.createBiquadFilter();

        bassOsc.type = 'sawtooth';
        const noteIdx = Math.floor(step / 2) % bassNotes.length;
        bassOsc.frequency.setValueAtTime(bassNotes[noteIdx], now);

        bassFilter.type = 'lowpass';
        bassFilter.frequency.setValueAtTime(600, now);
        bassFilter.Q.setValueAtTime(3, now);

        bassGain.gain.setValueAtTime(0.35, now);
        bassGain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

        bassOsc.connect(bassFilter);
        bassFilter.connect(bassGain);
        if (this.synthGain) bassGain.connect(this.synthGain);

        bassOsc.start(now);
        bassOsc.stop(now + 0.2);
      }

      // Ambient chords on bar starts
      if (step === 0) {
        const chord = padFrequencies[bar];
        chord.forEach(freq => {
          if (!this.ctx) return;
          const padOsc = this.ctx.createOscillator();
          const padGain = this.ctx.createGain();
          const padFilter = this.ctx.createBiquadFilter();

          padOsc.type = 'triangle';
          padOsc.frequency.setValueAtTime(freq, now);

          padFilter.type = 'lowpass';
          padFilter.frequency.setValueAtTime(1400, now);

          padGain.gain.setValueAtTime(0.01, now);
          padGain.gain.linearRampToValueAtTime(0.08, now + 0.4);
          padGain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

          padOsc.connect(padFilter);
          padFilter.connect(padGain);
          if (this.synthGain) padGain.connect(this.synthGain);

          padOsc.start(now);
          padOsc.stop(now + 1.9);
        });
      }

      this.synthStep++;
    };

    this.synthInterval = window.setInterval(triggerStep, stepInterval);
  }

  public play(): void {
    const ctx = this.getContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    if (this.audioElement && this.currentSourceType === 'file') {
      this.audioElement.play();
      this.isPlaying = true;
    } else if (this.currentSourceType === 'synth' && !this.synthInterval) {
      this.startProceduralSynth();
    } else if (this.currentSourceType === 'none') {
      this.startProceduralSynth();
    }
  }

  public pause(): void {
    if (this.audioElement && this.currentSourceType === 'file') {
      this.audioElement.pause();
      this.isPlaying = false;
    } else if (this.currentSourceType === 'synth') {
      if (this.synthInterval !== null) {
        clearInterval(this.synthInterval);
        this.synthInterval = null;
      }
      this.isPlaying = false;
    }
  }

  public togglePlayPause(): void {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  public seek(seconds: number): void {
    if (this.audioElement && this.currentSourceType === 'file') {
      this.audioElement.currentTime = Math.max(0, Math.min(this.duration, seconds));
    }
  }

  public stopAllSources(): void {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = '';
      this.audioElement = null;
    }
    if (this.mediaElementSource) {
      this.mediaElementSource.disconnect();
      this.mediaElementSource = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach(track => track.stop());
      this.micStream = null;
    }
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
    if (this.synthInterval !== null) {
      clearInterval(this.synthInterval);
      this.synthInterval = null;
    }
    if (this.synthGain) {
      this.synthGain.disconnect();
      this.synthGain = null;
    }

    this.currentSourceType = 'none';
    this.isPlaying = false;
  }

  /**
   * Extract real-time frequency & time domain data from analyser
   */
  public extractSnapshot(): AudioAnalysisSnapshot {
    if (!this.analyser) {
      return {
        freqData: this.freqData,
        timeData: this.timeData,
        rms: 0,
        bands: { subBass: 0, bass: 0, lowMid: 0, mid: 0, highMid: 0, treble: 0 },
        volume: 0,
      };
    }

    this.analyser.getByteFrequencyData(this.freqData);
    this.analyser.getByteTimeDomainData(this.timeData);

    const len = this.freqData.length;
    const sampleRate = this.ctx ? this.ctx.sampleRate : 44100;
    const binWidth = (sampleRate / 2) / len;

    const getBandEnergy = (minHz: number, maxHz: number): number => {
      const start = Math.max(0, Math.floor(minHz / binWidth));
      const end = Math.min(len - 1, Math.ceil(maxHz / binWidth));
      let sum = 0;
      let count = 0;
      for (let i = start; i <= end; i++) {
        sum += this.freqData[i];
        count++;
      }
      return count > 0 ? (sum / count) / 255.0 : 0;
    };

    const bands: AudioBands = {
      subBass: getBandEnergy(20, 60),
      bass: getBandEnergy(60, 250),
      lowMid: getBandEnergy(250, 500),
      mid: getBandEnergy(500, 2000),
      highMid: getBandEnergy(2000, 4000),
      treble: getBandEnergy(4000, 16000),
    };

    // Calculate time domain RMS
    let timeSumSquares = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const norm = (this.timeData[i] - 128) / 128;
      timeSumSquares += norm * norm;
    }
    const rms = Math.sqrt(timeSumSquares / this.timeData.length);

    return {
      freqData: this.freqData,
      timeData: this.timeData,
      rms,
      bands,
      volume: (bands.bass * 0.4 + bands.mid * 0.4 + bands.treble * 0.2),
    };
  }

  // Getters
  public getSourceType(): AudioSourceType { return this.currentSourceType; }
  public getTrackName(): string { return this.trackName; }
  public getDuration(): number { return this.duration; }
  public getCurrentTime(): number { return this.currentTime; }
  public getIsPlaying(): boolean { return this.isPlaying; }
}

export const globalAudioEngine = new AudioEngine();
