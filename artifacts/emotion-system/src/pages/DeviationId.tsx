import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, Play, RotateCcw, Square, Video } from 'lucide-react';
import { useAppLanguage } from '../i18n';
import { DeviationIdForm } from './deviationId/DeviationIdForm';
import { deviationText as tx } from './deviationId/copy';
import {
  deleteAllProjects,
  deleteProject,
  exportProjectFile,
  getProject,
  importProjectFile,
  getNextLocalSubjectId,
  listProjects,
  saveProject,
  type StoredProject,
  type StoredProjectSummary,
} from './deviationId/projectStore';
import { renderPersonFrame } from './deviationId/renderPersonFrame';
import { renderPostcardPng } from './deviationId/imageExport';
import {
  createDefaultDraft,
  createProjectKey,
  MAX_PHOTO_BYTES,
  type DeviationDraft,
} from './deviationId/types';
import type { DeviationWorkflowStep } from './deviationId/DeviationIdForm';
import './DeviationId.css';

const MP4_TYPES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'];

function getSupportedMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  if (typeof MediaRecorder.isTypeSupported !== 'function') return null;
  return MP4_TYPES.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? null;
}

function makeThumbnail(draft: DeviationDraft, image: HTMLImageElement | null) {
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 640;
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error('This browser could not create a project thumbnail.'));
  renderPersonFrame(context, canvas.width, canvas.height, draft, image, draft.animation.durationSeconds * .94);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob
      ? resolve(blob)
      : reject(new Error('This browser could not save a project thumbnail.')), 'image/webp', .82);
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function safeFilePart(value: string) {
  return value.trim().replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'SUBJECT';
}

function localError(error: unknown, language: 'en' | 'zh') {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return tx(language, 'LOCAL STORAGE IS FULL. Export a project backup or remove an archive item.');
  }
  if (error instanceof Error) {
    if (error.message.toLowerCase().includes('indexeddb is not available')) return tx(language, 'INDEXEDDB UNAVAILABLE IN THIS BROWSER.');
  return tx(language, error.message);
  }
  return 'The local operation failed. Please try again.';
}

function newAudioContext() {
  const audioWindow = window as Window & { webkitAudioContext?: typeof AudioContext };
  const Constructor = window.AudioContext ?? audioWindow.webkitAudioContext;
  return Constructor ? new Constructor() : null;
}

function scheduleTechCues(context: AudioContext, destination: MediaStreamAudioDestinationNode, startAt: number, duration: number) {
  const notes = [392, 523.25, 659.25, 783.99, 987.77];
  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const cueAt = startAt + (duration / 5) * index + .03;
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(frequency, cueAt);
    envelope.gain.setValueAtTime(.0001, cueAt);
    envelope.gain.exponentialRampToValueAtTime(.09, cueAt + .025);
    envelope.gain.exponentialRampToValueAtTime(.0001, cueAt + .22);
    oscillator.connect(envelope);
    envelope.connect(destination);
    oscillator.start(cueAt);
    oscillator.stop(cueAt + .24);
  });
}

export default function DeviationId() {
  const { language } = useAppLanguage();
  const t = useCallback((value: string) => tx(language, value), [language]);
  const [draft, setDraft] = useState<DeviationDraft>(() => createDefaultDraft());
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoImage, setPhotoImage] = useState<HTMLImageElement | null>(null);
  const [photoName, setPhotoName] = useState('');
  const [personSegmentationStatus, setPersonSegmentationStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [generated, setGenerated] = useState(false);
  const [step, setStep] = useState<DeviationWorkflowStep>(1);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [exportProgress, setExportProgress] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imageFilename, setImageFilename] = useState('');
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoFilename, setVideoFilename] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [projects, setProjects] = useState<StoredProjectSummary[]>([]);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<number>(() => Date.now());
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [mp4Available] = useState(() => Boolean(getSupportedMime()));
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const editorRef = useRef<HTMLElement | null>(null);
  const draftRef = useRef(draft);
  const imageRef = useRef(photoImage);
  const videoBlobRef = useRef(videoBlob);
  const languageRef = useRef(language);
  const playingRef = useRef(false);
  const playbackStartRef = useRef(0);
  const previewTimeRef = useRef(0);
  const currentProjectIdRef = useRef<string | null>(currentProjectId);
  const createdAtRef = useRef(createdAt);
  const photoUrlRef = useRef<string | null>(null);
  const personMattingRef = useRef<{ disposePersonSegmenter: () => void } | null>(null);
  const segmentationRequestRef = useRef(0);
  const animationFrameRef = useRef(0);
  const exportFrameRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const exportStreamRef = useRef<MediaStream | null>(null);
  const exportingRef = useRef(false);
  const lastCanvasRenderAtRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mountedRef = useRef(false);
  const lastPreviewUpdateRef = useRef(0);

  draftRef.current = draft;
  imageRef.current = photoImage;
  videoBlobRef.current = videoBlob;
  languageRef.current = language;
  currentProjectIdRef.current = currentProjectId;
  createdAtRef.current = createdAt;

  const outputFormat = 'mp4' as const;

  useEffect(() => {
    if (step !== 1) return undefined;
    document.body.classList.add('deviation-id-invitation-active');
    return () => document.body.classList.remove('deviation-id-invitation-active');
  }, [step]);

  const updateDraft = useCallback((patch: Partial<DeviationDraft>) => {
    const patchKeys = Object.keys(patch);
    const visibilityOnly = patchKeys.length > 0 && patchKeys.every((key) => key === 'datasetVisibility');
    setDraft((current) => {
      const next = { ...current, ...patch };
      draftRef.current = next;
      return next;
    });
    if (visibilityOnly) return;
    setGenerated(false);
    setImageBlob(null);
    setImageFilename('');
    setVideoBlob(null);
    setVideoFilename('');
    setPreviewProgress(0);
    previewTimeRef.current = 0;
    playingRef.current = false;
    videoRef.current?.pause();
    setPreviewPlaying(false);
    setError('');
  }, []);

  const refreshProjects = useCallback(async () => {
    const next = await listProjects();
    setProjects(next);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refreshProjects().catch((loadError: unknown) => {
      if (mountedRef.current) setError(localError(loadError, languageRef.current));
    });
    const draw = (now: number) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      const liveDraft = draftRef.current;
      let time = previewTimeRef.current;
      if (playingRef.current) {
        time = Math.max(0, (now - playbackStartRef.current) / 1000);
        if (time >= liveDraft.animation.durationSeconds) {
          time = liveDraft.animation.durationSeconds;
          playingRef.current = false;
          previewTimeRef.current = time;
          setPreviewPlaying(false);
          setPreviewProgress(1);
        } else if (now - lastPreviewUpdateRef.current > 120) {
          setPreviewProgress(time / liveDraft.animation.durationSeconds);
          lastPreviewUpdateRef.current = now;
        }
      } else {
        time = previewTimeRef.current;
      }
      if (
        canvas &&
        context &&
        !videoBlobRef.current &&
        !exportingRef.current &&
        now - lastCanvasRenderAtRef.current >= 1000 / 30
      ) {
         renderPersonFrame(context, canvas.width, canvas.height, liveDraft, imageRef.current, time);
        lastCanvasRenderAtRef.current = now;
      }
      animationFrameRef.current = window.requestAnimationFrame(draw);
    };
    animationFrameRef.current = window.requestAnimationFrame(draw);

    return () => {
      mountedRef.current = false;
      segmentationRequestRef.current += 1;
      exportingRef.current = false;
      personMattingRef.current?.disposePersonSegmenter();
      window.cancelAnimationFrame(animationFrameRef.current);
      window.cancelAnimationFrame(exportFrameRef.current);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        try { recorder.stop(); } catch { /* The browser may already be stopping the encoder. */ }
      }
      exportStreamRef.current?.getTracks().forEach((track) => track.stop());
      void audioContextRef.current?.close();
      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    };
  }, [refreshProjects]);

  useEffect(() => {
    const urls: Record<string, string> = {};
    for (const project of projects) {
      if (project.thumbnailBlob) urls[project.id] = URL.createObjectURL(project.thumbnailBlob);
    }
    setThumbnailUrls(urls);
    return () => Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
  }, [projects]);

  useEffect(() => {
    if (!videoBlob) {
      setVideoUrl(null);
      return;
    }
    const url = URL.createObjectURL(videoBlob);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [videoBlob]);

  const setPhoto = useCallback(async (blob: Blob | null, name: string): Promise<boolean> => {
    const requestId = ++segmentationRequestRef.current;
    if (photoUrlRef.current) {
      URL.revokeObjectURL(photoUrlRef.current);
      photoUrlRef.current = null;
    }
    setPhotoBlob(blob);
    setPhotoImage(null);
    imageRef.current = null;
    setPhotoName(name);
    if (!blob) {
      setPersonSegmentationStatus('idle');
      return true;
    }
    setPersonSegmentationStatus('loading');
    setStatus('');
    try {
      const matting = await import('./deviationId/personMatting');
      personMattingRef.current = matting;
      if (requestId !== segmentationRequestRef.current || !mountedRef.current) {
        matting.disposePersonSegmenter();
        return false;
      }
      const cutout = await matting.removePersonBackground(blob);
      if (requestId !== segmentationRequestRef.current || !mountedRef.current) return false;
      const url = URL.createObjectURL(cutout);
      let image: HTMLImageElement;
      try {
        image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const nextImage = new Image();
        nextImage.onload = () => resolve(nextImage);
        nextImage.onerror = () => reject(new Error('The transparent person image could not be created.'));
        nextImage.src = url;
        });
      } catch (decodeError) {
        URL.revokeObjectURL(url);
        throw decodeError;
      }
      if (requestId !== segmentationRequestRef.current || !mountedRef.current) {
        URL.revokeObjectURL(url);
        return false;
      }
      photoUrlRef.current = url;
      imageRef.current = image;
      setPhotoImage(image);
      setPersonSegmentationStatus('ready');
      return true;
    } catch (photoError) {
      if (requestId === segmentationRequestRef.current) {
        setPersonSegmentationStatus('error');
        setError(localError(photoError, languageRef.current));
      }
      return false;
    }
  }, []);

  const startPreview = useCallback(async (draftToUse = draftRef.current, resetExports = true) => {
    videoRef.current?.pause();
    if (!draftToUse.subjectId) {
      const nextDraft = { ...draftToUse, subjectId: await getNextLocalSubjectId() };
      draftRef.current = nextDraft;
      setDraft(nextDraft);
      draftToUse = nextDraft;
    }
    setGenerated(true);
    if (resetExports) {
      setImageBlob(null);
      setImageFilename('');
      setVideoBlob(null);
      setVideoFilename('');
    }
    previewTimeRef.current = 0;
    playbackStartRef.current = performance.now();
    playingRef.current = true;
    setPreviewProgress(0);
    setPreviewPlaying(true);
    setError('');
    setStatus('');
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!photoImage || personSegmentationStatus !== 'ready') {
      setError(t('RUN PERSON SEGMENTATION BEFORE GENERATING.'));
      return;
    }
    try {
      await startPreview();
    } catch (generationError) {
      setError(localError(generationError, language));
    }
  }, [language, personSegmentationStatus, photoImage, startPreview, t]);

  const handleContinueLocal = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      if (!draftRef.current.subjectId) {
        const nextDraft = { ...draftRef.current, subjectId: await getNextLocalSubjectId() };
        draftRef.current = nextDraft;
        setDraft(nextDraft);
      }
      setStep(4);
    } catch (sequenceError) {
      setError(localError(sequenceError, language));
    } finally {
      setBusy(false);
    }
  }, [language]);

  const handlePhotoChange = useCallback(async (file: File) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError(t('Please select an image file.'));
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError(t('Photos must be 24 MB or smaller for local project storage.'));
      return;
    }
    setBusy(true);
    try {
      const isolated = await setPhoto(file, file.name);
      if (!isolated) return;
      setGenerated(false);
      setImageBlob(null);
      setImageFilename('');
      videoRef.current?.pause();
      setVideoBlob(null);
      playingRef.current = false;
      setPreviewPlaying(false);
      setStatus(t('PERSON DETECTED · BACKGROUND REMOVED LOCALLY'));
      setError('');
    } finally {
      setBusy(false);
    }
  }, [language, setPhoto, t]);

  const handleSaveProject = useCallback(async () => {
    if (!draftRef.current.cardName.trim()) {
      setError(t('CARD NAME IS REQUIRED.'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const projectDraft = draftRef.current.subjectId
        ? draftRef.current
        : { ...draftRef.current, subjectId: await getNextLocalSubjectId() };
      const projectKey = currentProjectIdRef.current ?? createProjectKey();
      const projectCreatedAt = createdAtRef.current || Date.now();
      const thumbnailBlob = await makeThumbnail(projectDraft, imageRef.current);
      const project: StoredProject = {
        id: projectKey,
        draft: projectDraft,
        photoBlob,
        thumbnailBlob,
        createdAt: projectCreatedAt,
        updatedAt: Date.now(),
      };
      await saveProject(project);
      currentProjectIdRef.current = projectKey;
      createdAtRef.current = projectCreatedAt;
      setCurrentProjectId(projectKey);
      setCreatedAt(projectCreatedAt);
      setLastSavedAt(project.updatedAt);
      setDraft(projectDraft);
      draftRef.current = projectDraft;
      await refreshProjects();
      setStatus(t('PROJECT SAVED TO THIS DEVICE.'));
    } catch (saveError) {
      setError(localError(saveError, language));
    } finally {
      setBusy(false);
    }
  }, [language, photoBlob, refreshProjects, t]);

  const handleLoadProject = useCallback(async (id: string) => {
    setBusy(true);
    setError('');
    try {
      const project = await getProject(id);
      if (!project) throw new Error('This archive item is no longer available.');
      videoRef.current?.pause();
      setDraft(project.draft);
      draftRef.current = project.draft;
      setCurrentProjectId(project.id);
      currentProjectIdRef.current = project.id;
      setCreatedAt(project.createdAt);
      createdAtRef.current = project.createdAt;
      setLastSavedAt(project.updatedAt);
      setImageBlob(null);
      setImageFilename('');
      if (project.photoBlob) await setPhoto(project.photoBlob, 'LOCAL PHOTO');
      else await setPhoto(null, '');
      setGenerated(Boolean(project.draft.subjectId));
      setVideoBlob(null);
      setVideoFilename('');
      playingRef.current = false;
      setPreviewPlaying(false);
      previewTimeRef.current = Math.max(0, project.draft.animation.durationSeconds - .1);
      setPreviewProgress(1);
      setStatus(t('PROJECT LOADED. VIDEO EXPORT IS SEPARATE.'));
      await editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (loadError) {
      setError(localError(loadError, language));
    } finally {
      setBusy(false);
    }
  }, [language, setPhoto, t]);

  const handleDeleteProject = useCallback(async (id: string) => {
    if (!window.confirm(t('Delete this project from this device?'))) return;
    setBusy(true);
    try {
      await deleteProject(id);
      if (currentProjectIdRef.current === id) {
        currentProjectIdRef.current = null;
        setCurrentProjectId(null);
        setLastSavedAt(null);
      }
      await refreshProjects();
      setStatus(t('Project deleted from this device.'));
    } catch (deleteError) {
      setError(localError(deleteError, language));
    } finally {
      setBusy(false);
    }
  }, [language, refreshProjects, t]);

  const handleDeleteAll = useCallback(async () => {
    if (!window.confirm(t('Delete every saved project and image from this browser? This cannot be undone.'))) return;
    setBusy(true);
    try {
      await deleteAllProjects();
      currentProjectIdRef.current = null;
      setCurrentProjectId(null);
      setLastSavedAt(null);
      await refreshProjects();
      setStatus(t('All saved projects were deleted from this device.'));
    } catch (deleteError) {
      setError(localError(deleteError, language));
    } finally {
      setBusy(false);
    }
  }, [language, refreshProjects, t]);

  const handleNewProject = useCallback(() => {
    if (!window.confirm(t('Start a new project? Unsaved changes will be cleared.'))) return;
    const nextDraft = createDefaultDraft();
    const nextCreatedAt = Date.now();
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    setCurrentProjectId(null);
    currentProjectIdRef.current = null;
    setCreatedAt(nextCreatedAt);
    createdAtRef.current = nextCreatedAt;
    setLastSavedAt(null);
    void setPhoto(null, '');
    setGenerated(false);
    setImageBlob(null);
    setImageFilename('');
    setVideoBlob(null);
    setVideoFilename('');
    playingRef.current = false;
    setPreviewPlaying(false);
    previewTimeRef.current = 0;
    setPreviewProgress(0);
    videoRef.current?.pause();
    setError('');
    setStatus('');
  }, [setPhoto, t]);

  const handleExportProject = useCallback(async () => {
    if (!draftRef.current.cardName.trim()) {
      setError(t('CARD NAME IS REQUIRED.'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const projectDraft = draftRef.current.subjectId
        ? draftRef.current
        : { ...draftRef.current, subjectId: await getNextLocalSubjectId() };
      const thumbnailBlob = await makeThumbnail(projectDraft, imageRef.current);
      const file = await exportProjectFile(
        projectDraft,
        photoBlob,
        thumbnailBlob,
        createdAtRef.current || Date.now(),
      );
      downloadBlob(file, `DEVIATION_PROJECT_${safeFilePart(projectDraft.subjectId)}.json`);
      setDraft(projectDraft);
      draftRef.current = projectDraft;
      setStatus(t('PROJECT FILE EXPORTED.'));
    } catch (exportError) {
      setError(localError(exportError, language));
    } finally {
      setBusy(false);
    }
  }, [language, photoBlob, t]);

  const handleImportFile = useCallback(async (file: File) => {
    setBusy(true);
    setError('');
    try {
      const imported = await importProjectFile(file);
      const newKey = createProjectKey();
      const parsedDate = Date.parse(imported.createdAt);
      const importedCreatedAt = Number.isFinite(parsedDate) ? parsedDate : Date.now();
      if (imported.photoBlob) await setPhoto(imported.photoBlob, 'IMPORTED PHOTO');
      else await setPhoto(null, '');
      const saved: StoredProject = {
        id: newKey,
        draft: imported.draft,
        photoBlob: imported.photoBlob,
        thumbnailBlob: imported.thumbnailBlob ?? await makeThumbnail(imported.draft, null),
        createdAt: importedCreatedAt,
        updatedAt: Date.now(),
      };
      await saveProject(saved);
      setDraft(imported.draft);
      draftRef.current = imported.draft;
      setCurrentProjectId(newKey);
      currentProjectIdRef.current = newKey;
      setCreatedAt(importedCreatedAt);
      createdAtRef.current = importedCreatedAt;
      setLastSavedAt(saved.updatedAt);
      setImageBlob(null);
      setImageFilename('');
      setGenerated(Boolean(imported.draft.subjectId));
      setVideoBlob(null);
      setVideoFilename('');
      playingRef.current = false;
      setPreviewPlaying(false);
      videoRef.current?.pause();
      previewTimeRef.current = Math.max(0, imported.draft.animation.durationSeconds - .1);
      setPreviewProgress(1);
      await refreshProjects();
      setStatus(t('PROJECT IMPORTED TO THIS DEVICE.'));
      await editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (importError) {
      setError(localError(importError, language));
    } finally {
      setBusy(false);
    }
  }, [language, refreshProjects, setPhoto, t]);

  const handleSaveVideo = useCallback(async () => {
    if (!photoImage) {
      setError(t('A portrait image is required to export video.'));
      return;
    }
    if (!generated || !draftRef.current.subjectId) {
      setError(t('Generate the deviation ID before exporting the video.'));
      return;
    }
    if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
      setError(t('Video recording is unavailable in this browser.'));
      return;
    }
    const mimeType = getSupportedMime();
    if (mimeType === null) {
      setError(outputFormat === 'mp4' ? t('This browser does not support MP4 export.') : t('Video recording is unavailable in this browser.'));
      return;
    }
    setExporting(true);
    exportingRef.current = true;
    setExportProgress(0);
    setError('');
    setStatus(t('EXPORTING VIDEO…'));
    videoRef.current?.pause();
    setVideoBlob(null);
    setVideoFilename('');

    const exportCanvas = document.createElement('canvas');
    const resolution = draftRef.current.output.resolution;
    exportCanvas.width = resolution === '1080p' ? 1080 : 720;
    exportCanvas.height = resolution === '1080p' ? 1920 : 1280;
    const context = exportCanvas.getContext('2d');
    if (!context) {
      setExporting(false);
      exportingRef.current = false;
      setError(t('This browser could not prepare the video canvas.'));
      return;
    }

    const exportDraft = draftRef.current;
    const duration = exportDraft.animation.durationSeconds;
    let recorder: MediaRecorder | null = null;
    let audioContext: AudioContext | null = null;
    let audioDestination: MediaStreamAudioDestinationNode | null = null;
    let videoStream: MediaStream | null = null;
    try {
      renderPersonFrame(context, exportCanvas.width, exportCanvas.height, exportDraft, imageRef.current, 0);
      videoStream = exportCanvas.captureStream(30);
      const exportTracks = [...videoStream.getVideoTracks()];
      if (exportDraft.audio.includeTechCues) {
        audioContext = newAudioContext();
        if (!audioContext) throw new Error(t('Audio cues are unavailable in this browser. Turn off tech cues to export without sound.'));
        await audioContext.resume();
        audioDestination = audioContext.createMediaStreamDestination();
        scheduleTechCues(audioContext, audioDestination, audioContext.currentTime + .1, duration);
        exportTracks.push(...audioDestination.stream.getAudioTracks());
      }
      const mixedStream = new MediaStream(exportTracks);
      const recorderOptions: MediaRecorderOptions = mimeType ? { mimeType } : {};
      recorderOptions.videoBitsPerSecond = resolution === '1080p' ? 12_000_000 : 6_000_000;
      recorder = new MediaRecorder(mixedStream, recorderOptions);
      recorderRef.current = recorder;
      exportStreamRef.current = mixedStream;
      audioContextRef.current = audioContext;
      const chunks: BlobPart[] = [];
      let recorderFailure: Error | null = null;
      let finishRecording: (blob: Blob) => void = () => {};
      let failRecording: (reason: Error) => void = () => {};
      const recordingDone = new Promise<Blob>((resolve, reject) => {
        finishRecording = resolve;
        failRecording = reject;
      });
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        recorderFailure = new Error(t('The browser encoder stopped unexpectedly. Try a shorter export or another format.'));
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder?.mimeType || mimeType || 'video/mp4' });
        if (recorderFailure) failRecording(recorderFailure);
        else if (blob.size > 1024) finishRecording(blob);
        else failRecording(new Error(t('The encoder produced an empty video. Please try again.')));
      };
      recorder.start(250);
      const startTime = performance.now();
      let lastProgressBucket = -1;
      await new Promise<void>((resolve) => {
        const drawExportFrame = (now: number) => {
          const elapsed = Math.min(duration, Math.max(0, (now - startTime) / 1000));
          renderPersonFrame(context, exportCanvas.width, exportCanvas.height, exportDraft, imageRef.current, elapsed);
          const progressBucket = Math.floor((elapsed / duration) * 20);
          if (progressBucket !== lastProgressBucket && mountedRef.current) {
            lastProgressBucket = progressBucket;
            setExportProgress(elapsed / duration);
          }
          if (elapsed >= duration) {
            renderPersonFrame(context, exportCanvas.width, exportCanvas.height, exportDraft, imageRef.current, duration);
            window.setTimeout(resolve, 250);
            return;
          }
          exportFrameRef.current = window.requestAnimationFrame(drawExportFrame);
        };
        exportFrameRef.current = window.requestAnimationFrame(drawExportFrame);
      });
      if (recorder.state !== 'inactive') recorder.stop();
      const blob = await recordingDone;
      const filename = `DEVIATION_ID_${safeFilePart(exportDraft.subjectId)}.mp4`;
      if (mountedRef.current) {
        setVideoBlob(blob);
        setVideoFilename(filename);
        setExportProgress(1);
        setStatus(t('VIDEO READY · DOWNLOAD AVAILABLE.'));
        downloadBlob(blob, filename);
      }
    } catch (exportError) {
      if (recorder && recorder.state !== 'inactive') {
        try { recorder.stop(); } catch { /* The recorder may already have stopped. */ }
      }
      if (mountedRef.current) setError(localError(exportError, language));
    } finally {
      window.cancelAnimationFrame(exportFrameRef.current);
      videoStream?.getTracks().forEach((track) => track.stop());
      exportStreamRef.current?.getTracks().forEach((track) => track.stop());
      exportStreamRef.current = null;
      if (audioDestination) audioDestination.stream.getTracks().forEach((track) => track.stop());
      if (audioContext) void audioContext.close();
      recorderRef.current = null;
      audioContextRef.current = null;
      if (mountedRef.current) setExporting(false);
      exportingRef.current = false;
    }
  }, [generated, language, outputFormat, photoImage, t]);

  const handleSaveImage = useCallback(async () => {
    const image = imageRef.current;
    if (!image) {
      setError(t('A portrait image is required to export a PNG image.'));
      return;
    }
    if (!generated || !draftRef.current.subjectId) {
      setError(t('Generate the deviation ID before exporting the image.'));
      return;
    }

    setBusy(true);
    setError('');
    setStatus(t('EXPORTING IMAGE…'));
    try {
      const exportDraft = draftRef.current;
      const blob = await renderPostcardPng(exportDraft, image);
      const filename = `DEVIATION_ID_${safeFilePart(exportDraft.subjectId)}.png`;
      setImageBlob(blob);
      setImageFilename(filename);
      downloadBlob(blob, filename);
      setStatus(t('IMAGE READY · DOWNLOAD AVAILABLE.'));
    } catch (imageError) {
      setError(localError(imageError, language));
    } finally {
      setBusy(false);
    }
  }, [generated, language, t]);

  const handleDownloadImage = useCallback(() => {
    if (!imageBlob || !imageFilename) return;
    downloadBlob(imageBlob, imageFilename);
  }, [imageBlob, imageFilename]);

  const handleDownloadVideo = useCallback(() => {
    if (!videoBlob || !videoFilename) return;
    downloadBlob(videoBlob, videoFilename);
  }, [videoBlob, videoFilename]);

  const handleEditProfile = useCallback(() => {
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    editorRef.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
  }, []);

  const handlePreviewPlayback = useCallback(() => {
    if (videoBlob && videoRef.current) {
      if (videoRef.current.paused) {
        void videoRef.current.play().catch(() => setError(t('Video playback could not start in this browser.')));
      } else {
        videoRef.current.pause();
      }
      return;
    }
    if (previewPlaying) {
      playingRef.current = false;
      previewTimeRef.current = Math.min(draft.animation.durationSeconds, (performance.now() - playbackStartRef.current) / 1000);
      setPreviewPlaying(false);
    } else if (generated) {
      void startPreview(draftRef.current, false).catch((playbackError: unknown) => setError(localError(playbackError, language)));
    } else {
      handleGenerate();
    }
  }, [draft.animation.durationSeconds, generated, handleGenerate, language, previewPlaying, startPreview, t, videoBlob]);

  const handleRegenerate = useCallback(() => {
    videoRef.current?.pause();
    setVideoBlob(null);
    void startPreview().catch((regenerationError: unknown) => setError(localError(regenerationError, language)));
  }, [language, startPreview]);

  const handleContinueProfile = useCallback(() => {
    if (!draftRef.current.cardName.trim()) {
      setError(t('CARD NAME IS REQUIRED.'));
      return false;
    }
    if (!imageRef.current || personSegmentationStatus !== 'ready') {
      setError(t('RUN PERSON SEGMENTATION BEFORE GENERATING.'));
      return false;
    }
    setError('');
    return true;
  }, [personSegmentationStatus, t]);

  const handleContinueDownload = useCallback(() => {
    if (!generated) {
      setError(t('RUN PERSON SEGMENTATION BEFORE GENERATING.'));
      return;
    }
    setError('');
    setStep(5);
  }, [generated, t]);

  const previewStage = Math.min(5, Math.floor(previewProgress * 5) + 1);
  const canExportVideo = mp4Available;
  return (
    <main className={`deviation-id-page${step === 1 ? ' deviation-id-page--invitation' : ''}`}>
      <header className="deviation-page-heading">
        <div>
          <div className="deviation-kicker">EMOTION / SYSTEM · LOCAL IDENTITY RECORD</div>
          <h1>{t('DEVIATION ID')}<span> /</span> <small>偏差名片</small></h1>
          <p>{t('GENERATE A LOCAL SUBJECT RECORD')}</p>
        </div>
        <div className="deviation-status-badge"><i />{t('Saved image and profile stay on this device.')}</div>
      </header>

      <div className="deviation-builder-grid">
        <DeviationIdForm
          draft={draft}
          language={language}
          photoName={photoName}
          photoReady={Boolean(photoImage)}
          personSegmentationStatus={personSegmentationStatus}
          step={step}
          mp4Supported={mp4Available}
          outputFormat={outputFormat}
          busy={busy || exporting}
          generated={generated}
          imageReady={Boolean(imageBlob)}
          imageFilename={imageFilename}
          videoReady={Boolean(videoBlob)}
          videoFilename={videoFilename}
          exportProgress={exportProgress}
          invitationFileId={draft.subjectId}
          errorMessage={error}
          identityArrivalComplete
          editorRef={editorRef}
          onDraftChange={updateDraft}
          onStepChange={setStep}
          onInvitationOpened={() => setStep(2)}
          onContinueProfile={handleContinueProfile}
          onProfileCertified={() => setStep(3)}
          onContinueDatasetChoice={() => { void handleContinueLocal(); }}
          onContinueDownload={handleContinueDownload}
          onPhotoChange={(file) => { void handlePhotoChange(file); }}
          onGenerate={() => { void handleGenerate(); }}
          onSaveImage={() => { void handleSaveImage(); }}
          onDownloadImage={handleDownloadImage}
          onSaveVideo={() => { void handleSaveVideo(); }}
          onDownloadVideo={handleDownloadVideo}
        />

        <section className="deviation-panel deviation-preview-panel" aria-label={t('CURRENT PREVIEW')}>
          <div className="deviation-panel-heading">
            <div><span className="deviation-kicker">02 / {t('CURRENT PREVIEW')}</span><h2>{t('PREVIEW VIDEO')}</h2></div>
            <span className="deviation-panel-index">{previewStage.toString().padStart(2, '0')} / 05</span>
          </div>
          <div className="deviation-canvas-wrap">
            {videoBlob && videoUrl
              ? <video
                  ref={videoRef}
                  className="deviation-exported-video"
                  src={videoUrl}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label={t('PREVIEW VIDEO')}
                  onPlay={() => setPreviewPlaying(true)}
                  onPause={() => setPreviewPlaying(false)}
                  onEnded={() => { setPreviewPlaying(false); setPreviewProgress(1); }}
                  onTimeUpdate={(event) => {
                    const element = event.currentTarget;
                    if (element.duration) setPreviewProgress(element.currentTime / element.duration);
                  }}
                />
              : <canvas ref={canvasRef} className="deviation-card-canvas" width="720" height="1280" aria-label={t('Current card animation preview')} />}
            <div className="deviation-canvas-live"><i />{previewPlaying ? 'PLAYBACK / 30 FPS' : 'LOCAL RENDER / READY'}</div>
          </div>
          <div className="deviation-preview-progress" aria-label={t('EXPORT PROGRESS')}>
            <span style={{ width: `${Math.min(100, Math.max(0, (exporting ? exportProgress : previewProgress) * 100))}%` }} />
          </div>
          <div className="deviation-stage-readout">
            <span>{t('STAGE')} 0{previewStage} / 05</span>
            <span>{Math.round((exporting ? exportProgress : previewProgress) * 100)}%</span>
          </div>

          <div className="deviation-preview-actions">
            <button type="button" className="deviation-button deviation-button--primary" onClick={() => {
              handlePreviewPlayback();
            }} disabled={busy || exporting}>
              {previewPlaying ? <Square size={13} /> : <Play size={13} />}
              {t(previewPlaying ? 'PAUSE PREVIEW' : 'PREVIEW VIDEO')}
            </button>
            <button type="button" className="deviation-button" onClick={handleRegenerate} disabled={busy || exporting || !generated}><RotateCcw size={13} />{t('REGENERATE')}</button>
            <button type="button" className="deviation-button" onClick={handleEditProfile}><ArrowUpRight size={13} />{t('EDIT PROFILE')}</button>
          </div>

          <div className="deviation-video-export">
            <div className="deviation-video-export-heading"><Video size={14} /><span>{t('SAVE VIDEO')}</span><small>{draft.output.resolution.toUpperCase()} · 9:16 · {outputFormat.toUpperCase()}</small></div>
            <button type="button" className="deviation-button deviation-button--primary deviation-export-button" onClick={() => { void handleSaveVideo(); }} disabled={exporting || busy || !generated || !canExportVideo}>
              <Video size={14} />{t(exporting ? 'EXPORTING VIDEO…' : 'SAVE VIDEO')}
            </button>
            {videoBlob && (
              <button type="button" className="deviation-button deviation-download-button" onClick={handleDownloadVideo}>
                <ArrowDownToLine size={13} />{t('DOWNLOAD VIDEO')}
              </button>
            )}
            {exporting && <div className="deviation-export-progress"><span style={{ width: `${Math.round(exportProgress * 100)}%` }} /><small>{Math.round(exportProgress * 100)}%</small></div>}
          </div>

          {lastSavedAt !== null && <div className="deviation-saved-time">{t('SAVED AT')} · {new Intl.DateTimeFormat(language === 'zh' ? 'zh-TW' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(lastSavedAt))}</div>}
          {status && <p className="deviation-status-message" role="status">{status}</p>}
          {error && <p className="deviation-error-message" role="alert">{error}</p>}
          <p className="deviation-privacy-note">{t('PROJECT STATE ONLY · VIDEO EXPORT IS SEPARATE')}<br />{t('Projects are stored in this browser, not uploaded. Browser data can be cleared; export a project backup to move it or keep it long term.')}<br />{t('NO FACE ANALYSIS DATA IS STORED IN PROJECTS.')}</p>
        </section>
      </div>

      <footer className="deviation-footer">
        <span>LOCAL FIRST / INDEXEDDB</span>
        <span>PROJECT FILE V3 · NO ACCOUNT · NO SYNC</span>
        <span>DEVIATION RECORD</span>
      </footer>
    </main>
  );
}
