/** Plays a synthesized stamp impact, scheduled from the submit gesture. */
export function playCertificationImpact() {
  try {
    const AudioContextConstructor =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;

    const context = new AudioContextConstructor();
    void context.resume().then(() => {
      const impactAt = context.currentTime + 0.29;

      const thud = context.createOscillator();
      const thudGain = context.createGain();
      thud.type = 'sine';
      thud.frequency.setValueAtTime(112, impactAt);
      thud.frequency.exponentialRampToValueAtTime(42, impactAt + 0.2);
      thudGain.gain.setValueAtTime(0.42, impactAt);
      thudGain.gain.exponentialRampToValueAtTime(0.001, impactAt + 0.25);
      thud.connect(thudGain);
      thudGain.connect(context.destination);
      thud.start(impactAt);
      thud.stop(impactAt + 0.26);

      const click = context.createOscillator();
      const clickGain = context.createGain();
      click.type = 'triangle';
      click.frequency.setValueAtTime(760, impactAt);
      click.frequency.exponentialRampToValueAtTime(180, impactAt + 0.055);
      clickGain.gain.setValueAtTime(0.13, impactAt);
      clickGain.gain.exponentialRampToValueAtTime(0.001, impactAt + 0.065);
      click.connect(clickGain);
      clickGain.connect(context.destination);
      click.start(impactAt);
      click.stop(impactAt + 0.07);

      window.setTimeout(() => {
        void context.close().catch(() => undefined);
      }, 900);
    }).catch(() => {
      void context.close().catch(() => undefined);
    });
  } catch {
    // The certification transition must not depend on audio support or permission.
  }
}
