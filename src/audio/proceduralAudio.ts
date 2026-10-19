// Procedural ambient audio generator using Web Audio API
// Synthesizes gentle meadow wind breeze and peaceful anime chime harmonics.

class MeadowAudioSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private noiseNode: AudioBufferSourceNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private lfoNode: OscillatorNode | null = null;
  private chimeTimer: number | null = null;
  private isMutedState = false;

  private pentatonicFrequencies = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5]; // C5, D5, E5, G5, A5, C6

  private init() {
    if (this.ctx) return;
    const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxClass) return;

    this.ctx = new AudioCtxClass();

    // Master gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.isMutedState ? 0 : 0.65, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    // Wind noise generation
    const bufferSize = this.ctx.sampleRate * 4;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    // Pink-noise algorithm for warm natural breeze
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
      b6 = white * 0.115926;
    }

    this.noiseNode = this.ctx.createBufferSource();
    this.noiseNode.buffer = noiseBuffer;
    this.noiseNode.loop = true;

    // Bandpass filter for wind howl & rustle
    this.filterNode = this.ctx.createBiquadFilter();
    this.filterNode.type = 'bandpass';
    this.filterNode.frequency.setValueAtTime(420, this.ctx.currentTime);
    this.filterNode.Q.setValueAtTime(1.8, this.ctx.currentTime);

    // LFO to oscillate wind frequency gently
    this.lfoNode = this.ctx.createOscillator();
    this.lfoNode.type = 'sine';
    this.lfoNode.frequency.setValueAtTime(0.18, this.ctx.currentTime); // slow wind gust cycle

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(180, this.ctx.currentTime);
    this.lfoNode.connect(lfoGain);
    lfoGain.connect(this.filterNode.frequency);

    this.windGain = this.ctx.createGain();
    this.windGain.gain.setValueAtTime(0.35, this.ctx.currentTime);

    this.noiseNode.connect(this.filterNode);
    this.filterNode.connect(this.windGain);
    this.windGain.connect(this.masterGain);

    this.noiseNode.start();
    this.lfoNode.start();

    // Start periodic gentle chime harmonics
    this.scheduleNextChime();
  }

  private playGentleChime() {
    if (!this.ctx || this.isMutedState) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const chimeGain = this.ctx.createGain();

      const freq = this.pentatonicFrequencies[Math.floor(Math.random() * this.pentatonicFrequencies.length)];
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      chimeGain.gain.setValueAtTime(0.0001, now);
      chimeGain.gain.exponentialRampToValueAtTime(0.08, now + 0.1);
      chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 3.8);

      osc.connect(chimeGain);
      if (this.masterGain) {
        chimeGain.connect(this.masterGain);
      }

      osc.start(now);
      osc.stop(now + 4.0);
    } catch {
      // Audio node cleanup safeguard
    }
  }

  private scheduleNextChime() {
    if (this.chimeTimer) {
      window.clearTimeout(this.chimeTimer);
    }
    const delay = 4000 + Math.random() * 5500;
    this.chimeTimer = window.setTimeout(() => {
      this.playGentleChime();
      this.scheduleNextChime();
    }, delay);
  }

  public start() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    } else if (!this.ctx) {
      this.init();
    }
  }

  public toggleMute(): boolean {
    if (!this.ctx) {
      this.init();
      this.isMutedState = false;
      return false; // unmuted
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    this.isMutedState = !this.isMutedState;

    if (this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(this.isMutedState ? 0 : 0.65, now, 0.08);
    }

    return this.isMutedState;
  }

  public playFootstep(surface: 'grass' | 'dirt' | 'stone' | 'wood' | 'water' = 'grass', isSprinting = false) {
    if (!this.ctx || this.isMutedState) return;

    try {
      const now = this.ctx.currentTime;
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.055);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      if (surface === 'wood') {
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(320, now);
        filter.Q.value = 2.2;
        gain.gain.setValueAtTime(isSprinting ? 0.06 : 0.042, now);
      } else if (surface === 'stone') {
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(780, now);
        filter.Q.value = 3.0;
        gain.gain.setValueAtTime(isSprinting ? 0.05 : 0.035, now);
      } else if (surface === 'water') {
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(950, now);
        filter.frequency.exponentialRampToValueAtTime(350, now + 0.055);
        gain.gain.setValueAtTime(isSprinting ? 0.07 : 0.048, now);
      } else if (surface === 'dirt') {
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(isSprinting ? 480 : 360, now);
        gain.gain.setValueAtTime(isSprinting ? 0.05 : 0.032, now);
      } else {
        // grass
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(isSprinting ? 520 : 380, now);
        gain.gain.setValueAtTime(isSprinting ? 0.045 : 0.03, now);
      }

      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

      noise.connect(filter);
      filter.connect(gain);
      if (this.masterGain) {
        gain.connect(this.masterGain);
      }

      noise.start(now);
    } catch {
      // Audio safeguard
    }
  }

  public playWaterSplashSound(isDrowning = false) {
    if (!this.ctx || this.isMutedState) return;
    try {
      const now = this.ctx.currentTime;
      const duration = isDrowning ? 0.55 : 0.28;
      const bufferSize = Math.floor(this.ctx.sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.45));
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(isDrowning ? 420 : 850, now);
      filter.frequency.exponentialRampToValueAtTime(isDrowning ? 180 : 260, now + duration);
      filter.Q.value = 2.0;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(isDrowning ? 0.12 : 0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      noise.connect(filter);
      filter.connect(gain);
      if (this.masterGain) gain.connect(this.masterGain);
      noise.start(now);

      // Bubble pop tone
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isDrowning ? 280 : 420, now);
      osc.frequency.exponentialRampToValueAtTime(isDrowning ? 110 : 200, now + 0.18);
      oscGain.gain.setValueAtTime(0.06, now);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      osc.connect(oscGain);
      if (this.masterGain) oscGain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.19);
    } catch {
      // Audio safeguard
    }
  }

  public playRespawnSound() {
    if (!this.ctx || this.isMutedState) return;
    try {
      const now = this.ctx.currentTime;
      const chord = [392.0, 523.25, 659.25, 783.99]; // G4, C5, E5, G5
      chord.forEach((freq, idx) => {
        if (!this.ctx) return;
        const noteTime = now + idx * 0.09;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, noteTime);
        gain.gain.setValueAtTime(0.0001, noteTime);
        gain.gain.linearRampToValueAtTime(0.06, noteTime + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteTime + 1.8);
        osc.connect(gain);
        if (this.masterGain) gain.connect(this.masterGain);
        osc.start(noteTime);
        osc.stop(noteTime + 1.85);
      });
    } catch {
      // Audio safeguard
    }
  }

  public playJumpSound() {
    if (!this.ctx || this.isMutedState) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(460, now + 0.18);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      osc.connect(gain);
      if (this.masterGain) gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.23);
    } catch {
      // Safeguard
    }
  }

  public playSlashSound() {
    if (!this.ctx || this.isMutedState) return;
    try {
      const now = this.ctx.currentTime;
      
      // 1. Aerodynamic blade whoosh
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.18);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 3.2;
      filter.frequency.setValueAtTime(1800, now);
      filter.frequency.exponentialRampToValueAtTime(320, now + 0.18);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

      noise.connect(filter);
      filter.connect(gain);
      if (this.masterGain) gain.connect(this.masterGain);
      noise.start(now);

      // 2. High-tensile steel blade glint / ring
      const steelOsc = this.ctx.createOscillator();
      const steelGain = this.ctx.createGain();
      steelOsc.type = 'sine';
      steelOsc.frequency.setValueAtTime(2600, now);
      steelOsc.frequency.exponentialRampToValueAtTime(1400, now + 0.22);
      steelGain.gain.setValueAtTime(0.045, now);
      steelGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
      steelOsc.connect(steelGain);
      if (this.masterGain) steelGain.connect(this.masterGain);
      steelOsc.start(now);
      steelOsc.stop(now + 0.25);

      // 3. Low-frequency punch impact
      const punchOsc = this.ctx.createOscillator();
      const punchGain = this.ctx.createGain();
      punchOsc.type = 'triangle';
      punchOsc.frequency.setValueAtTime(140, now);
      punchOsc.frequency.exponentialRampToValueAtTime(45, now + 0.12);
      punchGain.gain.setValueAtTime(0.09, now);
      punchGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      punchOsc.connect(punchGain);
      if (this.masterGain) punchGain.connect(this.masterGain);
      punchOsc.start(now);
      punchOsc.stop(now + 0.15);
    } catch {
      // Safeguard
    }
  }

  public playRollSound() {
    if (!this.ctx || this.isMutedState) return;
    try {
      const now = this.ctx.currentTime;
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.22);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.45));
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(420, now);
      filter.frequency.exponentialRampToValueAtTime(180, now + 0.22);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

      noise.connect(filter);
      filter.connect(gain);
      if (this.masterGain) gain.connect(this.masterGain);
      noise.start(now);
    } catch {
      // Safeguard
    }
  }

  public isMuted(): boolean {
    return this.isMutedState;
  }

  public dispose() {
    if (this.chimeTimer) {
      window.clearTimeout(this.chimeTimer);
      this.chimeTimer = null;
    }
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}

export const meadowAudio = new MeadowAudioSystem();
