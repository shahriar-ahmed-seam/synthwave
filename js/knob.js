/**
 * SynthWave — SVG Rotary Knob Component
 * 
 * Custom SVG-based rotary knob that:
 * - Renders an arc track, fill arc, center body, and indicator line
 * - Calculates mouse/touch drag angles for value control
 * - Supports logarithmic scaling (for frequency knobs)
 * - Supports stepped values (for octave selector)
 * - Double-click to reset to default
 * - Shows value tooltip on hover/drag
 */

export class RotaryKnob {
    /**
     * @param {HTMLElement} container - The .knob-container element
     * @param {Function} onChange - Callback (paramName, value) => void
     */
    constructor(container, onChange) {
        this.container = container;
        this.onChange = onChange;

        // Read config from data attributes
        this.paramName = container.dataset.param;
        this.min = parseFloat(container.dataset.min) || 0;
        this.max = parseFloat(container.dataset.max) || 1;
        this.defaultValue = parseFloat(container.dataset.value) || 0;
        this.step = container.dataset.step ? parseFloat(container.dataset.step) : null;
        this.label = container.dataset.label || '';
        this.isLog = container.dataset.log === 'true';

        this.value = this.defaultValue;

        // Knob geometry
        this.startAngle = 225;  // degrees, from top (0=top, CW)
        this.endAngle = -45;    // Full sweep = 270 degrees
        this.sweepDeg = 270;

        // Drag state
        this._isDragging = false;
        this._dragStartY = 0;
        this._dragStartValue = 0;

        // Build the SVG
        this._render();
        this._bindEvents();
        this._updateVisual();
    }

    /**
     * Create the SVG elements inside the container.
     */
    _render() {
        const size = this.container.classList.contains('small') ? 40 : 52;
        const cx = size / 2;
        const cy = size / 2;
        const radius = (size / 2) - 6;
        const bodyRadius = radius - 5;
        const trackWidth = 4;

        // SVG namespace
        const ns = 'http://www.w3.org/2000/svg';

        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
        svg.setAttribute('class', 'knob-svg');
        svg.setAttribute('width', size);
        svg.setAttribute('height', size);

        // Background track arc
        const trackPath = this._describeArc(cx, cy, radius, this.startAngle, this.endAngle, this.sweepDeg);
        const track = document.createElementNS(ns, 'path');
        track.setAttribute('d', trackPath);
        track.setAttribute('class', 'knob-track');
        track.setAttribute('stroke-width', trackWidth);
        svg.appendChild(track);

        // Fill arc (animated)
        const fillArc = document.createElementNS(ns, 'path');
        fillArc.setAttribute('d', trackPath);
        fillArc.setAttribute('class', 'knob-fill-arc');
        fillArc.setAttribute('stroke-width', trackWidth);
        svg.appendChild(fillArc);
        this._fillArc = fillArc;

        // Center body circle
        const body = document.createElementNS(ns, 'circle');
        body.setAttribute('cx', cx);
        body.setAttribute('cy', cy);
        body.setAttribute('r', bodyRadius);
        body.setAttribute('class', 'knob-body');
        svg.appendChild(body);

        // Indicator line
        const indicator = document.createElementNS(ns, 'line');
        indicator.setAttribute('class', 'knob-indicator');
        indicator.setAttribute('x1', cx);
        indicator.setAttribute('y1', cy);
        svg.appendChild(indicator);
        this._indicator = indicator;

        this._cx = cx;
        this._cy = cy;
        this._radius = radius;
        this._bodyRadius = bodyRadius;
        this._svg = svg;

        // Value display
        const valueEl = document.createElement('div');
        valueEl.className = 'knob-value';
        this._valueEl = valueEl;

        // Label
        const labelEl = document.createElement('div');
        labelEl.className = 'knob-label';
        labelEl.textContent = this.label;

        // Assemble
        this.container.innerHTML = '';
        this.container.appendChild(svg);
        this.container.appendChild(valueEl);
        this.container.appendChild(labelEl);
    }

    /**
     * Create an SVG arc path.
     * Angles: 0 = top, clockwise positive. Using standard SVG coordinate math.
     */
    _describeArc(cx, cy, r, startDeg, endDeg, sweepDeg) {
        const startRad = (startDeg - 90) * Math.PI / 180;
        const endRad = (startDeg - 90 - sweepDeg) * Math.PI / 180;

        const x1 = cx + r * Math.cos(startRad);
        const y1 = cy + r * Math.sin(startRad);
        const x2 = cx + r * Math.cos(endRad);
        const y2 = cy + r * Math.sin(endRad);

        const largeArc = sweepDeg > 180 ? 1 : 0;

        return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 0 ${x2} ${y2}`;
    }

    /**
     * Create a partial arc path from start to a given normalized position.
     */
    _describePartialArc(cx, cy, r, startDeg, sweepDeg, normalizedValue) {
        if (normalizedValue <= 0.001) return '';
        const actualSweep = sweepDeg * normalizedValue;
        const startRad = (startDeg - 90) * Math.PI / 180;
        const endRad = (startDeg - 90 - actualSweep) * Math.PI / 180;

        const x1 = cx + r * Math.cos(startRad);
        const y1 = cy + r * Math.sin(startRad);
        const x2 = cx + r * Math.cos(endRad);
        const y2 = cy + r * Math.sin(endRad);

        const largeArc = actualSweep > 180 ? 1 : 0;

        return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 0 ${x2} ${y2}`;
    }

    /**
     * Get the normalized value (0-1) from the actual value, considering log scale.
     */
    _getNormalized() {
        if (this.isLog) {
            const logMin = Math.log(this.min);
            const logMax = Math.log(this.max);
            return (Math.log(this.value) - logMin) / (logMax - logMin);
        }
        return (this.value - this.min) / (this.max - this.min);
    }

    /**
     * Convert normalized (0-1) to actual value, considering log scale.
     */
    _fromNormalized(norm) {
        norm = Math.max(0, Math.min(1, norm));
        if (this.isLog) {
            const logMin = Math.log(this.min);
            const logMax = Math.log(this.max);
            return Math.exp(logMin + norm * (logMax - logMin));
        }
        return this.min + norm * (this.max - this.min);
    }

    /**
     * Update the SVG visual to reflect current value.
     */
    _updateVisual() {
        const norm = this._getNormalized();

        // Update fill arc
        const fillPath = this._describePartialArc(
            this._cx, this._cy, this._radius,
            this.startAngle, this.sweepDeg, norm
        );
        this._fillArc.setAttribute('d', fillPath || 'M0 0');

        // Update indicator position
        const angleDeg = this.startAngle - norm * this.sweepDeg;
        const angleRad = (angleDeg - 90) * Math.PI / 180;
        const innerR = this._bodyRadius * 0.35;
        const outerR = this._bodyRadius * 0.85;

        this._indicator.setAttribute('x1', this._cx + innerR * Math.cos(angleRad));
        this._indicator.setAttribute('y1', this._cy + innerR * Math.sin(angleRad));
        this._indicator.setAttribute('x2', this._cx + outerR * Math.cos(angleRad));
        this._indicator.setAttribute('y2', this._cy + outerR * Math.sin(angleRad));

        // Update value display
        this._valueEl.textContent = this._formatValue(this.value);
    }

    /**
     * Format the value for display.
     */
    _formatValue(val) {
        if (this.paramName === 'filterCutoff') {
            return val >= 1000 ? (val / 1000).toFixed(1) + 'k' : Math.round(val) + '';
        }
        if (this.step && this.step >= 1) {
            return Math.round(val).toString();
        }
        if (Math.abs(val) < 0.01) return '0';
        if (Math.abs(val) >= 100) return Math.round(val).toString();
        if (Math.abs(val) >= 10) return val.toFixed(1);
        return val.toFixed(2);
    }

    /**
     * Bind mouse and touch events for drag interaction.
     */
    _bindEvents() {
        // Mouse down
        this.container.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this._startDrag(e.clientY);
        });

        // Touch start
        this.container.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this._startDrag(e.touches[0].clientY);
        }, { passive: false });

        // Mouse move/up on document (for drag outside element)
        this._onMouseMove = (e) => {
            if (!this._isDragging) return;
            e.preventDefault();
            this._onDrag(e.clientY);
        };

        this._onMouseUp = () => {
            if (!this._isDragging) return;
            this._endDrag();
        };

        this._onTouchMove = (e) => {
            if (!this._isDragging) return;
            e.preventDefault();
            this._onDrag(e.touches[0].clientY);
        };

        this._onTouchEnd = () => {
            if (!this._isDragging) return;
            this._endDrag();
        };

        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);
        document.addEventListener('touchmove', this._onTouchMove, { passive: false });
        document.addEventListener('touchend', this._onTouchEnd);

        // Double-click to reset
        this.container.addEventListener('dblclick', (e) => {
            e.preventDefault();
            this.setValue(this.defaultValue);
        });

        // Scroll wheel
        this.container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.02 : 0.02;
            const norm = this._getNormalized() + delta;
            let newVal = this._fromNormalized(norm);
            if (this.step) {
                newVal = Math.round(newVal / this.step) * this.step;
            }
            newVal = Math.max(this.min, Math.min(this.max, newVal));
            this.setValue(newVal);
        }, { passive: false });
    }

    _startDrag(y) {
        this._isDragging = true;
        this._dragStartY = y;
        this._dragStartNorm = this._getNormalized();
        this.container.classList.add('active');
        document.body.style.cursor = 'ns-resize';
    }

    _onDrag(y) {
        // Vertical drag: up = increase, down = decrease
        // Sensitivity: 200px of movement = full range
        const dy = this._dragStartY - y;
        const sensitivity = 200;
        let newNorm = this._dragStartNorm + dy / sensitivity;
        newNorm = Math.max(0, Math.min(1, newNorm));

        let newVal = this._fromNormalized(newNorm);

        // Snap to step if defined
        if (this.step) {
            newVal = Math.round(newVal / this.step) * this.step;
        }

        newVal = Math.max(this.min, Math.min(this.max, newVal));

        if (newVal !== this.value) {
            this.value = newVal;
            this._updateVisual();
            if (this.onChange) {
                this.onChange(this.paramName, this.value);
            }
        }
    }

    _endDrag() {
        this._isDragging = false;
        this.container.classList.remove('active');
        document.body.style.cursor = '';
    }

    /**
     * Programmatically set the value (e.g., from preset loading).
     */
    setValue(val) {
        val = Math.max(this.min, Math.min(this.max, val));
        if (this.step) {
            val = Math.round(val / this.step) * this.step;
        }
        this.value = val;
        this._updateVisual();
        if (this.onChange) {
            this.onChange(this.paramName, this.value);
        }
    }

    /**
     * Set value without triggering onChange (for UI sync).
     */
    setValueSilent(val) {
        val = Math.max(this.min, Math.min(this.max, val));
        if (this.step) {
            val = Math.round(val / this.step) * this.step;
        }
        this.value = val;
        this._updateVisual();
    }

    destroy() {
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('mouseup', this._onMouseUp);
        document.removeEventListener('touchmove', this._onTouchMove);
        document.removeEventListener('touchend', this._onTouchEnd);
    }
}

/**
 * Initialize all knobs in the document.
 * @param {Function} onChange - Callback (paramName, value) => void
 * @returns {Map<string, RotaryKnob>} Map of paramName -> knob instance
 */
export function initAllKnobs(onChange) {
    const knobs = new Map();
    const containers = document.querySelectorAll('.knob-container[data-param]');

    containers.forEach(container => {
        const knob = new RotaryKnob(container, onChange);
        knobs.set(knob.paramName, knob);
    });

    return knobs;
}
