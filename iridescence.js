// iridescence.js — animated iridescent background.
// A dependency-free raw-WebGL port of the Reactbits <Iridescence> component
// (originally built on ogl). Renders a full-screen fragment shader into the
// fixed #dot-bg canvas. If WebGL is unavailable, the CSS background shows instead.
(function () {
  const canvas = document.getElementById("dot-bg");
  if (!canvas) return;
  const gl =
    canvas.getContext("webgl", { antialias: true }) ||
    canvas.getContext("experimental-webgl");
  if (!gl) return;

  // Requested configuration.
  const COLOR = [0.36470588235294116, 0.8274509803921568, 0.6745098039215687];
  const SPEED = 0.5;
  const AMPLITUDE = 0.1;
  const MOUSE_REACT = false;

  const vertexSrc = `
    attribute vec2 uv;
    attribute vec2 position;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `;
  const fragmentSrc = `
    precision highp float;
    uniform float uTime;
    uniform vec3 uColor;
    uniform vec3 uResolution;
    uniform vec2 uMouse;
    uniform float uAmplitude;
    uniform float uSpeed;
    varying vec2 vUv;
    void main() {
      float mr = min(uResolution.x, uResolution.y);
      vec2 uv = (vUv.xy * 2.0 - 1.0) * uResolution.xy / mr;
      uv += (uMouse - vec2(0.5)) * uAmplitude;
      float d = -uTime * 0.5 * uSpeed;
      float a = 0.0;
      for (float i = 0.0; i < 8.0; ++i) {
        a += cos(i - d - a * uv.x);
        d += sin(uv.y * i + a);
      }
      d += uTime * 0.5 * uSpeed;
      vec3 col = vec3(cos(uv * vec2(d, a)) * 0.6 + 0.4, cos(a + d) * 0.5 + 0.5);
      col = cos(col * cos(vec3(d, a, 2.5)) * 0.5 + 0.5) * uColor;
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error("iridescence shader:", gl.getShaderInfoLog(sh));
    }
    return sh;
  }

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSrc));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSrc));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("iridescence link:", gl.getProgramInfoLog(program));
    return;
  }
  gl.useProgram(program);

  // Full-screen triangle (matches ogl's Triangle): one tri covering clip space.
  const positions = new Float32Array([-1, -1, 3, -1, -1, 3]);
  const uvs = new Float32Array([0, 0, 2, 0, 0, 2]);

  function bindAttrib(name, data) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }
  bindAttrib("position", positions);
  bindAttrib("uv", uvs);

  const u = (n) => gl.getUniformLocation(program, n);
  const uTime = u("uTime");
  const uResolution = u("uResolution");

  gl.uniform3f(u("uColor"), COLOR[0], COLOR[1], COLOR[2]);
  gl.uniform1f(u("uAmplitude"), AMPLITUDE);
  gl.uniform1f(u("uSpeed"), SPEED);
  const mouse = [0.5, 0.5];
  const uMouse = u("uMouse");
  gl.uniform2f(uMouse, mouse[0], mouse[1]);

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  function resize() {
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform3f(uResolution, w, h, w / h);
  }
  window.addEventListener("resize", resize);
  resize();

  if (MOUSE_REACT) {
    window.addEventListener(
      "mousemove",
      (e) => {
        mouse[0] = e.clientX / window.innerWidth;
        mouse[1] = 1 - e.clientY / window.innerHeight;
        gl.uniform2f(uMouse, mouse[0], mouse[1]);
      },
      { passive: true }
    );
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function frame(t) {
    gl.uniform1f(uTime, t * 0.001);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!reduceMotion) requestAnimationFrame(frame);
  }
  if (reduceMotion) {
    gl.uniform1f(uTime, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3); // single static frame
  } else {
    requestAnimationFrame(frame);
  }
})();
