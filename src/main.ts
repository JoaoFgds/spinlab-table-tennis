import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BALL, HURRICANE_3_NEO_40, TABLE, serveContact, simulateFlight, type Scenario, type Vec3 } from './physics';
import './style.css';

const initial: Scenario = {
  incomingSpeed: 4.8,
  incomingVerticalSpeed: -0.3,
  topSpinRpm: 900,
  sideSpinRpm: 0,
  faceTiltDeg: -5,
  faceYawDeg: 0,
  racketSpeed: 2.2,
  brushVerticalSpeed: 1.2,
  brushLateralSpeed: 0,
  contactHeight: 0.65,
};
const scenario = { ...initial };

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="topbar"><div class="brand"><span class="brand-mark">◉</span><span>SPIN<span class="brand-light">LAB</span></span></div><span class="top-note">LABORATÓRIO DE RECEPÇÃO · PoC 0.1</span></header>
  <main class="layout">
    <section class="stage-panel">
      <div class="stage-head"><div><span class="eyebrow">SIMULAÇÃO INTERATIVA</span><h1>Construa o saque.</h1><p>Observe o contato, o primeiro quique e a chegada da bola ao lado do recebedor.</p></div><button id="reset" class="secondary">Restaurar cenário</button></div>
      <div class="stage" id="stage"><div class="scene-hint">Arraste para girar · role para ampliar</div><div class="legend"><span><i class="dot incoming"></i> Lançamento</span><span><i class="dot outgoing"></i> Trajetória do saque</span><span><i class="dot impact"></i> Quiques</span></div></div>
      <div class="playback"><button id="play" class="primary">▶ Reproduzir</button><input id="time" aria-label="Tempo da animação" type="range" min="0" max="1000" value="0"/><span id="time-value">0,00 s</span></div>
      <div class="metrics"><div><span>SAÍDA</span><strong id="speed-out">—</strong><small>m/s</small></div><div><span>GIRO VERTICAL</span><strong id="top-out">—</strong><small>RPM</small></div><div><span>GIRO LATERAL</span><strong id="side-out">—</strong><small>RPM</small></div><div><span>CONTATO</span><strong id="contact-mode">—</strong><small>modelo de impulso</small></div></div>
      <div id="notice" class="notice"></div>
    </section>
    <aside class="controls"><div class="controls-intro"><span class="eyebrow">PARÂMETROS DO SAQUE</span><h2>Configure a jogada</h2><p>O contato começa no lado do servidor. Valores positivos de giro vertical representam topspin.</p></div>
      <div class="control-group"><h3>01 · Lançamento e giro</h3><div id="ball-controls"></div></div>
      <div class="control-group"><h3>02 · Contato da raquete</h3><div id="racket-controls"></div></div>
      <div class="material"><span class="material-kicker">BORRACHA · AMBOS OS LADOS</span><strong>Hurricane 3 Neo Provincial</strong><span>Blue Sponge · 40°</span><p>Os coeficientes de contato atuais são ilustrativos. A borracha está identificada no modelo para futura calibração experimental.</p></div>
    </aside>
  </main>
`;

type Control = { key: keyof Scenario; label: string; min: number; max: number; step: number; unit: string };
const ballControls: Control[] = [
  { key: 'incomingSpeed', label: 'Velocidade após contato', min: 1, max: 12, step: 0.1, unit: 'm/s' },
  { key: 'incomingVerticalSpeed', label: 'Componente vertical', min: -3, max: 3, step: 0.1, unit: 'm/s' },
  { key: 'topSpinRpm', label: 'Topspin ↔ backspin', min: -5000, max: 5000, step: 50, unit: 'RPM' },
  { key: 'sideSpinRpm', label: 'Sidespin', min: -5000, max: 5000, step: 50, unit: 'RPM' },
];
const racketControls: Control[] = [
  { key: 'contactHeight', label: 'Altura de contato', min: 0.4, max: 1.4, step: 0.01, unit: 'm' },
  { key: 'faceTiltDeg', label: 'Inclinação da face', min: -45, max: 45, step: 1, unit: '°' },
  { key: 'faceYawDeg', label: 'Ângulo lateral', min: -45, max: 45, step: 1, unit: '°' },
  { key: 'racketSpeed', label: 'Velocidade do golpe', min: 0, max: 8, step: 0.1, unit: 'm/s' },
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
    const result = serveContact(scenario);
    const flight = simulateFlight(result.state);
    samples = flight.samples;
    if (outgoingPath) scene.remove(outgoingPath);
    if (incomingPath) scene.remove(incomingPath);
    outgoingPath = line(samples.map(s => s.state.position), new THREE.LineBasicMaterial({ color: '#56dfcf' }));
    const contactPoint = new THREE.Vector3(...result.state.position);
    const incomingStart = contactPoint.clone().add(new THREE.Vector3(-0.18, 0, 0.12));
    incomingPath = line([[incomingStart.x, incomingStart.y, incomingStart.z], [contactPoint.x, contactPoint.y, contactPoint.z]], new THREE.LineBasicMaterial({ color: '#ffa578' }));
    racket.position.copy(contactPoint);
    racket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...result.normal));
    bounce.visible = flight.bounces.length > 0;
    if (flight.bounces[0]) bounce.position.set(flight.bounces[0][0], flight.bounces[0][1], 0.004);
    document.querySelector('#speed-out')!.textContent = Math.hypot(...result.state.velocity).toFixed(1);
    document.querySelector('#top-out')!.textContent = Math.round(result.state.spin[1] * 30 / Math.PI).toLocaleString('pt-BR');
    document.querySelector('#side-out')!.textContent = Math.round(result.state.spin[2] * 30 / Math.PI).toLocaleString('pt-BR');
    document.querySelector('#contact-mode')!.textContent = result.mode === 'grip' ? 'Aderência' : 'Deslizamento';
    const p = flight.bounces[0];
    const q = flight.bounces[1];
    const onTable = (point: Vec3 | undefined) => !!point && Math.abs(point[0]) <= TABLE.length / 2 && Math.abs(point[1]) <= TABLE.width / 2;
    notice.textContent = p ? `Quinques: ${onTable(p) ? 'servidor' : 'fora da mesa'}${q ? ` → ${onTable(q) ? 'recebedor' : 'fora da mesa'}` : ''} · primeiro toque x ${p[0].toFixed(2)} m. Coeficientes aerodinâmicos e de contato ainda não calibrados.` : 'O saque não tocou a mesa no intervalo simulado.';
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
