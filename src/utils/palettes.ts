/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ColorPalette {
  id: string;
  name: string;
  description: string;
  category: 'monochrome' | 'warm' | 'cool' | 'cosmic' | 'organic';
  // Colors formatted as hex strings
  background: string;
  primary: string;
  secondary: string;
  accent: string;
  highlight: string;
  particles: string[];
}

export const PALETTES: Record<string, ColorPalette> = {
  monochrome_silver: {
    id: 'monochrome_silver',
    name: 'Monochrome Sigil',
    description: 'Lunar silver, crisp platinum, and obsidian depth',
    category: 'monochrome',
    background: '#050505',
    primary: '#f5f5f5',
    secondary: '#a3a3a3',
    accent: '#e5e5e5',
    highlight: '#ffffff',
    particles: ['#ffffff', '#e5e5e5', '#d4d4d4', '#a3a3a3', '#737373'],
  },
  celestial_gold: {
    id: 'celestial_gold',
    name: 'Celestial Gold',
    description: 'Deep amber, radiant gold, champagne and cosmic bronze',
    category: 'warm',
    background: '#070604',
    primary: '#f59e0b',
    secondary: '#fbbf24',
    accent: '#fef08a',
    highlight: '#fffbeb',
    particles: ['#fbbf24', '#f59e0b', '#d97706', '#fef08a', '#faf5ff'],
  },
  nordic_aurora: {
    id: 'nordic_aurora',
    name: 'Nordic Aurora',
    description: 'Emerald mist, seafoam teal, and deep twilight violet',
    category: 'cool',
    background: '#04090b',
    primary: '#10b981',
    secondary: '#06b6d4',
    accent: '#34d399',
    highlight: '#6ee7b7',
    particles: ['#10b981', '#06b6d4', '#6ee7b7', '#2dd4bf', '#a7f3d0'],
  },
  cyber_velvet: {
    id: 'cyber_velvet',
    name: 'Cyber Velvet',
    description: 'Soft rose quartz, deep magenta ash, and warm peach',
    category: 'warm',
    background: '#0b0408',
    primary: '#f43f5e',
    secondary: '#fb7185',
    accent: '#fda4af',
    highlight: '#ffe4e6',
    particles: ['#f43f5e', '#fb7185', '#e11d48', '#fda4af', '#fecdd3'],
  },
  solar_flare: {
    id: 'solar_flare',
    name: 'Solar Flare',
    description: 'Tangerine ochre, vermillion, and warm saffron ember',
    category: 'warm',
    background: '#0a0502',
    primary: '#ea580c',
    secondary: '#f97316',
    accent: '#fb923c',
    highlight: '#ffedd5',
    particles: ['#ea580c', '#f97316', '#fb923c', '#fdba74', '#fed7aa'],
  },
  bioluminescence: {
    id: 'bioluminescence',
    name: 'Bioluminescence',
    description: 'Deep abyss, phosphor mint, and luminous sage',
    category: 'organic',
    background: '#020b08',
    primary: '#059669',
    secondary: '#10b981',
    accent: '#6ee7b7',
    highlight: '#d1fae5',
    particles: ['#059669', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0'],
  },
  ethereal_dusk: {
    id: 'ethereal_dusk',
    name: 'Ethereal Dusk',
    description: 'Wisteria lilac, soft amethyst, and midnight violet',
    category: 'cosmic',
    background: '#06040b',
    primary: '#8b5cf6',
    secondary: '#a78bfa',
    accent: '#c4b5fd',
    highlight: '#ede9fe',
    particles: ['#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#f5f3ff'],
  },
  tokyo_rain: {
    id: 'tokyo_rain',
    name: 'Tokyo Rain',
    description: 'Subtle periwinkle, slate violet, and asphalt reflections',
    category: 'cool',
    background: '#04060c',
    primary: '#6366f1',
    secondary: '#818cf8',
    accent: '#a5b4fc',
    highlight: '#e0e7ff',
    particles: ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff'],
  },
};

export const DEFAULT_PALETTE_ID = 'monochrome_silver';

export function hexToRgb(hex: string): [number, number, number] {
  const cleanHex = hex.replace('#', '').trim();
  let r = 255;
  let g = 255;
  let b = 255;

  if (cleanHex.length === 3) {
    r = parseInt(cleanHex[0] + cleanHex[0], 16);
    g = parseInt(cleanHex[1] + cleanHex[1], 16);
    b = parseInt(cleanHex[2] + cleanHex[2], 16);
  } else if (cleanHex.length >= 6) {
    r = parseInt(cleanHex.substring(0, 2), 16);
    g = parseInt(cleanHex.substring(2, 4), 16);
    b = parseInt(cleanHex.substring(4, 6), 16);
  }

  return [isNaN(r) ? 255 : r, isNaN(g) ? 255 : g, isNaN(b) ? 255 : b];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const hexR = clamp(r).toString(16).padStart(2, '0');
  const hexG = clamp(g).toString(16).padStart(2, '0');
  const hexB = clamp(b).toString(16).padStart(2, '0');
  return `#${hexR}${hexG}${hexB}`;
}

export function lerpColor(hexA: string, hexB: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const factor = Math.max(0, Math.min(1, t));

  const r = r1 + (r2 - r1) * factor;
  const g = g1 + (g2 - g1) * factor;
  const b = b1 + (b2 - b1) * factor;

  return rgbToHex(r, g, b);
}

export function getRandomPalette(currentId?: string): ColorPalette {
  const allIds = Object.keys(PALETTES);
  const filtered = allIds.filter(id => id !== currentId);
  const randomId = filtered[Math.floor(Math.random() * filtered.length)] || allIds[0];
  return PALETTES[randomId];
}
