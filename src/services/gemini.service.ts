
import { Injectable } from '@angular/core';
import { GoogleGenAI, Type } from '@google/genai';
import { Caption } from '../models/caption.model';

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    if (!process.env.API_KEY) {
      throw new Error("API_KEY environment variable not set");
    }
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  private async fileToGenerativePart(file: File): Promise<{ inlineData: { data: string; mimeType: string; }; }> {
    const base64EncodedDataPromise = new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(file);
    });
    return {
      inlineData: {
        data: await base64EncodedDataPromise,
        mimeType: file.type,
      },
    };
  }

  async generateCaptions(videoFile: File, clipId: string): Promise<Caption[]> {
    const prompt = `
      Transcribe the audio from this video. Provide timestamps for both full caption lines and for each individual spoken word.
      The output must be a clean JSON array of caption objects.
      
      Each caption object in the array must have:
      - "text": The full transcribed phrase (string).
      - "startTime": The start time of the entire phrase in seconds (number).
      - "endTime": The end time of the entire phrase in seconds (number).
      - "words": An array of word objects.

      Each object within the "words" array must have:
      - "text": The individual word (string).
      - "startTime": The start time of the word in seconds (number).
      - "endTime": The end time of the word in seconds (number).

      Ensure all timestamps are accurate, sequential, and correctly nested.
    `;
    
    try {
      const videoPart = await this.fileToGenerativePart(videoFile);

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [ { text: prompt }, videoPart ] },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                startTime: { type: Type.NUMBER },
                endTime: { type: Type.NUMBER },
                words: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      text: { type: Type.STRING },
                      startTime: { type: Type.NUMBER },
                      endTime: { type: Type.NUMBER },
                    },
                    required: ['text', 'startTime', 'endTime'],
                  },
                },
              },
              required: ['text', 'startTime', 'endTime', 'words'],
            },
          },
        },
      });

      const jsonString = response.text;
      const captionsData = JSON.parse(jsonString) as Omit<Caption, 'clipId'>[];
      const captions: Caption[] = captionsData.map(c => ({...c, clipId}));
      return captions.sort((a, b) => a.startTime - b.startTime);

    } catch (error) {
      console.error('Error generating captions:', error);
      throw new Error('Failed to transcribe video. The AI may not have been able to process the audio.');
    }
  }
}
