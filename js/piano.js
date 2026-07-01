/**
 * SynthWave — Piano Keyboard Component
 * 
 * Interactive piano keyboard that:
 * - Dynamically generates 3 octaves of keys (white + black)
 * - Handles mouse click, mouse slide (drag across keys), and multi-touch
 * - Maps computer keyboard keys (A-L white, W-P black)
 * - Supports octave shifting with Z/X keys
 * - Visual feedback with neon glow on active keys
 * - Outputs note events (noteOn/noteOff with frequency)
 */

// Note frequencies for all MIDI notes (A0 = MIDI 21)
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Calculate frequency from MIDI note number.
 * MIDI 69 = A4 = 440 Hz
 */
function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Get note name from MIDI number.
 */
function midiToName(midi) {
    const octave = Math.floor(midi / 12) - 1;
    const note = NOTE_NAMES[midi % 12];
    return `${note}${octave}`;
}

/**
 * Check if a given note index (0-11) is a black key.
 */
function isBlackKey(noteIndex) {
    return [1, 3, 6, 8, 10].includes(noteIndex);
}

// Keyboard mapping: computer key -> note offset from base octave
const WHITE_KEY_MAP = {
    'a': 0,   // C
    's': 2,   // D
    'd': 4,   // E
    'f': 5,   // F
    'g': 7,   // G
    'h': 9,   // A
    'j': 11,  // B
    'k': 12,  // C+1
    'l': 14,  // D+1
};

const BLACK_KEY_MAP = {
    'w': 1,   // C#
    'e': 3,   // D#
    't': 6,   // F#
    'y': 8,   // G#
    'u': 10,  // A#
    'o': 13,  // C#+1
    'p': 15,  // D#+1
};

export class PianoKeyboard {
    /**
     * @param {HTMLElement} container - The #piano-keyboard element
     * @param {Object} callbacks - { noteOn(noteId, freq), noteOff(noteId) }
     */
    constructor(container, callbacks) {
        this.container = container;
        this.callbacks = callbacks;

        this.baseOctave = 4; // C4 is middle C
        this.numOctaves = 3; // Display 3 octaves
        this.keys = new Map(); // midi -> DOM element
        this.activeKeys = new Set(); // Currently pressed MIDI notes
        this.activeMouseKeys = new Set(); // Keys activated by mouse
        this.activeTouchKeys = new Map(); // touchId -> midi

        this._isMouseDown = false;

        this._buildKeyboard();
        this._bindEvents();
    }

    /**
     * Build the piano keyboard DOM.
     */
    _buildKeyboard() {
        this.container.innerHTML = '';

        const startMidi = (this.baseOctave + 1) * 12; // +1 because MIDI octave starts at -1
        const endMidi = startMidi + this.numOctaves * 12;

        // First pass: create white keys and determine positions
        const whiteKeys = [];
        for (let midi = startMidi; midi < endMidi; midi++) {
            const noteIndex = midi % 12;
            if (!isBlackKey(noteIndex)) {
                whiteKeys.push(midi);
            }
        }

        // Create white keys
        whiteKeys.forEach((midi) => {
            const name = midiToName(midi);
            const key = document.createElement('div');
            key.className = 'piano-key';
            key.dataset.midi = midi;
            key.dataset.note = name;

            // Note label
            const noteLabel = document.createElement('span');
            noteLabel.className = 'key-note';
            noteLabel.textContent = name;
            key.appendChild(noteLabel);

            // Keyboard binding label
            const binding = this._getKeyBinding(midi);
            if (binding) {
                const bindLabel = document.createElement('span');
                bindLabel.className = 'key-binding';
                bindLabel.textContent = binding.toUpperCase();
                key.appendChild(bindLabel);
            }

            this.container.appendChild(key);
            this.keys.set(midi, key);
        });

        // Second pass: create black keys positioned absolutely
        // We need to position black keys relative to their neighboring white keys
        for (let midi = startMidi; midi < endMidi; midi++) {
            const noteIndex = midi % 12;
            if (isBlackKey(noteIndex)) {
                const name = midiToName(midi);
                const key = document.createElement('div');
                key.className = 'piano-key-black';
                key.dataset.midi = midi;
                key.dataset.note = name;

                // Position: the black key sits between two white keys
                // Find the white key to the left
                const leftWhiteMidi = midi - 1;
                const leftWhiteIndex = whiteKeys.indexOf(leftWhiteMidi);

                if (leftWhiteIndex >= 0) {
                    // Calculate position as percentage
                    const whiteKeyWidth = 100 / whiteKeys.length;
                    const blackKeyWidth = whiteKeyWidth * 0.6;
                    const leftPos = (leftWhiteIndex + 1) * whiteKeyWidth - blackKeyWidth / 2;

                    key.style.left = `${leftPos}%`;
                    key.style.width = `${blackKeyWidth}%`;
                }

                // Note label
                const noteLabel = document.createElement('span');
                noteLabel.className = 'key-note';
                noteLabel.textContent = name;
                key.appendChild(noteLabel);

                // Keyboard binding
                const binding = this._getKeyBinding(midi);
                if (binding) {
                    const bindLabel = document.createElement('span');
                    bindLabel.className = 'key-binding';
                    bindLabel.textContent = binding.toUpperCase();
                    key.appendChild(bindLabel);
                }

                this.container.appendChild(key);
                this.keys.set(midi, key);
            }
        }
    }

    /**
     * Get the computer keyboard key that maps to a MIDI note.
     */
    _getKeyBinding(midi) {
        const baseMidi = (this.baseOctave + 1) * 12;
        const offset = midi - baseMidi;

        for (const [key, noteOffset] of Object.entries(WHITE_KEY_MAP)) {
            if (noteOffset === offset) return key;
        }
        for (const [key, noteOffset] of Object.entries(BLACK_KEY_MAP)) {
            if (noteOffset === offset) return key;
        }
        return null;
    }

    /**
     * Bind all interaction events.
     */
    _bindEvents() {
        // === Mouse Events ===
        this.container.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this._isMouseDown = true;
            const key = this._getKeyFromPoint(e.clientX, e.clientY);
            if (key) this._activateKey(key, 'mouse');
        });

        document.addEventListener('mousemove', (e) => {
            if (!this._isMouseDown) return;
            const key = this._getKeyFromPoint(e.clientX, e.clientY);
            // Deactivate keys no longer under mouse
            for (const midi of this.activeMouseKeys) {
                const el = this.keys.get(midi);
                if (el && el !== key) {
                    this._deactivateKey(midi, 'mouse');
                }
            }
            if (key) this._activateKey(key, 'mouse');
        });

        document.addEventListener('mouseup', () => {
            if (!this._isMouseDown) return;
            this._isMouseDown = false;
            for (const midi of [...this.activeMouseKeys]) {
                this._deactivateKey(midi, 'mouse');
            }
        });

        // === Touch Events (multi-touch support) ===
        this.container.addEventListener('touchstart', (e) => {
            e.preventDefault();
            for (const touch of e.changedTouches) {
                const key = this._getKeyFromPoint(touch.clientX, touch.clientY);
                if (key) this._activateTouchKey(key, touch.identifier);
            }
        }, { passive: false });

        this.container.addEventListener('touchmove', (e) => {
            e.preventDefault();
            for (const touch of e.changedTouches) {
                const key = this._getKeyFromPoint(touch.clientX, touch.clientY);
                const prevMidi = this.activeTouchKeys.get(touch.identifier);

                if (key) {
                    const midi = parseInt(key.dataset.midi);
                    if (prevMidi !== midi) {
                        if (prevMidi !== undefined) {
                            this._deactivateKey(prevMidi, 'touch', touch.identifier);
                        }
                        this._activateTouchKey(key, touch.identifier);
                    }
                } else if (prevMidi !== undefined) {
                    this._deactivateKey(prevMidi, 'touch', touch.identifier);
                }
            }
        }, { passive: false });

        this.container.addEventListener('touchend', (e) => {
            e.preventDefault();
            for (const touch of e.changedTouches) {
                const midi = this.activeTouchKeys.get(touch.identifier);
                if (midi !== undefined) {
                    this._deactivateKey(midi, 'touch', touch.identifier);
                }
            }
        }, { passive: false });

        this.container.addEventListener('touchcancel', (e) => {
            for (const touch of e.changedTouches) {
                const midi = this.activeTouchKeys.get(touch.identifier);
                if (midi !== undefined) {
                    this._deactivateKey(midi, 'touch', touch.identifier);
                }
            }
        });

        // === Keyboard Events ===
        this._keyboardHandler = (e) => this._handleKeyboard(e);
        this._keyboardUpHandler = (e) => this._handleKeyboardUp(e);
        document.addEventListener('keydown', this._keyboardHandler);
        document.addEventListener('keyup', this._keyboardUpHandler);
    }

    /**
     * Get the piano key element at a given screen point.
     * Prioritize black keys (higher z-index).
     */
    _getKeyFromPoint(x, y) {
        // Use elementsFromPoint to get all elements at the point
        const elements = document.elementsFromPoint(x, y);
        // Prioritize black keys
        for (const el of elements) {
            if (el.classList.contains('piano-key-black')) return el;
        }
        for (const el of elements) {
            if (el.classList.contains('piano-key')) return el;
        }
        return null;
    }

    _activateKey(keyEl, source) {
        const midi = parseInt(keyEl.dataset.midi);
        if (this.activeKeys.has(midi)) return;

        this.activeKeys.add(midi);
        if (source === 'mouse') this.activeMouseKeys.add(midi);

        keyEl.classList.add('active');

        const freq = midiToFreq(midi);
        const noteId = midiToName(midi);
        this.callbacks.noteOn(noteId, freq);
    }

    _activateTouchKey(keyEl, touchId) {
        const midi = parseInt(keyEl.dataset.midi);
        this.activeTouchKeys.set(touchId, midi);

        if (this.activeKeys.has(midi)) return;
        this.activeKeys.add(midi);

        keyEl.classList.add('active');

        const freq = midiToFreq(midi);
        const noteId = midiToName(midi);
        this.callbacks.noteOn(noteId, freq);
    }

    _deactivateKey(midi, source, touchId) {
        if (source === 'mouse') {
            this.activeMouseKeys.delete(midi);
        }
        if (source === 'touch' && touchId !== undefined) {
            this.activeTouchKeys.delete(touchId);
        }

        // Only truly deactivate if no other source is holding this key
        if (this.activeMouseKeys.has(midi)) return;
        for (const [, m] of this.activeTouchKeys) {
            if (m === midi) return;
        }
        // Check keyboard
        // (keyboard active keys are tracked separately by the active set check below)

        this.activeKeys.delete(midi);
        const keyEl = this.keys.get(midi);
        if (keyEl) keyEl.classList.remove('active');

        const noteId = midiToName(midi);
        this.callbacks.noteOff(noteId);
    }

    /**
     * Handle computer keyboard note-on.
     */
    _handleKeyboard(e) {
        if (e.repeat) return;
        const k = e.key.toLowerCase();

        // Octave shift
        if (k === 'z') {
            this.shiftOctave(-1);
            return;
        }
        if (k === 'x') {
            this.shiftOctave(1);
            return;
        }

        const offset = WHITE_KEY_MAP[k] ?? BLACK_KEY_MAP[k];
        if (offset === undefined) return;

        const baseMidi = (this.baseOctave + 1) * 12;
        const midi = baseMidi + offset;

        if (this.activeKeys.has(midi)) return;
        this.activeKeys.add(midi);

        const keyEl = this.keys.get(midi);
        if (keyEl) keyEl.classList.add('active');

        const freq = midiToFreq(midi);
        const noteId = midiToName(midi);
        this.callbacks.noteOn(noteId, freq);
    }

    /**
     * Handle computer keyboard note-off.
     */
    _handleKeyboardUp(e) {
        const k = e.key.toLowerCase();
        const offset = WHITE_KEY_MAP[k] ?? BLACK_KEY_MAP[k];
        if (offset === undefined) return;

        const baseMidi = (this.baseOctave + 1) * 12;
        const midi = baseMidi + offset;

        this.activeKeys.delete(midi);
        const keyEl = this.keys.get(midi);
        if (keyEl) keyEl.classList.remove('active');

        const noteId = midiToName(midi);
        this.callbacks.noteOff(noteId);
    }

    /**
     * Shift the base octave and rebuild the keyboard.
     */
    shiftOctave(delta) {
        const newOctave = this.baseOctave + delta;
        if (newOctave < 1 || newOctave > 7) return;

        // Release all active notes first
        for (const midi of [...this.activeKeys]) {
            const noteId = midiToName(midi);
            this.callbacks.noteOff(noteId);
        }
        this.activeKeys.clear();
        this.activeMouseKeys.clear();
        this.activeTouchKeys.clear();

        this.baseOctave = newOctave;
        this._buildKeyboard();

        // Update display
        const display = document.getElementById('octave-display');
        if (display) display.textContent = `C${this.baseOctave}`;
    }

    getActiveNoteCount() {
        return this.activeKeys.size;
    }

    destroy() {
        document.removeEventListener('keydown', this._keyboardHandler);
        document.removeEventListener('keyup', this._keyboardUpHandler);
    }
}
