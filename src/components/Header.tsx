/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { VisualizerMode } from './VisualizerCanvas';
import { BpmState } from '../utils/bpmDetector';
import { AudioMood } from '../utils/audioMood';
import { ColorPalette } from '../utils/palettes';
import {
  Activity,
  Maximize2,
  Minimize2,
  Sliders,
  Sparkles,
  Shuffle,
  Radio,
} from 'lucide-react';

interface HeaderProps {
  mode: VisualizerMode;
  setMode: (m: VisualizerMode) => void;
  bpmState: BpmState;
  onTapBpm: () => void;
  audioMood: AudioMood;
  autoMoodPalette: boolean;
  setAutoMoodPalette: (v: boolean) => void;
  currentPalette: ColorPalette;
  onRandomPalette: () => void;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  showInspector: boolean;
  setShowInspector: (v: boolean | ((prev: boolean) => boolean)) => void;
}

export const Header: React.FC<HeaderProps> = ({
  mode,
  setMode,
  bpmState,
  onTapBpm,
  audioMood,
  autoMoodPalette,
  setAutoMoodPalette,
  currentPalette,
  onRandomPalette,
  isFullscreen,
  toggleFullscreen,
  showInspector,
  setShowInspector,
}) => {
  const modes: { id: VisualizerMode; label: string }[] = [
    { id: 'sigil', label: 'Sigil Matrix' },
    { id: 'milkdrop', label: 'Milkdrop Warp' },
    { id: 'nebula', label: 'Nebula Field' },
    { id: 'oscilloscope', label: 'Oscilloscope' },
    { id: 'spectrum', label: 'Spectrum EQ' },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-40 px-4 py-3 bg-black/85 backdrop-blur-md border-b border-neutral-800 text-neutral-100 flex items-center justify-between gap-4 transition-opacity">
      {/* Brand & Emblem */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-700 flex items-center justify-center text-white font-mono font-bold text-sm tracking-wider shadow-sm">
          <Activity className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold tracking-wider font-mono uppercase text-white">
              Sigil Viz
            </h1>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-300 border border-neutral-700">
              v2.4
            </span>
          </div>
          <p className="text-[11px] text-neutral-400 font-sans hidden sm:block">
            ProjectM Dynamics & Precision Audio
          </p>
        </div>
      </div>

      {/* Visualizer Mode Segmented Pills (Monochrome B&W) */}
      <div className="hidden md:flex items-center bg-neutral-950 p-1 rounded-lg border border-neutral-800">
        {modes.map(m => {
          const isActive = mode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              aria-label={`Visualizer mode ${m.label}`}
              className={`px-3 py-1 text-xs font-mono font-medium rounded-md transition-all duration-150 cursor-pointer ${
                isActive
                  ? 'bg-neutral-100 text-black shadow-sm font-semibold'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
              }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Live BPM Analyzer Badge */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-neutral-950 border border-neutral-800">
          <span
            className={`w-2 h-2 rounded-full transition-all duration-100 ${
              bpmState.isBeat ? 'bg-white scale-125 shadow-[0_0_8px_#ffffff]' : 'bg-neutral-600'
            }`}
          />
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 leading-none">
              <span className="font-mono text-xs font-bold text-white tracking-tight">
                {bpmState.bpm > 0 ? bpmState.bpm : '--'}
              </span>
              <span className="text-[10px] font-mono text-neutral-400">BPM</span>
            </div>
            <span className="text-[9px] font-mono text-neutral-500">
              {Math.round(bpmState.confidence * 100)}% conf
            </span>
          </div>
          <button
            onClick={onTapBpm}
            title="Tap tempo (Hotkey: T)"
            aria-label="Tap BPM tempo"
            className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-700 active:scale-95 transition-all cursor-pointer"
          >
            Tap
          </button>
        </div>

        {/* Audio Mood & Palette Indicator */}
        <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-neutral-950 border border-neutral-800">
          <Sparkles className="w-3.5 h-3.5 text-neutral-300" />
          <div className="flex flex-col">
            <span className="text-[10px] font-mono uppercase text-neutral-400 leading-none">
              {audioMood.label}
            </span>
            <span className="text-[9px] font-mono text-neutral-500 truncate max-w-[110px]">
              {currentPalette.name}
            </span>
          </div>
          <button
            onClick={() => setAutoMoodPalette(!autoMoodPalette)}
            title={autoMoodPalette ? 'Auto mood palette enabled' : 'Auto mood palette paused'}
            aria-label="Toggle auto mood palette"
            className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase border transition-colors cursor-pointer ${
              autoMoodPalette
                ? 'bg-neutral-100 text-black font-semibold border-neutral-200'
                : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
            }`}
          >
            Auto
          </button>
        </div>

        {/* Action Buttons: Randomize Palette, Inspector, Fullscreen */}
        <button
          onClick={onRandomPalette}
          title="Random Palette (Hotkey: P)"
          aria-label="Randomize aesthetic palette"
          className="p-2 rounded-lg bg-neutral-950 hover:bg-neutral-900 text-neutral-300 hover:text-white border border-neutral-800 active:scale-95 transition-all cursor-pointer"
        >
          <Shuffle className="w-4 h-4" />
        </button>

        <button
          onClick={() => setShowInspector(prev => !prev)}
          title="Toggle Audio & Visual Inspector"
          aria-label="Toggle audio settings inspector"
          className={`p-2 rounded-lg border active:scale-95 transition-all cursor-pointer ${
            showInspector
              ? 'bg-neutral-100 text-black border-neutral-200'
              : 'bg-neutral-950 hover:bg-neutral-900 text-neutral-300 hover:text-white border border-neutral-800'
          }`}
        >
          <Sliders className="w-4 h-4" />
        </button>

        <button
          onClick={toggleFullscreen}
          title="Toggle Fullscreen (Hotkey: F)"
          aria-label="Toggle fullscreen mode"
          className="p-2 rounded-lg bg-neutral-950 hover:bg-neutral-900 text-neutral-300 hover:text-white border border-neutral-800 active:scale-95 transition-all cursor-pointer"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};
