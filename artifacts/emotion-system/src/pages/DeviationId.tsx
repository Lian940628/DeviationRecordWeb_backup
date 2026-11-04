import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Play, RotateCcw, Square } from 'lucide-react';
import { useAppLanguage } from '../i18n';
import { DeviationIdForm } from './deviationId/DeviationIdForm';
import { DevFirebaseUid } from './deviationId/DevFirebaseUid';
import { deviationText as tx } from './deviationId/copy';
import {
  getCloudinaryUploadReceipt,
  getNextLocalSubjectId,
  saveCloudinaryUploadReceipt,
} from './deviationId/projectStore';
import { renderPersonFrame } from './deviationId/renderPersonFrame';
import { renderPostcardPng } from './deviationId/imageExport';
import {
  createUploadId,
  uploadFinishedAsset,
  withUploadTimeout,
  type CloudinaryAssetType,
  type CloudinaryUploadResult,
} from './deviationId/cloudinaryUpload';
import { safeUploadMessage, subscribeUploadDiagnostics, uploadTrace, type UploadDiagnostic } from './deviationId/uploadDiagnostics';
import { enterStepFourExports, isVideoDownloadAllowed } from './deviationId/stepFourExports';
import {
  createDefaultDraft,
  MAX_PHOTO_BYTES,
  type DeviationDraft,
} from './deviationId/types';
import type { DeviationWorkflowStep } from './deviationId/DeviationIdForm';
import './DeviationId.css';

const MP4_TYPES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'];
const SHOW_DEV_FIREBASE_UID = import.meta.env.DEV;
type CloudUploadStatus = 'idle' | 'waiting' | 'uploading' | 'complete' | 'error';
type CachedCloudAsset = { submissionId: string; contentHash: string; asset: CloudinaryUploadResult };

function getSupportedMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  if (typeof MediaRecorder.isTypeSupported !== 'function') return null;
  return MP4_TYPES.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? null;
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

async function hashBlob(blob: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function localError(error: unknown, language: 'en' | 'zh') {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return tx(language, 'BROWSER STORAGE IS FULL.');
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
  const [cloudUploadStatus, setCloudUploadStatus] = useState<CloudUploadStatus>('idle');
  const [cloudUploadError, setCloudUploadError] = useState('');
  const [cloudUploadProgress, setCloudUploadProgress] = useState<Record<CloudinaryAssetType, number>>({
    image: 0,
    video: 0,
  });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mp4Available] = useState(() => Boolean(getSupportedMime()));
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [uploadEpoch, setUploadEpoch] = useState(0);
  const [cloudUploadWarning, setCloudUploadWarning] = useState('');
  const [uploadDiagnostics, setUploadDiagnostics] = useState<UploadDiagnostic[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const editorRef = useRef<HTMLElement | null>(null);
  const draftRef = useRef(draft);
  const stepRef = useRef<number>(step);
  const imageRef = useRef(photoImage);
  const videoBlobRef = useRef(videoBlob);
  const languageRef = useRef(language);
  const playingRef = useRef(false);
  const playbackStartRef = useRef(0);
  const previewTimeRef = useRef(0);
  const photoUrlRef = useRef<string | null>(null);
  const personMattingRef = useRef<{ disposePersonSegmenter: () => void } | null>(null);
  const segmentationRequestRef = useRef(0);
  const animationFrameRef = useRef(0);
  const exportFrameRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const exportStreamRef = useRef<MediaStream | null>(null);
  const exportingRef = useRef(false);
  const uploadControllerRef = useRef<AbortController | null>(null);
  const uploadRunningRef = useRef(false);
  const autoUploadAttemptRef = useRef<{ subjectId: string; imageBlob: Blob; videoBlob: Blob } | null>(null);
  const uploadedResultsRef = useRef<Partial<Record<CloudinaryAssetType, CachedCloudAsset>>>({});
  const uploadGateRef = useRef('');
  const completedFilesRef = useRef({ generated, imageBlob, videoBlob });
  const lastCanvasRenderAtRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mountedRef = useRef(false);
  const lastPreviewUpdateRef = useRef(0);

  draftRef.current = draft;
  stepRef.current = step;
  imageRef.current = photoImage;
  videoBlobRef.current = videoBlob;
  languageRef.current = language;
  completedFilesRef.current = { generated, imageBlob, videoBlob };

  const outputFormat = 'mp4' as const;

  const updateDraft = useCallback((patch: Partial<DeviationDraft>) => {
    const patchKeys = Object.keys(patch);
    const visibilityOnly = patchKeys.length > 0 && patchKeys.every((key) => key === 'datasetVisibility');
    if (!visibilityOnly || patch.datasetVisibility === 'PRIVATE') uploadControllerRef.current?.abort();
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

  useEffect(() => {
    mountedRef.current = true;
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
      uploadControllerRef.current?.abort();
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
  }, []);

  useEffect(() => subscribeUploadDiagnostics((event) => {
    setUploadDiagnostics((events) => [...events.slice(-19), event]);
  }), []);

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
      if (import.meta.env.DEV) console.error('[person-segmentation] Photo processing failed:', photoError);
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
      stepRef.current = 3;
      setStep(3);
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
      setError(t('Photos must be 24 MB or smaller.'));
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

  const handleSaveVideo = useCallback(async () => {
    if (!photoImage) {
      setError(t('A portrait image is required to export video.'));
      return;
    }
    if (!draftRef.current.subjectId) {
      setError(t('Generate the deviation ID before exporting the video.'));
      return;
    }
    if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
      setError(t('Video recording is unavailable in this browser.'));
      return;
    }
    const mimeType = getSupportedMime();
    if (mimeType === null) {
      setError(t('This browser does not support MP4 export.'));
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
      audioContext = newAudioContext();
      if (!audioContext) throw new Error(t('This browser cannot export the required tech cues.'));
      await audioContext.resume();
      audioDestination = audioContext.createMediaStreamDestination();
      scheduleTechCues(audioContext, audioDestination, audioContext.currentTime + .1, duration);
      exportTracks.push(...audioDestination.stream.getAudioTracks());
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
        recorderFailure = new Error(t('The browser encoder stopped unexpectedly. Try again or use a browser that supports MP4.'));
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
      const actualMime = blob.type || recorder.mimeType || 'video/mp4';
      if (!actualMime.includes('mp4')) throw new Error(t('The browser did not produce an MP4 file.'));
      const filename = `DEVIATION_ID_${safeFilePart(exportDraft.subjectId)}.mp4`;
      if (mountedRef.current) {
        setVideoBlob(blob);
        setVideoFilename(filename);
        setExportProgress(1);
        setStatus(t('VIDEO READY · DOWNLOAD AVAILABLE.'));
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
  }, [language, outputFormat, photoImage, t]);

  const handleSaveImage = useCallback(async () => {
    const image = imageRef.current;
    if (!image) {
      setError(t('A portrait image is required to export a PNG image.'));
      return;
    }
    if (!draftRef.current.subjectId) {
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
      setStatus(t('IMAGE READY · DOWNLOAD AVAILABLE.'));
    } catch (imageError) {
      setError(localError(imageError, language));
    } finally {
      setBusy(false);
    }
  }, [language, t]);

  const runCloudUpload = useCallback(async () => {
    const uploadDraft = draftRef.current;
    const image = imageBlob;
    const video = videoBlob;
    if (uploadDraft.datasetVisibility !== 'PUBLIC') return;
    if (!generated || !image || !video || !uploadDraft.subjectId) {
      setCloudUploadStatus('waiting');
      return;
    }
    if (uploadRunningRef.current) return;

    const subjectId = uploadDraft.subjectId;
    const controller = new AbortController();
    uploadControllerRef.current = controller;
    uploadRunningRef.current = true;
    // Mark only an acquired execution slot as attempted. A busy/aborting run must
    // not consume the automatic attempt for the newly completed files.
    autoUploadAttemptRef.current = { subjectId, imageBlob: image, videoBlob: video };
    setCloudUploadStatus('uploading');
    setCloudUploadError('');
    setCloudUploadWarning('');
    setCloudUploadProgress({ image: 0, video: 0 });
    uploadTrace('PUBLIC_START', { imageReady: true, videoReady: true });
    const assertCurrent = () => {
      if (controller.signal.aborted
        || draftRef.current.datasetVisibility !== 'PUBLIC'
        || draftRef.current.subjectId !== subjectId
        || !completedFilesRef.current.generated
        || completedFilesRef.current.imageBlob !== image
        || completedFilesRef.current.videoBlob !== video) {
        throw new DOMException('Upload cancelled.', 'AbortError');
      }
    };

    const files: Array<{
      assetType: CloudinaryAssetType;
      blob: Blob;
      filename: string;
    }> = [
      {
        assetType: 'image',
        blob: image,
        filename: imageFilename || `DEVIATION_ID_${safeFilePart(subjectId)}.png`,
      },
      {
        assetType: 'video',
        blob: video,
            filename: videoFilename || `DEVIATION_ID_${safeFilePart(subjectId)}.mp4`,
      },
    ];

    try {
      const submissionId = createUploadId(subjectId);
      for (const file of files) {
        assertCurrent();

        const contentHash = await hashBlob(file.blob);
        // Local receipt persistence is an optimization, never a network prerequisite.
        let savedReceipt: Awaited<ReturnType<typeof getCloudinaryUploadReceipt>> = null;
        try {
          savedReceipt = await withUploadTimeout(
            getCloudinaryUploadReceipt(submissionId, file.assetType), 2500,
            'Local upload receipt lookup timed out.',
          );
        } catch (receiptError) {
          uploadTrace('RECEIPT_READ_WARNING', { assetType: file.assetType, message: safeUploadMessage(receiptError) });
        }
        assertCurrent();
        const inMemoryResult = uploadedResultsRef.current[file.assetType];
        let asset = inMemoryResult?.submissionId === submissionId && inMemoryResult.contentHash === contentHash
          ? inMemoryResult.asset
          : savedReceipt?.contentHash === contentHash
            ? savedReceipt.asset
            : null;

        if (!asset) {
          uploadTrace(file.assetType === 'image' ? 'PNG_START' : 'VIDEO_START');
          asset = await uploadFinishedAsset(
            file.blob,
            file.filename,
            file.assetType,
            submissionId,
            controller.signal,
            (progress) => {
              if (!mountedRef.current) return;
              setCloudUploadProgress((current) => ({
                ...current,
                [file.assetType]: Math.min(1, Math.max(0, progress)),
              }));
            },
          );
          uploadedResultsRef.current[file.assetType] = { submissionId, contentHash, asset };
          uploadTrace(file.assetType === 'image' ? 'PNG_OK' : 'VIDEO_OK', { results: { [file.assetType]: asset } });
        } else {
          uploadedResultsRef.current[file.assetType] = { submissionId, contentHash, asset };
          uploadTrace('ASSET_ALREADY_UPLOADED', { assetType: file.assetType });
        }

        if (savedReceipt?.contentHash !== contentHash) {
          try {
            await withUploadTimeout(saveCloudinaryUploadReceipt({
            submissionId,
            assetType: file.assetType,
            asset,
            contentHash,
            filename: file.filename,
            mimeType: file.blob.type,
            bytes: file.blob.size,
            cardName: uploadDraft.cardName,
            subjectId,
            deviationLevel: uploadDraft.deviationLevel,
            }), 2500, 'Local upload receipt save timed out.');
          } catch (receiptError) {
            uploadTrace('RECEIPT_SAVE_WARNING', { assetType: file.assetType, message: safeUploadMessage(receiptError) });
            if (mountedRef.current) setCloudUploadWarning(t('Cloud upload can continue, but its local receipt could not be saved. Keep this page open for retries.'));
          }
        }
        if (mountedRef.current) {
          setCloudUploadProgress((current) => ({ ...current, [file.assetType]: 1 }));
        }
      }

      if (
        mountedRef.current
        && !controller.signal.aborted
        && draftRef.current.datasetVisibility === 'PUBLIC'
        && draftRef.current.subjectId === subjectId
      ) {
        setCloudUploadStatus('complete');
        uploadTrace('PUBLIC_COMPLETE', {
          results: { image: uploadedResultsRef.current.image?.asset, video: uploadedResultsRef.current.video?.asset },
        });
      }
    } catch (uploadError) {
      const cancelled = controller.signal.aborted
        || draftRef.current.datasetVisibility !== 'PUBLIC'
        || (uploadError instanceof DOMException && uploadError.name === 'AbortError');
      if (mountedRef.current) {
        if (cancelled) {
          setCloudUploadStatus('idle');
        } else {
          setCloudUploadStatus('error');
          setCloudUploadError(localError(new Error(safeUploadMessage(uploadError)), language));
          uploadTrace('PUBLIC_FAILED', { message: safeUploadMessage(uploadError) });
        }
      }
    } finally {
      uploadRunningRef.current = false;
      if (uploadControllerRef.current === controller) uploadControllerRef.current = null;
      // Wake the completion effect if newer files/consent arrived during an abort.
      if (mountedRef.current) setUploadEpoch((epoch) => epoch + 1);
    }
  }, [generated, imageBlob, imageFilename, language, t, videoBlob, videoFilename]);

  useEffect(() => {
    if (draft.datasetVisibility !== 'PUBLIC') {
      uploadControllerRef.current?.abort();
      autoUploadAttemptRef.current = null;
      if (cloudUploadStatus !== 'idle') setCloudUploadStatus('idle');
      if (cloudUploadError) setCloudUploadError('');
      setCloudUploadWarning('');
      setCloudUploadProgress({ image: 0, video: 0 });
      uploadGateRef.current = '';
      return;
    }

    const gateKey = `${draft.subjectId}:${generated}:${Boolean(imageBlob)}:${Boolean(videoBlob)}`;
    if (uploadGateRef.current !== gateKey) {
      uploadGateRef.current = gateKey;
      uploadTrace('PUBLIC_READINESS', {
        imageReady: Boolean(imageBlob), videoReady: Boolean(videoBlob),
        message: generated ? 'Waiting for both exported final files before signing.' : 'Postcard has not been generated.',
      });
    }
    if (!generated || !imageBlob || !videoBlob || !draft.subjectId) {
      uploadControllerRef.current?.abort();
      autoUploadAttemptRef.current = null;
      setCloudUploadStatus('waiting');
      if (cloudUploadError) setCloudUploadError('');
      setCloudUploadProgress({ image: 0, video: 0 });
      return;
    }

    const previousAttempt = autoUploadAttemptRef.current;
    if (
      previousAttempt?.subjectId === draft.subjectId
      && previousAttempt.imageBlob === imageBlob
      && previousAttempt.videoBlob === videoBlob
    ) return;

    if (uploadRunningRef.current) return;
    void runCloudUpload();
  }, [
    cloudUploadError,
    cloudUploadStatus,
    draft.datasetVisibility,
    draft.subjectId,
    generated,
    imageBlob,
    runCloudUpload,
    videoBlob,
    uploadEpoch,
  ]);

  const handleDownloadImage = useCallback(() => {
    if (!imageBlob || !imageFilename) return;
    downloadBlob(imageBlob, imageFilename);
  }, [imageBlob, imageFilename]);

  const handleDownloadVideo = useCallback(() => {
    if (!isVideoDownloadAllowed(stepRef.current, videoBlob, videoFilename)) return;
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

  const handleContinueProfile = useCallback(async () => {
    if (!draftRef.current.cardName.trim()) {
      setError(t('CARD NAME IS REQUIRED.'));
      return;
    }
    if (!imageRef.current || personSegmentationStatus !== 'ready') {
      setError(t('RUN PERSON SEGMENTATION BEFORE GENERATING.'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (!draftRef.current.subjectId) {
        const nextDraft = { ...draftRef.current, subjectId: await getNextLocalSubjectId() };
        draftRef.current = nextDraft;
        setDraft(nextDraft);
      }
      stepRef.current = 2;
      setStep(2);
    } catch (sequenceError) {
      setError(localError(sequenceError, language));
    } finally {
      setBusy(false);
    }
  }, [language, personSegmentationStatus, t]);

  const handleContinueDownload = useCallback(() => {
    if (!imageRef.current || !draftRef.current.subjectId) {
      setError(t('RUN PERSON SEGMENTATION BEFORE GENERATING.'));
      return;
    }
    setError('');
    setGenerated(true);
    playingRef.current = false;
    setPreviewPlaying(false);
    enterStepFourExports({
      setStep: (nextStep) => {
        stepRef.current = nextStep;
        setStep(nextStep);
      },
      imageReady: Boolean(imageBlob),
      videoReady: Boolean(videoBlob),
      generateImage: () => { void handleSaveImage(); },
      generateVideo: () => { void handleSaveVideo(); },
    });
  }, [handleSaveImage, handleSaveVideo, imageBlob, t, videoBlob]);

  const previewStage = Math.min(5, Math.floor(previewProgress * 5) + 1);
  return (
    <main className="deviation-id-page">
      <header className="deviation-page-heading">
        <div>
          <div className="deviation-kicker">EMOTION / SYSTEM · IDENTITY RECORD</div>
          <h1>{t('DEVIATION ID')}<span> /</span> <small>偏差名片</small></h1>
          <p>{t('BUILD YOUR DEVIATION ID')}</p>
        </div>
        <div className="deviation-status-badge"><i />{t('PERSON EXTRACTION RUNS LOCALLY.')}</div>
      </header>

      {SHOW_DEV_FIREBASE_UID && <DevFirebaseUid />}

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
          editorRef={editorRef}
          onDraftChange={updateDraft}
          onStepChange={(nextStep) => {
            stepRef.current = nextStep;
            setStep(nextStep);
          }}
          onContinueProfile={handleContinueProfile}
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
                  controls={step === 4}
                  controlsList={step === 4 ? undefined : 'nodownload'}
                  onContextMenu={(event) => { if (stepRef.current !== 4) event.preventDefault(); }}
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
            {step !== 4 && <button type="button" className="deviation-button" onClick={handleRegenerate} disabled={busy || exporting || !generated}><RotateCcw size={13} />{t('REGENERATE')}</button>}
            <button type="button" className="deviation-button" onClick={handleEditProfile}><ArrowUpRight size={13} />{t('EDIT PROFILE')}</button>
          </div>

          {draft.datasetVisibility === 'PUBLIC' && (
            <div className="deviation-cloud-upload" role="status" aria-live="polite">
              <div className="deviation-cloud-upload-heading">
                <span>{t('PUBLIC CLOUD UPLOAD')}</span>
                <small>
                  {cloudUploadStatus === 'uploading'
                    ? t('Uploading finished postcard files…')
                    : cloudUploadStatus === 'complete'
                      ? t('CLOUD UPLOAD SUCCESSFUL · NOT PUBLISHED.')
                      : cloudUploadStatus === 'error'
                        ? t('Upload incomplete. Your downloads are still available.')
                        : t('Waiting for completed PNG and video.')}
                </small>
              </div>
              <div className="deviation-cloud-upload-progress">
                <span>{t('IMAGE')}</span>
                <i><b style={{ width: `${Math.round(cloudUploadProgress.image * 100)}%` }} /></i>
                <span>{t('VIDEO')}</span>
                <i><b style={{ width: `${Math.round(cloudUploadProgress.video * 100)}%` }} /></i>
              </div>
              {cloudUploadError && <p className="deviation-error-message">{cloudUploadError}</p>}
              {cloudUploadWarning && <p className="deviation-status-message">{cloudUploadWarning}</p>}
              {cloudUploadStatus === 'waiting' && (
                <p className="deviation-status-message">
                  PNG: {imageBlob ? 'READY' : 'NOT EXPORTED'} · VIDEO: {videoBlob ? 'READY' : 'NOT EXPORTED'}
                </p>
              )}
              {cloudUploadStatus === 'error' && imageBlob && videoBlob && generated && (
                <button
                  type="button"
                  className="deviation-button deviation-cloud-upload-retry"
                  onClick={() => { void runCloudUpload(); }}
                >
                  <RotateCcw size={13} />{t('RETRY UPLOAD')}
                </button>
              )}
              {import.meta.env.DEV && (
                <details>
                  <summary>UPLOAD DEBUG · DEVELOPMENT ONLY</summary>
                  {uploadDiagnostics.map((event, index) => (
                    <p key={`${event.time}-${index}`} className="deviation-status-message">
                      {event.time.slice(11, 19)} · {event.stage}
                      {event.assetType ? ` · ${event.assetType}` : ''}
                      {event.httpStatus !== undefined ? ` · HTTP ${event.httpStatus}` : ''}
                      {event.message ? ` · ${event.message}` : ''}
                    </p>
                  ))}
                </details>
              )}
            </div>
          )}

          {status && <p className="deviation-status-message" role="status">{status}</p>}
          {error && <p className="deviation-error-message" role="alert">{error}</p>}
        </section>
      </div>

      <footer className="deviation-footer">
        <span>LOCAL IMAGE PROCESSING</span>
        <span>NO ACCOUNT · MP4 EXPORT</span>
        <span>DEVIATION RECORD</span>
      </footer>
    </main>
  );
}
