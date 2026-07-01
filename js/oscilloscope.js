/**
 * SynthWave — Oscilloscope Component
 * 
 * Real-time audio visualization using Canvas API and requestAnimationFrame:
 * - Waveform mode: time-domain display with trigger detection
 * - Frequency mode: FFT spectrum analyzer with logarithmic scaling
 * - Lissajous mode: XY phase display
 * - Neon glow effect with configurable intensity
 * - Grid overlay with retro CRT aesthetic
 * - Zoom control
 */

export class Oscilloscope {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {AnalyserNode} analyserNode
     */
    constructor(canvas, analyserNode) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.analyser = analyserNode;

        // Settings
        this.mode = 'waveform'; // 'waveform' | 'frequency' | 'lissajous'
        this.zoom = 1;
        this.glowIntensity = 8;
        this.isRunning = false;

        // Buffers
        this.timeDomainData = new Uint8Array(analyserNode.fftSize);
        this.frequencyData = new Uint8Array(analyserNode.frequencyBinCount);

        // For Lissajous: we'll use left channel vs derived phase-shifted data
        this.prevTimeDomainData = new Uint8Array(analyserNode.fftSize);

        // Colors
        this.waveColor = '#00e5ff';
        this.freqColor = '#39ff14';
        this.lissajousColor = '#ff00e5';
        this.gridColor = 'rgba(50, 50, 80, 0.3)';
        this.gridColorBright = 'rgba(60, 60, 100, 0.5)';

        // Handle resize
        this._resizeObserver = new ResizeObserver(() => this._resize());
        this._resizeObserver.observe(this.canvas.parentElement);
        this._resize();

        // Animation
        this._animationId = null;
        this._lastFrameTime = 0;
    }

    _resize() {
        const dpr = window.devicePixelRatio || 1;
        // Use the canvas's own rendered size as the source of truth
        const displayWidth = this.canvas.clientWidth;
        const displayHeight = this.canvas.clientHeight;

        if (displayWidth === 0 || displayHeight === 0) return;

        this.canvas.width = displayWidth * dpr;
        this.canvas.height = displayHeight * dpr;

        this.width = this.canvas.width;
        this.height = this.canvas.height;
        this.dpr = dpr;
    }

    /**
     * Start the render loop.
     */
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this._draw();
    }

    /**
     * Stop the render loop.
     */
    stop() {
        this.isRunning = false;
        if (this._animationId) {
            cancelAnimationFrame(this._animationId);
            this._animationId = null;
        }
    }

    setMode(mode) {
        this.mode = mode;
    }

    setZoom(zoom) {
        this.zoom = zoom;
    }

    setGlow(intensity) {
        this.glowIntensity = intensity;
    }

    /**
     * Main render loop using requestAnimationFrame.
     */
    _draw() {
        if (!this.isRunning) return;
        this._animationId = requestAnimationFrame(() => this._draw());

        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        // Clear with slight fade for persistence effect
        ctx.fillStyle = 'rgba(6, 6, 16, 0.3)';
        ctx.fillRect(0, 0, w, h);

        // Draw grid
        this._drawGrid(ctx, w, h);

        // Get audio data
        this.analyser.getByteTimeDomainData(this.timeDomainData);
        this.analyser.getByteFrequencyData(this.frequencyData);

        // Draw based on mode
        switch (this.mode) {
            case 'waveform':
                this._drawWaveform(ctx, w, h);
                break;
            case 'frequency':
                this._drawFrequency(ctx, w, h);
                break;
            case 'lissajous':
                this._drawLissajous(ctx, w, h);
                break;
        }

        // Store previous data for Lissajous
        this.prevTimeDomainData.set(this.timeDomainData);
    }

    /**
     * Draw the retro grid overlay.
     */
    _drawGrid(ctx, w, h) {
        ctx.strokeStyle = this.gridColor;
        ctx.lineWidth = 1;

        // Vertical lines
        const vDivisions = 10;
        for (let i = 0; i <= vDivisions; i++) {
            const x = (i / vDivisions) * w;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }

        // Horizontal lines
        const hDivisions = 6;
        for (let i = 0; i <= hDivisions; i++) {
            const y = (i / hDivisions) * h;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // Center crosshairs (brighter)
        ctx.strokeStyle = this.gridColorBright;
        ctx.lineWidth = 1;

        // Horizontal center
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();

        // Vertical center
        ctx.beginPath();
        ctx.moveTo(w / 2, 0);
        ctx.lineTo(w / 2, h);
        ctx.stroke();
    }

    /**
     * Draw time-domain waveform with trigger detection and glow.
     */
    _drawWaveform(ctx, w, h) {
        const data = this.timeDomainData;
        const bufferLength = data.length;
        const zoom = this.zoom;

        // Simple trigger: find zero-crossing rising edge
        let triggerOffset = 0;
        const triggerLevel = 128;
        for (let i = 1; i < bufferLength - 1; i++) {
            if (data[i] <= triggerLevel && data[i + 1] > triggerLevel) {
                triggerOffset = i;
                break;
            }
        }

        // Number of samples to display (affected by zoom)
        const samplesToShow = Math.floor(bufferLength / zoom);

        // Glow effect
        if (this.glowIntensity > 0) {
            ctx.shadowBlur = this.glowIntensity * this.dpr;
            ctx.shadowColor = this.waveColor;
        }

        // Draw the waveform
        ctx.strokeStyle = this.waveColor;
        ctx.lineWidth = 2 * this.dpr;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();

        const sliceWidth = w / samplesToShow;
        let x = 0;
        let firstPoint = true;

        for (let i = 0; i < samplesToShow; i++) {
            const dataIndex = (triggerOffset + i) % bufferLength;
            const v = data[dataIndex] / 128.0; // 0..2, center at 1
            const y = (1 - (v - 1)) * (h / 2); // Map to canvas height

            if (firstPoint) {
                ctx.moveTo(x, y);
                firstPoint = false;
            } else {
                ctx.lineTo(x, y);
            }

            x += sliceWidth;
        }

        ctx.stroke();

        // Draw a dimmer secondary line for depth
        ctx.globalAlpha = 0.15;
        ctx.lineWidth = 6 * this.dpr;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 2 * this.dpr;

        // Reset shadow
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
    }

    /**
     * Draw frequency spectrum with logarithmic scaling and gradient bars.
     */
    _drawFrequency(ctx, w, h) {
        const data = this.frequencyData;
        const bufferLength = data.length;

        // Glow
        if (this.glowIntensity > 0) {
            ctx.shadowBlur = this.glowIntensity * 0.5 * this.dpr;
            ctx.shadowColor = this.freqColor;
        }

        // Use logarithmic frequency scaling for more musical display
        const minFreq = 20;
        const maxFreq = 20000;
        const sampleRate = this.analyser.context.sampleRate;
        const numBars = Math.min(128, Math.floor(w / (3 * this.dpr)));
        const barWidth = (w / numBars) - 1;

        for (let i = 0; i < numBars; i++) {
            // Logarithmic frequency mapping
            const logMin = Math.log10(minFreq);
            const logMax = Math.log10(maxFreq);
            const logFreq = logMin + (i / numBars) * (logMax - logMin);
            const freq = Math.pow(10, logFreq);

            // Map frequency to FFT bin
            const binIndex = Math.round(freq * bufferLength / (sampleRate / 2));
            const value = binIndex < bufferLength ? data[binIndex] : 0;

            const barHeight = (value / 255) * h * 0.9;
            const x = (i / numBars) * w;
            const y = h - barHeight;

            // Color gradient from green to cyan based on frequency
            const hue = 120 + (i / numBars) * 60; // green to cyan
            const lightness = 50 + (value / 255) * 20;

            // Create gradient for each bar
            const gradient = ctx.createLinearGradient(x, h, x, y);
            gradient.addColorStop(0, `hsla(${hue}, 100%, ${lightness}%, 0.8)`);
            gradient.addColorStop(1, `hsla(${hue}, 100%, ${lightness + 15}%, 0.4)`);

            ctx.fillStyle = gradient;
            ctx.fillRect(x, y, barWidth, barHeight);

            // Top cap
            ctx.fillStyle = `hsla(${hue}, 100%, 80%, 0.9)`;
            ctx.fillRect(x, y, barWidth, 2 * this.dpr);
        }

        // Reset shadow
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
    }

    /**
     * Draw Lissajous (XY) pattern — plots current sample vs phase-shifted sample.
     */
    _drawLissajous(ctx, w, h) {
        const data = this.timeDomainData;
        const prevData = this.prevTimeDomainData;
        const bufferLength = data.length;

        // Glow
        if (this.glowIntensity > 0) {
            ctx.shadowBlur = this.glowIntensity * this.dpr;
            ctx.shadowColor = this.lissajousColor;
        }

        ctx.strokeStyle = this.lissajousColor;
        ctx.lineWidth = 1.5 * this.dpr;
        ctx.lineJoin = 'round';
        ctx.beginPath();

        const centerX = w / 2;
        const centerY = h / 2;
        const scale = Math.min(w, h) * 0.4;

        let firstPoint = true;
        const step = Math.max(1, Math.floor(bufferLength / 1024));

        for (let i = 0; i < bufferLength; i += step) {
            // X axis: current data
            const xVal = (data[i] / 128.0) - 1;
            // Y axis: phase-shifted data (use previous frame or offset samples)
            const phaseOffset = Math.floor(bufferLength / 4);
            const yVal = (data[(i + phaseOffset) % bufferLength] / 128.0) - 1;

            const x = centerX + xVal * scale;
            const y = centerY + yVal * scale;

            if (firstPoint) {
                ctx.moveTo(x, y);
                firstPoint = false;
            } else {
                ctx.lineTo(x, y);
            }
        }

        ctx.stroke();

        // Dim echo
        ctx.globalAlpha = 0.1;
        ctx.lineWidth = 4 * this.dpr;
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Reset shadow
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
    }

    destroy() {
        this.stop();
        this._resizeObserver.disconnect();
    }
}
