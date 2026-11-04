/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, Sliders, Zap, Eye, Music, Keyboard, RefreshCw } from 'lucide-react';
import { AudioAnalysisSnapshot } from '../utils/audioEngine';
import { BpmState } from '../utils/bpmDetector';
import { AudioMood } from '../utils/audioMood';
import { ColorPalette, PALETTES } from '../utils/palettes';

interface InspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  analysis: AudioAnalysisSnapshot;
  bpmState: BpmState;
  bpmSensitivity: number;
  onBpmSensitivityChange: (val: number) => void;
  onTapBpm: () => void;
  onResetBpm: () => void;
  bloomAmount: number;
  onBloomChange: (val: number) => void;
  warpFactor: number;
  onWarpFactorChange: (val: number) => void;
  particleCount: number;
  onParticleCountChange: (val: number) => void;
  audioMood: AudioMood;
  autoMoodPalette: boolean;
  onToggleAutoMoodPalette: (val: boolean) => void;
  currentPalette: ColorPalette;
  onSelectPalette: (id: string) => void;
}

export const InspectorModal: React.FC<InspectorModalProps> = ({
  isOpen,
  onClose,
  analysis,
  bpmState,
  bpmSensitivity,
  onBpmSensitivityChange,
  onTapBpm,
  onResetBpm,
  bloomAmount,
  onBloomChange,
  warpFactor,
  onWarpFactorChange,
  particleCount,
  onParticleCountChange,
  audioMood,
  autoMoodPalette,
  onToggleAutoMoodPalette,
  currentPalette,
  onSelectPalette,
}) => {
  if (!isOpen) return null;

  const bandEntries = [
    { label: 'Sub-Bass (20-60Hz)', value: analysis.bands.subBass },
    { label: 'Kick & Bass (60-250Hz)', value: analysis.bands.bass },
    { label: 'Low-Mid (250-500Hz)', value: analysis.bands.lowMid },
    { label: 'Midrange (500-2kHz)', value: analysis.bands.mid },
    { label: 'High-Mid (2k-4kHz)', value: analysis.bands.highMid },
    { label: 'Treble & Air (4k-16kHz)', value: analysis.bands.treble },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs transition-opacity">
      <div className="w-full max-w-md h-full bg-neutral-950 border-l border-neutral-800 text-neutral-100 flex flex-col shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between sticky top-0 bg-neutral-950/95 backdrop-blur-md z-10">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-white" />
            <h2 className="text-sm font-semibold font-mono tracking-wider uppercase text-white">
              Inspector & Audio Telemetry
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close inspector"
            className="p-1 rounded-lg hover:bg-neutral-900 text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-6 flex-1 text-xs font-mono">
          {/* SECTION 1: Real-time Audio EQ Telemetry */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-neutral-400 pb-1 border-b border-neutral-850">
              <span className="uppercase text-[11px] font-semibold flex items-center gap-1.5 text-white">
                <Music className="w-3.5 h-3.5 text-white" /> Frequency Spectrum
              </span>
              <span className="text-[10px] text-neutral-400">
                RMS: {(analysis.rms * 100).toFixed(1)}%
              </span>
            </div>

            <div className="space-y-2">
              {bandEntries.map((band, idx) => {
                const percent = Math.min(100, Math.round(band.value * 100));
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-[10px] text-neutral-400">
                      <span>{band.label}</span>
                      <span className="text-white font-medium">{percent}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-neutral-900 rounded-full overflow-hidden border border-neutral-800">
                      <div
                        className="h-full bg-white transition-all duration-75"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION 2: BPM Analyzer Engine */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between pb-1 border-b border-neutral-850">
              <span className="uppercase text-[11px] font-semibold flex items-center gap-1.5 text-white">
                <Zap className="w-3.5 h-3.5 text-white" /> BPM Detector Engine
              </span>
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    bpmState.isBeat ? 'bg-white shadow-[0_0_8px_white]' : 'bg-neutral-700'
                  }`}
                />
                <span className="text-white font-bold">{bpmState.bpm} BPM</span>
              </div>
            </div>

            <div className="space-y-3 bg-black p-3 rounded-lg border border-neutral-850">
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">Detection Confidence:</span>
                <span className="text-white">{Math.round(bpmState.confidence * 100)}%</span>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-neutral-400">
                  <span>Kick Threshold Sensitivity:</span>
                  <span className="text-white">{bpmSensitivity.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="1.05"
                  max="2.2"
                  step="0.05"
                  value={bpmSensitivity}
                  onChange={(e) => onBpmSensitivityChange(parseFloat(e.target.value))}
                  aria-label="BPM kick sensitivity"
                  className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-white"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={onTapBpm}
                  aria-label="Tap tempo button"
                  className="flex-1 py-1.5 rounded-md bg-neutral-100 hover:bg-white text-black font-bold active:scale-95 transition-all text-center cursor-pointer"
                >
                  Tap Tempo (T)
                </button>
                <button
                  onClick={onResetBpm}
                  aria-label="Reset BPM detector"
                  title="Reset onset history"
                  className="p-1.5 rounded-md bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* SECTION 3: Visualizer Clean Rendering & Bloom */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between pb-1 border-b border-neutral-850">
              <span className="uppercase text-[11px] font-semibold flex items-center gap-1.5 text-white">
                <Eye className="w-3.5 h-3.5 text-white" /> Clean Visualizer Tuning
              </span>
              <span className="text-[10px] text-neutral-400">ProjectM Matrix</span>
            </div>

            <div className="space-y-3 bg-black p-3 rounded-lg border border-neutral-850">
              {/* Bloom Calibrator */}
              <div className="space-y-1">
                <div className="flex justify-between text-neutral-400">
                  <span>Glow / Bloom Intensity:</span>
                  <span className="text-white">{Math.round(bloomAmount * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="0.8"
                  step="0.05"
                  value={bloomAmount}
                  onChange={(e) => onBloomChange(parseFloat(e.target.value))}
                  aria-label="Bloom intensity"
                  className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-white"
                />
                <span className="text-[9px] text-neutral-500 block">
                  Calibrated to prevent hazy, dirty over-exposure
                </span>
              </div>

              {/* ProjectM Warp Feedback */}
              <div className="space-y-1">
                <div className="flex justify-between text-neutral-400">
                  <span>Fluid Warp Feedback (Milkdrop):</span>
                  <span className="text-white">{(warpFactor * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.5"
                  step="0.05"
                  value={warpFactor}
                  onChange={(e) => onWarpFactorChange(parseFloat(e.target.value))}
                  aria-label="Warp factor"
                  className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-white"
                />
              </div>

              {/* Particles */}
              <div className="space-y-1">
                <div className="flex justify-between text-neutral-400">
                  <span>Nebula Particle Density:</span>
                  <span className="text-white">{particleCount}</span>
                </div>
                <input
                  type="range"
                  min="60"
                  max="300"
                  step="10"
                  value={particleCount}
                  onChange={(e) => onParticleCountChange(parseInt(e.target.value, 10))}
                  aria-label="Particle count"
                  className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-white"
                />
              </div>
            </div>
          </div>

          {/* SECTION 4: Mood & Palette Library */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between pb-1 border-b border-neutral-850">
              <span className="uppercase text-[11px] font-semibold text-white">
                Harmonic Palette Library
              </span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoMoodPalette}
                  onChange={(e) => onToggleAutoMoodPalette(e.target.checked)}
                  className="accent-white"
                />
                <span className="text-[10px] text-neutral-400">Auto-Detect Mood</span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {Object.values(PALETTES).map((pal) => {
                const isSelected = currentPalette.id === pal.id;
                return (
                  <button
                    key={pal.id}
                    onClick={() => onSelectPalette(pal.id)}
                    aria-label={`Select palette ${pal.name}`}
                    className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-neutral-900 border-white text-white'
                        : 'bg-black border-neutral-850 hover:border-neutral-700 text-neutral-400'
                    }`}
                  >
                    <div className="text-[11px] font-semibold truncate text-white">{pal.name}</div>
                    <div className="flex items-center gap-1 mt-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: pal.primary }} />
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: pal.secondary }} />
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: pal.accent }} />
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: pal.highlight }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* SECTION 5: Keyboard Shortcuts Guide */}
          <div className="space-y-2 pt-2 border-t border-neutral-850">
            <span className="uppercase text-[10px] font-semibold text-neutral-400 flex items-center gap-1">
              <Keyboard className="w-3 h-3" /> Keyboard Shortcuts
            </span>
            <div className="grid grid-cols-2 gap-1 text-[10px] text-neutral-400">
              <div><kbd className="px-1 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-white">Space</kbd> Play / Pause</div>
              <div><kbd className="px-1 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-white">M</kbd> Next Mode</div>
              <div><kbd className="px-1 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-white">P</kbd> Random Palette</div>
              <div><kbd className="px-1 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-white">T</kbd> Tap BPM Tempo</div>
              <div><kbd className="px-1 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-white">F</kbd> Fullscreen</div>
              <div><kbd className="px-1 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-white">I</kbd> Toggle Inspector</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
