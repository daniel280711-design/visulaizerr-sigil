/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Fallback procedural palette generator in case API key is missing or offline
function generateProceduralPalette(audio: any) {
  const bpm = audio.bpm || 120;
  const bass = audio.bass || 0.5;
  const centroid = audio.centroid || 1500;
  const isBright = centroid > 2200;
  const isHighEnergy = bpm > 125 || bass > 0.6;

  if (isHighEnergy && isBright) {
    return {
      paletteName: 'Solar Flare & Gold (IA Procedural)',
      sentimentDescription: 'Alta energía y frecuencias brillantes sintetizadas en ámbar y oro cálido.',
      c1: '#f97316',
      c2: '#fbbf24',
      c3: '#fffbeb',
      am: '#1f130b'
    };
  } else if (isHighEnergy) {
    return {
      paletteName: 'Cyber Velvet & Crimson (IA Procedural)',
      sentimentDescription: 'Graves pesados e impacto rítmico en tonos carmesí y magenta profundo.',
      c1: '#f43f5e',
      c2: '#fb7185',
      c3: '#ffe4e6',
      am: '#1a0a14'
    };
  } else if (isBright) {
    return {
      paletteName: 'Celestial Champagne (IA Procedural)',
      sentimentDescription: 'Resonancia armónica clara en dorados etéreos y blanco marfil.',
      c1: '#f59e0b',
      c2: '#fbbf24',
      c3: '#fef08a',
      am: '#17120a'
    };
  } else if (centroid < 1200) {
    return {
      paletteName: 'Nocturnal Wisteria (IA Procedural)',
      sentimentDescription: 'Sub-graves oscuros e introspectivos en violeta terciopelo y amatista.',
      c1: '#8b5cf6',
      c2: '#a78bfa',
      c3: '#ede9fe',
      am: '#120e24'
    };
  } else {
    return {
      paletteName: 'Nordic Aurora Mist (IA Procedural)',
      sentimentDescription: 'Equilibrio acústico orgánico en esmeralda boreal y niebla turquesa.',
      c1: '#10b981',
      c2: '#06b6d4',
      c3: '#a7f3d0',
      am: '#061a14'
    };
  }
}

// POST /api/generate-palette - AI-powered palette generator using Gemini 3.8 Flash
app.post('/api/generate-palette', async (req: Request, res: Response) => {
  const audioData = req.body || {};
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    // Graceful procedural fallback
    const fallback = generateProceduralPalette(audioData);
    return res.json({
      success: true,
      source: 'procedural_fallback',
      palette: fallback
    });
  }

  try {
    const ai = new GoogleGenAI({});
    const prompt = `You are an expert audio-visual synesthesia artist and master color theorist for a state-of-the-art 3D audio visualizer.
Analyze the following real musical audio telemetry:
- Track: ${audioData.trackName || 'Current Audio Track'}
- Tempo: ${audioData.bpm || 120} BPM
- Key / Scale: ${audioData.key || 'A MIN'}
- Loudness: ${audioData.lufs || -14} LUFS
- Bass Weight (20-150Hz): ${(audioData.bass * 100).toFixed(0)}%
- Midrange Energy (150-2000Hz): ${(audioData.mid * 100).toFixed(0)}%
- High/Air Energy (2000-16000Hz): ${(audioData.high * 100).toFixed(0)}%
- Spectral Centroid (Timbre Brightness): ${audioData.centroid || 1800} Hz
- Musical Character: ${audioData.character || 'Rhythmic & Balanced'}

Design a deeply evocative, harmonic, sophisticated color palette that embodies the emotional soul, tempo, and frequency texture of this song.
RULES:
1. Do NOT default to generic harsh cyan or electric blue. Choose rich, refined, tasteful palettes (e.g., deep amber gold, warm vermillion ember, boreal emerald, cosmic velvet orchid, platinum silver, warm sunset copper).
2. 'c1' is the primary 3D core color (#RRGGBB).
3. 'c2' is the harmonic border/edge color (#RRGGBB).
4. 'c3' is the high-impact beat/transient highlight (#RRGGBB, bright and luminous).
5. 'am' is the subtle ambient deep shadow/backlight (#RRGGBB, dark tone matching the palette).
6. Give the palette an evocative title and a 1-sentence poetic explanation in Spanish.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            paletteName: { type: Type.STRING, description: 'Evocative title for the palette' },
            sentimentDescription: { type: Type.STRING, description: '1-sentence poetic explanation in Spanish' },
            c1: { type: Type.STRING, description: 'Primary hex color e.g. #f59e0b' },
            c2: { type: Type.STRING, description: 'Secondary hex color e.g. #fbbf24' },
            c3: { type: Type.STRING, description: 'Highlight hex color e.g. #fef08a' },
            am: { type: Type.STRING, description: 'Ambient shadow hex color e.g. #17120a' }
          },
          required: ['paletteName', 'sentimentDescription', 'c1', 'c2', 'c3', 'am']
        }
      }
    });

    const parsed = JSON.parse(response.text || '{}');
    if (!parsed.c1 || !parsed.c2 || !parsed.c3) {
      throw new Error('Invalid palette schema returned by AI');
    }

    return res.json({
      success: true,
      source: 'gemini-3.8-flash',
      palette: parsed
    });
  } catch (error: any) {
    console.error('Gemini palette generation error:', error?.message || error);
    const fallback = generateProceduralPalette(audioData);
    return res.json({
      success: true,
      source: 'procedural_fallback',
      palette: fallback
    });
  }
});

// Mount Vite in dev mode, or static files in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

startServer();
