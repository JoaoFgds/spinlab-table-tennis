// All positions are metres, velocities m/s, angular velocities rad/s, and time seconds.
export type Vec3 = readonly [number, number, number];
export type State = { position: Vec3; velocity: Vec3; spin: Vec3 };
export type Material = { name: string; restitution: number; staticFriction: number; kineticFriction: number };
export type Scenario = {
  incomingSpeed: number;
  incomingVerticalSpeed: number;
  topSpinRpm: number;
  sideSpinRpm: number;
  faceTiltDeg: number;
  faceYawDeg: number;
  racketSpeed: number;
  brushVerticalSpeed: number;
  brushLateralSpeed: number;
};
export type ContactResult = { state: State; normalImpulse: number; tangentialImpulse: number; mode: 'grip' | 'slip'; normal: Vec3 };
export type Sample = { t: number; state: State };
export type Flight = { samples: Sample[]; firstBounce: Vec3 | null };

export const BALL = { mass: 0.0027, radius: 0.02 } as const;
export const TABLE = { length: 2.74, width: 1.525, netHeight: 0.1525 } as const;
export const HURRICANE_3_NEO_40: Material = {
  name: 'Hurricane 3 Neo Provincial Blue Sponge 40°',
  // Exploratory values only. They are not measurements of this rubber.
  restitution: 0.76,
  staticFriction: 0.55,
  kineticFriction: 0.42,
};

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3) => Math.sqrt(dot(a, a));
const unit = (a: Vec3): Vec3 => norm(a) > 0 ? scale(a, 1 / norm(a)) : [0, 0, 0];
const rad = (degrees: number) => degrees * Math.PI / 180;
const rpmToRad = (rpm: number) => rpm * Math.PI / 30;
const inertia = (2 / 3) * BALL.mass * BALL.radius ** 2; // Thin-shell approximation.

export function racketNormal(tiltDeg: number, yawDeg: number): Vec3 {
  const pitch = rad(tiltDeg);
  const yaw = rad(yawDeg);
  return [-Math.cos(pitch) * Math.cos(yaw), -Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch)];
}

export function incomingState(s: Scenario): State {
  return {
    position: [0.95, 0, 0.26],
    velocity: [s.incomingSpeed, 0, s.incomingVerticalSpeed],
    spin: [0, rpmToRad(s.topSpinRpm), rpmToRad(s.sideSpinRpm)],
  };
}

export function impact(s: Scenario, material: Material = HURRICANE_3_NEO_40): ContactResult {
  const before = incomingState(s);
  const n = racketNormal(s.faceTiltDeg, s.faceYawDeg);
  const r = scale(n, -BALL.radius);
  const racketVelocity: Vec3 = [-s.racketSpeed, s.brushLateralSpeed, s.brushVerticalSpeed];
  const relative = sub(add(before.velocity, cross(before.spin, r)), racketVelocity);
  const normalSpeed = dot(relative, n);
  if (normalSpeed >= 0) throw new Error('A bola não está se aproximando da face da raquete.');
  const jn = -(1 + material.restitution) * normalSpeed * BALL.mass;
  const tangential = sub(relative, scale(n, normalSpeed));
  const tangentialMassInverse = 1 / BALL.mass + BALL.radius ** 2 / inertia;
  const gripImpulse = scale(tangential, -1 / tangentialMassInverse);
  const grip = norm(gripImpulse) <= material.staticFriction * jn;
  const jt = grip ? gripImpulse : scale(unit(tangential), -material.kineticFriction * jn);
  const impulse = add(scale(n, jn), jt);
  return {
    state: {
      position: before.position,
      velocity: add(before.velocity, scale(impulse, 1 / BALL.mass)),
      spin: add(before.spin, scale(cross(r, jt), 1 / inertia)),
    },
    normalImpulse: jn,
    tangentialImpulse: norm(jt),
    mode: grip ? 'grip' : 'slip',
    normal: n,
  };
}

// A deliberately simple flight model. Cd and Cl must be calibrated before quantitative use.
export function acceleration(state: State): Vec3 {
  const rho = 1.2;
  const area = Math.PI * BALL.radius ** 2;
  const cd = 0.47;
  const speed = norm(state.velocity);
  const drag = scale(state.velocity, -0.5 * rho * area * cd * speed / BALL.mass);
  const spinRatio = speed > 1e-8 ? BALL.radius * norm(state.spin) / speed : 0;
  const cl = Math.min(0.35, 0.12 * spinRatio);
  const magnusDirection = unit(cross(state.spin, state.velocity));
  const magnus = scale(magnusDirection, 0.5 * rho * area * cl * speed ** 2 / BALL.mass);
  return add([0, 0, -9.81], add(drag, magnus));
}

export function simulateFlight(start: State, duration = 1.2, dt = 0.002): Flight {
  const samples: Sample[] = [{ t: 0, state: start }];
  let state = start;
  let firstBounce: Vec3 | null = null;
  for (let i = 1; i <= Math.round(duration / dt); i++) {
    // Midpoint integration is stable enough for the initial visual PoC.
    const a0 = acceleration(state);
    const mid: State = {
      position: add(state.position, scale(state.velocity, dt / 2)),
      velocity: add(state.velocity, scale(a0, dt / 2)),
      spin: state.spin,
    };
    const next: State = {
      position: add(state.position, scale(mid.velocity, dt)),
      velocity: add(state.velocity, scale(acceleration(mid), dt)),
      spin: state.spin,
    };
    if (state.position[2] > BALL.radius && next.position[2] <= BALL.radius) {
      const fraction = (state.position[2] - BALL.radius) / (state.position[2] - next.position[2]);
      firstBounce = add(state.position, scale(sub(next.position, state.position), fraction));
      samples.push({ t: (i - 1 + fraction) * dt, state: { ...next, position: firstBounce } });
      break;
    }
    samples.push({ t: i * dt, state: next });
    state = next;
  }
  return { samples, firstBounce };
}
