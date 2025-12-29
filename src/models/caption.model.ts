
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
  duration: number;
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
}

// Represents a full, saveable project
export interface Project {
  id: string;
  name: string;
  clips: { id: string; name: string; type: string; duration: number; }[];
  captions: Caption[];
  settings: ProjectSettings;
  lastModified: number;
}
