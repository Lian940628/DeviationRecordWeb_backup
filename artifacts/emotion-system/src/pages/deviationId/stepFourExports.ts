export function isVideoDownloadAllowed(step: number, video: Blob | null, filename: string): video is Blob {
  return step === 4 && Boolean(video && filename);
}

export function enterStepFourExports(options: {
  setStep: (step: 4) => void;
  imageReady: boolean;
  videoReady: boolean;
  generateImage: () => void;
  generateVideo: () => void;
}) {
  options.setStep(4);
  if (!options.imageReady) options.generateImage();
  if (!options.videoReady) options.generateVideo();
}
