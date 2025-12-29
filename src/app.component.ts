
import { Component, ChangeDetectionStrategy, signal, inject, viewChild, ElementRef, effect, computed, OnInit, untracked } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GeminiService } from './services/gemini.service';
import { StorageService } from './services/storage.service';
import { Caption, Clip, Project, ProjectSettings } from './models/caption.model';

interface VideoInfo { name: string; resolution: string; aspectRatio: string; duration: string; size: string; }
interface StylePreset { name: string; styles: Partial<ProjectSettings> }
interface ClipLayout { clip: Clip; left: number; width: number; duration: number; timelineStart: number; }

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
  addClipInput = viewChild<ElementRef<HTMLInputElement>>('addClipInput');

  // App View State
  view = signal<'hero' | 'editor'>('hero');
  projects = signal<Project[]>([]);
  projectToLoad = signal<Project | null>(null);

  // Editor UI State
  isPlayerPanelCollapsed = signal(false);
  isEditorPanelCollapsed = signal(false);
  isExportModalVisible = signal(false);
  isExporting = signal(false);
  exportProgress = signal(0);
  exportTimeElapsed = signal(0);
  private exportInterval: any;

  // Active Project State
  activeProjectId = signal<string | null>(null);
  clips = signal<Clip[]>([]);
  activeClipIndex = signal<number>(0);
  videoInfo = signal<VideoInfo | null>(null);
  captions = signal<Caption[]>([]);
  currentCaption = signal<Caption | null>(null);
  selectedCaptionId = signal<string | null>(null);
  
  // --- Styling Signals ---
  fonts = signal([ { name: 'Manrope', family: "'Manrope', sans-serif" }, { name: 'Inter', family: "'Inter', sans-serif" }, { name: 'Poppins', family: "'Poppins', sans-serif" }, { name: 'Roboto', family: "'Roboto', sans-serif" }, { name: 'Montserrat', family: "'Montserrat', sans-serif" } ]);
  selectedFont = signal<string>(this.fonts()[0].family);
  fontSize = signal<number>(36);
  textColor = signal<string>('#FFFFFF');
  fontWeight = signal<number>(700);
  fontStyle = signal<'normal' | 'italic'>('normal');
  textDecoration = signal<'none' | 'underline'>('none');
  textTransform = signal<'none' | 'uppercase' | 'lowercase' | 'capitalize'>('none');
  letterSpacing = signal<number>(0);
  lineHeight = signal<number>(1.2);
  textAlign = signal<'left' | 'center' | 'right'>('center');
  captionMaxWidth = signal(70);
  textShadowEnabled = signal<boolean>(true);
  textBackgroundEnabled = signal<boolean>(false);
  textBackgroundColor = signal<string>('rgba(0, 0, 0, 0.5)');
  textStrokeEnabled = signal(false);
  textStrokeColor = signal('#000000');
  textStrokeWidth = signal(2);
  captionAnimation = signal<'none' | 'fade' | 'pop' | 'slide'>('fade');
  karaokeEnabled = signal(true);
  karaokeColor = signal('#2563eb');
  
  // --- Audio Signals ---
  audioEnhancementEnabled = signal<boolean>(false);
  noiseReductionIntensity = signal<number>(0);
  eqTreble = signal<number>(0);
  eqMids = signal<number>(0);
  eqBass = signal<number>(0);
  voiceClarity = signal<number>(0);
  volumeBoost = signal<number>(0);

  // --- Transform Signals ---
  canvasAspectRatio = signal<'16:9' | '9:16' | '1:1'>('16:9');
  scale = signal<number>(1);
  positionX = signal<number>(0);
  positionY = signal<number>(0);
  
  // --- Audio & Alpha Check ---
  alphaCheckBg = signal('checkerboard');
  vocalIsolation = signal<boolean>(false);
  voiceVolume = signal(100);
  musicVolume = signal(100);
  private preIsolationMusicVolume = 100;
  private preMuteVoiceVolume = 100;
  private preMuteMusicVolume = 100;

  activeWordIndex = signal<number | null>(null);

  // App State
  isLoading = signal(false);
  error = signal<string | null>(null);
  activeTab = signal<'captions' | 'audio' | 'style' | 'layout' | 'transform' | 'animate' | 'alphacheck'>('style');
  playbackRate = signal(1);
  playheadPosition = signal(0);
  timelineZoom = signal(1);

  // Waveform visualization
  voiceWaveform = signal<number[]>([]);
  musicWaveform = signal<number[]>([]);
  
  // --- Computed Signals ---
  activeClip = computed(() => this.clips()[this.activeClipIndex()] ?? null);
  
  captionsForActiveClip = computed(() => {
    const clipId = this.activeClip()?.id;
    return clipId ? this.captions().filter(c => c.clipId === clipId) : [];
  });
  
  totalTimelineDuration = computed(() => this.clips().reduce((acc, clip) => acc + (clip.originalDuration - clip.trimStart - clip.trimEnd), 0));
  
  clipLayouts = computed<ClipLayout[]>(() => {
    const layouts: ClipLayout[] = [];
    let currentTime = 0;
    const totalDuration = this.totalTimelineDuration();
    if (totalDuration === 0) return [];

    for (const clip of this.clips()) {
      const duration = clip.originalDuration - clip.trimStart - clip.trimEnd;
      layouts.push({
        clip: clip,
        duration: duration,
        timelineStart: currentTime,
        left: (currentTime / totalDuration) * 100,
        width: (duration / totalDuration) * 100,
      });
      currentTime += duration;
    }
    return layouts;
  });

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
    effect(() => { const fontName = this.fonts().find(f => f.family === this.selectedFont())?.name; if (fontName) this.loadFont(fontName); });
    effect((onCleanup) => { const projectState = { id: this.activeProjectId(), clips: this.clips(), captions: this.captions(), settings: this.getCurrentSettings() }; if (projectState.id && untracked(this.view) === 'editor') { const timeoutId = setTimeout(() => { this.saveActiveProject(); }, 1000); onCleanup(() => { clearTimeout(timeoutId); }); } }, { allowSignalWrites: true });
    effect(() => { const clip = this.activeClip(); if(clip) { this.setVideoInfo(clip.file, clip.originalDuration - clip.trimStart - clip.trimEnd); }});
    effect(() => {
        const player = this.videoPlayer();
        if (player) {
            // Since we cannot separate audio tracks, the main video volume is controlled by the "Voice" track.
            // The "Music" track is a simulation for UI/UX purposes.
            player.nativeElement.volume = this.voiceVolume() / 100;
        }
    });
  }

  ngOnInit() { 
    this.projects.set(this.storageService.getProjects()); 
    const voicePoints: number[] = [];
    const musicPoints: number[] = [];
    for (let i = 0; i < 100; i++) {
        voicePoints.push(Math.random() * 30 + 40 + Math.sin(i / 5) * 15);
        musicPoints.push(Math.random() * 20 + 30 + Math.cos(i/ 7) * 20);
    }
    this.voiceWaveform.set(voicePoints);
    this.musicWaveform.set(musicPoints);
  }

  async handleNewProjectFile(event: Event) { const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return; this.startNewProject(file); (event.target as HTMLInputElement).value = ''; }
  
  async handleAddClipFile(event: Event) { const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return; this.isLoading.set(true); const newClip = await this.createClipFromFile(file); this.clips.update(currentClips => [...currentClips, newClip]); this.activeClipIndex.set(this.clips().length - 1); this.generateCaptions(newClip.file, newClip.id); if(this.addClipInput()?.nativeElement) this.addClipInput()!.nativeElement.value = ''; }

  async startNewProject(file: File) { if (!file.type.startsWith('video/')) { alert('Please select a valid video file.'); return; } this.isLoading.set(true); this.resetEditorState(); const newClip = await this.createClipFromFile(file); this.clips.set([newClip]); const projectId = `proj_${Date.now()}`; this.activeProjectId.set(projectId); this.view.set('editor'); this.generateCaptions(file, newClip.id); }

  loadProject(project: Project) { this.projectToLoad.set(project); this.fileInputForLoad()?.nativeElement.click(); }

  async handleLoadProjectFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    const project = this.projectToLoad();
    if (!file || !project) return;
    if (file.name !== project.clips[0].name) { if (!confirm(`Warning: The selected file name "${file.name}" does not match the project's first clip "${project.clips[0].name}". You may need to locate multiple files if this is a multi-clip project.\n\nContinue?`)) { this.projectToLoad.set(null); (event.target as HTMLInputElement).value = ''; return; } }
    this.isLoading.set(true); this.resetEditorState();
    const loadedClips: Clip[] = [];
    for(const clipData of project.clips) { const loadedClip = await this.createClipFromFile(file); loadedClips.push({ ...loadedClip, id: clipData.id, name: clipData.name, type: clipData.type, originalDuration: clipData.originalDuration, trimStart: clipData.trimStart, trimEnd: clipData.trimEnd }); }
    this.clips.set(loadedClips); this.captions.set(project.captions); this.applySettings(project.settings); this.activeProjectId.set(project.id); this.activeClipIndex.set(0); this.view.set('editor'); this.isLoading.set(false); this.projectToLoad.set(null); (event.target as HTMLInputElement).value = '';
  }

  saveActiveProject() { const projectId = this.activeProjectId(); if (!projectId || this.clips().length === 0) return; const project: Project = { id: projectId, name: this.clips()[0].name, clips: this.clips().map(c => ({ id: c.id, name: c.name, type: c.type, originalDuration: c.originalDuration, trimStart: c.trimStart, trimEnd: c.trimEnd })), captions: this.captions(), settings: this.getCurrentSettings(), lastModified: Date.now() }; this.storageService.saveProject(project); this.projects.set(this.storageService.getProjects()); }
  
  goHome() { this.saveActiveProject(); this.resetEditorState(); this.view.set('hero'); }

  private async createClipFromFile(file: File): Promise<Clip> { const objectUrl = URL.createObjectURL(file); const duration = await this.getVideoDuration(objectUrl); return { id: `clip_${Date.now()}`, file, objectUrl, originalDuration: duration, trimStart: 0, trimEnd: 0, name: file.name, type: file.type }; }
  
  private getVideoDuration(url: string): Promise<number> { return new Promise((resolve) => { const video = document.createElement('video'); video.preload = 'metadata'; video.src = url; video.onloadedmetadata = () => { video.currentTime = Number.MAX_SAFE_INTEGER; video.ontimeupdate = () => { video.ontimeupdate = null; resolve(video.currentTime); video.currentTime = 0; }; }; }); }

  onTimeUpdate(event: Event) {
    const video = event.target as HTMLVideoElement; if(!video) return;
    const clipLayout = this.clipLayouts()[this.activeClipIndex()]; if (!clipLayout) return;
    const currentTimeInClip = video.currentTime;
    const totalTime = clipLayout.timelineStart + currentTimeInClip;
    this.playheadPosition.set((totalTime / this.totalTimelineDuration()) * 100);
    const activeCaption = this.captionsForActiveClip().find(c => currentTimeInClip >= c.startTime && currentTimeInClip <= c.endTime) || null;
    this.currentCaption.set(activeCaption);
    if (activeCaption && this.karaokeEnabled() && activeCaption.words) { const activeWord = activeCaption.words.findIndex(w => currentTimeInClip >= w.startTime && currentTimeInClip <= w.endTime); this.activeWordIndex.set(activeWord !== -1 ? activeWord : null); } else { this.activeWordIndex.set(null); }
  }

  async generateCaptions(file: File, clipId: string) { this.isLoading.set(true); this.error.set(null); try { const newCaptions = await this.geminiService.generateCaptions(file, clipId); this.captions.update(caps => [...caps, ...newCaptions]); } catch (e: any) { this.error.set(e.message || 'An unknown error occurred.'); } finally { this.isLoading.set(false); } }

  selectCaption(captionId: string) { this.selectedCaptionId.set(captionId); const video = this.videoPlayer()?.nativeElement; if (video) { const caption = this.captions().find(c => c.id === captionId); if(caption) { video.currentTime = caption.startTime; video.pause(); } } }

  updateCaption(captionId: string, value: string) { this.captions.update(caps => caps.map(c => c.id === captionId ? { ...c, text: value } : c)); }
  
  splitCaption() {
    const video = this.videoPlayer()?.nativeElement; if (!video) return; const currentTime = video.currentTime; const activeClipId = this.activeClip()?.id; if(!activeClipId) return; const captionIndex = this.captions().findIndex(c => c.clipId === activeClipId && currentTime > c.startTime && currentTime < c.endTime); if (captionIndex === -1) return;
    this.captions.update(caps => {
        const originalCaption = caps[captionIndex]; const splitPoint = currentTime; let wordIndexToSplit = originalCaption.words.findIndex(w => splitPoint >= w.startTime && splitPoint <= w.endTime); if (wordIndexToSplit === -1) wordIndexToSplit = originalCaption.words.length; const firstHalfWords = originalCaption.words.slice(0, wordIndexToSplit); const secondHalfWords = originalCaption.words.slice(wordIndexToSplit); if (firstHalfWords.length === 0 || secondHalfWords.length === 0) return caps;
        const newCaption1: Caption = { ...originalCaption, id: `caption_${Date.now()}_a`, text: firstHalfWords.map(w => w.text).join(' '), endTime: splitPoint, words: firstHalfWords };
        const newCaption2: Caption = { ...originalCaption, id: `caption_${Date.now()}_b`, text: secondHalfWords.map(w => w.text).join(' '), startTime: splitPoint, words: secondHalfWords };
        const newCaptions = [...caps]; newCaptions.splice(captionIndex, 1, newCaption1, newCaption2); return newCaptions;
    });
  }

  addCaption() { const clip = this.activeClip(); if(!clip) return; this.captions.update(caps => { const lastCap = this.captionsForActiveClip().sort((a,b) => a.endTime - b.endTime).pop(); const newStartTime = lastCap ? lastCap.endTime + 0.1 : (this.videoPlayer()?.nativeElement.currentTime || 0); const newCaption: Caption = { id: `caption_${Date.now()}`, clipId: clip.id, text: 'New Caption', startTime: parseFloat(newStartTime.toFixed(2)), endTime: parseFloat((newStartTime + 2).toFixed(2)), words: [] }; return [...caps, newCaption]; }); }
  deleteCaption(captionId: string) { this.captions.update(caps => caps.filter(c => c.id !== captionId)); }

  togglePlayerPanel() { this.isPlayerPanelCollapsed.update(v => !v); }
  toggleEditorPanel() { this.isEditorPanelCollapsed.update(v => !v); }
  
  resetEditorState() { this.activeProjectId.set(null); this.clips.set([]); this.captions.set([]); this.currentCaption.set(null); this.error.set(null); this.selectedCaptionId.set(null); this.videoInfo.set(null); this.activeClipIndex.set(0); this.resetStyles(); const video = this.videoPlayer()?.nativeElement; if(video) { video.src = ''; video.ontimeupdate = null; } }
  
  getCurrentSettings(): ProjectSettings { return { fontFamily: this.selectedFont(), fontSize: this.fontSize(), textColor: this.textColor(), fontWeight: this.fontWeight(), fontStyle: this.fontStyle(), textDecoration: this.textDecoration(), textTransform: this.textTransform(), letterSpacing: this.letterSpacing(), lineHeight: this.lineHeight(), textAlign: this.textAlign(), captionMaxWidth: this.captionMaxWidth(), textShadowEnabled: this.textShadowEnabled(), textBackgroundEnabled: this.textBackgroundEnabled(), textBackgroundColor: this.textBackgroundColor(), textStrokeEnabled: this.textStrokeEnabled(), textStrokeColor: this.textStrokeColor(), textStrokeWidth: this.textStrokeWidth(), captionAnimation: this.captionAnimation(), karaokeEnabled: this.karaokeEnabled(), karaokeColor: this.karaokeColor(), canvasAspectRatio: this.canvasAspectRatio(), audioEnhancementEnabled: this.audioEnhancementEnabled(), noiseReductionIntensity: this.noiseReductionIntensity(), eqTreble: this.eqTreble(), eqMids: this.eqMids(), eqBass: this.eqBass(), voiceClarity: this.voiceClarity(), volumeBoost: this.volumeBoost(), scale: this.scale(), positionX: this.positionX(), positionY: this.positionY(), vocalIsolation: this.vocalIsolation(), voiceVolume: this.voiceVolume(), musicVolume: this.musicVolume() }; }
  
  applySettings(settings: ProjectSettings) { for (const [key, value] of Object.entries(settings)) { if (this.hasOwnProperty(key) && typeof (this as any)[key] === 'function' && (this as any)[key].set) { if(value !== undefined) (this as any)[key].set(value); } } }

  applyPreset(preset: StylePreset) { this.applySettings(preset.styles as ProjectSettings); }
  
  resetStyles() { const defaultSettings: ProjectSettings = { fontFamily: this.fonts()[0].family, fontSize: 36, textColor: '#FFFFFF', fontWeight: 700, fontStyle: 'normal', textDecoration: 'none', textTransform: 'none', letterSpacing: 0, lineHeight: 1.2, textAlign: 'center', captionMaxWidth: 70, textShadowEnabled: true, textBackgroundEnabled: false, textBackgroundColor: 'rgba(0, 0, 0, 0.5)', textStrokeEnabled: false, textStrokeColor: '#000000', textStrokeWidth: 2, captionAnimation: 'fade', karaokeEnabled: true, karaokeColor: '#2563eb', canvasAspectRatio: '16:9', audioEnhancementEnabled: false, noiseReductionIntensity: 0, eqTreble: 0, eqMids: 0, eqBass: 0, voiceClarity: 0, volumeBoost: 0, scale: 1, positionX: 0, positionY: 0, vocalIsolation: false, voiceVolume: 100, musicVolume: 100 }; this.applySettings(defaultSettings); }

  toggleAudioEnhancement() { this.audioEnhancementEnabled.update(v => !v); if (this.audioEnhancementEnabled()) { this.noiseReductionIntensity.set(60); this.voiceClarity.set(10); this.eqMids.set(2); this.eqTreble.set(1); } else { this.noiseReductionIntensity.set(0); this.voiceClarity.set(0); this.eqTreble.set(0); this.eqMids.set(0); this.eqBass.set(0); this.volumeBoost.set(0); } }
  
  toggleVocalIsolation() { this.vocalIsolation.update(v => !v); if (this.vocalIsolation()) { this.preIsolationMusicVolume = this.musicVolume(); this.musicVolume.set(0); } else { this.musicVolume.set(this.preIsolationMusicVolume); } }
  toggleMuteVoice() { if (this.voiceVolume() > 0) { this.preMuteVoiceVolume = this.voiceVolume(); this.voiceVolume.set(0); } else { this.voiceVolume.set(this.preMuteVoiceVolume); } }
  toggleMuteMusic() { if (this.musicVolume() > 0) { this.preMuteMusicVolume = this.musicVolume(); this.musicVolume.set(0); } else { this.musicVolume.set(this.preMuteMusicVolume); } }
  
  splitClipAtPlayhead() {
    const video = this.videoPlayer()?.nativeElement; const clip = this.activeClip(); const index = this.activeClipIndex(); if(!video || !clip) return;
    const currentTimeInClip = video.currentTime;
    const splitPointInOriginal = clip.trimStart + currentTimeInClip;
    if (currentTimeInClip <= 0.1 || currentTimeInClip >= clip.originalDuration - clip.trimStart - clip.trimEnd - 0.1) return; // Cannot split at the very beginning or end
    
    const clip1: Clip = { ...clip, trimEnd: clip.originalDuration - splitPointInOriginal };
    const clip2: Clip = { ...clip, id: `clip_${Date.now()}`, trimStart: splitPointInOriginal };
    
    this.captions.update(caps => caps.map(c => { if(c.clipId === clip.id && c.startTime >= currentTimeInClip) { return { ...c, clipId: clip2.id, startTime: c.startTime - currentTimeInClip, endTime: c.endTime - currentTimeInClip }; } return c; }));
    this.clips.update(clips => { clips.splice(index, 1, clip1, clip2); return [...clips]; });
  }

  trimClipStartAtPlayhead() { const video = this.videoPlayer()?.nativeElement; if(!video) return; this.clips.update(clips => { const currentClip = clips[this.activeClipIndex()]; if(!currentClip) return clips; const newTrimStart = currentClip.trimStart + video.currentTime; if(newTrimStart < currentClip.originalDuration - currentClip.trimEnd) { this.captions.update(caps => caps.map(c => c.clipId === currentClip.id ? {...c, startTime: c.startTime - video.currentTime, endTime: c.endTime - video.currentTime} : c).filter(c => c.endTime > 0)); currentClip.trimStart = newTrimStart; video.currentTime = 0; } return [...clips]; }); }
  trimClipEndAtPlayhead() { const video = this.videoPlayer()?.nativeElement; if(!video) return; this.clips.update(clips => { const currentClip = clips[this.activeClipIndex()]; if(!currentClip) return clips; const newTrimEnd = currentClip.originalDuration - (currentClip.trimStart + video.currentTime); if(newTrimEnd >= 0) { this.captions.update(caps => caps.filter(c => c.clipId !== currentClip.id || c.endTime <= video.currentTime)); currentClip.trimEnd = newTrimEnd; video.currentTime = 0; } return [...clips]; }); }
  
  deleteClip(index: number) {
    const clipToDelete = this.clips()[index];
    if (!clipToDelete || this.clips().length <= 1) return;
    this.clips.update(clips => clips.filter((_, i) => i !== index));
    this.captions.update(captions => captions.filter(c => c.clipId !== clipToDelete.id));
    if (this.activeClipIndex() >= index) {
      this.activeClipIndex.update(i => Math.max(0, i - 1));
    }
  }

  startExport() { this.isExporting.set(true); this.exportProgress.set(0); this.exportTimeElapsed.set(0); const totalTime = 5000; const interval = 50; let elapsed = 0; this.exportInterval = setInterval(() => { elapsed += interval; this.exportTimeElapsed.set(elapsed / 1000); this.exportProgress.set(Math.min(100, (elapsed / totalTime) * 100)); if (elapsed >= totalTime) { clearInterval(this.exportInterval); setTimeout(() => { this.isExporting.set(false); this.isExportModalVisible.set(false); }, 1000); } }, interval); }

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
  openExportModal = () => this.isExportModalVisible.set(true);
}
