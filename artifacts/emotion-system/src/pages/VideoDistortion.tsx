import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { AlertCircle, Check, Expand, FileVideo2, Pause, Play, RotateCcw, Shrink, Trash2, Upload } from 'lucide-react';
import { useAppLanguage } from '../i18n';
import './VideoDistortion.css';

type VideoSource = {
  file: File;
  url: string;
};

const COPY = {
  'VIDEO / DISTORTION': '影像 / 偏移',
  'A frame, held slightly out of place.': '讓一格畫面，稍微偏離原位。',
  'Prepare a local fragment before it enters the system. Nothing is uploaded or saved.':
    '在片段進入系統前，先於本機整理。檔案不會上傳或儲存。',
  '01 / SOURCE': '01 / 來源',
  'LOCAL VIDEO INPUT': '本機影像輸入',
  'Drop a video file here': '將影像檔拖放至此',
  'or choose from this device': '或從此裝置選擇',
  'CHOOSE VIDEO': '選擇影像',
  'VIDEO FILE': '影像檔案',
  'REPLACE': '更換',
  'REMOVE': '移除',
  'RESOLUTION': '解析度',
  'DURATION': '片長',
  'FILE SIZE': '檔案大小',
  '02 / FRAME WINDOW': '02 / 畫面區段',
  'TRIM INTERVAL': '裁切區間',
  'Start': '開始',
  'End': '結束',
  'SECONDS': '秒',
  'Drag the handles or enter precise start and end times. The selected interval is 1–30 seconds.':
    '拖曳控制點或輸入精確的起訖時間。選取區間為 1–30 秒。',
  'PLAY': '播放',
  'PAUSE': '暫停',
  'LOOP ON': '循環播放',
  'LOOP OFF': '停止循環',
  'ORIGINAL': '原始',
  'PROCESSED': '處理後',
  'NOT AVAILABLE IN THIS STAGE': '此階段尚未提供',
  '03 / OUTPUT STATE': '03 / 輸出狀態',
  'The source remains unchanged.': '來源影像保持不變。',
  'Processed mode is reserved for a later stage. No effects are applied here.':
    '處理後模式將於後續階段提供。本階段不套用任何效果。',
  'Choose a video to begin.': '選擇影像以開始。',
  'Ready · video remains on this device.': '就緒 · 影像只留在此裝置。',
  'This file is not a video. Choose a supported video file.': '此檔案不是影像檔，請選擇支援的影像格式。',
  'This video could not be decoded. Try another file.': '無法解碼此影像，請嘗試其他檔案。',
  'Unable to read video duration. Try another file.': '無法讀取影像長度，請嘗試其他檔案。',
  'The video is shorter than one second; its full duration is selected.':
    '影像短於一秒，已選取完整片長。',
  'No video selected': '尚未選擇影像',
  'Video preview': '影像預覽',
  'Timeline seek': '時間軸定位',
  'Trim start': '裁切開始時間',
  'Trim end': '裁切結束時間',
  'Loop playback': '循環播放',
  'Playback mode': '播放模式',
  'Toggle fullscreen preview': '切換全螢幕預覽',
  'Enter fullscreen': '進入全螢幕',
  'Exit fullscreen': '離開全螢幕',
  'FULLSCREEN': '全螢幕',
  'EXIT FULLSCREEN': '離開全螢幕',
  'Video upload': '選擇影像檔',
  'Local video editor': '本機影像整理工具',
  'Drop to load a local video': '拖放以載入本機影像',
  'Current playback time': '目前播放時間',
  'Source duration': '來源片長',
  'Loading video metadata…': '正在讀取影像資訊…',
  'Video loaded': '影像已載入',
  'Ready to inspect': '可開始檢視',
  'Local only · no upload': '僅限本機 · 不會上傳',
} as const;

function formatTime(value: number) {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = safe - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${seconds.toFixed(1).padStart(4, '0')}`;
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function VideoDistortion() {
  const { language } = useAppLanguage();
  const t = useCallback((text: keyof typeof COPY | string) => (
    language === 'zh' ? COPY[text as keyof typeof COPY] ?? text : text
  ), [language]);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const urlRef = useRef<string | null>(null);
  const dragDepth = useRef(0);
  const [source, setSource] = useState<VideoSource | null>(null);
  const [duration, setDuration] = useState(0);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [currentTime, setCurrentTime] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [looping, setLooping] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState<'original' | 'processed'>('original');
  const [cssFullscreen, setCssFullscreen] = useState(false);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const isFullscreen = cssFullscreen || nativeFullscreen;

  const releaseSource = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  }, []);

  useEffect(() => () => {
    releaseSource();
  }, [releaseSource]);

  useEffect(() => {
    const syncFullscreen = () => {
      const frame = document.querySelector('.vd-source-frame');
      const prefixedDocument = document as Document & { webkitFullscreenElement?: Element | null };
      setNativeFullscreen(Boolean(
        frame && (document.fullscreenElement === frame || prefixedDocument.webkitFullscreenElement === frame),
      ));
    };
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
    syncFullscreen();
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('webkitfullscreenchange', syncFullscreen);
    };
  }, []);

  useEffect(() => {
    if (!cssFullscreen) return undefined;
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
    };
  }, [cssFullscreen]);

  const resetVideoElement = () => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
  };

  const loadFile = (file?: File) => {
    if (!file) return;
    const recognizedVideoType = file.type.startsWith('video/');
    const recognizedVideoExtension = /\.(mp4|m4v|mov|webm|ogv)$/i.test(file.name);
    if (!recognizedVideoType && !recognizedVideoExtension) {
      setError(t('This file is not a video. Choose a supported video file.'));
      setStatus('');
      return;
    }
    resetVideoElement();
    releaseSource();
    const url = URL.createObjectURL(file);
    urlRef.current = url;
    setSource({ file, url });
    setDuration(0);
    setDimensions({ width: 0, height: 0 });
    setCurrentTime(0);
    setTrimStart(0);
    setTrimEnd(0);
    setPlaying(false);
    setError('');
    setStatus(t('Loading video metadata…'));
    setMode('original');
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    loadFile(event.target.files?.[0]);
    event.target.value = '';
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    loadFile(event.dataTransfer.files?.[0]);
  };

  const removeFile = () => {
    resetVideoElement();
    releaseSource();
    setSource(null);
    setDuration(0);
    setDimensions({ width: 0, height: 0 });
    setCurrentTime(0);
    setTrimStart(0);
    setTrimEnd(0);
    setPlaying(false);
    setError('');
    setStatus(t('Choose a video to begin.'));
    setMode('original');
  };

  const onMetadata = () => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) {
      setError(t('Unable to read video duration. Try another file.'));
      setStatus('');
      return;
    }
    const length = video.duration;
    const initialEnd = Math.min(30, length);
    setDuration(length);
    setDimensions({ width: video.videoWidth, height: video.videoHeight });
    setTrimStart(0);
    setTrimEnd(initialEnd);
    setCurrentTime(0);
    setError('');
    setStatus(length < 1 ? t('The video is shorter than one second; its full duration is selected.') : t('Ready · video remains on this device.'));
  };

  const onVideoError = () => {
    if (!source) return;
    setError(t('This video could not be decoded. Try another file.'));
    setStatus('');
    setPlaying(false);
  };

  const seek = (time: number) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const next = Math.max(0, Math.min(duration, time));
    video.currentTime = next;
    setCurrentTime(next);
  };

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video || !duration) return;
    if (video.paused) {
      if (video.currentTime < trimStart || video.currentTime >= trimEnd) seek(trimStart);
      void video.play().then(() => setPlaying(true)).catch(() => {
        setPlaying(false);
        setError(t('This video could not be decoded. Try another file.'));
      });
    } else {
      video.pause();
      setPlaying(false);
    }
  };

  const toggleFullscreen = async () => {
    const frame = document.querySelector<HTMLElement>('.vd-source-frame');
    if (!frame) return;
    if (cssFullscreen) {
      setCssFullscreen(false);
      return;
    }
    if (nativeFullscreen) {
      const prefixedDocument = document as Document & { webkitExitFullscreen?: () => Promise<void> | void };
      if (document.exitFullscreen) await document.exitFullscreen().catch(() => setCssFullscreen(false));
      else if (prefixedDocument.webkitExitFullscreen) prefixedDocument.webkitExitFullscreen();
      else setCssFullscreen(false);
      return;
    }
    try {
      if (frame.requestFullscreen) {
        await frame.requestFullscreen({ navigationUI: 'hide' });
        return;
      }
      const prefixedFrame = frame as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
      if (prefixedFrame.webkitRequestFullscreen) {
        await prefixedFrame.webkitRequestFullscreen();
        return;
      }
      setCssFullscreen(true);
    } catch {
      setCssFullscreen(true);
    }
  };

  const clampStart = (value: number) => {
    const minLength = Math.min(1, duration);
    const next = Math.max(0, Math.min(value, trimEnd - minLength, Math.max(0, duration - minLength)));
    setTrimStart(next);
    if (currentTime < next || currentTime > trimEnd) seek(next);
  };

  const clampEnd = (value: number) => {
    const minLength = Math.min(1, duration);
    const next = Math.max(trimStart + minLength, Math.min(value, Math.min(duration, trimStart + 30)));
    setTrimEnd(next);
    if (currentTime > next) seek(trimStart);
  };

  const onTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.currentTime >= trimEnd) {
      if (looping) {
        video.currentTime = trimStart;
        setCurrentTime(trimStart);
        if (!video.paused) void video.play();
      } else {
        video.pause();
        video.currentTime = trimEnd;
        setCurrentTime(trimEnd);
        setPlaying(false);
      }
      return;
    }
    setCurrentTime(video.currentTime);
  };

  const safeDuration = Math.max(duration, 0.1);
  const left = duration ? (trimStart / duration) * 100 : 0;
  const width = duration ? ((trimEnd - trimStart) / duration) * 100 : 0;
  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <main className="vd-page" aria-label={t('Local video editor')} data-testid="page-video-distortion">
      <div className="vd-wrap">
        <header className="vd-heading">
          <div>
            <div className="vd-eyebrow"><span className="vd-mark" />{t('VIDEO / DISTORTION')} <span className="vd-index">STAGE 01</span></div>
            <h1>{t('A frame, held slightly out of place.')}</h1>
            <p>{t('Prepare a local fragment before it enters the system. Nothing is uploaded or saved.')}</p>
          </div>
          <div className="vd-local-indicator"><span />{t('Local only · no upload')}</div>
        </header>

        <div className="vd-layout">
          <section className="vd-main-column" aria-label={t('Local video editor')}>
            <section className="vd-source-section">
              <div className="vd-section-heading">
                <span>{t('01 / SOURCE')}</span><span className="vd-section-rule" /><span className="vd-section-state">{source ? t('Video loaded') : 'INPUT / —'}</span>
              </div>
              <div
                className={`vd-source-frame${dragging ? ' is-dragging' : ''}${source ? ' has-source' : ''}${cssFullscreen ? ' is-fullscreen-fallback' : ''}`}
                onDragEnter={(event) => { event.preventDefault(); dragDepth.current += 1; setDragging(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragging(false); }}
                onDrop={onDrop}
                data-testid="dropzone-video"
              >
                <video
                  ref={videoRef}
                  className="vd-video"
                  src={source?.url}
                  playsInline
                  preload="metadata"
                  aria-label={t('Video preview')}
                  onLoadedMetadata={onMetadata}
                  onTimeUpdate={onTimeUpdate}
                  onEnded={() => { setPlaying(false); if (looping) seek(trimStart); }}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onError={onVideoError}
                  data-testid="video-local-preview"
                />
                {!source && (
                  <div className="vd-empty">
                    <div className="vd-empty-symbol"><FileVideo2 size={22} strokeWidth={1.2} /><i /></div>
                    <strong>{t('Drop a video file here')}</strong>
                    <span>{t('or choose from this device')}</span>
                    <button className="vd-button vd-button-primary" type="button" onClick={() => inputRef.current?.click()} data-testid="button-choose-video">
                      <Upload size={14} />{t('CHOOSE VIDEO')}
                    </button>
                    <small>VIDEO/* · MP4 · MOV · WEBM</small>
                  </div>
                )}
                {source && <div className="vd-preview-corner">{dimensions.width ? `${dimensions.width} × ${dimensions.height}` : t('Loading video metadata…')}</div>}
                <div className="vd-scanline" aria-hidden="true" />
                <button
                  type="button"
                  className="vd-fullscreen-button"
                  onClick={() => void toggleFullscreen()}
                  aria-label={t('Toggle fullscreen preview')}
                  data-testid="button-video-fullscreen"
                >
                  {isFullscreen ? <Shrink size={13} /> : <Expand size={13} />}
                  <span>{t(isFullscreen ? 'EXIT FULLSCREEN' : 'FULLSCREEN')}</span>
                </button>
              </div>
              <input ref={inputRef} type="file" accept="video/*" className="vd-file-input" onChange={onFileChange} aria-label={t('Video upload')} data-testid="input-video-file" />

              {source && (
                <div className="vd-file-readout">
                  <div className="vd-file-name"><FileVideo2 size={17} /><div><span>{t('VIDEO FILE')}</span><strong title={source.file.name} data-testid="text-video-name">{source.file.name}</strong></div></div>
                  <div className="vd-file-facts">
                    <div><span>{t('RESOLUTION')}</span><strong data-testid="text-video-resolution">{dimensions.width ? `${dimensions.width} × ${dimensions.height}` : '—'}</strong></div>
                    <div><span>{t('DURATION')}</span><strong data-testid="text-video-duration">{duration ? formatTime(duration) : '—'}</strong></div>
                    <div><span>{t('FILE SIZE')}</span><strong data-testid="text-video-size">{formatSize(source.file.size)}</strong></div>
                  </div>
                  <div className="vd-file-actions">
                    <button type="button" className="vd-icon-button" onClick={() => inputRef.current?.click()} data-testid="button-replace-video"><RotateCcw size={13} />{t('REPLACE')}</button>
                    <button type="button" className="vd-icon-button vd-remove" onClick={removeFile} data-testid="button-remove-video"><Trash2 size={13} />{t('REMOVE')}</button>
                  </div>
                </div>
              )}
            </section>

            <section className="vd-trim-section">
              <div className="vd-section-heading">
                <span>{t('02 / FRAME WINDOW')}</span><span className="vd-section-rule" /><span className="vd-section-state">{t('TRIM INTERVAL')}</span>
              </div>
              <div className={`vd-trim-panel${!source || !duration ? ' is-disabled' : ''}`}>
                <div className="vd-trim-controls">
                  <label className="vd-time-field"><span>{t('Start')}</span><div><input type="number" min="0" max={duration} step="0.1" value={trimStart.toFixed(1)} disabled={!duration} onChange={(event) => clampStart(Number(event.target.value) || 0)} aria-label={t('Trim start')} data-testid="input-trim-start" /><em>{t('SECONDS')}</em></div></label>
                  <span className="vd-range-separator">—</span>
                  <label className="vd-time-field"><span>{t('End')}</span><div><input type="number" min={trimStart + Math.min(1, duration)} max={Math.min(duration, trimStart + 30)} step="0.1" value={trimEnd.toFixed(1)} disabled={!duration} onChange={(event) => clampEnd(Number(event.target.value) || 0)} aria-label={t('Trim end')} data-testid="input-trim-end" /><em>{t('SECONDS')}</em></div></label>
                  <div className="vd-length-readout"><span>WINDOW</span><strong data-testid="text-trim-length">{duration ? `${(trimEnd - trimStart).toFixed(1)}s` : '—'}</strong></div>
                </div>

                <div className="vd-timeline" aria-label={t('Timeline seek')}>
                  <div className="vd-timeline-track">
                    <div className="vd-timeline-selection" style={{ left: `${left}%`, width: `${width}%` }} />
                    <div className="vd-timeline-progress" style={{ width: `${progress}%` }} />
                    <input className="vd-range vd-range-start" type="range" min="0" max={safeDuration} step="0.1" value={trimStart} disabled={!duration} onChange={(event) => clampStart(Number(event.target.value))} aria-label={t('Trim start')} data-testid="range-trim-start" />
                    <input className="vd-range vd-range-end" type="range" min="0" max={safeDuration} step="0.1" value={trimEnd} disabled={!duration} onChange={(event) => clampEnd(Number(event.target.value))} aria-label={t('Trim end')} data-testid="range-trim-end" />
                    <input className="vd-range vd-range-seek" type="range" min="0" max={safeDuration} step="0.1" value={currentTime} disabled={!duration} onChange={(event) => seek(Number(event.target.value))} aria-label={t('Timeline seek')} data-testid="range-video-seek" />
                  </div>
                  <div className="vd-timeline-labels"><span>00:00</span><span>{duration ? formatTime(duration) : '00:00'}</span></div>
                </div>
                <p className="vd-trim-hint">{t('Drag the handles or enter precise start and end times. The selected interval is 1–30 seconds.')}</p>

                <div className="vd-player-row">
                  <button type="button" className="vd-play-button" disabled={!duration} onClick={togglePlayback} aria-label={t(playing ? 'PAUSE' : 'PLAY')} data-testid="button-toggle-playback">
                    {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}<span>{t(playing ? 'PAUSE' : 'PLAY')}</span>
                  </button>
                  <div className="vd-timecode" aria-live="off"><strong data-testid="text-current-time">{formatTime(currentTime)}</strong><span> / </span><span data-testid="text-total-time">{duration ? formatTime(duration) : '00:00'}</span></div>
                  <button type="button" className={`vd-loop-button${looping ? ' active' : ''}`} disabled={!duration} aria-pressed={looping} aria-label={t('Loop playback')} onClick={() => setLooping((enabled) => !enabled)} data-testid="button-loop-playback"><RotateCcw size={13} />{t(looping ? 'LOOP ON' : 'LOOP OFF')}</button>
                </div>
              </div>
            </section>
          </section>

          <aside className="vd-side-column">
            <section className="vd-mode-panel">
              <div className="vd-section-heading"><span>{t('03 / OUTPUT STATE')}</span></div>
              <div className="vd-mode-label">{t('Playback mode')}</div>
              <div className="vd-mode-switch" role="group" aria-label={t('Playback mode')}>
                <button type="button" className={mode === 'original' ? 'selected' : ''} onClick={() => setMode('original')} aria-pressed={mode === 'original'} data-testid="button-mode-original"><Check size={12} />{t('ORIGINAL')}</button>
                <button type="button" className="unavailable" disabled aria-disabled="true" title={t('NOT AVAILABLE IN THIS STAGE')} data-testid="button-mode-processed">{t('PROCESSED')}<span>—</span></button>
              </div>
              <div className="vd-mode-caption"><span className="vd-status-dot" />{t('NOT AVAILABLE IN THIS STAGE')}</div>
              <div className="vd-divider" />
              <div className="vd-output-copy"><span className="vd-output-index">A / 01</span><strong>{t('The source remains unchanged.')}</strong><p>{t('Processed mode is reserved for a later stage. No effects are applied here.')}</p></div>
              <div className="vd-local-note"><div className="vd-lock-mark"><Check size={12} /></div><span>{t('Local only · no upload')}</span></div>
            </section>

            <div className={`vd-status-box${error ? ' has-error' : ''}`} role={error ? 'alert' : 'status'} aria-live="polite" data-testid="status-video-message">
              {error ? <AlertCircle size={15} /> : <span className="vd-status-pip" />}
              <span>{error || status || t('Choose a video to begin.')}</span>
            </div>
          </aside>
        </div>
        <footer className="vd-footer"><span>EMOTION / SYSTEM</span><span>LOCAL INPUT · NO RECORDING</span><span data-testid="status-stage">STAGE 01 / 03</span></footer>
      </div>
    </main>
  );
}
