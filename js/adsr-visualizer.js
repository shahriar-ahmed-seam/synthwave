/**
 * SynthWave — ADSR Envelope Visualizer
 * 
 * Draws the ADSR envelope curve on a canvas with:
 * - Smooth bezier curves for attack, decay, sustain, release phases
 * - Labels and phase markers
 * - Real-time updates when knobs change
 * - Neon glow aesthetic matching the synth theme
 */

export class ADSRVisualizer {
    /**
     * @param {HTMLCanvasElement} canvas - The #adsr-canvas element
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // ADSR values (normalized for display)
        this.attack = 0.01;
        this.decay = 0.2;
        this.sustain = 0.7;
        this.release = 0.3;

        // Colors
        this.lineColor = '#39ff14';
        this.fillColor = 'rgba(57, 255, 20, 0.08)';
        this.phaseColor = 'rgba(57, 255, 20, 0.3)';
        this.textColor = 'rgba(150, 150, 180, 0.7)';
        this.gridColor = 'rgba(40, 40, 60, 0.4)';

        this._setupCanvas();
        this.draw();
    }

    _setupCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const displayWidth = this.canvas.clientWidth || 280;
        const displayHeight = this.canvas.clientHeight || 120;

        this.canvas.width = displayWidth * dpr;
        this.canvas.height = displayHeight * dpr;

        this.width = this.canvas.width;
        this.height = this.canvas.height;
        this.dpr = dpr;
    }

    /**
     * Update ADSR values and redraw.
     */
    update(attack, decay, sustain, release) {
        this.attack = attack;
        this.decay = decay;
        this.sustain = sustain;
        this.release = release;
        this.draw();
    }

    /**
     * Main draw routine.
     */
    draw() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        const pad = 16 * this.dpr;

        // Clear
        ctx.clearRect(0, 0, w, h);

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, 0, w, h);

        const drawW = w - pad * 2;
        const drawH = h - pad * 2;
        const baseY = pad + drawH; // Bottom line

        // Normalize times so the total fits the width
        // Reserve 30% for sustain hold phase
        const totalTime = this.attack + this.decay + this.release;
        const sustainWidth = drawW * 0.25;
        const envWidth = drawW - sustainWidth;

        const aW = totalTime > 0 ? (this.attack / totalTime) * envWidth : envWidth * 0.1;
        const dW = totalTime > 0 ? (this.decay / totalTime) * envWidth : envWidth * 0.2;
        const rW = totalTime > 0 ? (this.release / totalTime) * envWidth : envWidth * 0.3;

        const sustainLevel = this.sustain;

        // Key points
        const p0 = { x: pad, y: baseY }; // Start
        const p1 = { x: pad + aW, y: pad }; // Peak (after attack)
        const p2 = { x: pad + aW + dW, y: pad + drawH * (1 - sustainLevel) }; // Sustain start
        const p3 = { x: pad + aW + dW + sustainWidth, y: pad + drawH * (1 - sustainLevel) }; // Sustain end
        const p4 = { x: pad + aW + dW + sustainWidth + rW, y: baseY }; // Release end

        // Draw phase separator lines
        ctx.setLineDash([4 * this.dpr, 4 * this.dpr]);
        ctx.strokeStyle = this.phaseColor;
        ctx.lineWidth = 1;

        [p1, p2, p3].forEach(p => {
            ctx.beginPath();
            ctx.moveTo(p.x, pad);
            ctx.lineTo(p.x, baseY);
            ctx.stroke();
        });

        ctx.setLineDash([]);

        // Draw the ADSR curve with fill
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);

        // Attack: curved rise
        const aCpX = p0.x + aW * 0.3;
        const aCpY = p1.y;
        ctx.quadraticCurveTo(aCpX, aCpY, p1.x, p1.y);

        // Decay: exponential fall to sustain
        const dCpX = p1.x + dW * 0.3;
        const dCpY = p1.y;
        ctx.quadraticCurveTo(dCpX, dCpY, p2.x, p2.y);

        // Sustain: flat hold
        ctx.lineTo(p3.x, p3.y);

        // Release: exponential fall
        const rCpX = p3.x + rW * 0.3;
        const rCpY = p3.y;
        ctx.quadraticCurveTo(rCpX, rCpY, p4.x, p4.y);

        // Fill under curve
        ctx.lineTo(p4.x, baseY);
        ctx.lineTo(p0.x, baseY);
        ctx.closePath();

        ctx.fillStyle = this.fillColor;
        ctx.fill();

        // Draw the curve line with glow
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.quadraticCurveTo(aCpX, aCpY, p1.x, p1.y);
        ctx.quadraticCurveTo(dCpX, dCpY, p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.quadraticCurveTo(rCpX, rCpY, p4.x, p4.y);

        ctx.shadowBlur = 6 * this.dpr;
        ctx.shadowColor = this.lineColor;
        ctx.strokeStyle = this.lineColor;
        ctx.lineWidth = 2 * this.dpr;
        ctx.lineJoin = 'round';
        ctx.stroke();

        // Reset shadow
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';

        // Draw key points
        [p0, p1, p2, p3, p4].forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3 * this.dpr, 0, Math.PI * 2);
            ctx.fillStyle = this.lineColor;
            ctx.fill();
        });

        // Phase labels
        ctx.font = `${9 * this.dpr}px 'Orbitron', monospace`;
        ctx.fillStyle = this.textColor;
        ctx.textAlign = 'center';

        const labelY = baseY + 12 * this.dpr;
        ctx.fillText('A', (p0.x + p1.x) / 2, labelY);
        ctx.fillText('D', (p1.x + p2.x) / 2, labelY);
        ctx.fillText('S', (p2.x + p3.x) / 2, labelY);
        ctx.fillText('R', (p3.x + p4.x) / 2, labelY);
    }

    destroy() {
        // Nothing to clean up
    }
}
