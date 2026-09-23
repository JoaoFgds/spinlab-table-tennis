import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BALL, HURRICANE_3_NEO_40, TABLE, impact, incomingState, simulateFlight, type Scenario, type Vec3 } from './physics';
import './style.css';

const initial: Scenario = {
  incomingSpeed: 5,
  incomingVerticalSpeed: -0.3,
  topSpinRpm: 1800,
  sideSpinRpm: 0,
  faceTiltDeg: 8,
  faceYawDeg: 0,
  racketSpeed: 0.3,
  brushVerticalSpeed: 0,
  brushLateralSpeed: 0,
};
const scenario = { ...initial };

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="topbar"><div class="brand"><span class="brand-mark">◉</span><span>SPIN<span class="brand-light">LAB</span></span></div><span class="top-note">LABORATÓRIO DE RECEPÇÃO · PoC 0.1</span></header>
  <main class="layout">
    <section class="stage-panel">
      <div class="stage-head"><div><span class="eyebrow">SIMULAÇÃO INTERATIVA</span><h1>O giro encontra a raquete.</h1><p>Explore como o ângulo da face e a velocidade do movimento mudam a devolução.</p></div><button id="reset" class="secondary">Restaurar cenário</button></div>
      <div class="stage" id="stage"><div class="scene-hint">Arraste para girar · role para ampliar</div><div class="legend"><span><i class="dot incoming"></i> Bola recebida</span><span><i class="dot outgoing"></i> Devolução</span><span><i class="dot impact"></i> Primeiro quique</span></div></div>
      <div class="playback"><button id="play" class="primary">▶ Reproduzir</button><input id="time" aria-label="Tempo da animação" type="range" min="0" max="1000" value="0"/><span id="time-value">0,00 s</span></div>
      <div class="metrics"><div><span>SAÍDA</span><strong id="speed-out">—</strong><small>m/s</small></div><div><span>GIRO VERTICAL</span><strong id="top-out">—</strong><small>RPM</small></div><div><span>GIRO LATERAL</span><strong id="side-out">—</strong><small>RPM</small></div><div><span>CONTATO</span><strong id="contact-mode">—</strong><small>modelo de impulso</small></div></div>
      <div id="notice" class="notice"></div>
    </section>
    <aside class="controls"><div class="controls-intro"><span class="eyebrow">PARÂMETROS</span><h2>Configure a jogada</h2><p>Valores positivos de giro vertical representam topspin neste sistema de coordenadas.</p></div>
      <div class="control-group"><h3>01 · Bola recebida</h3><div id="ball-controls"></div></div>
      <div class="control-group"><h3>02 · Movimento da raquete</h3><div id="racket-controls"></div></div>
      <div class="material"><span class="material-kicker">BORRACHA · AMBOS OS LADOS</span><strong>Hurricane 3 Neo Provincial</strong><span>Blue Sponge · 40°</span><p>Os coeficientes de contato atuais são ilustrativos. A borracha está identificada no modelo para futura calibração experimental.</p></div>
    </aside>
  </main>
`;

type Control = { key: keyof Scenario; label: string; min: number; max: number; step: number; unit: string };
const ballControls: Control[] = [
  { key: 'incomingSpeed', label: 'Velocidade da bola', min: 1, max: 12, step: 0.1, unit: 'm/s' },
  { key: 'incomingVerticalSpeed', label: 'Componente vertical', min: -3, max: 3, step: 0.1, unit: 'm/s' },
  { key: 'topSpinRpm', label: 'Topspin ↔ backspin', min: -5000, max: 5000, step: 50, unit: 'RPM' },
  { key: 'sideSpinRpm', label: 'Sidespin', min: -5000, max: 5000, step: 50, unit: 'RPM' },
];
const racketControls: Control[] = [
  { key: 'faceTiltDeg', label: 'Inclinação da face', min: -45, max: 45, step: 1, unit: '°' },
  { key: 'faceYawDeg', label: 'Ângulo lateral', min: -45, max: 45, step: 1, unit: '°' },
  { key: 'racketSpeed', label: 'Velocidade para a bola', min: -2, max: 6, step: 0.1, unit: 'm/s' },
  { key: 'brushVerticalSpeed', label: 'Escovada vertical', min: -6, max: 6, step: 0.1, unit: 'm/s' },
  { key: 'brushLateralSpeed', label: 'Escovada lateral', min: -6, max: 6, step: 0.1, unit: 'm/s' },
];
function addControls(hostId: string, controls: Control[]) {
  const host = document.querySelector<HTMLDivElement>(`#${hostId}`)!;
  for (const c of controls) {
    const row = document.createElement('label');
    row.className = 'control';
    row.innerHTML = `<span class="control-title"><span>${c.label}</span><output></output></span><input type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${scenario[c.key]}" />`;
    const slider = row.querySelector('input')!;
    const output = row.querySelector('output')!;
    const refresh = () => { output.textContent = `${Number(slider.value).toLocaleString('pt-BR')} ${c.unit}`; };
    refresh();
    slider.addEventListener('input', () => { scenario[c.key] = Number(slider.value); refresh(); updateSimulation(); });
    host.append(row);
  }
}
addControls('ball-controls', ballControls);
addControls('racket-controls', racketControls);

const stage = document.querySelector<HTMLDivElement>('#stage')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#101c2a');
const camera = new THREE.PerspectiveCamera(43, 1, 0.01, 30);
camera.up.set(0, 0, 1);
camera.position.set(3.55, -4.2, 3.1);
camera.lookAt(0, 0, 0.08);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.prepend(renderer.domElement);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 0, 0.08);
orbit.enableDamping = true;
orbit.minDistance = 1.4;
orbit.maxDistance = 9;
orbit.update();
scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x2a4254, 2.3));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(1, -1, 4);
scene.add(sun);

const table = new THREE.Mesh(new THREE.BoxGeometry(TABLE.length, TABLE.width, 0.045), new THREE.MeshStandardMaterial({ color: '#0c6776', roughness: 0.75 }));
table.position.z = -0.0225;
scene.add(table);
const lineMat = new THREE.LineBasicMaterial({ color: '#dceff0' });
function line(points: Vec3[], material = lineMat) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
  const object = new THREE.Line(geometry, material);
  scene.add(object);
  return object;
}
const hx = TABLE.length / 2 - 0.02, hy = TABLE.width / 2 - 0.02;
line([[-hx,-hy,0.003],[hx,-hy,0.003],[hx,hy,0.003],[-hx,hy,0.003],[-hx,-hy,0.003]]);
const net = new THREE.Mesh(new THREE.PlaneGeometry(TABLE.width + 0.08, TABLE.netHeight), new THREE.MeshBasicMaterial({ color: '#c1dbe3', transparent: true, opacity: 0.37, side: THREE.DoubleSide }));
net.rotation.y = Math.PI / 2;
net.position.z = TABLE.netHeight / 2;
scene.add(net);
line([[0,-TABLE.width/2, TABLE.netHeight],[0,TABLE.width/2,TABLE.netHeight]], new THREE.LineBasicMaterial({ color: '#e4f8ff' }));
const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL.radius, 24, 16), new THREE.MeshStandardMaterial({ color: '#ffdc85', emissive: '#c9661a', emissiveIntensity: 0.24, roughness: 0.65 }));
scene.add(ball);
const racket = new THREE.Mesh(new THREE.CircleGeometry(0.115, 48), new THREE.MeshStandardMaterial({ color: '#e95f55', roughness: 0.9, side: THREE.DoubleSide }));
scene.add(racket);
const bounce = new THREE.Mesh(new THREE.RingGeometry(0.027, 0.038, 32), new THREE.MeshBasicMaterial({ color: '#ffd577', side: THREE.DoubleSide }));
bounce.position.z = 0.004;
scene.add(bounce);
const grid = new THREE.GridHelper(5, 20, 0x24445b, 0x24445b);
grid.rotation.x = Math.PI / 2;
grid.position.z = -0.07;
scene.add(grid);

let outgoingPath: THREE.Line | null = null;
let incomingPath: THREE.Line | null = null;
let samples: ReturnType<typeof simulateFlight>['samples'] = [];
let playing = false;
let playbackStart = 0;
const timeSlider = document.querySelector<HTMLInputElement>('#time')!;
const timeValue = document.querySelector<HTMLElement>('#time-value')!;
const notice = document.querySelector<HTMLElement>('#notice')!;
const playButton = document.querySelector<HTMLButtonElement>('#play')!;

function setPlayback(t: number) {
  const end = samples.at(-1)?.t ?? 0;
  const clamped = Math.max(0, Math.min(end, t));
  timeSlider.value = end ? String(Math.round(clamped / end * 1000)) : '0';
  timeValue.textContent = `${clamped.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s`;
  const index = Math.min(samples.length - 1, Math.round(clamped / 0.002));
  if (samples[index]) ball.position.set(...samples[index].state.position);
}

function updateSimulation() {
  playing = false;
  playButton.textContent = '▶ Reproduzir';
  try {
    const result = impact(scenario);
    const flight = simulateFlight(result.state);
    samples = flight.samples;
    if (outgoingPath) scene.remove(outgoingPath);
    if (incomingPath) scene.remove(incomingPath);
    outgoingPath = line(samples.map(s => s.state.position), new THREE.LineBasicMaterial({ color: '#56dfcf' }));
    const before = incomingState(scenario);
    const incomingDirection = new THREE.Vector3(...before.velocity).normalize();
    const incomingStart = new THREE.Vector3(...before.position).addScaledVector(incomingDirection, -0.55);
    incomingPath = line([[incomingStart.x, incomingStart.y, incomingStart.z], before.position], new THREE.LineBasicMaterial({ color: '#ffa578' }));
    const contactPoint = new THREE.Vector3(...before.position).addScaledVector(new THREE.Vector3(...result.normal), -BALL.radius);
    racket.position.copy(contactPoint);
    racket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...result.normal));
    bounce.visible = !!flight.firstBounce;
    if (flight.firstBounce) bounce.position.set(flight.firstBounce[0], flight.firstBounce[1], 0.004);
    document.querySelector('#speed-out')!.textContent = Math.hypot(...result.state.velocity).toFixed(1);
    document.querySelector('#top-out')!.textContent = Math.round(result.state.spin[1] * 30 / Math.PI).toLocaleString('pt-BR');
    document.querySelector('#side-out')!.textContent = Math.round(result.state.spin[2] * 30 / Math.PI).toLocaleString('pt-BR');
    document.querySelector('#contact-mode')!.textContent = result.mode === 'grip' ? 'Aderência' : 'Deslizamento';
    const p = flight.firstBounce;
    const onTable = p && Math.abs(p[0]) <= TABLE.length / 2 && Math.abs(p[1]) <= TABLE.width / 2;
    notice.textContent = p ? `Primeiro toque: ${onTable ? 'na mesa' : 'fora da mesa'} · x ${p[0].toFixed(2)} m, y ${p[1].toFixed(2)} m. Coeficientes aerodinâmicos e de contato ainda não calibrados.` : 'A bola não tocou o plano da mesa no intervalo simulado.';
    notice.classList.remove('error');
    setPlayback(0);
  } catch (error) {
    samples = [];
    notice.textContent = error instanceof Error ? error.message : 'Cenário inválido.';
    notice.classList.add('error');
  }
}

playButton.addEventListener('click', () => {
  if (!samples.length) return;
  playing = !playing;
  playbackStart = performance.now() - Number(timeSlider.value) / 1000 * (samples.at(-1)?.t ?? 0) * 1000;
  playButton.textContent = playing ? 'Ⅱ Pausar' : '▶ Reproduzir';
});
timeSlider.addEventListener('input', () => { playing = false; playButton.textContent = '▶ Reproduzir'; setPlayback(Number(timeSlider.value) / 1000 * (samples.at(-1)?.t ?? 0)); });
document.querySelector('#reset')!.addEventListener('click', () => {
  Object.assign(scenario, initial);
  for (const c of [...ballControls, ...racketControls]) {
    const group = ballControls.includes(c) ? '#ball-controls' : '#racket-controls';
    const rows = [...document.querySelectorAll(`${group} .control`)];
    const row = rows[[...(ballControls.includes(c) ? ballControls : racketControls)].indexOf(c)];
    const slider = row.querySelector('input')!;
    slider.value = String(scenario[c.key]);
    row.querySelector('output')!.textContent = `${Number(slider.value).toLocaleString('pt-BR')} ${c.unit}`;
  }
  updateSimulation();
});

const resize = () => {
  const width = stage.clientWidth, height = stage.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
};
new ResizeObserver(resize).observe(stage);
function animate(now: number) {
  requestAnimationFrame(animate);
  if (playing) {
    const t = (now - playbackStart) / 1000;
    setPlayback(t);
    if (t >= (samples.at(-1)?.t ?? 0)) { playing = false; playButton.textContent = '▶ Reproduzir'; }
  }
  orbit.update();
  renderer.render(scene, camera);
}
updateSimulation();
requestAnimationFrame(animate);
