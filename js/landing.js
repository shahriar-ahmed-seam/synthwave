/* SynthWave landing — nav state, reveals, counters, animated hero waveform. */
(function () {
  'use strict';

  // Nav scrolled state
  var nav = document.getElementById('lnav');
  function onScroll() { if (nav) nav.classList.toggle('scrolled', window.scrollY > 40); }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Year
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // Reveal on scroll
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.15 });
  document.querySelectorAll('.reveal').forEach(function (el, i) {
    el.style.transitionDelay = Math.min(i * 60, 300) + 'ms';
    io.observe(el);
  });

  // Animated counters
  var countIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var el = e.target, target = Number(el.dataset.count || '0'), start = performance.now(), dur = 1400;
      function tick(now) {
        var t = Math.min((now - start) / dur, 1), eased = 1 - Math.pow(1 - t, 3);
        el.textContent = String(Math.round(target * eased));
        if (t < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
      countIO.unobserve(el);
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('[data-count]').forEach(function (c) { countIO.observe(c); });

  // Hero waveform — layered sine waves scrolling like an oscilloscope trace
  var canvas = document.getElementById('hero-scope');
  if (canvas && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var ctx = canvas.getContext('2d'), W = 0, H = 0, dpr = 1;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    var waves = [
      { color: '#00e5ff', amp: 0.16, freq: 1.4, speed: 1.1, w: 2.2 },
      { color: '#ff00e5', amp: 0.11, freq: 2.6, speed: -1.6, w: 1.8 },
      { color: '#a855f7', amp: 0.07, freq: 4.1, speed: 2.2, w: 1.4 }
    ];
    var start = performance.now();
    function frame(now) {
      var t = (now - start) / 1000;
      ctx.clearRect(0, 0, W, H);
      var midY = H * 0.62;
      waves.forEach(function (wv) {
        ctx.beginPath();
        ctx.strokeStyle = wv.color;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = wv.w;
        ctx.shadowColor = wv.color;
        ctx.shadowBlur = 12;
        for (var x = 0; x <= W; x += 4) {
          var p = x / W;
          var env = Math.sin(p * Math.PI); // taper edges
          var y = midY + Math.sin(p * Math.PI * 2 * wv.freq + t * wv.speed) * H * wv.amp * env;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
})();
