<div align="center">

# 🎹 SynthWave

### A browser-native, 16-voice polyphonic synthesizer & real-time oscilloscope.

Dual oscillators, ADSR envelopes, a resonant multi-mode filter, studio effects,
a modulation LFO and a live oscilloscope — built entirely on the Web Audio API.
No plug-ins. No install. Just press a key.

[**Launch the Studio →**](https://synthwave-studio-amber.vercel.app/synth.html) · [Landing page](https://synthwave-studio-amber.vercel.app)

![Web Audio API](https://img.shields.io/badge/Web%20Audio%20API-native-00e5ff)
![Vanilla JS](https://img.shields.io/badge/JavaScript-ES%20Modules-f7df1e?logo=javascript&logoColor=black)
![Dependencies](https://img.shields.io/badge/runtime%20deps-0-22c55e)
![License](https://img.shields.io/badge/license-MIT-blue)

</div>

---

## Overview

SynthWave is a fully-featured subtractive synthesizer that runs entirely in the
browser. Every module — oscillators, envelopes, filter, effects and LFO — is a
real node on the Web Audio graph, wired and modulated in real time. There are no
audio libraries; it is vanilla JavaScript, Canvas and SVG.

Two surfaces ship in the project:

- **A cinematic landing page** (`/`) — the synthwave-styled front door.
- **The Studio** (`/synth.html`) — the full instrument.

> The Web Audio API requires a user gesture, so the studio opens with an
> **Initialize Audio Engine** button before it starts making sound.

## Features

| Module | Details |
|--------|---------|
| 🎛️ **Dual oscillators** | Sine / triangle / saw / square, per-osc detune, octave and level. |
| 🎚️ **Amp & filter ADSR** | Independent envelopes with an animated visualizer. |
| 🌫️ **Resonant filter** | Low-pass, high-pass, band-pass, notch — with envelope modulation. |
| ✨ **Studio effects** | Convolution reverb, feedback delay, stereo chorus. |
| 〰️ **LFO** | Route to pitch, filter, amplitude or pan (vibrato / tremolo / wobble). |
| 📈 **Oscilloscope** | Waveform, frequency-spectrum and Lissajous modes, zoom + glow. |
| 🎹 **Keyboard** | On-screen + computer keys, octave shifting, 16-voice meter. |
| 🎼 **8 presets** | Warm Pad, Bass Pluck, Lead Saw, Organ, Bell, Strings, Wobble Bass, Init. |

## Playing it

| Keys | Action |
|------|--------|
| `A` `S` `D` `F` `G` `H` `J` `K` `L` | White keys |
| `W` `E` `T` `Y` `U` `O` `P` | Black keys |
| `Z` / `X` | Shift octave down / up |

## Tech stack

- **Web Audio API** for all synthesis and DSP
- **Canvas 2D** for the oscilloscope & ADSR visualizer
- **SVG** for the rotary knobs
- Vanilla **ES Modules** — zero runtime dependencies

## Getting started

This is a **buildless static site** — no bundler required.

```bash
# serve locally (any static server works)
npm run dev            # → http://localhost:3000

# (optional) refresh landing imagery from Unsplash
cp .env.example .env.local        # add your UNSPLASH_ACCESS_KEY
npm run fetch:images
```

> Imagery is committed under `media/`, so the site works with **no** API key.

## Project structure

```
synthwave/
├── index.html            # cinematic landing page
├── synth.html            # the synthesizer studio
├── css/                  # main, knobs, piano, oscilloscope, controls, landing
├── js/
│   ├── audio-engine.js   # Web Audio synthesis + voice management
│   ├── oscilloscope.js   # canvas visualizer
│   ├── adsr-visualizer.js
│   ├── knob.js           # SVG rotary knobs
│   ├── piano.js          # interactive keyboard
│   ├── main.js           # app orchestrator
│   └── landing.js        # landing interactions
├── media/                # committed landing imagery
└── scripts/
    └── fetch-images.mjs  # build-time Unsplash pipeline
```

## Deployment

Deployed on [Vercel](https://vercel.com) as a static site. Any push to `main`
triggers an automatic production deploy.

## Credits

- Synthesis engine, UI and design — hand-built.
- Landing imagery — [Unsplash](https://unsplash.com) (see `media/credits.json`).

## License

[MIT](LICENSE) © Shahriar Ahmed
