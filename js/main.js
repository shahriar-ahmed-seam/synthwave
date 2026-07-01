/**
 * SynthWave — Main Application Orchestrator
 * 
 * Wires together all components:
 * - AudioEngine (Web Audio synthesis)
 * - RotaryKnob (SVG knob UI)
 * - PianoKeyboard (interactive keyboard)
 * - Oscilloscope (canvas visualizer)
 * - ADSRVisualizer (envelope display)
 * 
 * Handles:
 * - Startup flow (user gesture for AudioContext)
 * - Parameter routing between UI and engine
 * - Preset loading/switching
 * - Toggle buttons for oscillators, filter, effects, LFO
 * - Oscilloscope mode switching
 * - CPU meter updates
 */

import { AudioEngine } from './audio-engine.js';
import { initAllKnobs } from './knob.js';
import { PianoKeyboard } from './piano.js';
import { Oscilloscope } from './oscilloscope.js';
import { ADSRVisualizer } from './adsr-visualizer.js';

class SynthWaveApp {
    constructor() {
        this.engine = new AudioEngine();
        this.knobs = null;
        this.keyboard = null;
        this.oscilloscope = null;
        this.adsrVisualizer = null;
        this._cpuInterval = null;
    }

    /**
     * Initialize everything after user gesture.
     */
    async init() {
        // Initialize audio engine
        await this.engine.init();

        // Show main app, hide overlay
        document.getElementById('startup-overlay').classList.add('hidden');
        document.getElementById('synth-app').classList.remove('hidden');

        // Initialize all SVG knobs
        this.knobs = initAllKnobs((paramName, value) => {
            this._onKnobChange(paramName, value);
        });

        // Initialize ADSR Visualizer
        const adsrCanvas = document.getElementById('adsr-canvas');
        if (adsrCanvas) {
            this.adsrVisualizer = new ADSRVisualizer(adsrCanvas);
        }

        // Initialize Piano Keyboard
        const pianoContainer = document.getElementById('piano-keyboard');
        this.keyboard = new PianoKeyboard(pianoContainer, {
            noteOn: (noteId, freq) => {
                this.engine.noteOn(noteId, freq);
                this._updateVoiceCount();
            },
            noteOff: (noteId) => {
                this.engine.noteOff(noteId);
                this._updateVoiceCount();
            },
        });

        // Initialize Oscilloscope
        const scopeCanvas = document.getElementById('oscilloscope-canvas');
        this.oscilloscope = new Oscilloscope(scopeCanvas, this.engine.getAnalyserNode());
        this.oscilloscope.start();

        // Bind UI controls
        this._bindToggles();
        this._bindWaveformSelectors();
        this._bindFilterTypeSelector();
        this._bindLFOControls();
        this._bindOscilloscopeControls();
        this._bindPresetSelector();
        this._bindOctaveControls();

        // Start CPU meter
        this._startCPUMeter();

        console.log('[SynthWave] Initialized successfully');
    }

    // =========================================
    // Parameter Routing
    // =========================================

    _onKnobChange(paramName, value) {
        // Route to audio engine
        this.engine.setParam(paramName, value);

        // Update ADSR visualizer if relevant
        if (['attack', 'decay', 'sustain', 'release'].includes(paramName)) {
            if (this.adsrVisualizer) {
                this.adsrVisualizer.update(
                    this.engine.params.attack,
                    this.engine.params.decay,
                    this.engine.params.sustain,
                    this.engine.params.release
                );
            }
        }
    }

    // =========================================
    // Toggle Buttons
    // =========================================

    _bindToggles() {
        // Oscillator toggles
        this._bindToggle('osc1-toggle', (active) => {
            this.engine.params.osc1Enabled = active;
        });

        this._bindToggle('osc2-toggle', (active) => {
            this.engine.params.osc2Enabled = active;
        });

        // Filter toggle
        this._bindToggle('filter-toggle', (active) => {
            this.engine.params.filterEnabled = active;
        });

        // Effect toggles
        this._bindToggle('reverb-toggle', (active) => {
            this.engine.params.reverbEnabled = active;
            this.engine.setParam('reverbEnabled', active);
        });

        this._bindToggle('delay-toggle', (active) => {
            this.engine.params.delayEnabled = active;
            this.engine.setParam('delayEnabled', active);
        });

        this._bindToggle('chorus-toggle', (active) => {
            this.engine.params.chorusEnabled = active;
            this.engine.setParam('chorusEnabled', active);
        });

        // LFO toggle
        this._bindToggle('lfo-toggle', (active) => {
            this.engine.params.lfoEnabled = active;
            this.engine.setParam('lfoEnabled', active);
        });
    }

    _bindToggle(id, onChange) {
        const btn = document.getElementById(id);
        if (!btn) return;

        btn.addEventListener('click', () => {
            const isActive = btn.classList.toggle('active');
            btn.textContent = isActive ? 'ON' : 'OFF';
            onChange(isActive);
        });
    }

    // =========================================
    // Waveform Selectors
    // =========================================

    _bindWaveformSelectors() {
        // Oscillator 1 waveform
        this._bindWaveformGroup('osc1-waveform', (wave) => {
            this.engine.params.osc1Waveform = wave;
        });

        // Oscillator 2 waveform
        this._bindWaveformGroup('osc2-waveform', (wave) => {
            this.engine.params.osc2Waveform = wave;
        });

        // LFO waveform
        this._bindWaveformGroup('lfo-waveform', (wave) => {
            this.engine.params.lfoWaveform = wave;
            this.engine.setParam('lfoWaveform', wave);
        });
    }

    _bindWaveformGroup(containerId, onChange) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const buttons = container.querySelectorAll('.wave-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                onChange(btn.dataset.wave);
            });
        });
    }

    // =========================================
    // Filter Type Selector
    // =========================================

    _bindFilterTypeSelector() {
        const container = document.getElementById('filter-type-selector');
        if (!container) return;

        const buttons = container.querySelectorAll('.filter-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.engine.setParam('filterType', btn.dataset.type);
            });
        });
    }

    // =========================================
    // LFO Controls
    // =========================================

    _bindLFOControls() {
        const destSelect = document.getElementById('lfo-destination');
        if (destSelect) {
            destSelect.addEventListener('change', () => {
                this.engine.setParam('lfoDestination', destSelect.value);
            });
        }
    }

    // =========================================
    // Oscilloscope Controls
    // =========================================

    _bindOscilloscopeControls() {
        // Mode buttons
        const modeButtons = document.querySelectorAll('.scope-btn');
        modeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                modeButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.oscilloscope.setMode(btn.dataset.mode);
            });
        });

        // Zoom slider
        const zoomSlider = document.getElementById('scope-zoom');
        if (zoomSlider) {
            zoomSlider.addEventListener('input', () => {
                this.oscilloscope.setZoom(parseFloat(zoomSlider.value));
            });
        }

        // Glow slider
        const glowSlider = document.getElementById('scope-glow');
        if (glowSlider) {
            glowSlider.addEventListener('input', () => {
                this.oscilloscope.setGlow(parseFloat(glowSlider.value));
            });
        }
    }

    // =========================================
    // Preset Selector
    // =========================================

    _bindPresetSelector() {
        const select = document.getElementById('preset-select');
        if (!select) return;

        select.addEventListener('change', () => {
            const presetName = select.value;
            const preset = this.engine.loadPreset(presetName);
            if (preset) {
                this._syncUIFromEngine(preset);
            }
        });
    }

    /**
     * Sync all UI elements from engine params after preset load.
     */
    _syncUIFromEngine(preset) {
        const p = this.engine.params;

        // Update knobs
        if (this.knobs) {
            for (const [paramName, knob] of this.knobs) {
                if (p[paramName] !== undefined) {
                    knob.setValueSilent(p[paramName]);
                }
            }
        }

        // Update ADSR visualizer
        if (this.adsrVisualizer) {
            this.adsrVisualizer.update(p.attack, p.decay, p.sustain, p.release);
        }

        // Update toggle buttons
        this._syncToggle('osc1-toggle', p.osc1Enabled);
        this._syncToggle('osc2-toggle', p.osc2Enabled);
        this._syncToggle('filter-toggle', p.filterEnabled);
        this._syncToggle('reverb-toggle', p.reverbEnabled);
        this._syncToggle('delay-toggle', p.delayEnabled);
        this._syncToggle('chorus-toggle', p.chorusEnabled);
        this._syncToggle('lfo-toggle', p.lfoEnabled);

        // Update waveform selectors
        this._syncWaveform('osc1-waveform', p.osc1Waveform);
        this._syncWaveform('osc2-waveform', p.osc2Waveform);
        if (p.lfoWaveform) this._syncWaveform('lfo-waveform', p.lfoWaveform);

        // Update filter type
        this._syncFilterType(p.filterType);

        // Update LFO destination
        if (p.lfoDestination) {
            const destSelect = document.getElementById('lfo-destination');
            if (destSelect) destSelect.value = p.lfoDestination;
        }
    }

    _syncToggle(id, isActive) {
        const btn = document.getElementById(id);
        if (!btn) return;

        if (isActive) {
            btn.classList.add('active');
            btn.textContent = 'ON';
        } else {
            btn.classList.remove('active');
            btn.textContent = 'OFF';
        }
    }

    _syncWaveform(containerId, waveform) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const buttons = container.querySelectorAll('.wave-btn');
        buttons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.wave === waveform);
        });
    }

    _syncFilterType(type) {
        const container = document.getElementById('filter-type-selector');
        if (!container) return;

        const buttons = container.querySelectorAll('.filter-btn');
        buttons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === type);
        });
    }

    // =========================================
    // Octave Controls
    // =========================================

    _bindOctaveControls() {
        const downBtn = document.getElementById('octave-down');
        const upBtn = document.getElementById('octave-up');

        if (downBtn) {
            downBtn.addEventListener('click', () => {
                this.keyboard.shiftOctave(-1);
            });
        }

        if (upBtn) {
            upBtn.addEventListener('click', () => {
                this.keyboard.shiftOctave(1);
            });
        }
    }

    // =========================================
    // CPU Meter
    // =========================================

    _startCPUMeter() {
        const fill = document.getElementById('cpu-fill');
        if (!fill) return;

        this._cpuInterval = setInterval(() => {
            const load = this.engine.getCPULoad();
            fill.style.width = `${load}%`;

            if (load > 70) {
                fill.style.background = '#ff4444';
            } else if (load > 40) {
                fill.style.background = 'var(--accent-yellow)';
            } else {
                fill.style.background = 'var(--accent-green)';
            }
        }, 500);
    }

    _updateVoiceCount() {
        const el = document.getElementById('voice-count');
        if (el) {
            // Small delay to get accurate count after voice creation/destruction
            requestAnimationFrame(() => {
                el.textContent = this.engine.getVoiceCount();
            });
        }
    }
}

// =========================================
// Bootstrap
// =========================================

const app = new SynthWaveApp();

document.getElementById('start-btn').addEventListener('click', async () => {
    try {
        await app.init();
    } catch (err) {
        console.error('[SynthWave] Initialization error:', err);
        alert('Failed to initialize audio engine. Please try refreshing the page.');
    }
});

// Also allow Enter key on startup
document.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && !document.getElementById('startup-overlay').classList.contains('hidden')) {
        try {
            await app.init();
        } catch (err) {
            console.error('[SynthWave] Initialization error:', err);
        }
    }
});
