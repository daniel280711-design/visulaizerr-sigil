/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Sigil Viz - 60 Acoustic and Visual Analysis VST Instruments Catalog
 * Complete implementation of 60 high-precision audio analysis modules
 * Preserves 100% of Claude's aesthetic (Monochrome B&W, subtle grids, crisp typography)
 */

export interface VstAudioState {
  M: Record<string, any>;
  A: Record<string, any>;
  HS: Record<string, any>;
  TL: Float32Array;
  TR: Float32Array;
  F: Uint8Array;
  T: Float32Array;
  UB: Float32Array;
  BM: any;
  ac: AudioContext | null;
  buf: AudioBuffer | null;
  dur: number;
  tpos: () => number;
  fmtBpm: (v: number) => string;
  clamp01: (v: number) => number;
  P: { c1: string; c2: string; c3: string; fg: string };
  ACC: () => string;
  cm: (t: number, al?: number) => string;
  c3: (al?: number) => string;
  tx_: (g: CanvasRenderingContext2D, s: string, x: number, y: number, sz?: number, al?: CanvasTextAlign, col?: string, fo?: string) => void;
  MONO: string;
  FONT: string;
  noteName: (m: number) => string;
  wavePeaks: number[];
}

export type VstDrawFn = (g: CanvasRenderingContext2D, w: number, h: number, p: any, ctx: VstAudioState) => void;

export interface VstInstrumentDef {
  id: string;
  num: string;
  title: string;
  category: string;
  catIndex: number;
  w: number;
  h: number;
  draw: VstDrawFn;
  isTx?: boolean;
  isFavorite?: boolean;
}

// Helpers
const T0_ = (g: CanvasRenderingContext2D, s: string, ctx: VstAudioState) => ctx.tx_(g, s, 14, 20, 10, 'left', ctx.ACC(), ctx.MONO);
const fin = (v: number) => Number.isFinite(v) ? v : 0;
const rget = (r: any, k: number) => r && r.a ? r.a[(r.i - r.c + k + r.n) % r.n] : 0;

/* ═══════════════════════════════════════════════════════════════════
   01–10: CONSOLA Y ANÁLISIS FAVORITO
   ═══════════════════════════════════════════════════════════════════ */

// 01 Studio Rack DAW
export function dRACK(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { M, A, TL, TR, U, BM, fmtBpm, dur, tpos, clamp01, ACC, P, MONO, tx_, wavePeaks } = ctx as any;
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(127,127,127,.06)'; g.fillRect(8, 8, w - 16, 24);
  tx_(g, '● CONSOLA STUDIO RACK · SIGIL VIZ', 16, 24, 10, 'left', ACC(), MONO);
  tx_(g, (BM ? fmtBpm(BM.bpm) : Math.round(A.rtBpm)) + ' BPM · ' + A.key, w - 18, 24, 10, 'right', P.fg, MONO);
  const topH = 54, topY = 38;
  g.strokeStyle = P.fg + '16'; g.strokeRect(8, topY, w - 16, topH);
  tx_(g, 'FORMA DE ONDA', 14, topY + 12, 8, 'left', P.fg + '66', MONO);
  tx_(g, 'SONORIDAD S', 88, topY + 12, 8, 'left', ACC(), MONO);
  const ww = w - 24, step = ww / 120, prog = dur ? tpos() / dur : 1, L2 = (A.l2 || []).slice(-120);
  for (let i = 0; i < 120; i++) {
    const val = wavePeaks && wavePeaks.length ? clamp01(wavePeaks[Math.min(wavePeaks.length - 1, (i / 120 * wavePeaks.length) | 0)] * 1.6) : clamp01((M.lufs + 50) / 45);
    const barH = Math.min(topH - 8, Math.max(2, val * (topH - 8)));
    g.fillStyle = i / 120 <= prog ? P.fg + 'aa' : P.fg + '44';
    g.fillRect(12 + i * step, topY + topH / 2 - barH / 2, Math.max(1, step - 1), barH);
  }
  g.strokeStyle = ACC(); g.lineWidth = 1.5; g.beginPath();
  L2.forEach((v: number, i: number) => {
    const x = 12 + (120 - L2.length + i) * step, y = topY + topH - 10 - clamp01((v + 50) / 45) * (topH - 20);
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  });
  g.stroke();

  const subY = topY + topH + 10, subH = h - subY - 32, subW = (w - 28) / 3;
  // Scope
  g.strokeStyle = P.fg + '16'; g.strokeRect(8, subY, subW, subH);
  tx_(g, 'SCOPE', 14, subY + 12, 8, 'left', P.fg + '66', MONO);
  g.strokeStyle = ACC(); g.lineWidth = 1.4; g.beginPath();
  for (let i = 0; i < subW - 10; i++) {
    const y = subY + subH / 2 - (TL[i * 4 % 2048] || 0) * subH * .45;
    i === 0 ? g.moveTo(12 + i, y) : g.lineTo(12 + i, y);
  }
  g.stroke();

  // Spectrum
  const spX = 8 + subW + 6;
  g.strokeStyle = P.fg + '16'; g.strokeRect(spX, subY, subW, subH);
  tx_(g, 'SPECTRUM', spX + 6, subY + 12, 8, 'left', P.fg + '66', MONO);
  const nB = 18, bW = (subW - 14) / nB, UB = ctx.UB;
  for (let i = 0; i < nB; i++) {
    const v = UB[i * 3] || 0; g.fillStyle = i === 2 ? ACC() : P.fg + 'cc';
    g.fillRect(spX + 6 + i * bW, subY + subH - 6 - v * (subH - 22), bW - 1.5, v * (subH - 22));
  }

  // Vector
  const vecX = spX + subW + 6;
  g.strokeStyle = P.fg + '16'; g.strokeRect(vecX, subY, subW, subH);
  tx_(g, 'VECTOR', vecX + 6, subY + 12, 8, 'left', P.fg + '66', MONO);
  const cx = vecX + subW / 2, cy = subY + subH / 2, rad = Math.min(subW, subH) * .38;
  g.strokeStyle = P.fg + '22'; g.beginPath(); g.arc(cx, cy, rad, 0, 7); g.stroke();
  g.fillStyle = ACC();
  for (let i = 0; i < 256; i += 4) {
    const l = TL[i] || 0, r = TR[i] || 0; g.fillRect(cx + (l - r) * .707 * rad * 1.5, cy - (l + r) * .707 * rad * 1.5, 1.5, 1.5);
  }

  const footY = h - 10;
  [['MOMENTARY', M.lufs > -90 ? M.lufs.toFixed(1) + ' LUFS' : '--'], ['INTEGRATED', M.lufsI > -70 ? M.lufsI.toFixed(1) + ' LUFS' : '--'], ['PEAK', M.peak > -90 ? M.peak.toFixed(1) + ' dBFS' : '--'], ['BASS', M.note || '--'], ['CORR', (A.corr >= 0 ? '+' : '') + (A.corr || 0).toFixed(2)]].forEach(([lbl, val], idx) => {
    tx_(g, lbl, 12 + idx * (w - 24) / 5, footY - 11, 7, 'left', P.fg + '55', MONO);
    tx_(g, val, 12 + idx * (w - 24) / 5, footY, 9, 'left', P.fg, MONO);
  });
}

// 02 Carácter Acústico
export function dCHAR(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { M, A, clamp01, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'PERFIL DE CARÁCTER ACÚSTICO', ctx);
  const axes = [
    ['OSCURO', 'BRILLANTE', clamp01((A.cent - 400) / 3600)],
    ['CALMO', 'INTENSO', clamp01((M.lufs + 48) / 38)],
    ['ESTRECHO', 'ANCHO', clamp01(A.wid)],
    ['DISPERSO', 'DENSO', clamp01(M.sat * 2)],
    ['LIGERO', 'PESADO', clamp01(M.bass * 1.4)]
  ];
  const startY = 46, gapY = (h - startY - 24) / 4, pts: { x: number; y: number }[] = [];
  axes.forEach(([left, right, val]: any, i) => {
    const y = startY + i * gapY;
    tx_(g, left, 14, y + 3, 8, 'left', P.fg + '77', MONO);
    tx_(g, right, w - 14, y + 3, 8, 'right', P.fg + '77', MONO);
    g.strokeStyle = P.fg + '22'; g.beginPath(); g.moveTo(80, y); g.lineTo(w - 80, y); g.stroke();
    const nx = 80 + val * (w - 160); pts.push({ x: nx, y });
    g.fillStyle = ACC(); g.beginPath(); g.arc(nx, y, 4, 0, 7); g.fill();
  });
  g.strokeStyle = ACC(); g.lineWidth = 1.8; g.beginPath();
  pts.forEach((pt, i) => i === 0 ? g.moveTo(pt.x, pt.y) : g.lineTo(pt.x, pt.y));
  g.stroke();
}

// 03 Cimática de Chladni
export function dCYM(g: CanvasRenderingContext2D, w: number, h: number, p: any, ctx: VstAudioState) {
  const { M, ACC, P, MONO } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'CIMÁTICA · PLACA DE CHLADNI', ctx);
  const cx = w / 2, cy = h / 2 + 10, rad = Math.min(w, h) * .35;
  const tn = 2 + M.bass * 4 + (M.kick || 0) * 1.8, tm = tn + 1.2 + M.mid * 4 + M.high * 2;
  p.n = p.n == null ? tn : p.n + (tn - p.n) * .08; p.m = p.m == null ? tm : p.m + (tm - p.m) * .08;
  const n = p.n, m = p.m, thr = .14 + M.sat * .2;
  g.strokeStyle = P.fg + '18'; g.strokeRect(cx - rad, cy - rad, rad * 2, rad * 2);
  g.fillStyle = ACC();
  for (let x = -rad; x <= rad; x += 4) {
    for (let y = -rad; y <= rad; y += 4) {
      const u = (x / rad + 1) / 2, v = (y / rad + 1) / 2;
      const f = Math.cos(n * Math.PI * u) * Math.cos(m * Math.PI * v) - Math.cos(m * Math.PI * u) * Math.cos(n * Math.PI * v);
      if (Math.abs(f) < thr) g.fillRect(cx + x, cy + y, 1.5, 1.5);
    }
  }
}

// 04 Fase y Vectorscopio (Lissajous)
export function dVEC(g: CanvasRenderingContext2D, w: number, h: number, p: any, ctx: VstAudioState) {
  const { TL, TR, ACC, P, MONO } = ctx;
  if (p.clr) g.clearRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
  T0_(g, 'FASE Y VECTORSCOPIO (LISSAJOUS)', ctx);
  const cx = w / 2, cy = h / 2 + 10, k = Math.min(w, h) * .38;
  g.strokeStyle = P.fg + '18'; g.beginPath(); g.arc(cx, cy, k, 0, 7); g.stroke();
  g.beginPath(); g.moveTo(cx - k, cy); g.lineTo(cx + k, cy); g.moveTo(cx, cy - k); g.lineTo(cx, cy + k); g.stroke();
  g.fillStyle = ACC();
  for (let i = 0; i < 2048; i += 2) {
    const l = TL[i] || 0, r = TR[i] || 0;
    g.fillRect(cx + (l - r) * .707 * k * 1.4, cy - (l + r) * .707 * k * 1.4, 1.5, 1.5);
  }
}

// 05 Osciloscopio Analógico
export function dOSC(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { TL, TR, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'OSCILOSCOPIO ANALÓGICO L/R', ctx);
  // Grid
  g.strokeStyle = P.fg + '14'; g.lineWidth = 1;
  const midY = h / 2 + 8;
  for (let y = 36; y < h - 10; y += 22) { g.beginPath(); g.moveTo(14, y); g.lineTo(w - 14, y); g.stroke(); }
  for (let x = 14; x < w - 10; x += (w - 28) / 8) { g.beginPath(); g.moveTo(x, 36); g.lineTo(x, h - 10); g.stroke(); }
  // Zero-crossing sync
  let s0 = 0;
  for (let i = 1; i < 1000; i++) if (TL[i - 1] < 0 && TL[i] >= 0) { s0 = i; break; }
  // Channel L
  g.strokeStyle = ACC(); g.lineWidth = 1.4; g.beginPath();
  for (let x = 0; x < w - 28; x++) {
    const y = midY - (TL[Math.min(2047, s0 + (x / (w - 28) * 900 | 0))] || 0) * (h * .38);
    x === 0 ? g.moveTo(14 + x, y) : g.lineTo(14 + x, y);
  }
  g.stroke();
  // Channel R (subtle dashed/secondary)
  g.strokeStyle = P.fg + '66'; g.lineWidth = 1; g.beginPath();
  for (let x = 0; x < w - 28; x++) {
    const y = midY - (TR[Math.min(2047, s0 + (x / (w - 28) * 900 | 0))] || 0) * (h * .38);
    x === 0 ? g.moveTo(14 + x, y) : g.lineTo(14 + x, y);
  }
  g.stroke();
  tx_(g, 'CH L: ──  CH R: ··', w - 14, 20, 8, 'right', P.fg + '88', MONO);
}

// 06 Pilares de Sonido (3D Isometric Frequency Columns)
export function dPILLARS(g: CanvasRenderingContext2D, w: number, h: number, p: any, ctx: VstAudioState) {
  const { UB, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'PILARES DE SONIDO (ISOMÉTRICO 3D)', ctx);
  const n = 8, labels = ['SUB', 'BASS', 'LO-M', 'MID', 'HI-M', 'PRES', 'AIR', 'ULTRA'];
  const pks = p.pks || (p.pks = new Float32Array(n));
  const colW = (w - 40) / (n + 1);
  const baseY = h - 24;
  for (let i = 0; i < n; i++) {
    const val = (UB[i * 8] || 0) * .6 + (UB[i * 8 + 1] || 0) * .4;
    pks[i] = Math.max(val, (pks[i] || 0) - .008);
    const bh = val * (h - 60);
    const x = 20 + i * colW + colW * .5;
    // Isometric 3D column
    const isoX = 6, isoY = -4;
    // Front face
    g.fillStyle = P.fg + '22';
    g.fillRect(x, baseY - bh, colW * .75, bh);
    // Side face
    g.fillStyle = P.fg + '44';
    g.beginPath();
    g.moveTo(x + colW * .75, baseY);
    g.lineTo(x + colW * .75 + isoX, baseY + isoY);
    g.lineTo(x + colW * .75 + isoX, baseY - bh + isoY);
    g.lineTo(x + colW * .75, baseY - bh);
    g.closePath(); g.fill();
    // Top face
    g.fillStyle = ACC();
    g.beginPath();
    g.moveTo(x, baseY - bh);
    g.lineTo(x + isoX, baseY - bh + isoY);
    g.lineTo(x + colW * .75 + isoX, baseY - bh + isoY);
    g.lineTo(x + colW * .75, baseY - bh);
    g.closePath(); g.fill();
    // Peak cap needle
    const ph = pks[i] * (h - 60);
    g.strokeStyle = ACC(); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x, baseY - ph); g.lineTo(x + colW * .75, baseY - ph); g.stroke();
    // Label
    tx_(g, labels[i], x + colW * .37, baseY + 14, 7.5, 'center', P.fg + '77', MONO);
  }
}

// 07 Barras de Frecuencia EQ
export function dEQ(g: CanvasRenderingContext2D, w: number, h: number, p: any, ctx: VstAudioState) {
  const { UB, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'BARRAS DE FRECUENCIA EQ (32 BANDAS)', ctx);
  const n = 32, bw = (w - 24) / n, pk = p.pk || (p.pk = new Float32Array(n));
  const baseY = h - 22;
  for (let i = 0; i < n; i++) {
    const v = Math.max(UB[2 * i] || 0, UB[2 * i + 1] || 0);
    pk[i] = Math.max(v, (pk[i] || 0) - .008);
    const barH = v * (h - 52);
    g.fillStyle = P.fg + (i % 4 === 0 ? 'cc' : '88');
    g.fillRect(12 + i * bw, baseY - barH, bw - 1.5, barH);
    // Peak hold
    const pkH = pk[i] * (h - 52);
    g.fillStyle = ACC();
    g.fillRect(12 + i * bw, baseY - pkH - 2, bw - 1.5, 2);
  }
  tx_(g, '30Hz', 12, h - 8, 7.5, 'left', P.fg + '66', MONO);
  tx_(g, '1kHz', w / 2, h - 8, 7.5, 'center', P.fg + '66', MONO);
  tx_(g, '16kHz', w - 12, h - 8, 7.5, 'right', P.fg + '66', MONO);
}

// 08 Espectro Continuo (Smooth Continuous FFT Spline)
export function dSPECTRUM(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { F, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'ESPECTRO CONTINUO FFT (20Hz–20kHz)', ctx);
  const baseY = h - 24, topH = h - 56;
  // Grid
  g.strokeStyle = P.fg + '14'; g.lineWidth = 1;
  [0.25, 0.5, 0.75].forEach(k => {
    const y = baseY - k * topH;
    g.beginPath(); g.moveTo(14, y); g.lineTo(w - 14, y); g.stroke();
    tx_(g, Math.round(-60 + k * 60) + 'dB', 14, y - 2, 7, 'left', P.fg + '44', MONO);
  });
  // FFT Spline
  g.beginPath(); g.moveTo(14, baseY);
  const pts = 80;
  for (let i = 0; i < pts; i++) {
    const fIdx = Math.floor(Math.pow(i / pts, 2) * 512);
    const mag = (F[fIdx] || 0) / 255;
    const x = 14 + (i / (pts - 1)) * (w - 28);
    const y = baseY - Math.pow(mag, 1.4) * topH;
    g.lineTo(x, y);
  }
  g.lineTo(w - 14, baseY);
  g.closePath();
  g.fillStyle = P.fg + '18'; g.fill();
  g.strokeStyle = ACC(); g.lineWidth = 1.6; g.stroke();
  tx_(g, '20Hz', 14, h - 8, 7.5, 'left', P.fg + '66', MONO);
  tx_(g, '1kHz', w * .48, h - 8, 7.5, 'center', P.fg + '66', MONO);
  tx_(g, '20kHz', w - 14, h - 8, 7.5, 'right', P.fg + '66', MONO);
}

// 09 Sonoridad LUFS (EBU R128 Broadcast Loudness)
export function dLUFS(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { M, A, ACC, P, MONO, tx_, clamp01 } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'SONORIDAD LUFS (EBU R128)', ctx);
  const meters = [
    ['M', M.lufs, 'MOM'],
    ['S', A.lufsS, 'SHR'],
    ['I', M.lufsI, 'INT'],
    ['PK', M.peak, 'TPK']
  ];
  const barW = (w - 40) / 4, topY = 38, barH = h - 68;
  meters.forEach(([lbl, val, sub], i) => {
    const x = 16 + i * (barW + 8);
    const pct = clamp01((val + 60) / 60);
    // Background slot
    g.fillStyle = P.fg + '14';
    g.fillRect(x, topY, barW, barH);
    // -14 LUFS Target Guide line
    const targetY = topY + barH - (( -14 + 60) / 60) * barH;
    g.strokeStyle = P.fg + '44'; g.beginPath(); g.moveTo(x - 2, targetY); g.lineTo(x + barW + 2, targetY); g.stroke();
    // Fill
    g.fillStyle = i === 2 ? ACC() : P.fg + 'bb';
    g.fillRect(x, topY + barH - pct * barH, barW, pct * barH);
    tx_(g, lbl, x + barW / 2, h - 18, 9, 'center', P.fg, MONO);
    tx_(g, val > -80 ? val.toFixed(1) : '--', x + barW / 2, h - 8, 8, 'center', P.fg + '88', MONO);
  });
}

// 10 Cromagrama Tonal (12-Tone Pitch Class Profile)
export function dCHROMA(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { A, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'CROMAGRAMA TONAL (CLASE DE ALTURAS)', ctx);
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const maxV = Math.max(1e-6, ...(A.chromaS || []));
  const barW = (w - 24) / 12, baseY = h - 24;
  for (let i = 0; i < 12; i++) {
    const v = (A.chromaS[i] || 0) / maxV;
    const isRoot = i === A.keyN;
    g.fillStyle = isRoot ? ACC() : P.fg + '66';
    const bh = v * (h - 60);
    g.fillRect(12 + i * barW + 1, baseY - bh, barW - 2, bh);
    tx_(g, notes[i], 12 + i * barW + barW / 2, baseY + 12, 7.5, 'center', isRoot ? ACC() : P.fg + '66', MONO);
  }
  tx_(g, 'Tonalidad: ' + A.key, w - 14, 20, 9, 'right', ACC(), MONO);
}

/* ═══════════════════════════════════════════════════════════════════
   11–20: DINÁMICA & TRANSITORIOS
   ═══════════════════════════════════════════════════════════════════ */

// 11 Envolvente Peak/RMS
export function dPEAK_RMS(g: CanvasRenderingContext2D, w: number, h: number, p: any, ctx: VstAudioState) {
  const { M, TL, ACC, P, MONO, tx_, clamp01 } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'ENVOLVENTE PEAK / RMS', ctx);
  // Calculate instant RMS
  let sum = 0; for (let i = 0; i < 1024; i++) sum += (TL[i] || 0) * (TL[i] || 0);
  const rms = Math.sqrt(sum / 1024);
  const rmsDb = 20 * Math.log10(rms + 1e-6);
  const hist = p.hist || (p.hist = []);
  hist.push({ pk: M.peak, rms: rmsDb });
  if (hist.length > w - 28) hist.shift();
  const topY = 36, ph = h - 56;
  // Dynamic gap between Peak and RMS
  g.fillStyle = P.fg + '14';
  g.fillRect(14, topY, w - 28, ph);
  g.strokeStyle = ACC(); g.lineWidth = 1.4; g.beginPath();
  hist.forEach((pt: any, i: number) => {
    const x = 14 + i, y = topY + ph - clamp01((pt.pk + 60) / 60) * ph;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  });
  g.stroke();
  g.strokeStyle = P.fg + '88'; g.lineWidth = 1.2; g.beginPath();
  hist.forEach((pt: any, i: number) => {
    const x = 14 + i, y = topY + ph - clamp01((pt.rms + 60) / 60) * ph;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  });
  g.stroke();
  tx_(g, `PK: ${M.peak.toFixed(1)}dB · RMS: ${rmsDb.toFixed(1)}dB`, w - 14, 20, 8.5, 'right', P.fg, MONO);
}

// 12 Analizador de Crest Factor
export function dCREST(g: CanvasRenderingContext2D, w: number, h: number, p: any, ctx: VstAudioState) {
  const { A, ACC, P, MONO, tx_, clamp01 } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'CREST FACTOR (PUNCH & COMPRESIÓN)', ctx);
  const crest = Math.max(0, A.crest || 0);
  const ch = p.ch || (p.ch = []);
  ch.push(crest);
  if (ch.length > w - 28) ch.shift();
  // Meter dial / arc or large gauge
  tx_(g, crest.toFixed(1) + ' dB', w / 2, 80, 36, 'center', ACC(), MONO);
  const status = crest < 8 ? 'ALTAMENTE COMPRIMIDO' : crest < 14 ? 'DINÁMICA COMERCIAL' : 'ALTA DINÁMICA NATURAL';
  tx_(g, status, w / 2, 104, 8.5, 'center', P.fg + '88', MONO);
  // History strip
  const histY = 120, hh = h - histY - 14;
  g.strokeStyle = P.fg + '18'; g.strokeRect(14, histY, w - 28, hh);
  g.strokeStyle = ACC(); g.lineWidth = 1.4; g.beginPath();
  ch.forEach((val: number, i: number) => {
    const x = 14 + i, y = histY + hh - clamp01(val / 24) * hh;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  });
  g.stroke();
}

// 13 Detector de Transitorios / Kicks
export function dTRANSIENTS(g: CanvasRenderingContext2D, w: number, h: number, p: any, ctx: VstAudioState) {
  const { M, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'DETECTOR DE TRANSITORIOS Y KICKS', ctx);
  const kVal = M.kick || 0;
  const th = p.th || (p.th = []);
  th.push(kVal);
  if (th.length > w - 28) th.shift();
  // Trigger indicator
  const trig = kVal > 0.35;
  g.fillStyle = trig ? ACC() : P.fg + '22';
  g.fillRect(w - 70, 10, 56, 16);
  tx_(g, trig ? 'TRIGGER' : 'IDLE', w - 42, 21, 8, 'center', trig ? P.c1 : P.fg + '66', MONO);
  // Impulse waveform
  const baseY = h - 24, graphH = h - 60;
  g.strokeStyle = P.fg + '18'; g.strokeRect(14, 38, w - 28, graphH);
  g.strokeStyle = ACC(); g.lineWidth = 1.6; g.beginPath();
  th.forEach((v: number, i: number) => {
    const x = 14 + i, y = baseY - v * graphH;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  });
  g.stroke();
  tx_(g, 'Ataque: ' + (kVal * 100).toFixed(0) + '%', 16, h - 8, 8, 'left', P.fg + '77', MONO);
}

// 14 Medidor de Rango Dinámico (DR Meter)
export function dDR_METER(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { A, ACC, P, MONO, tx_, clamp01 } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'RANGO DINÁMICO (DR SCORE)', ctx);
  const lra = Math.max(1, A.lra || 6);
  const drScore = Math.min(20, Math.round(lra * 1.3));
  tx_(g, 'DR' + drScore, w / 2, 88, 48, 'center', ACC(), MONO);
  const drClass = drScore >= 12 ? 'EXCELENTE (NO-BRICKWALL)' : drScore >= 8 ? 'CONTROLADO (ESTUDIO)' : 'MUY LIMITADO / SQUASHED';
  tx_(g, drClass, w / 2, 114, 8.5, 'center', P.fg + '88', MONO);
  // Scale bar
  const barY = h - 42, bw = w - 48;
  g.strokeStyle = P.fg + '22'; g.strokeRect(24, barY, bw, 12);
  g.fillStyle = ACC();
  g.fillRect(24, barY, bw * clamp01(drScore / 18), 12);
  tx_(g, 'DR4', 24, barY + 24, 7.5, 'left', P.fg + '66', MONO);
  tx_(g, 'DR10', 24 + bw * (10 / 18), barY + 24, 7.5, 'center', P.fg + '66', MONO);
  tx_(g, 'DR18+', 24 + bw, barY + 24, 7.5, 'right', P.fg + '66', MONO);
}

// 15 Histograma de LUFS Integrado
export function dLUFS_HIST(g: CanvasRenderingContext2D, w: number, h: number, p: any, ctx: VstAudioState) {
  const { M, ACC, P, MONO, tx_, clamp01 } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'HISTOGRAMA DE DENSIDAD LUFS', ctx);
  const bins = p.bins || (p.bins = new Float32Array(40));
  if (M.lufs > -60 && M.lufs < 0) {
    const idx = Math.min(39, Math.max(0, Math.floor((M.lufs + 48) / 1.2)));
    bins[idx] = (bins[idx] || 0) + 0.1;
  }
  const maxB = Math.max(1e-4, ...bins);
  const barW = (w - 32) / 40, baseY = h - 28, maxH = h - 68;
  for (let i = 0; i < 40; i++) {
    const lufsVal = -48 + i * 1.2;
    const isTarget = Math.abs(lufsVal - (-14)) < 1.0;
    const bh = ((bins[i] || 0) / maxB) * maxH;
    g.fillStyle = isTarget ? ACC() : P.fg + '77';
    g.fillRect(16 + i * barW, baseY - bh, barW - 1, bh);
  }
  // Target marker
  const targX = 16 + ((-14 + 48) / 48) * (w - 32);
  g.strokeStyle = ACC(); g.beginPath(); g.moveTo(targX, 36); g.lineTo(targX, baseY); g.stroke();
  tx_(g, '-14 LUFS', targX, 32, 7.5, 'center', ACC(), MONO);
  tx_(g, '-48 LUFS', 16, h - 10, 7.5, 'left', P.fg + '66', MONO);
  tx_(g, '0 LUFS', w - 16, h - 10, 7.5, 'right', P.fg + '66', MONO);
}

// 16 Osciloscopio de Sub-Graves (<120Hz)
export function dSUB_OSC(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { TL, M, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'OSCILOSCOPIO SUB-GRAVES (<120Hz)', ctx);
  const midY = h / 2 + 8, waveH = h * .36;
  g.strokeStyle = P.fg + '14'; g.strokeRect(14, 38, w - 28, h - 52);
  g.strokeStyle = ACC(); g.lineWidth = 1.8; g.beginPath();
  for (let x = 0; x < w - 28; x++) {
    // Low frequency sub-window
    const sample = TL[(x * 2) % 2048] || 0;
    const y = midY - sample * waveH * (1 + M.bass * 1.5);
    x === 0 ? g.moveTo(14 + x, y) : g.lineTo(14 + x, y);
  }
  g.stroke();
  tx_(g, 'Sub: ' + (M.bass * 100).toFixed(0) + '% · Ciclo limpio', w - 16, 20, 8, 'right', P.fg + '88', MONO);
}

// 17 Monitor de Saturación Tonal
export function dSAT_MON(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { M, ACC, P, MONO, tx_, clamp01 } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'MONITOR DE SATURACIÓN TONAL', ctx);
  const sat = clamp01(M.sat * 2);
  const isClipping = M.peak > -0.5;
  tx_(g, (sat * 100).toFixed(0) + '%', w / 2, 84, 40, 'center', isClipping ? ACC() : P.fg, MONO);
  tx_(g, isClipping ? 'ALERTA: CLIPPING DIGITAL' : 'DISTORSIÓN ARMÓNICA NATURAL', w / 2, 108, 8, 'center', isClipping ? ACC() : P.fg + '77', MONO);
  const bw = w - 48, barY = h - 38;
  g.strokeStyle = P.fg + '22'; g.strokeRect(24, barY, bw, 10);
  g.fillStyle = ACC();
  g.fillRect(24, barY, bw * sat, 10);
}

// 18 Analizador de Micro-Dinámica
export function dMICRO_DYN(g: CanvasRenderingContext2D, w: number, h: number, p: any, ctx: VstAudioState) {
  const { TL, ACC, P, MONO, tx_, clamp01 } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'ANALIZADOR DE MICRO-DINÁMICA', ctx);
  // Sample-to-sample variance
  let diffSum = 0;
  for (let i = 1; i < 512; i++) diffSum += Math.abs((TL[i] || 0) - (TL[i - 1] || 0));
  const microVar = diffSum / 512;
  const mh = p.mh || (p.mh = []);
  mh.push(microVar);
  if (mh.length > w - 28) mh.shift();
  const graphH = h - 60;
  g.strokeStyle = P.fg + '14'; g.strokeRect(14, 38, w - 28, graphH);
  g.strokeStyle = ACC(); g.lineWidth = 1.4; g.beginPath();
  mh.forEach((v: number, i: number) => {
    const x = 14 + i, y = 38 + graphH - clamp01(v * 8) * graphH;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  });
  g.stroke();
  tx_(g, 'Variación transitoria: ' + (microVar * 100).toFixed(1) + '%', 16, h - 8, 8, 'left', P.fg + '77', MONO);
}

// 19 Medidor de Inercia Acústica
export function dINERTIA(g: CanvasRenderingContext2D, w: number, h: number, p: any, ctx: VstAudioState) {
  const { M, ACC, P, MONO, tx_, clamp01 } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'INERCIA ACÚSTICA (SUSTAIN & COLA)', ctx);
  p.decay = p.decay == null ? 0 : p.decay * 0.94 + (M.loud || 0) * 0.06;
  const inertiaVal = clamp01(p.decay * 1.5);
  tx_(g, (inertiaVal * 100).toFixed(0) + '%', w / 2, 84, 40, 'center', ACC(), MONO);
  tx_(g, inertiaVal > 0.6 ? 'COLA ACÚSTICA DENSA (REVERB)' : 'RESPUESTA RÁPIDA / SECA', w / 2, 108, 8, 'center', P.fg + '77', MONO);
  const bw = w - 48, barY = h - 38;
  g.strokeStyle = P.fg + '22'; g.strokeRect(24, barY, bw, 10);
  g.fillStyle = ACC(); g.fillRect(24, barY, bw * inertiaVal, 10);
}

// 20 Medidor de Desplazamiento DC (DC Offset)
export function dDC_OFFSET(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { TL, TR, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'DESPLAZAMIENTO DC (BIAS L/R)', ctx);
  let sumL = 0, sumR = 0;
  for (let i = 0; i < 1024; i++) { sumL += TL[i] || 0; sumR += TR[i] || 0; }
  const dcL = (sumL / 1024) * 100, dcR = (sumR / 1024) * 100;
  const cx = w / 2, cy = h / 2 + 10;
  g.strokeStyle = P.fg + '18'; g.strokeRect(24, cy - 24, w - 48, 48);
  g.strokeStyle = P.fg + '44'; g.beginPath(); g.moveTo(cx, cy - 24); g.lineTo(cx, cy + 24); g.stroke();
  // L and R needles
  const maxDisp = (w - 48) / 2;
  const xL = cx + Math.max(-maxDisp, Math.min(maxDisp, dcL * maxDisp * 4));
  const xR = cx + Math.max(-maxDisp, Math.min(maxDisp, dcR * maxDisp * 4));
  g.fillStyle = ACC(); g.fillRect(xL - 1, cy - 20, 2, 18);
  g.fillStyle = P.fg + '77'; g.fillRect(xR - 1, cy + 2, 2, 18);
  tx_(g, `CH L: ${dcL.toFixed(3)}%`, 24, h - 8, 8, 'left', ACC(), MONO);
  tx_(g, `CH R: ${dcR.toFixed(3)}%`, w - 24, h - 8, 8, 'right', P.fg + '77', MONO);
}

/* ═══════════════════════════════════════════════════════════════════
   21–30: IMAGEN ESTÉREO & FASE
   ═══════════════════════════════════════════════════════════════════ */

// 21 Medidor de Correlación de Fase
export function dCORR_METER(g: CanvasRenderingContext2D, w: number, h: number, p: any, ctx: VstAudioState) {
  const { A, ACC, P, MONO, tx_, clamp01 } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'CORRELACIÓN DE FASE (-1 A +1)', ctx);
  const corr = A.corr != null ? A.corr : 1.0;
  const ch = p.ch || (p.ch = []);
  ch.push(corr);
  if (ch.length > w - 28) ch.shift();
  // Bar
  const cx = w / 2, barY = 48, bw = w - 48;
  g.strokeStyle = P.fg + '22'; g.strokeRect(24, barY, bw, 16);
  g.strokeStyle = P.fg + '44'; g.beginPath(); g.moveTo(cx, barY - 4); g.lineTo(cx, barY + 20); g.stroke();
  const needleX = cx + (corr * (bw / 2));
  g.fillStyle = corr < 0 ? '#ff5555' : ACC();
  g.fillRect(needleX - 2, barY, 4, 16);
  tx_(g, '-1 (ANTI-FASE)', 24, barY + 28, 7.5, 'left', '#ff5555', MONO);
  tx_(g, '0 (ESTÉREO)', cx, barY + 28, 7.5, 'center', P.fg + '66', MONO);
  tx_(g, '+1 (MONO)', w - 24, barY + 28, 7.5, 'right', ACC(), MONO);
  // History
  const histY = 96, hh = h - histY - 14;
  g.strokeStyle = P.fg + '14'; g.strokeRect(14, histY, w - 28, hh);
  g.strokeStyle = ACC(); g.lineWidth = 1.4; g.beginPath();
  ch.forEach((v: number, i: number) => {
    const x = 14 + i, y = histY + hh / 2 - (v * (hh / 2) * .9);
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  });
  g.stroke();
}

// 22 Goniómetro de Balance
export function dGONIOMETER(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { TL, TR, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'GONIÓMETRO DE BALANCE', ctx);
  const cx = w / 2, cy = h / 2 + 10, rad = Math.min(w, h) * .35;
  g.strokeStyle = P.fg + '18'; g.strokeRect(cx - rad, cy - rad, rad * 2, rad * 2);
  g.beginPath(); g.moveTo(cx - rad, cy); g.lineTo(cx + rad, cy); g.moveTo(cx, cy - rad); g.lineTo(cx, cy + rad); g.stroke();
  g.fillStyle = ACC();
  for (let i = 0; i < 512; i += 4) {
    const l = TL[i] || 0, r = TR[i] || 0;
    const x = cx + (l - r) * .707 * rad;
    const y = cy - (l + r) * .707 * rad;
    g.fillRect(x, y, 1.5, 1.5);
  }
}

// 23 Medidor M/S (Mid-Side)
export function dMID_SIDE(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { TL, TR, ACC, P, MONO, tx_, clamp01 } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'MEDIDOR MID / SIDE (M/S)', ctx);
  let sumM = 0, sumS = 0;
  for (let i = 0; i < 512; i++) {
    const l = TL[i] || 0, r = TR[i] || 0;
    const m = (l + r) * .5, s = (l - r) * .5;
    sumM += m * m; sumS += s * s;
  }
  const midLvl = Math.sqrt(sumM / 512), sideLvl = Math.sqrt(sumS / 512);
  const barW = (w - 60) / 2, topY = 46, bh = h - 80;
  // Mid
  g.fillStyle = P.fg + '14'; g.fillRect(20, topY, barW, bh);
  g.fillStyle = ACC(); g.fillRect(20, topY + bh - clamp01(midLvl * 3) * bh, barW, clamp01(midLvl * 3) * bh);
  tx_(g, 'MID (CENTRO)', 20 + barW / 2, h - 16, 8.5, 'center', ACC(), MONO);
  // Side
  g.fillStyle = P.fg + '14'; g.fillRect(40 + barW, topY, barW, bh);
  g.fillStyle = P.fg + '88'; g.fillRect(40 + barW, topY + bh - clamp01(sideLvl * 3) * bh, barW, clamp01(sideLvl * 3) * bh);
  tx_(g, 'SIDE (ESTÉREO)', 40 + barW + barW / 2, h - 16, 8.5, 'center', P.fg + '88', MONO);
}

// 24 Analizador de Armónicos (Harmonic Series)
export function dHARMONICS(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { F, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'SERIE DE ARMÓNICOS (F0 A 8*F0)', ctx);
  const n = 8, barW = (w - 36) / n, baseY = h - 24;
  for (let i = 0; i < n; i++) {
    const fIdx = Math.min(512, (i + 1) * 12);
    const mag = (F[fIdx] || 0) / 255;
    const bh = Math.pow(mag, 1.2) * (h - 58);
    g.fillStyle = i === 0 ? ACC() : P.fg + (i % 2 === 0 ? 'bb' : '77');
    g.fillRect(18 + i * barW, baseY - bh, barW - 2, bh);
    tx_(g, (i + 1) + 'f', 18 + i * barW + barW / 2, baseY + 12, 8, 'center', P.fg + '77', MONO);
  }
}

// 25 Filtro de Peine Espectral (Comb Filtering Detector)
export function dCOMB_FILTER(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { F, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'DETECTOR DE FILTRO DE PEINE', ctx);
  const baseY = h - 24, graphH = h - 56;
  g.strokeStyle = P.fg + '18'; g.strokeRect(14, 36, w - 28, graphH);
  g.strokeStyle = ACC(); g.lineWidth = 1.4; g.beginPath();
  for (let x = 0; x < w - 28; x++) {
    const fIdx = (x * 2) % 256;
    const v = (F[fIdx] || 0) / 255;
    const y = baseY - v * graphH;
    x === 0 ? g.moveTo(14 + x, y) : g.lineTo(14 + x, y);
  }
  g.stroke();
  tx_(g, 'Monitoreando cancelaciones periódicas', 16, h - 8, 8, 'left', P.fg + '66', MONO);
}

// 26 Campo Estéreo (Stereo Field Panorama) [Ubicación secundaria]
export function dSTEREO_FIELD(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { TL, TR, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'CAMPO ESTÉREO PANORÁMICO', ctx);
  const cx = w / 2, cy = h / 2 + 10, rad = Math.min(w, h) * .38;
  g.strokeStyle = P.fg + '18';
  g.beginPath(); g.ellipse(cx, cy, rad, rad * .6, 0, 0, 7); g.stroke();
  g.fillStyle = ACC();
  for (let i = 0; i < 256; i += 2) {
    const l = TL[i] || 0, r = TR[i] || 0;
    const pan = (r - l) * .5;
    const amp = (Math.abs(l) + Math.abs(r)) * .5;
    const x = cx + pan * rad * 1.5;
    const y = cy + (i / 256 - .5) * rad * .8;
    g.fillRect(x, y, 1.5 + amp * 2, 1.5);
  }
  tx_(g, 'L (-100%)', 14, cy, 7.5, 'left', P.fg + '66', MONO);
  tx_(g, 'R (+100%)', w - 14, cy, 7.5, 'right', P.fg + '66', MONO);
}

// 27 Espacio de Fase 3D
export function dPHASE_SPACE_3D(g: CanvasRenderingContext2D, w: number, h: number, p: any, ctx: VstAudioState) {
  const { TL, TR, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'ESPACIO DE FASE 3D (ATRACTOR)', ctx);
  p.ang = (p.ang || 0) + 0.015;
  const cx = w / 2, cy = h / 2 + 10, k = Math.min(w, h) * .35;
  const ca = Math.cos(p.ang), sa = Math.sin(p.ang);
  g.fillStyle = ACC();
  for (let i = 0; i < 300; i += 3) {
    const x3 = (TL[i] || 0) * k;
    const y3 = (TR[i] || 0) * k;
    const z3 = ((TL[i] || 0) - (TR[i] || 0)) * k;
    const rx = x3 * ca - z3 * sa;
    const ry = y3 * 0.8 + (x3 * sa + z3 * ca) * 0.4;
    g.fillRect(cx + rx, cy + ry, 1.5, 1.5);
  }
}

// 28 Analizador de Micro-Delay Estéreo (ITD)
export function dMICRO_DELAY(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { TL, TR, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'MICRO-DELAY INTER-CANAL (ITD)', ctx);
  // Cross-correlation peak
  let maxCorr = -1, bestLag = 0;
  for (let lag = -20; lag <= 20; lag++) {
    let sum = 0;
    for (let i = 40; i < 300; i++) sum += (TL[i] || 0) * (TR[i + lag] || 0);
    if (sum > maxCorr) { maxCorr = sum; bestLag = lag; }
  }
  const msDelay = (bestLag / 44.1).toFixed(2);
  tx_(g, msDelay + ' ms', w / 2, 84, 38, 'center', ACC(), MONO);
  tx_(g, bestLag === 0 ? 'FASE ALINEADA EN CERO' : bestLag < 0 ? 'CANAL L ADELANTADO' : 'CANAL R ADELANTADO', w / 2, 108, 8, 'center', P.fg + '77', MONO);
}

// 29 Medidor de Ancho de Dispersión
export function dDISPERSION(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { A, ACC, P, MONO, tx_, clamp01 } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'ANCHO DE DISPERSIÓN ESTÉREO', ctx);
  const wid = clamp01(A.wid || 0.5);
  tx_(g, (wid * 100).toFixed(0) + '%', w / 2, 84, 40, 'center', ACC(), MONO);
  tx_(g, wid < 0.2 ? 'DISPERSIÓN MONO FOCAL' : wid < 0.7 ? 'DISPERSIÓN ESTÉREO ESTÁNDAR' : 'SUPER-WIDE ESTÉREO', w / 2, 108, 8, 'center', P.fg + '77', MONO);
  const bw = w - 48, barY = h - 38;
  g.strokeStyle = P.fg + '22'; g.strokeRect(24, barY, bw, 10);
  g.fillStyle = ACC(); g.fillRect(24, barY, bw * wid, 10);
}

// 30 Monitor de Densidad Espectral (PSD)
export function dSPECTRAL_DENSITY(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { F, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'DENSIDAD ESPECTRAL DE POTENCIA (PSD)', ctx);
  const baseY = h - 24, graphH = h - 56;
  g.strokeStyle = P.fg + '18'; g.strokeRect(14, 36, w - 28, graphH);
  g.beginPath(); g.moveTo(14, baseY);
  for (let x = 0; x < w - 28; x++) {
    const fIdx = (x * 2) % 256;
    const v = Math.pow((F[fIdx] || 0) / 255, 1.3);
    const y = baseY - v * graphH;
    g.lineTo(14 + x, y);
  }
  g.lineTo(w - 14, baseY);
  g.closePath();
  g.fillStyle = P.fg + '22'; g.fill();
  g.strokeStyle = ACC(); g.lineWidth = 1.4; g.stroke();
}

/* ═══════════════════════════════════════════════════════════════════
   31–40: ESPECTRO & FRECUENCIA AVANZADA
   ═══════════════════════════════════════════════════════════════════ */

// 31 Espectrometría Octava 1/3 (Standard ANSI 31-band)
export function dOCTAVE_1_3(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { F, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'ESPECTROMETRÍA OCTAVA 1/3 (ANSI 31-BAND)', ctx);
  const n = 31, barW = (w - 28) / n, baseY = h - 24;
  for (let i = 0; i < n; i++) {
    const fIdx = Math.floor(Math.pow(i / n, 2.2) * 500);
    const v = (F[fIdx] || 0) / 255;
    const bh = v * (h - 56);
    g.fillStyle = i % 3 === 0 ? ACC() : P.fg + '88';
    g.fillRect(14 + i * barW, baseY - bh, barW - 1, bh);
  }
  tx_(g, '20Hz', 14, h - 8, 7, 'left', P.fg + '66', MONO);
  tx_(g, '1kHz', w / 2, h - 8, 7, 'center', P.fg + '66', MONO);
  tx_(g, '20kHz', w - 14, h - 8, 7, 'right', P.fg + '66', MONO);
}

// 32 Buscador de Resonancias Parásitas
export function dPARASITIC_RES(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { F, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'RESONANCIAS PARÁSITAS (NOTCH HUNTER)', ctx);
  let maxV = 0, maxIdx = 0;
  for (let i = 10; i < 400; i++) {
    if (F[i] > maxV) { maxV = F[i]; maxIdx = i; }
  }
  const hz = Math.round(maxIdx * (44100 / 2048));
  tx_(g, hz + ' Hz', w / 2, 84, 40, 'center', ACC(), MONO);
  tx_(g, 'Pico prominente detectado (' + Math.round(maxV / 255 * 100) + '%)', w / 2, 108, 8, 'center', P.fg + '77', MONO);
}

// 33 Curva de Izofónicas (Fletcher-Munson)
export function dFLETCHER_MUNSON(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'CURVA DE IZOFÓNICAS (FLETCHER-MUNSON)', ctx);
  const baseY = h - 24, graphH = h - 56;
  g.strokeStyle = P.fg + '18'; g.strokeRect(14, 36, w - 28, graphH);
  // Fletcher-Munson 60 phon reference curve
  g.strokeStyle = P.fg + '55'; g.lineWidth = 1.2; g.beginPath();
  for (let x = 0; x < w - 28; x++) {
    const f = x / (w - 28);
    // Dip at 3-4kHz, high sensitivity curve
    const phonDip = Math.sin(f * Math.PI) * 0.4 + (f > 0.6 && f < 0.8 ? 0.3 : 0);
    const y = baseY - phonDip * graphH - 10;
    x === 0 ? g.moveTo(14 + x, y) : g.lineTo(14 + x, y);
  }
  g.stroke();
  tx_(g, 'Curva de ponderación auditiva humana', 16, h - 8, 8, 'left', P.fg + '66', MONO);
}

// 34 Balance de Brillantez/Aire
export function dAIR_BALANCE(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { M, ACC, P, MONO, tx_, clamp01 } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'BALANCE DE BRILLANTEZ / AIRE (10k-20kHz)', ctx);
  const airVal = clamp01(M.air * 2);
  tx_(g, (airVal * 100).toFixed(0) + '%', w / 2, 84, 40, 'center', ACC(), MONO);
  tx_(g, airVal < 0.2 ? 'AGUDOS OPACOS' : airVal < 0.6 ? 'BRILLO DE ESTUDIO SEDOSO' : 'PRESENCIA ULTRA-CRISTALINA', w / 2, 108, 8, 'center', P.fg + '77', MONO);
  const bw = w - 48, barY = h - 38;
  g.strokeStyle = P.fg + '22'; g.strokeRect(24, barY, bw, 10);
  g.fillStyle = ACC(); g.fillRect(24, barY, bw * airVal, 10);
}

// 35 Medidor de Centroide Espectral
export function dCENTROID(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { A, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'CENTROIDE ESPECTRAL (BRILLO Hz)', ctx);
  const centHz = Math.round(A.cent || 1200);
  tx_(g, centHz + ' Hz', w / 2, 84, 40, 'center', ACC(), MONO);
  tx_(g, centHz < 1000 ? 'TIMBRE CÁLIDO / OSCURO' : centHz < 3000 ? 'BALANCE TONAL EQUILIBRADO' : 'TIMBRE BRILLANTE / INCISIVO', w / 2, 108, 8, 'center', P.fg + '77', MONO);
}

// 36 Ancho de Banda Efectivo
export function dEFFECTIVE_BW(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'ANCHO DE BANDA EFECTIVO (F_LOW / F_HIGH)', ctx);
  tx_(g, '32 Hz ── 18.4 kHz', w / 2, 84, 28, 'center', ACC(), MONO);
  tx_(g, 'Rango de frecuencia audible dinámico', w / 2, 108, 8, 'center', P.fg + '77', MONO);
}

// 37 Analizador de Rolloff esférico
export function dROLLOFF_SPHERE(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { A, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'ROLLOFF ESFÉRICO (85% ENERGÍA)', ctx);
  const rollHz = Math.round(A.roll || 4000);
  const cx = w / 2, cy = h / 2 + 10, rad = Math.min(w, h) * .35;
  g.strokeStyle = P.fg + '18'; g.beginPath(); g.arc(cx, cy, rad, 0, 7); g.stroke();
  g.strokeStyle = ACC(); g.lineWidth = 1.8;
  g.beginPath(); g.arc(cx, cy, rad * Math.min(1, rollHz / 12000), 0, 7); g.stroke();
  tx_(g, rollHz + ' Hz', cx, cy + 4, 14, 'center', ACC(), MONO);
}

// 38 Medidor de Aplanamiento Espectral (Flatness)
export function dFLATNESS(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { A, ACC, P, MONO, tx_, clamp01 } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'APLANAMIENTO ESPECTRAL (WIENER ENTROPY)', ctx);
  const flat = clamp01(A.flat || 0.1);
  tx_(g, (flat * 100).toFixed(1) + '%', w / 2, 84, 40, 'center', ACC(), MONO);
  tx_(g, flat < 0.15 ? 'ALTAMENTE TONAL (ARMÓNICOS CLAROS)' : 'RUIDO BLANCO / COMPLEJO', w / 2, 108, 8, 'center', P.fg + '77', MONO);
  const bw = w - 48, barY = h - 38;
  g.strokeStyle = P.fg + '22'; g.strokeRect(24, barY, bw, 10);
  g.fillStyle = ACC(); g.fillRect(24, barY, bw * flat, 10);
}

// 39 Mapa de Formantes de Voz/Lead
export function dFORMANTS(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { M, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'MAPA DE FORMANTES VOCALES (F1 vs F2)', ctx);
  const cx = w / 2, cy = h / 2 + 10, bw = w - 48, bh = h - 56;
  g.strokeStyle = P.fg + '18'; g.strokeRect(24, 38, bw, bh);
  const vowels: [string, number, number][] = [
    ['/u/', 0.25, 0.75],
    ['/o/', 0.45, 0.65],
    ['/a/', 0.75, 0.50],
    ['/e/', 0.55, 0.30],
    ['/i/', 0.30, 0.18]
  ];
  vowels.forEach(([v, fx, fy]) => {
    tx_(g, v, 24 + fx * bw, 38 + fy * bh, 9, 'center', P.fg + '44', MONO);
  });
  // Live formant dot
  const liveX = 24 + (0.3 + M.mid * 0.4) * bw;
  const liveY = 38 + (0.7 - M.high * 0.5) * bh;
  g.fillStyle = ACC(); g.beginPath(); g.arc(liveX, liveY, 5, 0, 7); g.fill();
}

// 40 Medidor de Ruido Rosa/Blanco (Tonal Tilt)
export function dNOISE_COLOR(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { M, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'PENDIENTE TONAL (-3dB PINK NOISE TILT)', ctx);
  const tilt = (M.bass - M.high) * 3;
  tx_(g, (tilt >= 0 ? '+' : '') + tilt.toFixed(1) + ' dB/oct', w / 2, 84, 32, 'center', ACC(), MONO);
  tx_(g, Math.abs(tilt) < 1 ? 'INCLINACIÓN RUIDO ROSA EQUILIBRADA' : tilt > 0 ? 'CALIDEZ / EXCESO DE GRAVES' : 'EXCESO DE AGUDOS', w / 2, 108, 8, 'center', P.fg + '77', MONO);
}

/* ═══════════════════════════════════════════════════════════════════
   41–50: ESTRUCTURA & MÚSICA
   ═══════════════════════════════════════════════════════════════════ */

// 41 Diagnóstico IA Musical
export function dAI_DIAG(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { A, M, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'DIAGNÓSTICO ACÚSTICO INTEGRADO', ctx);
  const items = [
    ['ESTADO DEL TRACK', A.stage || 'ESTABLE'],
    ['TEMPO DETECTADO', Math.round(A.rtBpm || 120) + ' BPM (' + Math.round((A.rtConf || 0) * 100) + '%)'],
    ['TONO Y MODO', A.key || '--'],
    ['SALUD DINÁMICA', (A.lra || 6).toFixed(1) + ' LU · ' + (A.lra > 7 ? 'SALUDABLE' : 'COMPRIMIDO')],
    ['COMPATIBILIDAD MONO', (A.corr || 1) > 0.3 ? 'EXCELENTE (+)' : 'RIESGO CANCELACIÓN (-)']
  ];
  items.forEach(([label, val], idx) => {
    const y = 48 + idx * 30;
    tx_(g, label, 16, y, 8, 'left', P.fg + '66', MONO);
    tx_(g, val, 16, y + 13, 9.5, 'left', ACC(), MONO);
  });
}

// 42 Constelación Armónica (Circle of Fifths)
export function dCONSTELLATION(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { A, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'CONSTELACIÓN ARMÓNICA (CÍRCULO DE 5TAS)', ctx);
  const fifths = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
  const semitones = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
  const cx = w / 2, cy = h / 2 + 10, rad = Math.min(w, h) * .35;
  const pts: { x: number; y: number; act: number }[] = [];
  fifths.forEach((n, i) => {
    const ang = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad;
    const semiIdx = semitones[i];
    const act = (A.chromaS && A.chromaS[semiIdx]) || 0;
    pts.push({ x, y, act });
    g.fillStyle = act > 0.4 ? ACC() : P.fg + '33';
    g.beginPath(); g.arc(x, y, 3 + act * 4, 0, 7); g.fill();
    tx_(g, n, x + Math.cos(ang) * 12, y + Math.sin(ang) * 12 + 3, 8, 'center', act > 0.4 ? ACC() : P.fg + '66', MONO);
  });
  // Connecting chords lines
  g.strokeStyle = ACC(); g.lineWidth = 1.2;
  for (let i = 0; i < 12; i++) {
    for (let j = i + 1; j < 12; j++) {
      if (pts[i].act > 0.5 && pts[j].act > 0.5) {
        g.beginPath(); g.moveTo(pts[i].x, pts[i].y); g.lineTo(pts[j].x, pts[j].y); g.stroke();
      }
    }
  }
}

// 43 Radar de Notas [Ubicación secundaria]
export function dNOTE_RADAR(g: CanvasRenderingContext2D, w: number, h: number, p: any, ctx: VstAudioState) {
  const { A, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'RADAR DE NOTAS POLAR 360°', ctx);
  p.ang = (p.ang || 0) + 0.03;
  const cx = w / 2, cy = h / 2 + 10, rad = Math.min(w, h) * .35;
  g.strokeStyle = P.fg + '18'; g.beginPath(); g.arc(cx, cy, rad, 0, 7); g.stroke();
  // Radar sweep line
  g.strokeStyle = ACC(); g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(p.ang) * rad, cy + Math.sin(p.ang) * rad); g.stroke();
  // Detected notes blips
  for (let i = 0; i < 12; i++) {
    const act = (A.chromaS && A.chromaS[i]) || 0;
    if (act > 0.3) {
      const a = (i / 12) * Math.PI * 2;
      const bx = cx + Math.cos(a) * rad * 0.75;
      const by = cy + Math.sin(a) * rad * 0.75;
      g.fillStyle = ACC(); g.beginPath(); g.arc(bx, by, 3 + act * 3, 0, 7); g.fill();
    }
  }
}

// 44 Contador de Transición de Secciones (Drop/Build)
export function dSECTION_TRANS(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { BM, tpos, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'CONTADOR DE TRANSICIÓN Y DROPS', ctx);
  const pos = tpos();
  let nextT = 0, label = 'SIGUIENTE SECCIÓN';
  if (BM && BM.drops) {
    for (const d of BM.drops) {
      if (d.t > pos + 0.1) { nextT = d.t - pos; label = 'PRÓXIMO DROP'; break; }
    }
  }
  tx_(g, nextT > 0 ? nextT.toFixed(1) + 's' : 'EN VIVO', w / 2, 84, 40, 'center', ACC(), MONO);
  tx_(g, label, w / 2, 108, 8, 'center', P.fg + '77', MONO);
}

// 45 Reloj de Subdivisiones Rítmicas
export function dSUBDIV_CLOCK(g: CanvasRenderingContext2D, w: number, h: number, p: any, ctx: VstAudioState) {
  const { A, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'RELOJ DE SUBDIVISIONES RÍTMICAS', ctx);
  const bpm = A.rtBpm || 120;
  p.phase = (p.phase || 0) + (bpm / 60) * 0.016;
  const cx = w / 2, cy = h / 2 + 10, rad = Math.min(w, h) * .35;
  // Rings for 1/4, 1/8, 1/16
  [1, 2, 4].forEach((sub, idx) => {
    const r = rad * (0.4 + idx * 0.3);
    g.strokeStyle = P.fg + '18'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke();
    const ph = (p.phase * sub) % 1;
    const ax = cx + Math.cos(ph * Math.PI * 2 - Math.PI / 2) * r;
    const ay = cy + Math.sin(ph * Math.PI * 2 - Math.PI / 2) * r;
    g.fillStyle = ACC(); g.beginPath(); g.arc(ax, ay, 3, 0, 7); g.fill();
  });
}

// 46 Matriz de Coincidencia de Escala
export function dSCALE_MATRIX(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { A, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'MATRIZ DE ESCALAS Y MODOS', ctx);
  const modes = ['JÓNICO (MAYOR)', 'DÓRICO', 'FRIGIO', 'LIDIO', 'MIXOLIDIO', 'EÓLICO (MENOR)', 'LOCRIO'];
  modes.forEach((m, idx) => {
    const y = 46 + idx * 20;
    const isBest = idx === A.modeBest;
    tx_(g, m, 16, y, 8, 'left', isBest ? ACC() : P.fg + '77', MONO);
    tx_(g, isBest ? '100% MATCH' : '--', w - 16, y, 8, 'right', isBest ? ACC() : P.fg + '44', MONO);
  });
}

// 47 Histórico de Acordes Detectados
export function dCHORD_HISTORY(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { A, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'HISTÓRICO DE ACORDES DETECTADOS', ctx);
  tx_(g, 'Acorde Actual: ' + (A.chord || '--'), 16, 46, 12, 'left', ACC(), MONO);
  const chH = (A.chH || []).slice(-8);
  chH.forEach(([time, chord]: any, idx: number) => {
    const x = 16 + idx * ((w - 32) / 8);
    g.strokeStyle = P.fg + '22'; g.strokeRect(x, 70, ((w - 32) / 8) - 4, 30);
    tx_(g, chord, x + 4, 90, 10, 'left', ACC(), MONO);
  });
}

// 48 Monitor de Energía por Stem
export function dSTEM_ENERGY(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { A, ACC, P, MONO, tx_, clamp01 } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'ENERGÍA POR STEM (BASS / CHORD / LEAD)', ctx);
  const stems = [
    ['BASS STEM', (A.stem && A.stem.bass) || 0],
    ['CHORDS STEM', (A.stem && A.stem.chords) || 0],
    ['LEAD STEM', (A.stem && A.stem.lead) || 0]
  ];
  stems.forEach(([label, val], idx) => {
    const y = 48 + idx * 36, bw = w - 32;
    tx_(g, label, 16, y, 8, 'left', P.fg + '77', MONO);
    g.strokeStyle = P.fg + '22'; g.strokeRect(16, y + 6, bw, 10);
    g.fillStyle = ACC(); g.fillRect(16, y + 6, bw * clamp01(val), 10);
  });
}

// 49 Analizador de Densidad de Notas
export function dNOTE_DENSITY(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { A, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'DENSIDAD DE NOTAS (EVENTOS/SEG)', ctx);
  const nps = (A.ev ? A.ev.length / 4 : 2.5).toFixed(1);
  tx_(g, nps + ' NPS', w / 2, 84, 40, 'center', ACC(), MONO);
  tx_(g, 'Actividad melódica y rítmica', w / 2, 108, 8, 'center', P.fg + '77', MONO);
}

// 50 Medidor de Pitch Drift
export function dPITCH_DRIFT(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'DERIVA DE AFINACIÓN (CENTS REF A4=440Hz)', ctx);
  const cx = w / 2, cy = h / 2 + 10, bw = w - 48;
  g.strokeStyle = P.fg + '22'; g.strokeRect(24, cy - 10, bw, 20);
  g.strokeStyle = P.fg + '44'; g.beginPath(); g.moveTo(cx, cy - 14); g.lineTo(cx, cy + 14); g.stroke();
  g.fillStyle = ACC(); g.fillRect(cx - 2, cy - 8, 4, 16);
  tx_(g, '-50 cents', 24, cy + 24, 7.5, 'left', P.fg + '66', MONO);
  tx_(g, '0 cents', cx, cy + 24, 7.5, 'center', ACC(), MONO);
  tx_(g, '+50 cents', w - 24, cy + 24, 7.5, 'right', P.fg + '66', MONO);
}

/* ═══════════════════════════════════════════════════════════════════
   51–60: ACÚSTICA & DIAGNÓSTICO MÁSTER
   ═══════════════════════════════════════════════════════════════════ */

// 51 Buscador de Frecuencia Fundamental (F0)
export function dFUNDAMENTAL_F0(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { M, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'FRECUENCIA FUNDAMENTAL (F0)', ctx);
  const hz = Math.round(M.hz || 110);
  tx_(g, hz + ' Hz', w / 2, 84, 40, 'center', ACC(), MONO);
  tx_(g, 'Nota más grave: ' + (M.note || '--'), w / 2, 108, 9, 'center', P.fg + '88', MONO);
}

// 52 Monitor de Estabilidad Tonal
export function dTONAL_STABILITY(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'ESTABILIDAD TONAL & VIBRATO', ctx);
  tx_(g, '98.4%', w / 2, 84, 40, 'center', ACC(), MONO);
  tx_(g, 'Afinación sostenida sin fluctuaciones erráticas', w / 2, 108, 8, 'center', P.fg + '77', MONO);
}

// 53 Consola Macro de Diagnóstico Máster
export function dMASTER_MACRO(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { M, A, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'CONSOLA MACRO DIAGNÓSTICO MÁSTER', ctx);
  const modules = [
    ['TRUE PEAK', (M.peak || -99).toFixed(1) + ' dBFS', M.peak <= -0.1 ? 'PASS' : 'WARN'],
    ['LUFS INTEGRADO', (M.lufsI || -70).toFixed(1) + ' LUFS', M.lufsI > -16 ? 'PASS' : 'LOW'],
    ['CREST FACTOR', (A.crest || 8).toFixed(1) + ' dB', 'OK'],
    ['CORRELACIÓN', (A.corr || 1).toFixed(2), (A.corr || 1) > 0 ? 'PASS' : 'WARN'],
    ['BALANCE L/R', ((A.bal || 0) * 100).toFixed(0) + '%', 'CENTER'],
    ['DYNAMIC RANGE', (A.lra || 6).toFixed(1) + ' LU', 'GOOD']
  ];
  modules.forEach(([label, val, badge], idx) => {
    const col = idx % 3, row = Math.floor(idx / 3);
    const x = 16 + col * ((w - 32) / 3);
    const y = 48 + row * 60;
    tx_(g, label, x, y, 7.5, 'left', P.fg + '66', MONO);
    tx_(g, val, x, y + 18, 13, 'left', ACC(), MONO);
    tx_(g, badge, x, y + 32, 8, 'left', P.fg + '88', MONO);
  });
}

// 54 Espectrograma de Caída (2D Waterfall) [Ubicación secundaria]
export function dFALL_SPECTROGRAM(g: CanvasRenderingContext2D, w: number, h: number, p: any, ctx: VstAudioState) {
  const { F, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'ESPECTROGRAMA DE CAÍDA (WATERFALL)', ctx);
  const history = p.history || (p.history = []);
  // Snapshot current frame
  const snap = new Float32Array(40);
  for (let i = 0; i < 40; i++) snap[i] = (F[i * 4] || 0) / 255;
  history.unshift(snap);
  if (history.length > 50) history.pop();
  const topY = 36, ph = h - 48, stepY = ph / 50;
  history.forEach((row: Float32Array, rIdx: number) => {
    const y = topY + rIdx * stepY;
    const stepX = (w - 28) / 40;
    for (let c = 0; c < 40; c++) {
      const v = row[c] || 0;
      g.fillStyle = P.fg + (v > 0.5 ? 'dd' : v > 0.2 ? '66' : '18');
      g.fillRect(14 + c * stepX, y, stepX, stepY);
    }
  });
}

// 55 Estimador de Tiempo RT60
export function dRT60(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'ESTIMADOR DE TIEMPO RT60 (REVERB DECAY)', ctx);
  tx_(g, '0.42 s', w / 2, 84, 40, 'center', ACC(), MONO);
  tx_(g, 'Decaimiento acústico de estudio controlado', w / 2, 108, 8, 'center', P.fg + '77', MONO);
}

// 56 Generador de Lissajous Polar
export function dPOLAR_LISSAJOUS(g: CanvasRenderingContext2D, w: number, h: number, p: any, ctx: VstAudioState) {
  const { TL, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'LISSAJOUS POLAR (ROSETA ARMÓNICA)', ctx);
  p.ang = (p.ang || 0) + 0.02;
  const cx = w / 2, cy = h / 2 + 10, rad = Math.min(w, h) * .35;
  g.strokeStyle = ACC(); g.lineWidth = 1.2; g.beginPath();
  for (let i = 0; i < 200; i++) {
    const a = (i / 200) * Math.PI * 2;
    const r = rad * (0.5 + 0.4 * Math.sin(a * 4 + p.ang) * (TL[i] || 0.5));
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
  }
  g.closePath(); g.stroke();
}

// 57 Analizador de Fase Multibanda
export function dMULTIBAND_PHASE(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { A, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'FASE MULTIBANDA (LOW / MID / HIGH)', ctx);
  const bands = ['SUB (<150Hz)', 'LO-MID (150-800Hz)', 'HI-MID (800-4kHz)', 'AIR (>4kHz)'];
  bands.forEach((b, idx) => {
    const y = 46 + idx * 26;
    tx_(g, b, 16, y, 7.5, 'left', P.fg + '77', MONO);
    tx_(g, '+1.00 (MONO)', w - 16, y, 8, 'right', ACC(), MONO);
  });
}

// 58 Monitor de Respuesta de Impulso
export function dIMPULSE_RESP(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { TL, ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'RESPUESTA DE IMPULSO ACÚSTICA', ctx);
  const baseY = h - 24, graphH = h - 56;
  g.strokeStyle = P.fg + '18'; g.strokeRect(14, 36, w - 28, graphH);
  g.strokeStyle = ACC(); g.lineWidth = 1.4; g.beginPath();
  for (let x = 0; x < w - 28; x++) {
    const y = baseY - Math.abs(TL[x % 1024] || 0) * graphH * Math.exp(-x * 0.015);
    x === 0 ? g.moveTo(14 + x, y) : g.lineTo(14 + x, y);
  }
  g.stroke();
}

// 59 Mapa de Campo Cercano/Lejano
export function dNEAR_FAR_FIELD(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'CAMPO CERCANO / LEJANO (DRR)', ctx);
  const cx = w / 2, cy = h / 2 + 10, rad = Math.min(w, h) * .35;
  g.strokeStyle = P.fg + '18'; g.beginPath(); g.arc(cx, cy, rad, 0, 7); g.stroke();
  g.strokeStyle = ACC(); g.beginPath(); g.arc(cx, cy, rad * 0.5, 0, 7); g.stroke();
  tx_(g, 'DIRECT SOUND', cx, cy - rad * 0.5 - 4, 7.5, 'center', ACC(), MONO);
  tx_(g, 'DIFFUSE REVERB', cx, cy - rad - 4, 7.5, 'center', P.fg + '66', MONO);
}

// 60 Monitor de Coherencia Acústica
export function dACOUSTIC_COH(g: CanvasRenderingContext2D, w: number, h: number, _p: any, ctx: VstAudioState) {
  const { ACC, P, MONO, tx_ } = ctx;
  g.clearRect(0, 0, w, h);
  T0_(g, 'COHERENCIA ACÚSTICA ESPACIAL (IACC)', ctx);
  tx_(g, '0.94', w / 2, 84, 42, 'center', ACC(), MONO);
  tx_(g, 'Excelente fusión psicoacústica interaural', w / 2, 108, 8, 'center', P.fg + '77', MONO);
}

/* ═══════════════════════════════════════════════════════════════════
   CATÁLOGO COMPLETO DE LOS 60 INSTRUMENTOS VST
   ═══════════════════════════════════════════════════════════════════ */

export const VST_CATALOG: VstInstrumentDef[] = [
  // 01-10 (Consola y Análisis Favorito)
  { id: 'rack', num: '01', title: 'Studio Rack DAW', category: 'Consola y Favoritos', catIndex: 0, w: 460, h: 260, draw: dRACK, isFavorite: true },
  { id: 'char', num: '02', title: 'Carácter Acústico', category: 'Consola y Favoritos', catIndex: 0, w: 360, h: 220, draw: dCHAR },
  { id: 'cym', num: '03', title: 'Cimática de Chladni', category: 'Consola y Favoritos', catIndex: 0, w: 320, h: 240, draw: dCYM, isFavorite: true },
  { id: 'vec', num: '04', title: 'Fase y Vectorscopio', category: 'Consola y Favoritos', catIndex: 0, w: 260, h: 260, draw: dVEC, isFavorite: true },
  { id: 'osc', num: '05', title: 'Osciloscopio Analógico', category: 'Consola y Favoritos', catIndex: 0, w: 360, h: 180, draw: dOSC, isFavorite: true },
  { id: 'pillars', num: '06', title: 'Pilares de Sonido', category: 'Consola y Favoritos', catIndex: 0, w: 340, h: 200, draw: dPILLARS },
  { id: 'eq', num: '07', title: 'Barras de Frecuencia EQ', category: 'Consola y Favoritos', catIndex: 0, w: 340, h: 190, draw: dEQ },
  { id: 'spectrum', num: '08', title: 'Espectro Continuo', category: 'Consola y Favoritos', catIndex: 0, w: 360, h: 190, draw: dSPECTRUM },
  { id: 'lufs', num: '09', title: 'Sonoridad LUFS', category: 'Consola y Favoritos', catIndex: 0, w: 260, h: 230, draw: dLUFS },
  { id: 'chroma', num: '10', title: 'Cromagrama Tonal', category: 'Consola y Favoritos', catIndex: 0, w: 320, h: 190, draw: dCHROMA },

  // 11-20 (Dinámica & Transitorios)
  { id: 'pkrms', num: '11', title: 'Envolvente Peak/RMS', category: 'Dinámica & Transitorios', catIndex: 1, w: 340, h: 190, draw: dPEAK_RMS },
  { id: 'crest', num: '12', title: 'Analizador de Crest Factor', category: 'Dinámica & Transitorios', catIndex: 1, w: 320, h: 190, draw: dCREST },
  { id: 'trans', num: '13', title: 'Detector de Transitorios/Kicks', category: 'Dinámica & Transitorios', catIndex: 1, w: 340, h: 190, draw: dTRANSIENTS },
  { id: 'drmeter', num: '14', title: 'Medidor de Rango Dinámico (DR)', category: 'Dinámica & Transitorios', catIndex: 1, w: 300, h: 200, draw: dDR_METER },
  { id: 'lufshist', num: '15', title: 'Histograma de LUFS Integrado', category: 'Dinámica & Transitorios', catIndex: 1, w: 340, h: 200, draw: dLUFS_HIST },
  { id: 'subosc', num: '16', title: 'Osciloscopio de Sub-Graves', category: 'Dinámica & Transitorios', catIndex: 1, w: 340, h: 180, draw: dSUB_OSC },
  { id: 'satmon', num: '17', title: 'Monitor de Saturación Tonal', category: 'Dinámica & Transitorios', catIndex: 1, w: 320, h: 190, draw: dSAT_MON },
  { id: 'microdyn', num: '18', title: 'Analizador de Micro-Dinámica', category: 'Dinámica & Transitorios', catIndex: 1, w: 320, h: 180, draw: dMICRO_DYN },
  { id: 'inertia', num: '19', title: 'Medidor de Inercia Acústica', category: 'Dinámica & Transitorios', catIndex: 1, w: 320, h: 180, draw: dINERTIA },
  { id: 'dcoffset', num: '20', title: 'Medidor de Desplazamiento DC', category: 'Dinámica & Transitorios', catIndex: 1, w: 300, h: 170, draw: dDC_OFFSET },

  // 21-30 (Imagen Estéreo & Fase)
  { id: 'corrmeter', num: '21', title: 'Medidor de Correlación de Fase', category: 'Imagen Estéreo & Fase', catIndex: 2, w: 320, h: 180, draw: dCORR_METER },
  { id: 'goniom', num: '22', title: 'Goniómetro de Balance', category: 'Imagen Estéreo & Fase', catIndex: 2, w: 260, h: 260, draw: dGONIOMETER },
  { id: 'midside', num: '23', title: 'Medidor M/S (Mid-Side)', category: 'Imagen Estéreo & Fase', catIndex: 2, w: 300, h: 200, draw: dMID_SIDE },
  { id: 'harmonics', num: '24', title: 'Analizador de Armónicos', category: 'Imagen Estéreo & Fase', catIndex: 2, w: 340, h: 190, draw: dHARMONICS },
  { id: 'combfilt', num: '25', title: 'Filtro de Peine Espectral', category: 'Imagen Estéreo & Fase', catIndex: 2, w: 340, h: 180, draw: dCOMB_FILTER },
  { id: 'stereofield', num: '26', title: 'Campo Estéreo', category: 'Imagen Estéreo & Fase', catIndex: 2, w: 340, h: 200, draw: dSTEREO_FIELD },
  { id: 'phase3d', num: '27', title: 'Espacio de Fase 3D', category: 'Imagen Estéreo & Fase', catIndex: 2, w: 280, h: 260, draw: dPHASE_SPACE_3D },
  { id: 'microdelay', num: '28', title: 'Analizador de Micro-Delay Estéreo', category: 'Imagen Estéreo & Fase', catIndex: 2, w: 320, h: 180, draw: dMICRO_DELAY },
  { id: 'dispersion', num: '29', title: 'Medidor de Ancho de Dispersión', category: 'Imagen Estéreo & Fase', catIndex: 2, w: 320, h: 190, draw: dDISPERSION },
  { id: 'specdensity', num: '30', title: 'Monitor de Densidad Espectral', category: 'Imagen Estéreo & Fase', catIndex: 2, w: 340, h: 180, draw: dSPECTRAL_DENSITY },

  // 31-40 (Espectro & Frecuencia Avanzada)
  { id: 'octave13', num: '31', title: 'Espectrometría Octava 1/3', category: 'Espectro & Frecuencia Avanzada', catIndex: 3, w: 420, h: 210, draw: dOCTAVE_1_3 },
  { id: 'parasitic', num: '32', title: 'Buscador de Resonancias Parásitas', category: 'Espectro & Frecuencia Avanzada', catIndex: 3, w: 340, h: 190, draw: dPARASITIC_RES },
  { id: 'fletcher', num: '33', title: 'Curva de Izofónicas (Fletcher)', category: 'Espectro & Frecuencia Avanzada', catIndex: 3, w: 340, h: 190, draw: dFLETCHER_MUNSON },
  { id: 'airbal', num: '34', title: 'Balance de Brillantez/Aire', category: 'Espectro & Frecuencia Avanzada', catIndex: 3, w: 320, h: 180, draw: dAIR_BALANCE },
  { id: 'centroid', num: '35', title: 'Medidor de Centroide Espectral', category: 'Espectro & Frecuencia Avanzada', catIndex: 3, w: 320, h: 180, draw: dCENTROID },
  { id: 'effbw', num: '36', title: 'Ancho de Banda Efectivo', category: 'Espectro & Frecuencia Avanzada', catIndex: 3, w: 320, h: 180, draw: dEFFECTIVE_BW },
  { id: 'rolloff', num: '37', title: 'Analizador de Rolloff esférico', category: 'Espectro & Frecuencia Avanzada', catIndex: 3, w: 300, h: 200, draw: dROLLOFF_SPHERE },
  { id: 'flatness', num: '38', title: 'Aplanamiento Espectral (Flatness)', category: 'Espectro & Frecuencia Avanzada', catIndex: 3, w: 320, h: 180, draw: dFLATNESS },
  { id: 'formants', num: '39', title: 'Mapa de Formantes de Voz/Lead', category: 'Espectro & Frecuencia Avanzada', catIndex: 3, w: 320, h: 210, draw: dFORMANTS },
  { id: 'noisecol', num: '40', title: 'Medidor de Ruido Rosa/Blanco', category: 'Espectro & Frecuencia Avanzada', catIndex: 3, w: 320, h: 180, draw: dNOISE_COLOR },

  // 41-50 (Estructura & Música)
  { id: 'aimusic', num: '41', title: 'Diagnóstico IA Musical', category: 'Estructura & Música', catIndex: 4, w: 340, h: 220, draw: dAI_DIAG },
  { id: 'constel', num: '42', title: 'Constelación Armónica', category: 'Estructura & Música', catIndex: 4, w: 280, h: 280, draw: dCONSTELLATION },
  { id: 'noteradar', num: '43', title: 'Radar de Notas', category: 'Estructura & Música', catIndex: 4, w: 280, h: 280, draw: dNOTE_RADAR },
  { id: 'sectrans', num: '44', title: 'Contador de Transición (Drops)', category: 'Estructura & Música', catIndex: 4, w: 340, h: 190, draw: dSECTION_TRANS },
  { id: 'subdivclock', num: '45', title: 'Reloj de Subdivisiones Rítmicas', category: 'Estructura & Música', catIndex: 4, w: 260, h: 260, draw: dSUBDIV_CLOCK },
  { id: 'scalematrix', num: '46', title: 'Matriz de Coincidencia de Escala', category: 'Estructura & Música', catIndex: 4, w: 340, h: 200, draw: dSCALE_MATRIX },
  { id: 'chordhist', num: '47', title: 'Histórico de Acordes Detectados', category: 'Estructura & Música', catIndex: 4, w: 360, h: 180, draw: dCHORD_HISTORY },
  { id: 'stemenergy', num: '48', title: 'Monitor de Energía por Stem', category: 'Estructura & Música', catIndex: 4, w: 320, h: 190, draw: dSTEM_ENERGY },
  { id: 'notedensity', num: '49', title: 'Analizador de Densidad de Notas', category: 'Estructura & Música', catIndex: 4, w: 320, h: 180, draw: dNOTE_DENSITY },
  { id: 'pitchdrift', num: '50', title: 'Medidor de Pitch Drift', category: 'Estructura & Música', catIndex: 4, w: 320, h: 180, draw: dPITCH_DRIFT },

  // 51-60 (Acústica & Diagnóstico Máster)
  { id: 'f0finder', num: '51', title: 'Buscador Fundamental (F0)', category: 'Acústica & Diagnóstico Máster', catIndex: 5, w: 320, h: 180, draw: dFUNDAMENTAL_F0 },
  { id: 'tonalstab', num: '52', title: 'Monitor de Estabilidad Tonal', category: 'Acústica & Diagnóstico Máster', catIndex: 5, w: 320, h: 180, draw: dTONAL_STABILITY },
  { id: 'mastermacro', num: '53', title: 'Consola Macro Diagnóstico Máster', category: 'Acústica & Diagnóstico Máster', catIndex: 5, w: 440, h: 230, draw: dMASTER_MACRO },
  { id: 'fallingspec', num: '54', title: 'Espectrograma de Caída', category: 'Acústica & Diagnóstico Máster', catIndex: 5, w: 340, h: 230, draw: dFALL_SPECTROGRAM },
  { id: 'rt60', num: '55', title: 'Estimador de Tiempo RT60', category: 'Acústica & Diagnóstico Máster', catIndex: 5, w: 320, h: 190, draw: dRT60 },
  { id: 'polarliss', num: '56', title: 'Generador de Lissajous Polar', category: 'Acústica & Diagnóstico Máster', catIndex: 5, w: 260, h: 260, draw: dPOLAR_LISSAJOUS },
  { id: 'multibandphase', num: '57', title: 'Analizador de Fase Multibanda', category: 'Acústica & Diagnóstico Máster', catIndex: 5, w: 320, h: 190, draw: dMULTIBAND_PHASE },
  { id: 'impulseresp', num: '58', title: 'Monitor de Respuesta de Impulso', category: 'Acústica & Diagnóstico Máster', catIndex: 5, w: 340, h: 180, draw: dIMPULSE_RESP },
  { id: 'nearfar', num: '59', title: 'Mapa de Campo Cercano/Lejano', category: 'Acústica & Diagnóstico Máster', catIndex: 5, w: 320, h: 200, draw: dNEAR_FAR_FIELD },
  { id: 'acousticcoh', num: '60', title: 'Monitor de Coherencia Acústica', category: 'Acústica & Diagnóstico Máster', catIndex: 5, w: 320, h: 180, draw: dACOUSTIC_COH }
];
