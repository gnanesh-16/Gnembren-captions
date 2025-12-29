
import { Component, ChangeDetectionStrategy, signal, inject, viewChild, ElementRef, effect, computed, OnInit } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GeminiService } from './services/gemini.service';
import { StorageService } from './services/storage.service';
import { Caption, Clip, Project, ProjectSettings } from './models/caption.model';

interface VideoInfo { name: string; resolution: string; aspectRatio: string; duration: string; size: string; }
interface StylePreset { name: string; styles: Partial<ProjectSettings> }

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  host: {
    '(document:keydown)': 'handleKeyboardShortcuts($event)'
  }
})
export class AppComponent implements OnInit {
  private geminiService = inject(GeminiService);
  private document = inject(DOCUMENT);
  private storageService = inject(StorageService);

  videoPlayer = viewChild<ElementRef<HTMLVideoElement>>('videoPlayer');
  fileInputForLoad = viewChild<ElementRef<HTMLInputElement>>('fileInputForLoad');

  // App View State
  view = signal<'hero' | 'editor'>('hero');
  projects = signal<Project[]>([]);
  projectToLoad = signal<Project | null>(null);

  // Editor UI State
  isPlayerPanelCollapsed = signal(false);
  isEditorPanelCollapsed = signal(false);
  isExportModalVisible = signal(false);

  // Active Project State
  activeProjectId = signal<string | null>(null);
  clips = signal<Clip[]>([]);
  videoInfo = signal<VideoInfo | null>(null);
  captions = signal<Caption[]>([]);
  currentCaption = signal<Caption | null>(null);
  selectedCaptionIndex = signal<number | null>(null);
  
  // --- Styling Signals ---
  fonts = signal([ { name: 'Manrope', family: "'Manrope', sans-serif" }, { name: 'Inter', family: "'Inter', sans-serif" }, { name: 'Poppins', family: "'Poppins', sans-serif" }, { name: 'Roboto', family: "'Roboto', sans-serif" }, { name: 'Montserrat', family: "'Montserrat', sans-serif" } ]);
  selectedFont = signal<string>(this.fonts()[0].family);
  fontSize = signal<number>(48);
  textColor = signal<string>('#FFFFFF');
  fontWeight = signal<number>(700);
  fontStyle = signal<'normal' | 'italic'>('normal');
  textDecoration = signal<'none' | 'underline'>('none');
  textTransform = signal<'none' | 'uppercase' | 'lowercase' | 'capitalize'>('none');
  letterSpacing = signal<number>(0);
  lineHeight = signal<number>(1.2);
  textAlign = signal<'left' | 'center' | 'right'>('center');
  captionMaxWidth = signal(90);
  textShadowEnabled = signal<boolean>(true);
  textBackgroundEnabled = signal<boolean>(false);
  textBackgroundColor = signal<string>('rgba(0, 0, 0, 0.5)');
  textStrokeEnabled = signal(false);
  textStrokeColor = signal('#000000');
  textStrokeWidth = signal(2);
  canvasAspectRatio = signal<'16:9' | '9:16' | '1:1'>('16:9');
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
    { name: 'Cinematic', styles: { fontSize: 36, fontFamily: "'Roboto', sans-serif", fontWeight: 400, textColor: '#FFFFFF', textShadowEnabled: true, textBackgroundEnabled: false, textStrokeEnabled: false, captionAnimation: 'fade', karaokeEnabled: true, textAlign: 'center'} },
    { name: 'Minimal', styles: { fontSize: 24, fontFamily: "'Inter', sans-serif", fontWeight: 500, textColor: '#FFFFFF', textShadowEnabled: false, textBackgroundEnabled: false, textStrokeEnabled: false, captionAnimation: 'fade', karaokeEnabled: false } },
  ]);

  constructor() {
    effect(() => {
      const fontName = this.fonts().find(f => f.family === this.selectedFont())?.name;
      if (fontName) this.loadFont(fontName);
    });
    // Auto-save effect
    effect(() => {
      const projectId = this.activeProjectId();
      if (projectId && this.view() === 'editor') {
        this.saveActiveProject();
      }
    }, { allowSignalWrites: true });
  }

  ngOnInit() {
    this.projects.set(this.storageService.getProjects());
  }

  // --- Project Management ---
  async handleNewProjectFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.startNewProject(file);
    (event.target as HTMLInputElement).value = ''; // Reset file input
  }

  async startNewProject(file: File) {
    if (!file.type.startsWith('video/')) {
      alert('Please select a valid video file.');
      return;
    }
    this.isLoading.set(true);
    this.resetEditorState();
    
    const newClip = await this.createClipFromFile(file);
    this.clips.set([newClip]);
    
    const projectId = `proj_${Date.now()}`;
    this.activeProjectId.set(projectId);

    this.setVideoInfo(file, newClip.duration);
    this.view.set('editor');
    
    this.generateCaptions(file, newClip.id); // This also sets isLoading to false
  }

  loadProject(project: Project) {
    this.projectToLoad.set(project);
    // Prompt user to select the file.
    this.fileInputForLoad()?.nativeElement.click();
  }

  async handleLoadProjectFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    const project = this.projectToLoad();
    if (!file || !project) return;

    // A real app would validate if this is the correct file (e.g., check duration, name)
    if (file.name !== project.clips[0].name) {
      if (!confirm(`Warning: The selected file name "${file.name}" does not match the saved project file "${project.clips[0].name}".\n\nDo you want to continue?`)) {
        this.projectToLoad.set(null);
        (event.target as HTMLInputElement).value = '';
        return;
      }
    }

    this.isLoading.set(true);
    this.resetEditorState();

    const loadedClip = await this.createClipFromFile(file);
    this.clips.set([loadedClip]); // For now, only support single-clip projects
    this.captions.set(project.captions);
    this.applySettings(project.settings);

    this.activeProjectId.set(project.id);
    this.setVideoInfo(file, loadedClip.duration);
    this.view.set('editor');
    this.isLoading.set(false);
    this.projectToLoad.set(null);
    (event.target as HTMLInputElement).value = '';
  }

  saveActiveProject() {
    const projectId = this.activeProjectId();
    const clip = this.clips()[0];
    if (!projectId || !clip) return;

    const project: Project = {
      id: projectId,
      name: clip.name,
      clips: this.clips().map(c => ({ id: c.id, name: c.name, type: c.type, duration: c.duration })),
      captions: this.captions(),
      settings: this.getCurrentSettings(),
      lastModified: Date.now()
    };
    this.storageService.saveProject(project);
    this.projects.set(this.storageService.getProjects());
  }
  
  goHome() {
    this.saveActiveProject();
    this.resetEditorState();
    this.view.set('hero');
  }

  private async createClipFromFile(file: File): Promise<Clip> {
    const objectUrl = URL.createObjectURL(file);
    const duration = await this.getVideoDuration(objectUrl);
    return { id: `clip_${Date.now()}`, file, objectUrl, duration, name: file.name, type: file.type };
  }
  
  private getVideoDuration(url: string): Promise<number> {
    return new Promise((resolve) => { const video = document.createElement('video'); video.src = url; video.onloadedmetadata = () => resolve(video.duration); });
  }

  onTimeUpdate(event: Event) {
    const video = event.target as HTMLVideoElement;
    if(!video) return;
    const currentTime = video.currentTime;
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
    this.isLoading.set(true); this.error.set(null);
    try {
      const newCaptions = await this.geminiService.generateCaptions(file, clipId);
      this.captions.set(newCaptions);
    } catch (e: any) { this.error.set(e.message || 'An unknown error occurred.'); } 
    finally { this.isLoading.set(false); }
  }

  selectCaption(index: number) { this.selectedCaptionIndex.set(index); const video = this.videoPlayer()?.nativeElement; if (video) { video.currentTime = this.captions()[index].startTime; video.pause(); } }

  updateCaption(index: number, value: string) {
    this.captions.update(caps => {
      const newCaps = [...caps];
      const newCaption = { ...newCaps[index], text: value };
      newCaps[index] = newCaption;
      return newCaps;
    });
  }
  
  splitCaption() {
    const video = this.videoPlayer()?.nativeElement; if (!video) return; const currentTime = video.currentTime; const captionIndex = this.captions().findIndex(c => currentTime > c.startTime && currentTime < c.endTime); if (captionIndex === -1) return;
    this.captions.update(caps => {
        const originalCaption = caps[captionIndex]; const splitPoint = currentTime; let wordIndexToSplit = originalCaption.words.findIndex(w => splitPoint >= w.startTime && splitPoint <= w.endTime); if (wordIndexToSplit === -1) wordIndexToSplit = originalCaption.words.length; const firstHalfWords = originalCaption.words.slice(0, wordIndexToSplit); const secondHalfWords = originalCaption.words.slice(wordIndexToSplit); if (firstHalfWords.length === 0 || secondHalfWords.length === 0) return caps;
        const newCaption1: Caption = { ...originalCaption, id: `caption_${Math.random().toString(36).substring(2, 11)}`, text: firstHalfWords.map(w => w.text).join(' '), endTime: splitPoint, words: firstHalfWords };
        const newCaption2: Caption = { ...originalCaption, id: `caption_${Math.random().toString(36).substring(2, 11)}`, text: secondHalfWords.map(w => w.text).join(' '), startTime: splitPoint, words: secondHalfWords };
        const newCaptions = [...caps]; newCaptions.splice(captionIndex, 1, newCaption1, newCaption2); return newCaptions;
    });
  }

  addCaption() { this.captions.update(caps => { const lastCap = caps[caps.length - 1]; const newStartTime = lastCap ? lastCap.endTime + 0.1 : (this.videoPlayer()?.nativeElement.currentTime || 0); const newCaption: Caption = { id: `caption_${Math.random().toString(36).substring(2, 11)}`, clipId: this.clips()[0]?.id, text: 'New Caption', startTime: parseFloat(newStartTime.toFixed(2)), endTime: parseFloat((newStartTime + 2).toFixed(2)), words: [] }; return [...caps, newCaption]; }); }
  deleteCaption(index: number) { this.captions.update(caps => caps.filter((_, i) => i !== index)); }

  // --- UI and State Helpers ---
  togglePlayerPanel() { this.isPlayerPanelCollapsed.update(v => !v); }
  toggleEditorPanel() { this.isEditorPanelCollapsed.update(v => !v); }
  
  resetEditorState() {
    this.activeProjectId.set(null); this.clips.set([]); this.captions.set([]); this.currentCaption.set(null); this.error.set(null); this.selectedCaptionIndex.set(null); this.videoInfo.set(null); this.resetStyles();
    const video = this.videoPlayer()?.nativeElement;
    if(video) { video.src = ''; video.ontimeupdate = null; }
  }
  
  getCurrentSettings(): ProjectSettings {
    return { fontFamily: this.selectedFont(), fontSize: this.fontSize(), textColor: this.textColor(), fontWeight: this.fontWeight(), fontStyle: this.fontStyle(), textDecoration: this.textDecoration(), textTransform: this.textTransform(), letterSpacing: this.letterSpacing(), lineHeight: this.lineHeight(), textAlign: this.textAlign(), captionMaxWidth: this.captionMaxWidth(), textShadowEnabled: this.textShadowEnabled(), textBackgroundEnabled: this.textBackgroundEnabled(), textBackgroundColor: this.textBackgroundColor(), textStrokeEnabled: this.textStrokeEnabled(), textStrokeColor: this.textStrokeColor(), textStrokeWidth: this.textStrokeWidth(), captionAnimation: this.captionAnimation(), karaokeEnabled: this.karaokeEnabled(), karaokeColor: this.karaokeColor(), canvasAspectRatio: this.canvasAspectRatio() };
  }
  
  applySettings(settings: ProjectSettings) {
    for (const [key, value] of Object.entries(settings)) {
      if (this.hasOwnProperty(key) && typeof (this as any)[key] === 'function') {
        (this as any)[key].set(value);
      }
    }
  }

  applyPreset(preset: StylePreset) { this.applySettings(preset.styles as ProjectSettings); }
  
  resetStyles() { const defaultSettings: ProjectSettings = { fontFamily: this.fonts()[0].family, fontSize: 48, textColor: '#FFFFFF', fontWeight: 700, fontStyle: 'normal', textDecoration: 'none', textTransform: 'none', letterSpacing: 0, lineHeight: 1.2, textAlign: 'center', captionMaxWidth: 90, textShadowEnabled: true, textBackgroundEnabled: false, textBackgroundColor: 'rgba(0, 0, 0, 0.5)', textStrokeEnabled: false, textStrokeColor: '#000000', textStrokeWidth: 2, captionAnimation: 'fade', karaokeEnabled: true, karaokeColor: '#2563eb', canvasAspectRatio: '16:9' }; this.applySettings(defaultSettings); }
  
  setVideoInfo(file: File, duration: number) { const video = document.createElement('video'); video.preload = 'metadata'; video.src = URL.createObjectURL(file); video.onloadedmetadata = () => { const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b); const r = gcd(video.videoWidth, video.videoHeight); this.videoInfo.set({ name: file.name, resolution: `${video.videoWidth}x${video.videoHeight}`, aspectRatio: `${video.videoWidth/r}:${video.videoHeight/r}`, duration: this.formatDuration(duration), size: this.formatFileSize(file.size) }); URL.revokeObjectURL(video.src); }; }
  
  handleKeyboardShortcuts(event: KeyboardEvent) { const video = this.videoPlayer()?.nativeElement; if (!video || this.view() === 'hero') return; if ((event.target as HTMLElement).tagName === 'INPUT' || (event.target as HTMLElement).tagName === 'TEXTAREA') return; switch (event.code) { case 'Space': event.preventDefault(); video.paused ? video.play() : video.pause(); break; case 'ArrowLeft': video.currentTime -= 2; break; case 'ArrowRight': video.currentTime += 2; break; } }
  
  toggleTextShadow() { this.textShadowEnabled.update(v => !v); }
  toggleTextBackground() { this.textBackgroundEnabled.update(v => !v); }
  toggleTextStroke() { this.textStrokeEnabled.update(v => !v); }
  toggleKaraoke() { this.karaokeEnabled.update(v => !v); }
  setPlaybackRate(rate: number) { const video = this.videoPlayer()?.nativeElement; if (video) { this.playbackRate.set(rate); video.playbackRate = rate; } }
  loadFont(fontName: string) { const fontId = `google-font-${fontName.toLowerCase()}`; if (this.document.getElementById(fontId)) return; const link = this.document.createElement('link'); link.id = fontId; link.rel = 'stylesheet'; link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(' ', '+')}:wght@400;500;600;700;800&display=swap`; this.document.head.appendChild(link); }
  formatDuration = (seconds: number) => { const min = Math.floor(seconds / 60); const sec = Math.floor(seconds % 60); return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`; }
  formatFileSize = (bytes: number) => { if (bytes === 0) return '0 B'; const k = 1024; const sizes = ['B', 'KB', 'MB', 'GB']; const i = Math.floor(Math.log(bytes) / Math.log(k)); return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`; }
  downloadVideo = () => this.isExportModalVisible.set(true);
}
