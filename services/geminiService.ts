import { GoogleGenAI } from '@google/genai';
import { ShotResult, TerrainType } from '../types';

let ai: GoogleGenAI | null = null;

if (process.env.API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
}

export const getCaddieCommentary = async (result: ShotResult): Promise<string> => {
  if (!ai) return "Nice shot! (AI Key missing)";

  const prompt = `
    You are a witty, slightly sarcastic, but ultimately helpful golf caddie.
    The player just hit a shot with the following stats:
    - Distance: ${result.distance.toFixed(1)} meters
    - Landing Terrain: ${result.landingTerrain}
    - Accuracy: ${result.accuracy.toFixed(0)}%
    - Power: ${result.power.toFixed(0)}%
    - Current Strokes: ${result.strokes}

    Give a very short (max 2 sentences) reaction to the shot.
    If it landed in the Water or Sand, be sympathetic or funny.
    If it's on the Green or in the Hole, be excited.
    Use golf terminology appropriately.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "Interesting shot!";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "The wind is interfering with my voice... Nice shot though!";
  }
};
