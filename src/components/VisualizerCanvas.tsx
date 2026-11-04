/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { ColorPalette, lerpColor } from '../utils/palettes';
import { AudioAnalysisSnapshot } from '../utils/audioEngine';
import { BpmState } from '../utils/bpmDetector';

export type VisualizerMode = 'sigil' | 'milkdrop' | 'nebula' | 'oscilloscope' | 'spectrum';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  baseSize: number;
  alpha: number;
  color: string;
  angle: number;
  speed: number;
  life: number;
  maxLife: number;
}

interface VisualizerCanvasProps {
  analysis: AudioAnalysisSnapshot;
  bpmState: BpmState;
  palette: ColorPalette;
  mode: VisualizerMode;
  warpFactor?: number;
  particleCount?: number;
  sensitivity?: number;
  bloomAmount?: number;
}

export const VisualizerCanvas: React.FC<VisualizerCanvasProps> = ({
  analysis,
  bpmState,
  palette,
  mode,
  warpFactor = 0.5,
  particleCount = 180,
  sensitivity = 1.0,
  bloomAmount = 0.35, // Calibrated low bloom for crisp, clean aesthetics
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const feedbackCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // References for animation state
  const particlesRef = useRef<Particle[]>([]);
  const rotationAngleRef = useRef(0);
  const colorTransitionRef = useRef<{
    currentPalette: ColorPalette;
    targetPalette: ColorPalette;
    progress: number;
  }>({
    currentPalette: palette,
    targetPalette: palette,
    progress: 1,
  });

  // Mouse interaction state
  const mousePosRef = useRef({ x: 0.5, y: 0.5, isDown: false });

  // Update target palette when prop changes
  useEffect(() => {
    if (colorTransitionRef.current.targetPalette.id !== palette.id) {
      colorTransitionRef.current.currentPalette = { ...colorTransitionRef.current.targetPalette };
      colorTransitionRef.current.targetPalette = palette;
      colorTransitionRef.current.progress = 0;
    }
  }, [palette]);

  // Initialize particles once
  useEffect(() => {
    const particles: Particle[] = [];
    const count = Math.min(300, Math.max(50, particleCount));

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 300;
      particles.push({
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        size: Math.random() * 2.2 + 0.8,
        baseSize: Math.random() * 2.2 + 0.8,
        alpha: Math.random() * 0.6 + 0.2,
        color: palette.particles[Math.floor(Math.random() * palette.particles.length)],
        angle: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.02 + 0.005,
        life: Math.random() * 100,
        maxLife: Math.random() * 80 + 120,
      });
    }

    particlesRef.current = particles;
  }, [particleCount, palette]);

  // Main Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    // Offscreen feedback canvas for Milkdrop / ProjectM warp buffer
    if (!feedbackCanvasRef.current) {
      feedbackCanvasRef.current = document.createElement('canvas');
    }
    const feedbackCanvas = feedbackCanvasRef.current;
    const feedbackCtx = feedbackCanvas.getContext('2d', { alpha: false });

    let animationFrameId: number;

    const handleResize = () => {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        if (feedbackCanvas) {
          feedbackCanvas.width = width * dpr;
          feedbackCanvas.height = height * dpr;
        }
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    const render = () => {
      if (!canvas || !ctx) return;
      const width = canvas.width;
      const height = canvas.height;
      const cx = width / 2;
      const cy = height / 2;

      // Smooth color transition
      const trans = colorTransitionRef.current;
      if (trans.progress < 1) {
        trans.progress = Math.min(1, trans.progress + 0.02);
      }
      const t = trans.progress;
      const activePrimary = lerpColor(trans.currentPalette.primary, trans.targetPalette.primary, t);
      const activeSecondary = lerpColor(trans.currentPalette.secondary, trans.targetPalette.secondary, t);
      const activeAccent = lerpColor(trans.currentPalette.accent, trans.targetPalette.accent, t);
      const activeHighlight = lerpColor(trans.currentPalette.highlight, trans.targetPalette.highlight, t);
      const activeBg = lerpColor(trans.currentPalette.background, trans.targetPalette.background, t);

      // Audio reactive parameters
      const bass = (analysis.bands.bass + analysis.bands.subBass * 1.2) * sensitivity;
      const mid = analysis.bands.mid * sensitivity;
      const treble = analysis.bands.treble * sensitivity;
      const rms = analysis.rms * sensitivity;
      const isKick = bpmState.isBeat;

      // ProjectM Warp Mesh Effect:
      // Feedback loop: slightly scale and rotate previous frame
      if (feedbackCanvas && feedbackCtx && mode === 'milkdrop') {
        const warpZoom = 1.002 + bass * 0.015 * warpFactor;
        const warpRot = 0.0015 * (mid + 0.2);

        feedbackCtx.save();
        feedbackCtx.translate(cx, cy);
        feedbackCtx.rotate(warpRot);
        feedbackCtx.scale(warpZoom, warpZoom);
        feedbackCtx.translate(-cx, -cy);
        feedbackCtx.drawImage(canvas, 0, 0);
        feedbackCtx.restore();

        // Draw feedback back onto main canvas with fade
        ctx.fillStyle = activeBg;
        ctx.globalAlpha = 0.14;
        ctx.fillRect(0, 0, width, height);

        ctx.globalAlpha = 0.88;
        ctx.drawImage(feedbackCanvas, 0, 0);
        ctx.globalAlpha = 1.0;
      } else {
        // Crisp clean background clear with slight motion trail
        const trailAlpha = mode === 'oscilloscope' ? 0.18 : 0.22;
        ctx.fillStyle = activeBg;
        ctx.globalAlpha = trailAlpha;
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 1.0;
      }

      // Rotation angle updates smoothly with BPM and audio energy
      rotationAngleRef.current += 0.004 + mid * 0.01;
      const rot = rotationAngleRef.current;

      // Set clean calibrated bloom (prevents dirty over-exposure)
      const bloomRadius = Math.max(0, Math.min(16, bloomAmount * 14 * (1 + bass * 0.5)));
      ctx.shadowBlur = bloomRadius;
      ctx.shadowColor = activePrimary;

      // ==========================================
      // MODE 1: SIGIL MATRIX (Sacred Geometry & Rune Glyphs)
      // ==========================================
      if (mode === 'sigil') {
        ctx.save();
        ctx.translate(cx, cy);

        // Responsive mouse offset
        const mouseOffX = (mousePosRef.current.x - 0.5) * 40;
        const mouseOffY = (mousePosRef.current.y - 0.5) * 40;
        ctx.translate(mouseOffX, mouseOffY);

        const baseRadius = Math.min(width, height) * 0.22 * (1 + bass * 0.18);

        // Outer Ring with Frequency Waveform
        ctx.beginPath();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = activeSecondary;
        const outerBins = 64;
        for (let i = 0; i < outerBins; i++) {
          const angle = (i / outerBins) * Math.PI * 2 + rot;
          const binVal = (analysis.freqData[i * 4] || 0) / 255.0;
          const r = baseRadius * 1.35 + binVal * 45 * sensitivity;
          const x = Math.cos(angle) * r;
          const y = Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();

        // Inner Inscribed Polygonal Sigils (Heptagram & Hexagram)
        const drawPolygon = (sides: number, radius: number, angleOffset: number, strokeColor: string, lw: number) => {
          ctx.beginPath();
          ctx.lineWidth = lw;
          ctx.strokeStyle = strokeColor;
          for (let i = 0; i <= sides; i++) {
            const a = (i / sides) * Math.PI * 2 + angleOffset;
            const x = Math.cos(a) * radius;
            const y = Math.sin(a) * radius;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        };

        // Concentric geometric layers
        drawPolygon(7, baseRadius * 1.05, -rot * 0.8, activePrimary, 2.0);
        drawPolygon(12, baseRadius * 0.78, rot * 1.2, activeAccent, 1.2);
        drawPolygon(6, baseRadius * 0.52, -rot * 1.5, activeHighlight, 1.8);
        drawPolygon(3, baseRadius * 0.3 * (1 + (isKick ? 0.25 : 0)), rot * 2, activePrimary, 2.5);

        // Radiating Sound Glyphs / Spoke Needles
        ctx.beginPath();
        ctx.lineWidth = 1;
        ctx.strokeStyle = activeSecondary;
        const spokes = 12;
        for (let i = 0; i < spokes; i++) {
          const a = (i / spokes) * Math.PI * 2 + rot;
          const r1 = baseRadius * 0.55;
          const r2 = baseRadius * 1.15 + (i % 2 === 0 ? bass * 35 : treble * 25);
          ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
          ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
        }
        ctx.stroke();

        // Center Core Pulsing Sigil Orb
        ctx.beginPath();
        const coreR = Math.max(8, baseRadius * 0.12 * (1 + bass * 0.6));
        ctx.arc(0, 0, coreR, 0, Math.PI * 2);
        ctx.fillStyle = activeHighlight;
        ctx.fill();

        ctx.restore();
      }

      // ==========================================
      // MODE 2: MILKDROP WARP (Fluid Waveform Dynamics)
      // ==========================================
      else if (mode === 'milkdrop') {
        ctx.save();
        ctx.translate(cx, cy);

        // Render fluid multi-harmonic Lissajous ribbon
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = activePrimary;
        ctx.beginPath();

        const samples = 180;
        const freqStep = Math.floor(analysis.timeData.length / samples);
        for (let i = 0; i < samples; i++) {
          const tVal = (analysis.timeData[i * freqStep] - 128) / 128.0;
          const fVal = (analysis.freqData[i * 2] || 0) / 255.0;

          const theta = (i / samples) * Math.PI * 4 + rot;
          const radius = (Math.min(width, height) * 0.28) + fVal * 90 * sensitivity;

          // ProjectM harmonic orbital equation
          const x = Math.sin(theta * 2 + rot) * radius + Math.cos(theta * 3) * tVal * 80;
          const y = Math.cos(theta * 1.5 - rot) * radius + Math.sin(theta * 2) * tVal * 80;

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();

        // Secondary counter-phase harmonic wave
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = activeAccent;
        ctx.beginPath();
        for (let i = 0; i < samples; i += 2) {
          const tVal = (analysis.timeData[i * freqStep] - 128) / 128.0;
          const theta = (i / samples) * Math.PI * 6 - rot * 1.5;
          const radius = (Math.min(width, height) * 0.16) + tVal * 60;
          const x = Math.cos(theta) * radius;
          const y = Math.sin(theta) * radius;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();

        ctx.restore();
      }

      // ==========================================
      // MODE 3: NEBULA FIELD (Calibrated Crisp Particle Galaxy)
      // ==========================================
      else if (mode === 'nebula') {
        ctx.save();
        ctx.translate(cx, cy);

        // Update and draw clean particles
        const particles = particlesRef.current;
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];

          // Orbital velocity affected by music energy
          p.angle += p.speed * (1 + mid * 1.8);
          const currentDist = Math.hypot(p.x, p.y);
          const targetDist = currentDist + (isKick ? 4 : -0.2) + Math.sin(p.angle * 3) * bass * 2;

          p.x = Math.cos(p.angle) * targetDist;
          p.y = Math.sin(p.angle) * targetDist;

          // Wrap boundaries
          const maxDist = Math.min(width, height) * 0.46;
          if (targetDist > maxDist || targetDist < 10) {
            p.angle = Math.random() * Math.PI * 2;
            p.x = Math.cos(p.angle) * (Math.random() * 80 + 30);
            p.y = Math.sin(p.angle) * (Math.random() * 80 + 30);
          }

          // Dynamic clean size without dirty halo
          const renderSize = p.baseSize * (1 + treble * 1.2 + (isKick ? 0.8 : 0));

          ctx.beginPath();
          ctx.arc(p.x, p.y, renderSize, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.alpha * (0.6 + bass * 0.4);
          ctx.fill();

          // Connect nearby particles with subtle constellation filaments
          if (i % 6 === 0) {
            for (let j = i + 1; j < Math.min(particles.length, i + 7); j++) {
              const p2 = particles[j];
              const dx = p.x - p2.x;
              const dy = p.y - p2.y;
              const distSq = dx * dx + dy * dy;
              if (distSq < 3600) {
                ctx.beginPath();
                ctx.lineWidth = 0.6;
                ctx.strokeStyle = activeSecondary;
                ctx.globalAlpha = 0.25 * (1 - Math.sqrt(distSq) / 60);
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
              }
            }
          }
        }
        ctx.globalAlpha = 1.0;

        // Central sound pulsar
        ctx.beginPath();
        const pulsarRadius = 14 + bass * 28;
        ctx.arc(0, 0, pulsarRadius, 0, Math.PI * 2);
        ctx.lineWidth = 2.0;
        ctx.strokeStyle = activeHighlight;
        ctx.stroke();

        ctx.restore();
      }

      // ==========================================
      // MODE 4: OSCILLOSCOPE LISSAJOUS (Precision Vector Beam)
      // ==========================================
      else if (mode === 'oscilloscope') {
        ctx.save();
        ctx.translate(cx, cy);

        ctx.lineWidth = 2.0;
        ctx.strokeStyle = activePrimary;
        ctx.beginPath();

        const count = 512;
        const scaleX = Math.min(width, height) * 0.42;
        const scaleY = scaleX * 0.75;

        for (let i = 0; i < count; i++) {
          const t1 = (analysis.timeData[i] - 128) / 128.0;
          const t2 = (analysis.timeData[(i + 128) % analysis.timeData.length] - 128) / 128.0;

          // Phase-space Lissajous projection
          const x = t1 * scaleX + Math.sin(rot * 2 + i * 0.05) * bass * 25;
          const y = t2 * scaleY + Math.cos(rot * 2 + i * 0.05) * mid * 25;

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Precision reticle grid (Engineering scope style)
        ctx.lineWidth = 0.75;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath();
        // Crosshair
        ctx.moveTo(-scaleX, 0);
        ctx.lineTo(scaleX, 0);
        ctx.moveTo(0, -scaleY);
        ctx.lineTo(0, scaleY);
        // Reticle ticks
        for (let x = -scaleX; x <= scaleX; x += scaleX / 4) {
          ctx.moveTo(x, -6);
          ctx.lineTo(x, 6);
        }
        for (let y = -scaleY; y <= scaleY; y += scaleY / 4) {
          ctx.moveTo(-6, y);
          ctx.lineTo(6, y);
        }
        ctx.stroke();

        ctx.restore();
      }

      // ==========================================
      // MODE 5: SPECTRUM & RIBBONS (Studio Mastering Bars)
      // ==========================================
      else if (mode === 'spectrum') {
        const bandsCount = 64;
        const barWidth = (width * 0.8) / bandsCount;
        const startX = width * 0.1;
        const baseY = height * 0.72;

        ctx.save();
        for (let i = 0; i < bandsCount; i++) {
          // Logarithmic bin sampling
          const binIndex = Math.min(
            analysis.freqData.length - 1,
            Math.floor(Math.pow(i / bandsCount, 1.7) * (analysis.freqData.length * 0.7))
          );
          const val = (analysis.freqData[binIndex] || 0) / 255.0;
          const barHeight = Math.max(3, val * height * 0.42 * sensitivity);

          const x = startX + i * barWidth;
          const y = baseY - barHeight;

          // Gradient bar
          const grad = ctx.createLinearGradient(x, baseY, x, y);
          grad.addColorStop(0, activeSecondary);
          grad.addColorStop(1, activeHighlight);

          ctx.fillStyle = grad;
          ctx.fillRect(x + 1, y, barWidth - 2, barHeight);

          // Peak cap line
          ctx.fillStyle = activeHighlight;
          ctx.fillRect(x + 1, y - 2, barWidth - 2, 2);
        }

        // Floating dynamic mirror ribbon above spectrum
        ctx.beginPath();
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = activeAccent;
        for (let i = 0; i < bandsCount; i++) {
          const binIndex = Math.floor((i / bandsCount) * 128);
          const val = (analysis.freqData[binIndex] || 0) / 255.0;
          const x = startX + i * barWidth + barWidth / 2;
          const y = baseY - val * height * 0.42 * sensitivity - 15;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.restore();
      }

      // Reset shadow blur to keep canvas clean
      ctx.shadowBlur = 0;

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, [analysis, bpmState, mode, warpFactor, sensitivity, bloomAmount]);

  // Mouse interaction handlers
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mousePosRef.current.x = (e.clientX - rect.left) / rect.width;
    mousePosRef.current.y = (e.clientY - rect.top) / rect.height;
  };

  return (
    <canvas
      ref={canvasRef}
      onPointerMove={handlePointerMove}
      onPointerDown={() => { mousePosRef.current.isDown = true; }}
      onPointerUp={() => { mousePosRef.current.isDown = false; }}
      data-testid="sigil-visualizer-canvas"
      className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
    />
  );
};
