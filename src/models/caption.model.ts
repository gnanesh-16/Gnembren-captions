
export interface Word {
  text: string;
  startTime: number;
  endTime: number;
}

export interface Caption {
  clipId: string;
  text: string;
  startTime: number;
  endTime: number;
  words: Word[];
}

export interface Clip {
  id: string;
  file: File;
  objectUrl: string;
  duration: number;
  thumbnails: string[];
}
