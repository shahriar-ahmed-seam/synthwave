/**
 * SynthWave — Audio Engine
 * 
 * Core Web Audio API synthesizer with:
 * - Dual oscillators with detune, octave, waveform control
 * - ADSR amplitude envelope with precise timing
 * - Filter with its own ADSR envelope
 * - Effects: Reverb (convolution), Delay, Chorus
 * - LFO with multiple destinations
 * - Polyphonic voice management (16 voices max)
 */

export class AudioEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.analyserNode = null;
        this.voices = new Map(); // noteId -> voice
        this.maxVoices = 16;

        // Synth parameters (defaults)
        this.params = {
            masterVolume: 0.7,

            // Oscillator 1
            osc1Enabled: true,
            osc1Waveform: 'sine',
            osc1Detune: 0,
            osc1Octave: 0,
            osc1Gain: 0.8,

            // Oscillator 2
            osc2Enabled: false,
            osc2Waveform: 'sine',
            osc2Detune: 0,
            osc2Octave: 0,
            osc2Gain: 0.5,

            // Amp ADSR
            attack: 0.01,
            decay: 0.2,
            sustain: 0.7,
            release: 0.3,

            // Filter
            filterEnabled: true,
            filterType: 'lowpass',
            filterCutoff: 8000,
            filterResonance: 1,
            filterEnvAmount: 0,
            filterAttack: 0.01,
            filterDecay: 0.3,
            filterSustain: 0.5,
            filterRelease: 0.3,

            // Reverb
            reverbEnabled: true,
            reverbMix: 0.2,
            reverbDecay: 2.5,

            // Delay
            delayEnabled: false,
            delayTime: 0.3,
            delayFeedback: 0.4,
            delayMix: 0.2,

            // Chorus
            chorusEnabled: false,
            chorusRate: 1.5,
            chorusDepth: 0.5,
            chorusMix: 0.3,

            // LFO
            lfoEnabled: false,
            lfoWaveform: 'sine',
            lfoRate: 5,
            lfoDepth: 0.5,
            lfoDestination: 'pitch',
        };

        // Effect nodes
        this.reverbNode = null;
        this.reverbGain = null;
        this.dryGain = null;

        this.delayNode = null;
        this.delayFeedbackNode = null;
        this.delayDryGain = null;
        this.delayWetGain = null;

        this.chorusDelayL = null;
        this.chorusDelayR = null;
        this.chorusLFO = null;
        this.chorusDryGain = null;
        this.chorusWetGain = null;

        // LFO
        this.globalLFO = null;
        this.globalLFOGain = null;

        this._reverbBuffer = null;
    }

    /**
     * Initialize the AudioContext and build the signal chain.
     * Must be called from a user gesture.
     */
    async init() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();

        // Master output chain:
        // voices -> voiceBus -> filter(bypassed globally) -> chorusSend -> delaySend -> reverbSend -> masterGain -> analyser -> destination
        // (per-voice filtering is done in voice)

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.params.masterVolume;

        // Analyser for oscilloscope
        this.analyserNode = this.ctx.createAnalyser();
        this.analyserNode.fftSize = 4096;
        this.analyserNode.smoothingTimeConstant = 0.8;

        // Create voice bus
        this.voiceBus = this.ctx.createGain();
        this.voiceBus.gain.value = 1;

        // === Chorus ===
        this._buildChorus();

        // === Delay ===
        this._buildDelay();

        // === Reverb ===
        await this._buildReverb();

        // Connect chain: voiceBus -> chorus -> delay -> reverb -> masterGain -> analyser -> destination
        this.voiceBus.connect(this.chorusDryGain);
        this.voiceBus.connect(this.chorusInputGain);

        this.chorusOutput.connect(this.delayDryGain);
        this.chorusOutput.connect(this.delayNode);

        this.delayOutput.connect(this.dryGain);
        this.delayOutput.connect(this.reverbNode);

        this.reverbSendOutput.connect(this.masterGain);

        this.masterGain.connect(this.analyserNode);
        this.analyserNode.connect(this.ctx.destination);

        // === LFO ===
        this._buildLFO();

        this._updateEffectGains();
    }

    // =========================================
    // Effect Builders
    // =========================================

    _buildChorus() {
        // Stereo chorus using modulated delay lines
        this.chorusInputGain = this.ctx.createGain();
        this.chorusInputGain.gain.value = 0;

        this.chorusDryGain = this.ctx.createGain();
        this.chorusDryGain.gain.value = 1;

        const chorusWetGain = this.ctx.createGain();
        chorusWetGain.gain.value = 1;

        // Create two delay lines for stereo chorus
        this.chorusDelayL = this.ctx.createDelay(0.1);
        this.chorusDelayL.delayTime.value = 0.015;

        this.chorusDelayR = this.ctx.createDelay(0.1);
        this.chorusDelayR.delayTime.value = 0.017;

        // LFO for chorus modulation
        this.chorusLFO = this.ctx.createOscillator();
        this.chorusLFO.type = 'sine';
        this.chorusLFO.frequency.value = this.params.chorusRate;

        this.chorusLFOGainL = this.ctx.createGain();
        this.chorusLFOGainL.gain.value = 0.002;

        this.chorusLFOGainR = this.ctx.createGain();
        this.chorusLFOGainR.gain.value = 0.003;

        this.chorusLFO.connect(this.chorusLFOGainL);
        this.chorusLFO.connect(this.chorusLFOGainR);
        this.chorusLFOGainL.connect(this.chorusDelayL.delayTime);
        this.chorusLFOGainR.connect(this.chorusDelayR.delayTime);
        this.chorusLFO.start();

        // Merge back to mono for the chain
        this.chorusInputGain.connect(this.chorusDelayL);
        this.chorusInputGain.connect(this.chorusDelayR);
        this.chorusDelayL.connect(chorusWetGain);
        this.chorusDelayR.connect(chorusWetGain);

        // Chorus output merger
        this.chorusOutput = this.ctx.createGain();
        this.chorusDryGain.connect(this.chorusOutput);
        chorusWetGain.connect(this.chorusOutput);

        this.chorusWetGain = chorusWetGain;
    }

    _buildDelay() {
        this.delayNode = this.ctx.createDelay(2.0);
        this.delayNode.delayTime.value = this.params.delayTime;

        this.delayFeedbackNode = this.ctx.createGain();
        this.delayFeedbackNode.gain.value = this.params.delayFeedback;

        this.delayDryGain = this.ctx.createGain();
        this.delayDryGain.gain.value = 1;

        const delayWetGain = this.ctx.createGain();
        delayWetGain.gain.value = 0;

        // Feedback loop
        this.delayNode.connect(this.delayFeedbackNode);
        this.delayFeedbackNode.connect(this.delayNode);

        this.delayNode.connect(delayWetGain);

        this.delayOutput = this.ctx.createGain();
        this.delayDryGain.connect(this.delayOutput);
        delayWetGain.connect(this.delayOutput);

        this.delayWetGain = delayWetGain;
    }

    async _buildReverb() {
        this.reverbNode = this.ctx.createConvolver();

        this.dryGain = this.ctx.createGain();
        this.dryGain.gain.value = 1;

        this.reverbGain = this.ctx.createGain();
        this.reverbGain.gain.value = 0;

        // Generate impulse response
        this._reverbBuffer = this._generateImpulseResponse(this.params.reverbDecay);
        this.reverbNode.buffer = this._reverbBuffer;

        this.reverbNode.connect(this.reverbGain);

        // Reverb send output
        this.reverbSendOutput = this.ctx.createGain();
        this.dryGain.connect(this.reverbSendOutput);
        this.reverbGain.connect(this.reverbSendOutput);
    }

    /**
     * Generate a synthetic impulse response for convolution reverb.
     * Creates a natural sounding reverb tail with early reflections.
     */
    _generateImpulseResponse(decay) {
        const sampleRate = this.ctx.sampleRate;
        const length = sampleRate * decay;
        const impulse = this.ctx.createBuffer(2, length, sampleRate);

        for (let channel = 0; channel < 2; channel++) {
            const data = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                const t = i / sampleRate;
                // Exponential decay with some randomness
                const decay_factor = Math.exp(-3.0 * t / (decay * 0.5));
                // Early reflections (sharp transients in first 50ms)
                const earlyReflection = t < 0.05 ? Math.exp(-t * 40) * 0.3 : 0;
                // Diffuse late reverb
                const noise = (Math.random() * 2 - 1);
                data[i] = noise * (decay_factor + earlyReflection);
            }
        }
        return impulse;
    }

    _buildLFO() {
        this.globalLFO = this.ctx.createOscillator();
        this.globalLFO.type = this.params.lfoWaveform;
        this.globalLFO.frequency.value = this.params.lfoRate;

        this.globalLFOGain = this.ctx.createGain();
        this.globalLFOGain.gain.value = 0; // starts off

        this.globalLFO.connect(this.globalLFOGain);
        this.globalLFO.start();
    }

    // =========================================
    // Parameter Updates
    // =========================================

    setParam(name, value) {
        this.params[name] = value;

        switch (name) {
            case 'masterVolume':
                this.masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
                break;
            case 'filterCutoff':
            case 'filterResonance':
            case 'filterType':
                this._updateVoiceFilters();
                break;
            case 'reverbMix':
            case 'reverbDecay':
            case 'reverbEnabled':
            case 'delayMix':
            case 'delayTime':
            case 'delayFeedback':
            case 'delayEnabled':
            case 'chorusMix':
            case 'chorusRate':
            case 'chorusDepth':
            case 'chorusEnabled':
                this._updateEffectParams(name, value);
                break;
            case 'lfoRate':
                this.globalLFO.frequency.setTargetAtTime(value, this.ctx.currentTime, 0.02);
                break;
            case 'lfoDepth':
            case 'lfoEnabled':
            case 'lfoDestination':
                this._updateLFO();
                break;
            case 'lfoWaveform':
                this.globalLFO.type = value;
                break;
        }
    }

    _updateEffectParams(name, value) {
        const t = this.ctx.currentTime;
        switch (name) {
            case 'reverbMix':
            case 'reverbEnabled':
                this._updateEffectGains();
                break;
            case 'reverbDecay':
                this._reverbBuffer = this._generateImpulseResponse(value);
                this.reverbNode.buffer = this._reverbBuffer;
                break;
            case 'delayTime':
                this.delayNode.delayTime.setTargetAtTime(value, t, 0.05);
                break;
            case 'delayFeedback':
                this.delayFeedbackNode.gain.setTargetAtTime(value, t, 0.02);
                break;
            case 'delayMix':
            case 'delayEnabled':
                this._updateEffectGains();
                break;
            case 'chorusRate':
                this.chorusLFO.frequency.setTargetAtTime(value, t, 0.02);
                break;
            case 'chorusDepth':
                this.chorusLFOGainL.gain.setTargetAtTime(value * 0.004, t, 0.02);
                this.chorusLFOGainR.gain.setTargetAtTime(value * 0.006, t, 0.02);
                break;
            case 'chorusMix':
            case 'chorusEnabled':
                this._updateEffectGains();
                break;
        }
    }

    _updateEffectGains() {
        const t = this.ctx.currentTime;
        const ramp = 0.02;

        // Reverb
        if (this.params.reverbEnabled) {
            this.reverbGain.gain.setTargetAtTime(this.params.reverbMix, t, ramp);
        } else {
            this.reverbGain.gain.setTargetAtTime(0, t, ramp);
        }

        // Delay
        if (this.params.delayEnabled) {
            this.delayWetGain.gain.setTargetAtTime(this.params.delayMix, t, ramp);
        } else {
            this.delayWetGain.gain.setTargetAtTime(0, t, ramp);
        }

        // Chorus
        if (this.params.chorusEnabled) {
            this.chorusInputGain.gain.setTargetAtTime(this.params.chorusMix, t, ramp);
            this.chorusDryGain.gain.setTargetAtTime(1 - this.params.chorusMix * 0.5, t, ramp);
        } else {
            this.chorusInputGain.gain.setTargetAtTime(0, t, ramp);
            this.chorusDryGain.gain.setTargetAtTime(1, t, ramp);
        }
    }

    _updateVoiceFilters() {
        for (const voice of this.voices.values()) {
            if (voice.filter) {
                voice.filter.type = this.params.filterType;
                voice.filter.frequency.setTargetAtTime(
                    this.params.filterCutoff,
                    this.ctx.currentTime, 0.02
                );
                voice.filter.Q.setTargetAtTime(
                    this.params.filterResonance,
                    this.ctx.currentTime, 0.02
                );
            }
        }
    }

    _updateLFO() {
        // Disconnect existing connections from LFOGain
        this.globalLFOGain.disconnect();

        if (!this.params.lfoEnabled) {
            this.globalLFOGain.gain.value = 0;
            return;
        }

        const depth = this.params.lfoDepth;
        const dest = this.params.lfoDestination;

        // Set gain range based on destination
        switch (dest) {
            case 'pitch':
                // Pitch: depth controls cents (0-100)
                this.globalLFOGain.gain.value = depth * 100;
                // Connect to all active voices' oscillator detune
                for (const voice of this.voices.values()) {
                    if (voice.osc1) this.globalLFOGain.connect(voice.osc1.detune);
                    if (voice.osc2) this.globalLFOGain.connect(voice.osc2.detune);
                }
                break;
            case 'filter':
                // Filter cutoff modulation
                this.globalLFOGain.gain.value = depth * 4000;
                for (const voice of this.voices.values()) {
                    if (voice.filter) this.globalLFOGain.connect(voice.filter.frequency);
                }
                break;
            case 'amplitude':
                // Tremolo
                this.globalLFOGain.gain.value = depth * 0.5;
                this.globalLFOGain.connect(this.voiceBus.gain);
                break;
            case 'panning':
                // Simplified - modulate master gain slightly
                this.globalLFOGain.gain.value = depth * 0.3;
                this.globalLFOGain.connect(this.masterGain.gain);
                break;
        }
    }

    // =========================================
    // Voice Management (Polyphonic ADSR)
    // =========================================

    /**
     * Play a note with full ADSR envelope.
     * @param {string} noteId - Unique identifier (e.g., "C4")
     * @param {number} frequency - Hz
     */
    noteOn(noteId, frequency) {
        // If voice already exists for this note, release it first
        if (this.voices.has(noteId)) {
            this._releaseVoice(noteId);
        }

        // Voice stealing: if at max polyphony, release oldest voice
        if (this.voices.size >= this.maxVoices) {
            const oldestKey = this.voices.keys().next().value;
            this._releaseVoice(oldestKey, true);
        }

        const now = this.ctx.currentTime;
        const voice = this._createVoice(frequency, now);
        this.voices.set(noteId, voice);

        // Connect LFO to new voice if enabled
        if (this.params.lfoEnabled) {
            this._connectLFOToVoice(voice);
        }
    }

    /**
     * Release a note — trigger the Release phase of ADSR.
     * @param {string} noteId
     */
    noteOff(noteId) {
        if (!this.voices.has(noteId)) return;
        this._releaseVoice(noteId);
    }

    /**
     * Create a single polyphonic voice with the complete signal chain:
     * osc(s) -> oscGain(s) -> voiceMixer -> filter -> ampEnvGain -> voiceBus
     */
    _createVoice(frequency, now) {
        const p = this.params;
        const voice = { startTime: now };

        // === Voice gain envelope ===
        const ampEnvGain = this.ctx.createGain();
        ampEnvGain.gain.setValueAtTime(0, now);
        voice.ampEnvGain = ampEnvGain;

        // === ADSR Amplitude Envelope ===
        // Attack
        ampEnvGain.gain.linearRampToValueAtTime(1.0, now + p.attack);
        // Decay -> Sustain
        ampEnvGain.gain.setTargetAtTime(
            p.sustain,
            now + p.attack,
            p.decay * 0.35 // time constant for exponential decay
        );

        // === Voice mixer (combines osc1 + osc2) ===
        const voiceMixer = this.ctx.createGain();
        voiceMixer.gain.value = 1;
        voice.voiceMixer = voiceMixer;

        // === Oscillator 1 ===
        if (p.osc1Enabled) {
            const osc1 = this.ctx.createOscillator();
            osc1.type = p.osc1Waveform;
            osc1.frequency.value = frequency * Math.pow(2, p.osc1Octave);
            osc1.detune.value = p.osc1Detune;

            const osc1Gain = this.ctx.createGain();
            osc1Gain.gain.value = p.osc1Gain;

            osc1.connect(osc1Gain);
            osc1Gain.connect(voiceMixer);
            osc1.start(now);

            voice.osc1 = osc1;
            voice.osc1Gain = osc1Gain;
        }

        // === Oscillator 2 ===
        if (p.osc2Enabled) {
            const osc2 = this.ctx.createOscillator();
            osc2.type = p.osc2Waveform;
            osc2.frequency.value = frequency * Math.pow(2, p.osc2Octave);
            osc2.detune.value = p.osc2Detune;

            const osc2Gain = this.ctx.createGain();
            osc2Gain.gain.value = p.osc2Gain;

            osc2.connect(osc2Gain);
            osc2Gain.connect(voiceMixer);
            osc2.start(now);

            voice.osc2 = osc2;
            voice.osc2Gain = osc2Gain;
        }

        // === Filter ===
        if (p.filterEnabled) {
            const filter = this.ctx.createBiquadFilter();
            filter.type = p.filterType;
            filter.Q.value = p.filterResonance;

            // Filter envelope
            const baseCutoff = p.filterCutoff;
            const envAmount = p.filterEnvAmount;
            const filterPeak = Math.min(20000, baseCutoff + envAmount * (20000 - baseCutoff));

            if (envAmount > 0.01) {
                // Start at base cutoff
                filter.frequency.setValueAtTime(baseCutoff, now);
                // Attack to peak
                filter.frequency.linearRampToValueAtTime(filterPeak, now + p.filterAttack);
                // Decay to sustain level
                const filterSustainFreq = baseCutoff + p.filterSustain * (filterPeak - baseCutoff);
                filter.frequency.setTargetAtTime(
                    filterSustainFreq,
                    now + p.filterAttack,
                    p.filterDecay * 0.35
                );
            } else {
                filter.frequency.value = baseCutoff;
            }

            voiceMixer.connect(filter);
            filter.connect(ampEnvGain);
            voice.filter = filter;
            voice.filterBaseCutoff = baseCutoff;
            voice.filterPeakCutoff = filterPeak;
        } else {
            voiceMixer.connect(ampEnvGain);
        }

        // Connect to voice bus
        ampEnvGain.connect(this.voiceBus);

        return voice;
    }

    /**
     * Release a voice with proper ADSR release phase.
     */
    _releaseVoice(noteId, immediate = false) {
        const voice = this.voices.get(noteId);
        if (!voice) return;

        const now = this.ctx.currentTime;
        const releaseTime = immediate ? 0.01 : this.params.release;

        // Cancel any scheduled ramps and set current value
        voice.ampEnvGain.gain.cancelScheduledValues(now);
        voice.ampEnvGain.gain.setValueAtTime(voice.ampEnvGain.gain.value, now);

        // Release ramp to 0
        voice.ampEnvGain.gain.linearRampToValueAtTime(0, now + releaseTime);

        // Filter release
        if (voice.filter && this.params.filterEnvAmount > 0.01) {
            voice.filter.frequency.cancelScheduledValues(now);
            voice.filter.frequency.setValueAtTime(voice.filter.frequency.value, now);
            voice.filter.frequency.linearRampToValueAtTime(
                voice.filterBaseCutoff,
                now + (immediate ? 0.01 : this.params.filterRelease)
            );
        }

        // Cleanup after release completes
        const cleanupTime = (releaseTime + 0.05) * 1000;
        voice._cleanupTimeout = setTimeout(() => {
            this._destroyVoice(voice);
        }, cleanupTime);

        this.voices.delete(noteId);
    }

    _destroyVoice(voice) {
        try {
            if (voice.osc1) { voice.osc1.stop(); voice.osc1.disconnect(); }
            if (voice.osc2) { voice.osc2.stop(); voice.osc2.disconnect(); }
            if (voice.osc1Gain) voice.osc1Gain.disconnect();
            if (voice.osc2Gain) voice.osc2Gain.disconnect();
            if (voice.voiceMixer) voice.voiceMixer.disconnect();
            if (voice.filter) voice.filter.disconnect();
            if (voice.ampEnvGain) voice.ampEnvGain.disconnect();
        } catch (e) {
            // Nodes may already be stopped/disconnected
        }
    }

    _connectLFOToVoice(voice) {
        const dest = this.params.lfoDestination;
        switch (dest) {
            case 'pitch':
                if (voice.osc1) this.globalLFOGain.connect(voice.osc1.detune);
                if (voice.osc2) this.globalLFOGain.connect(voice.osc2.detune);
                break;
            case 'filter':
                if (voice.filter) this.globalLFOGain.connect(voice.filter.frequency);
                break;
        }
    }

    // =========================================
    // Analyser Access
    // =========================================

    getAnalyserNode() {
        return this.analyserNode;
    }

    getVoiceCount() {
        return this.voices.size;
    }

    // =========================================
    // Presets
    // =========================================

    loadPreset(name) {
        const presets = {
            'init': {
                osc1Waveform: 'sine', osc1Detune: 0, osc1Octave: 0, osc1Gain: 0.8,
                osc2Enabled: false, osc2Waveform: 'sine', osc2Detune: 0, osc2Octave: 0, osc2Gain: 0.5,
                attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3,
                filterCutoff: 8000, filterResonance: 1, filterEnvAmount: 0,
                filterAttack: 0.01, filterDecay: 0.3, filterSustain: 0.5, filterRelease: 0.3,
                reverbMix: 0.2, reverbDecay: 2.5,
                delayEnabled: false, delayTime: 0.3, delayFeedback: 0.4, delayMix: 0.2,
                chorusEnabled: false,
                lfoEnabled: false,
            },
            'warm-pad': {
                osc1Waveform: 'sawtooth', osc1Detune: -8, osc1Octave: 0, osc1Gain: 0.5,
                osc2Enabled: true, osc2Waveform: 'sawtooth', osc2Detune: 8, osc2Octave: 0, osc2Gain: 0.5,
                attack: 0.8, decay: 0.5, sustain: 0.8, release: 1.5,
                filterCutoff: 2500, filterResonance: 2, filterEnvAmount: 0.3,
                filterAttack: 0.6, filterDecay: 0.8, filterSustain: 0.4, filterRelease: 1.0,
                reverbMix: 0.45, reverbDecay: 4.0,
                delayEnabled: false,
                chorusEnabled: true, chorusRate: 0.8, chorusDepth: 0.6, chorusMix: 0.35,
                lfoEnabled: false,
            },
            'bass-pluck': {
                osc1Waveform: 'square', osc1Detune: 0, osc1Octave: -1, osc1Gain: 0.9,
                osc2Enabled: true, osc2Waveform: 'sawtooth', osc2Detune: 5, osc2Octave: -1, osc2Gain: 0.4,
                attack: 0.001, decay: 0.25, sustain: 0.1, release: 0.15,
                filterCutoff: 800, filterResonance: 6, filterEnvAmount: 0.7,
                filterAttack: 0.001, filterDecay: 0.2, filterSustain: 0.1, filterRelease: 0.15,
                reverbMix: 0.1, reverbDecay: 1.0,
                delayEnabled: false,
                chorusEnabled: false,
                lfoEnabled: false,
            },
            'lead-saw': {
                osc1Waveform: 'sawtooth', osc1Detune: -5, osc1Octave: 0, osc1Gain: 0.7,
                osc2Enabled: true, osc2Waveform: 'sawtooth', osc2Detune: 5, osc2Octave: 1, osc2Gain: 0.3,
                attack: 0.02, decay: 0.3, sustain: 0.6, release: 0.4,
                filterCutoff: 4000, filterResonance: 4, filterEnvAmount: 0.5,
                filterAttack: 0.02, filterDecay: 0.3, filterSustain: 0.3, filterRelease: 0.3,
                reverbMix: 0.2, reverbDecay: 2.0,
                delayEnabled: true, delayTime: 0.375, delayFeedback: 0.35, delayMix: 0.2,
                chorusEnabled: false,
                lfoEnabled: true, lfoWaveform: 'sine', lfoRate: 5.5, lfoDepth: 0.15, lfoDestination: 'pitch',
            },
            'organ': {
                osc1Waveform: 'sine', osc1Detune: 0, osc1Octave: 0, osc1Gain: 0.6,
                osc2Enabled: true, osc2Waveform: 'sine', osc2Detune: 0, osc2Octave: 1, osc2Gain: 0.4,
                attack: 0.005, decay: 0.05, sustain: 0.95, release: 0.08,
                filterCutoff: 6000, filterResonance: 0.5, filterEnvAmount: 0,
                filterAttack: 0.01, filterDecay: 0.1, filterSustain: 1, filterRelease: 0.1,
                reverbMix: 0.25, reverbDecay: 2.0,
                delayEnabled: false,
                chorusEnabled: true, chorusRate: 3, chorusDepth: 0.3, chorusMix: 0.2,
                lfoEnabled: true, lfoWaveform: 'sine', lfoRate: 6, lfoDepth: 0.08, lfoDestination: 'pitch',
            },
            'bell': {
                osc1Waveform: 'sine', osc1Detune: 0, osc1Octave: 1, osc1Gain: 0.7,
                osc2Enabled: true, osc2Waveform: 'triangle', osc2Detune: 700, osc2Octave: 2, osc2Gain: 0.3,
                attack: 0.001, decay: 1.5, sustain: 0, release: 1.0,
                filterCutoff: 12000, filterResonance: 0.5, filterEnvAmount: 0.4,
                filterAttack: 0.001, filterDecay: 1.0, filterSustain: 0.1, filterRelease: 0.8,
                reverbMix: 0.4, reverbDecay: 3.5,
                delayEnabled: true, delayTime: 0.5, delayFeedback: 0.3, delayMix: 0.15,
                chorusEnabled: false,
                lfoEnabled: false,
            },
            'string-ensemble': {
                osc1Waveform: 'sawtooth', osc1Detune: -12, osc1Octave: 0, osc1Gain: 0.4,
                osc2Enabled: true, osc2Waveform: 'sawtooth', osc2Detune: 12, osc2Octave: 0, osc2Gain: 0.4,
                attack: 0.5, decay: 0.3, sustain: 0.85, release: 0.8,
                filterCutoff: 3000, filterResonance: 1.5, filterEnvAmount: 0.2,
                filterAttack: 0.4, filterDecay: 0.5, filterSustain: 0.5, filterRelease: 0.6,
                reverbMix: 0.5, reverbDecay: 4.5,
                delayEnabled: false,
                chorusEnabled: true, chorusRate: 0.5, chorusDepth: 0.8, chorusMix: 0.4,
                lfoEnabled: true, lfoWaveform: 'sine', lfoRate: 4.5, lfoDepth: 0.1, lfoDestination: 'pitch',
            },
            'wobble-bass': {
                osc1Waveform: 'sawtooth', osc1Detune: 0, osc1Octave: -1, osc1Gain: 0.9,
                osc2Enabled: true, osc2Waveform: 'square', osc2Detune: -3, osc2Octave: -1, osc2Gain: 0.5,
                attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.2,
                filterCutoff: 600, filterResonance: 12, filterEnvAmount: 0.6,
                filterAttack: 0.01, filterDecay: 0.3, filterSustain: 0.3, filterRelease: 0.2,
                reverbMix: 0.1, reverbDecay: 1.5,
                delayEnabled: false,
                chorusEnabled: false,
                lfoEnabled: true, lfoWaveform: 'sine', lfoRate: 3, lfoDepth: 0.8, lfoDestination: 'filter',
            },
        };

        const preset = presets[name];
        if (!preset) return;

        // Apply all preset values
        for (const [key, value] of Object.entries(preset)) {
            this.params[key] = value;
            // Trigger live updates for applicable params
            this.setParam(key, value);
        }

        return preset;
    }

    /**
     * Get current CPU load estimate
     */
    getCPULoad() {
        // Rough estimate based on voice count and effects
        let load = this.voices.size * 5;
        if (this.params.reverbEnabled) load += 3;
        if (this.params.delayEnabled) load += 2;
        if (this.params.chorusEnabled) load += 2;
        if (this.params.lfoEnabled) load += 1;
        return Math.min(100, load);
    }
}
