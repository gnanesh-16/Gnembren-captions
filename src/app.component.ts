
import { Component, ChangeDetectionStrategy, signal, inject, viewChild, ElementRef, effect, WritableSignal, computed } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GeminiService } from './services/gemini.service';
import { Caption, Clip } from './models/caption.model';

interface VideoInfo { name: string; resolution: string; aspectRatio: string; duration: string; size: string; }
interface StylePreset { name: string; styles: Partial<AllStyles> }
interface AllStyles {
  fontFamily: string;
  fontSize: number;
  textColor: string;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  textDecoration: 'none' | 'underline';
  textAlign: 'left' | 'center' | 'right';
  textShadowEnabled: boolean;
  textBackgroundEnabled: boolean;
  textBackgroundColor: string;
  textStrokeEnabled: boolean;
  textStrokeColor: string;
  textStrokeWidth: number;
  captionAnimation: 'none' | 'fade' | 'pop' | 'slide';
  karaokeEnabled: boolean;
  karaokeColor: string;
}


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  host: {
    '(document:keydown)': 'handleKeyboardShortcuts($event)'
  }
})
export class AppComponent {
  private geminiService = inject(GeminiService);
  private document = inject(DOCUMENT);

  videoPlayer = viewChild<ElementRef<HTMLVideoElement>>('videoPlayer');

  // Video & Timeline State
  clips = signal<Clip[]>([]);
  videoInfo = signal<VideoInfo | null>(null);
  captions = signal<Caption[]>([]);
  currentCaption = signal<Caption | null>(null);
  selectedCaptionIndex = signal<number | null>(null);
  
  // --- Styling Signals ---
  fonts = signal([ { name: 'Manrope', family: "'Manrope', sans-serif" }, { name: 'Inter', family: "'Inter', sans-serif" }, { name: 'Poppins', family: "'Poppins', sans-serif" }, { name: 'Roboto', family: "'Roboto', sans-serif" }, { name: 'Montserrat', family: "'Montserrat', sans-serif" } ]);
  // Style Tab
  selectedFont = signal<string>(this.fonts()[0].family);
  fontSize = signal<number>(48);
  textColor = signal<string>('#FFFFFF');
  fontWeight = signal<number>(700);
  fontStyle = signal<'normal' | 'italic'>('normal');
  textDecoration = signal<'none' | 'underline'>('none');
  textTransform = signal<'none' | 'uppercase' | 'lowercase' | 'capitalize'>('none');
  letterSpacing = signal<number>(0);
  lineHeight = signal<number>(1.2);
  // Layout Tab
  textAlign = signal<'left' | 'center' | 'right'>('center');
  captionMaxWidth = signal(90); // in percent
  textShadowEnabled = signal<boolean>(true);
  textBackgroundEnabled = signal<boolean>(false);
  textBackgroundColor = signal<string>('rgba(0, 0, 0, 0.5)');
  textStrokeEnabled = signal(false);
  textStrokeColor = signal('#000000');
  textStrokeWidth = signal(2);
  // Format Tab
  canvasAspectRatio = signal<'16:9' | '9:16' | '1:1'>('16:9');
  // Animate Tab
  captionAnimation = signal<'none' | 'fade' | 'pop' | 'slide'>('fade');
  karaokeEnabled = signal(true);
  karaokeColor = signal('#2563eb');
  
  activeWordIndex = signal<number | null>(null);

  // App State
  isLoading = signal(false);
  error = signal<string | null>(null);
  activeTab = signal<'captions' | 'style' | 'layout' | 'format' | 'animate'>('captions');
  playbackRate = signal(1);

  textStrokeStyle = computed(() => {
    if (!this.textStrokeEnabled()) return 'none';
    const w = this.textStrokeWidth();
    const c = this.textStrokeColor();
    return `-${w}px -${w}px 0 ${c}, ${w}px -${w}px 0 ${c}, -${w}px ${w}px 0 ${c}, ${w}px ${w}px 0 ${c}`;
  });

  stylePresets = signal<StylePreset[]>([
    { name: 'Social Pop', styles: { fontSize: 56, fontWeight: 800, textColor: '#FFFFFF', textStrokeEnabled: true, textStrokeColor: '#000000', textStrokeWidth: 3, captionAnimation: 'pop', karaokeEnabled: true, karaokeColor: '#FFFF00' } },
    { name: 'Cinematic', styles: { fontSize: 36, fontFamily: "'Roboto', sans-serif", fontWeight: 400, textColor: '#FFFFFF', textShadowEnabled: true, textBackgroundEnabled: false, textStrokeEnabled: false, captionAnimation: 'fade', karaokeEnabled: false,textAlign: 'center'} },
    { name: 'Minimal', styles: { fontSize: 24, fontFamily: "'Inter', sans-serif", fontWeight: 500, textColor: '#FFFFFF', textShadowEnabled: false, textBackgroundEnabled: false, textStrokeEnabled: false, captionAnimation: 'fade', karaokeEnabled: false } },
  ]);

  constructor() {
    effect(() => {
      const fontName = this.fonts().find(f => f.family === this.selectedFont())?.name;
      if (fontName) this.loadFont(fontName);
    });
  }

  async onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || !file.type.startsWith('video/')) {
      this.error.set('Please select a valid video file.');
      return;
    }
    
    this.isLoading.set(true);
    const clip = await this.createClipFromFile(file);
    this.clips.update(clips => [...clips, clip]);
    
    // Only set info and generate captions for the first video
    if (this.clips().length === 1) {
      this.setVideoInfo(file, clip.duration);
      this.generateCaptions(file, clip.id); // This already sets isLoading to false
    } else {
       this.isLoading.set(false);
    }

    setTimeout(() => {
      const videoElement = this.videoPlayer()?.nativeElement;
      if (videoElement) {
        videoElement.src = this.clips()[0].objectUrl;
        videoElement.ontimeupdate = (e) => this.onTimeUpdate(e);
      }
    });
  }
  
  private async createClipFromFile(file: File): Promise<Clip> {
    const objectUrl = URL.createObjectURL(file);
    const duration = await this.getVideoDuration(objectUrl);
    return { id: `clip_${Date.now()}`, file, objectUrl, duration, thumbnails: [] };
  }
  
  private getVideoDuration(url: string): Promise<number> {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.src = url;
      video.onloadedmetadata = () => resolve(video.duration);
    });
  }
  
  setVideoInfo(file: File, duration: number) {
      const video = document.createElement('video');
      video.src = URL.createObjectURL(file);
      video.onloadedmetadata = () => {
        const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
        const r = gcd(video.videoWidth, video.videoHeight);
        this.videoInfo.set({ 
            name: file.name, 
            resolution: `${video.videoWidth}x${video.videoHeight}`, 
            aspectRatio: `${video.videoWidth/r}:${video.videoHeight/r}`,
            duration: this.formatDuration(duration), 
            size: this.formatFileSize(file.size)
        });
        URL.revokeObjectURL(video.src);
      };
  }


  onTimeUpdate(event: Event) {
    const video = event.target as HTMLVideoElement;
    const currentTime = video.currentTime;
    // For now, simple caption finding in the first clip's captions
    const activeCaption = this.captions().find(c => currentTime >= c.startTime && currentTime <= c.endTime) || null;
    this.currentCaption.set(activeCaption);

    if (activeCaption && this.karaokeEnabled() && activeCaption.words) {
      const activeWord = activeCaption.words.findIndex(w => currentTime >= w.startTime && currentTime <= w.endTime);
      this.activeWordIndex.set(activeWord !== -1 ? activeWord : null);
    } else {
      this.activeWordIndex.set(null);
    }
  }

  async generateCaptions(file: File, clipId: string) {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      this.captions.set(await this.geminiService.generateCaptions(file, clipId));
    } catch (e: any) {
      this.error.set(e.message || 'An unknown error occurred.');
    } finally {
      this.isLoading.set(false);
    }
  }

  handleKeyboardShortcuts(event: KeyboardEvent) {
    const video = this.videoPlayer()?.nativeElement;
    if (!video) return;
    if ((event.target as HTMLElement).tagName === 'INPUT' || (event.target as HTMLElement).tagName === 'TEXTAREA') return;

    switch (event.code) {
      case 'Space':
        event.preventDefault();
        video.paused ? video.play() : video.pause();
        break;
      case 'ArrowLeft':
        video.currentTime -= 2;
        break;
      case 'ArrowRight':
        video.currentTime += 2;
        break;
    }
  }

  selectCaption(index: number) {
    this.selectedCaptionIndex.set(index);
    const video = this.videoPlayer()?.nativeElement;
    if (video) {
      video.currentTime = this.captions()[index].startTime;
      video.pause();
    }
  }

  updateCaption(index: number, field: 'text' | 'startTime' | 'endTime', value: string | number) {
    this.captions.update(caps => {
      const newCaps = [...caps];
      const caption = { ...newCaps[index] };
      if (field === 'text') caption.text = value as string;
      else {
        const numValue = Number(value);
        if (!isNaN(numValue) && numValue >= 0) caption[field] = numValue;
      }
      newCaps[index] = caption;
      return newCaps;
    });
  }
  
  splitCaption() {
    // This logic would need to be updated for multi-clip timelines.
    // For now, it works on the assumption of a single clip.
    const video = this.videoPlayer()?.nativeElement;
    if (!video) return;
    const currentTime = video.currentTime;
    const captionIndex = this.captions().findIndex(c => currentTime > c.startTime && currentTime < c.endTime);
    if (captionIndex === -1) return;

    this.captions.update(caps => {
        const originalCaption = caps[captionIndex];
        const splitPoint = currentTime;
        let wordIndexToSplit = originalCaption.words.findIndex(w => splitPoint >= w.startTime && splitPoint <= w.endTime);
        if (wordIndexToSplit === -1) wordIndexToSplit = originalCaption.words.length;
        const firstHalfWords = originalCaption.words.slice(0, wordIndexToSplit);
        const secondHalfWords = originalCaption.words.slice(wordIndexToSplit);
        if (firstHalfWords.length === 0 || secondHalfWords.length === 0) return caps;

        const newCaption1: Caption = { ...originalCaption, text: firstHalfWords.map(w => w.text).join(' '), endTime: splitPoint, words: firstHalfWords };
        const newCaption2: Caption = { ...originalCaption, text: secondHalfWords.map(w => w.text).join(' '), startTime: splitPoint, words: secondHalfWords };

        const newCaptions = [...caps];
        newCaptions.splice(captionIndex, 1, newCaption1, newCaption2);
        return newCaptions;
    });
}


  addCaption() {
    this.captions.update(caps => {
      const lastCap = caps[caps.length - 1];
      const newStartTime = lastCap ? lastCap.endTime + 0.1 : (this.videoPlayer()?.nativeElement.currentTime || 0);
      const newCaption: Caption = { clipId: this.clips()[0]?.id, text: 'New Caption', startTime: parseFloat(newStartTime.toFixed(2)), endTime: parseFloat((newStartTime + 2).toFixed(2)), words: [] };
      return [...caps, newCaption];
    });
  }

  deleteCaption(index: number) {
    this.captions.update(caps => caps.filter((_, i) => i !== index));
  }

  toggleTextShadow() { this.textShadowEnabled.update(v => !v); }
  toggleTextBackground() { this.textBackgroundEnabled.update(v => !v); }
  toggleTextStroke() { this.textStrokeEnabled.update(v => !v); }
  toggleKaraoke() { this.karaokeEnabled.update(v => !v); }

  setPlaybackRate(rate: number) {
    const video = this.videoPlayer()?.nativeElement;
    if (video) {
        this.playbackRate.set(rate);
        video.playbackRate = rate;
    }
  }

  applyPreset(preset: StylePreset) {
    for (const [key, value] of Object.entries(preset.styles)) {
      if (this.hasOwnProperty(key) && typeof (this as any)[key] === 'function') {
        (this as any)[key].set(value);
      }
    }
  }

  resetStyles() {
    this.selectedFont.set(this.fonts()[0].family); this.fontSize.set(48); this.textColor.set('#FFFFFF'); this.fontWeight.set(700); this.fontStyle.set('normal'); this.textDecoration.set('none'); this.textTransform.set('none'); this.letterSpacing.set(0); this.lineHeight.set(1.2); this.textAlign.set('center'); this.captionMaxWidth.set(90); this.textShadowEnabled.set(true); this.textBackgroundEnabled.set(false); this.textBackgroundColor.set('rgba(0, 0, 0, 0.5)'); this.textStrokeEnabled.set(false); this.textStrokeColor.set('#000000'); this.textStrokeWidth.set(2); this.captionAnimation.set('fade'); this.karaokeEnabled.set(true); this.karaokeColor.set('#2563eb');
  }

  loadFont(fontName: string) { const fontId = `google-font-${fontName.toLowerCase()}`; if (this.document.getElementById(fontId)) return; const link = this.document.createElement('link'); link.id = fontId; link.rel = 'stylesheet'; link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(' ', '+')}:wght@400;500;600;700;800&display=swap`; this.document.head.appendChild(link); }
  formatDuration = (seconds: number) => { const min = Math.floor(seconds / 60); const sec = Math.floor(seconds % 60); return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`; }
  formatFileSize = (bytes: number) => { if (bytes === 0) return '0 B'; const k = 1024; const sizes = ['B', 'KB', 'MB', 'GB']; const i = Math.floor(Math.log(bytes) / Math.log(k)); return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`; }
  downloadVideo = () => alert('Simulated download. Client-side video rendering is not implemented.');
}
