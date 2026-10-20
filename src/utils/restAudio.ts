// One context is reused so navigating away and resuming does not lose audio activation.
export function createRestAudio() {
  let context: AudioContext | undefined;

  return {
    // Must be called directly from a click/tap before awaiting anything else.
    async unlock(): Promise<boolean> {
      try {
        const Audio = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Audio) return false;
        if (!context || context.state === 'closed') context = new Audio();
        if (context.state !== 'running') await context.resume();
        return context.state === 'running';
      } catch {
        return false;
      }
    },

    play(): boolean {
      if (!context || context.state !== 'running') return false;
      try {
        const start = context.currentTime;
        [880, 1108, 1320].forEach((frequency, index) => {
          const oscillator = context!.createOscillator();
          const gain = context!.createGain();
          const at = start + index * 0.22;
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(frequency, at);
          gain.gain.setValueAtTime(0, at);
          gain.gain.linearRampToValueAtTime(0.2, at + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.001, at + 0.18);
          oscillator.connect(gain);
          gain.connect(context!.destination);
          oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
          oscillator.start(at);
          oscillator.stop(at + 0.2);
        });
        return true;
      } catch {
        return false;
      }
    },
  };
}

export const restAudio = createRestAudio();
