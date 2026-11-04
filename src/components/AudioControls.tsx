/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Mic,
  Upload,
  Music,
  Radio,
  Palette,
  SlidersHorizontal,
} from 'lucide-react';
import { AudioSourceType } from '../utils/audioEngine';
import { PALETTES, ColorPalette } from '../utils/palettes';

interface AudioControlsProps {
  isPlaying: boolean;
  trackName: string;
  sourceType: AudioSourceType;
  duration: number;
  currentTime: number;
  volume: number;
  sensitivity: number;
  warpFactor: number;
  bloomAmount: number;
  currentPalette: ColorPalette;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
  onVolumeChange: (vol: number) => void;
  onSensitivityChange: (s: number) => void;
  onWarpChange: (w: number) => void;
  onSelectPalette: (paletteId: string) => void;
  onStartSynth: () => void;
  onStartMic: () => void;
  onFileUpload: (file: File) => void;
}

export const AudioControls: React.FC<AudioControlsProps> = ({
  isPlaying,
  trackName,
  sourceType,
  duration,
  currentTime,
  volume,
  sensitivity,
  warpFactor,
  bloomAmount,
  currentPalette,
  onTogglePlay,
  onSeek,
  onVolumeChange,
  onSensitivityChange,
  onWarpChange,
  onSelectPalette,
  onStartSynth,
  onStartMic,
  onFileUpload,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileUpload(file);
    }
  };

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-40 p-4 pointer-events-none">
      <div className="max-w-5xl mx-auto bg-black/90 backdrop-blur-lg border border-neutral-800 rounded-xl p-3 shadow-2xl text-white pointer-events-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Left: Playback & Source Selection */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Main Play/Pause Button */}
          <button
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
            className="w-10 h-10 rounded-lg bg-neutral-100 hover:bg-white text-black flex items-center justify-center font-bold shadow-md active:scale-95 transition-all cursor-pointer"
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>

          {/* Track Info & Scrubber */}
          <div className="flex flex-col min-w-[160px] max-w-[280px]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-medium truncate text-white" title={trackName}>
                {trackName}
              </span>
              <span className="text-[10px] uppercase font-mono px-1 py-0.2 rounded bg-neutral-900 border border-neutral-800 text-neutral-400">
                {sourceType === 'synth' ? 'Generative' : sourceType === 'mic' ? 'Stream' : sourceType === 'file' ? 'Local' : 'Idle'}
              </span>
            </div>

            {/* Scrubber for file or status bar for stream */}
            {sourceType === 'file' && duration > 0 ? (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-mono text-neutral-400">{formatTime(currentTime)}</span>
                <input
                  type="range"
                  min="0"
                  max={duration}
                  step="0.1"
                  value={currentTime}
                  onChange={(e) => onSeek(parseFloat(e.target.value))}
                  aria-label="Seek audio track"
                  className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-white"
                />
                <span className="text-[10px] font-mono text-neutral-500">{formatTime(duration)}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-pulse" />
                <span className="text-[10px] font-mono text-neutral-400">
                  {isPlaying ? 'Live real-time frequency analysis active' : 'Audio engine standby'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Center: Audio Source Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {/* Play Generative Synth Demo */}
          <button
            onClick={onStartSynth}
            aria-label="Play built-in synth demo track"
            title="Play built-in generative synthwave audio"
            className={`px-3 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer ${
              sourceType === 'synth' && isPlaying
                ? 'bg-neutral-100 text-black font-semibold border-white'
                : 'bg-neutral-950 hover:bg-neutral-900 text-neutral-300 hover:text-white border-neutral-800'
            }`}
          >
            <Music className="w-3.5 h-3.5" />
            <span>Synth Track</span>
          </button>

          {/* Connect Live Microphone / Stream */}
          <button
            onClick={onStartMic}
            aria-label="Connect microphone or line input stream"
            title="Stream live audio from your microphone or input"
            className={`px-3 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer ${
              sourceType === 'mic' && isPlaying
                ? 'bg-neutral-100 text-black font-semibold border-white'
                : 'bg-neutral-950 hover:bg-neutral-900 text-neutral-300 hover:text-white border-neutral-800'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Live Stream</span>
          </button>

          {/* Upload File */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="audio/*"
            className="hidden"
            aria-label="Upload audio file"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            aria-label="Upload custom audio file"
            title="Upload audio file from your computer (MP3, WAV, FLAC, OGG)"
            className={`px-3 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer ${
              sourceType === 'file'
                ? 'bg-neutral-100 text-black font-semibold border-white'
                : 'bg-neutral-950 hover:bg-neutral-900 text-neutral-300 hover:text-white border-neutral-800'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Load File</span>
          </button>
        </div>

        {/* Right: Master Volume & Tuning Knobs */}
        <div className="flex items-center gap-4 w-full md:w-auto justify-end">
          {/* Palette Selector */}
          <div className="flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-neutral-400" />
            <select
              value={currentPalette.id}
              onChange={(e) => onSelectPalette(e.target.value)}
              aria-label="Select color palette"
              className="bg-neutral-950 text-white text-xs font-mono border border-neutral-800 rounded-lg px-2 py-1 outline-none cursor-pointer hover:border-neutral-700"
            >
              {Object.values(PALETTES).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sensitivity */}
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-[10px] font-mono text-neutral-400 uppercase">Gain</span>
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.1"
              value={sensitivity}
              onChange={(e) => onSensitivityChange(parseFloat(e.target.value))}
              aria-label="Audio visualization sensitivity"
              title={`Sensitivity: ${sensitivity.toFixed(1)}x`}
              className="w-16 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-white"
            />
          </div>

          {/* Volume Slider */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onVolumeChange(volume > 0 ? 0 : 0.8)}
              aria-label={volume === 0 ? 'Unmute volume' : 'Mute volume'}
              className="text-neutral-400 hover:text-white transition-colors cursor-pointer"
            >
              {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min="0"
              max="1.2"
              step="0.05"
              value={volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              aria-label="Master audio volume"
              title={`Master Volume: ${Math.round(volume * 100)}%`}
              className="w-16 sm:w-20 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-white"
            />
          </div>
        </div>
      </div>
    </footer>
  );
};
