import { useEffect, useState } from "react";
import "./_group.css";
import {
  DEFAULT_VISUAL_SETTINGS,
  type VisualSettings,
  type VisualStage,
} from "./_source/visualization/visualSettings";
import { LanguageProvider, useAppLanguage } from "./_source/i18n";
import { VisualModeControls } from "./_source/visual-controls/_VisualModeControls";
import type { PlaybackMode } from "./_source/visual-controls/visualControlsTypes";

function CurrentPanel() {
  const { language, setLanguage } = useAppLanguage();
  const [settings, setSettings] = useState<VisualSettings>(() => structuredClone(DEFAULT_VISUAL_SETTINGS));
  const [stage, setStage] = useState<VisualStage>("anomaly");
  const [playback, setPlayback] = useState<PlaybackMode>("manual");

  useEffect(() => {
    setLanguage("zh");
  }, [setLanguage]);

  return (
    <main className="extract-shell" lang={language === "zh" ? "zh-Hant-HK" : "en"}>
      <header className="extract-heading">
        <strong>EMOTION / SYSTEM<br />偏差紀錄 · CONTROL ARCHIVE</strong>
        <span>EXTRACTED FROM CURRENT EXPERIENCE</span>
      </header>
      <div className="extract-controls">
        <VisualModeControls
          playbackMode={playback}
          onPlaybackModeChange={setPlayback}
          visualMode={stage}
          onVisualModeChange={setStage}
          settings={settings}
          savedPresets={[]}
          presetMessage=""
          presetError=""
          onGlobalSettingChange={(key, value) => setSettings((current) => ({
            ...current,
            global: { ...current.global, [key]: value },
          }))}
          onTransitionSettingChange={(key, value) => setSettings((current) => ({
            ...current,
            transitions: { ...current.transitions, [key]: value },
          }))}
          onStageSettingChange={(activeStage, key, value) => setSettings((current) => ({
            ...current,
            stages: {
              ...current.stages,
              [activeStage]: { ...current.stages[activeStage], [key]: value },
            },
          }))}
          onAudioSettingChange={(key, value) => setSettings((current) => {
            if (key === "muted" && typeof value === "boolean") {
              return { ...current, audio: { ...current.audio, muted: value } };
            }
            if (key === "masterVolume" && typeof value === "number") {
              return { ...current, audio: { ...current.audio, masterVolume: value } };
            }
            if (key in current.audio.enabledStages && typeof value === "boolean") {
              return {
                ...current,
                audio: {
                  ...current.audio,
                  enabledStages: {
                    ...current.audio.enabledStages,
                    [key]: value,
                  },
                },
              };
            }
            return current;
          })}
          onAudioUnlock={() => undefined}
          onResetImageSettings={() => setSettings((current) => ({
            ...current,
            global: structuredClone(DEFAULT_VISUAL_SETTINGS.global),
          }))}
          onResetStage={(activeStage) => setSettings((current) => ({
            ...current,
            stages: {
              ...current.stages,
              [activeStage]: structuredClone(DEFAULT_VISUAL_SETTINGS.stages[activeStage]),
            },
          }))}
          onSavePreset={() => undefined}
          onLoadPreset={() => undefined}
          onExportPreset={() => undefined}
          onImportPreset={() => undefined}
        />
      </div>
    </main>
  );
}

export function Current() {
  return (
    <LanguageProvider>
      <CurrentPanel />
    </LanguageProvider>
  );
}
