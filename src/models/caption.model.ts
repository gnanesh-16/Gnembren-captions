
export interface Word {
  text: string;
  startTime: number;
  endTime: number;
}

export interface Caption {
  id: string;
  clipId: string;
  text: string;
  startTime: number;
  endTime: number;
  words: Word[];
}

export interface Clip {
  id:string;
  file: File;
  objectUrl: string;
  originalDuration: number;
  trimStart: number;
  trimEnd: number;
  // This will be used for the serializable version
  name: string; 
  type: string;
}

// Represents all the configurable style options
export interface ProjectSettings {
  fontFamily: string;
  fontSize: number;
  textColor: string;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  textDecoration: 'none' | 'underline';
  textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  letterSpacing: number;
  lineHeight: number;
  textAlign: 'left' | 'center' | 'right';
  captionMaxWidth: number;
  textShadowEnabled: boolean;
  textBackgroundEnabled: boolean;
  textBackgroundColor: string;
  textStrokeEnabled: boolean;
  textStrokeColor: string;
  textStrokeWidth: number;
  captionAnimation: 'none' | 'fade' | 'pop' | 'slide';
  karaokeEnabled: boolean;
  karaokeColor: string;
  canvasAspectRatio: '16:9' | '9:16' | '1:1';
  // New Audio Settings
  audioEnhancementEnabled: boolean;
  noiseReductionIntensity: number;
  eqTreble: number;
  eqMids: number;
  eqBass: number;
  voiceClarity: number;
  volumeBoost: number;
  // New Transform Settings
  scale: number;
  positionX: number;
  positionY: number;
  // New AlphaCheck setting
  backgroundSoundOff: boolean;
}

// Represents a full, saveable project
export interface Project {
  id: string;
  name: string;
  clips: { 
    id: string; 
    name: string; 
    type: string; 
    originalDuration: number;
    trimStart: number;
    trimEnd: number;
  }[];
  captions: Caption[];
  settings: ProjectSettings;
  lastModified: number;
}