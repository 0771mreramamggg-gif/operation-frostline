import * as THREE from 'three';

const $ = i => document.getElementById(i);
const keys = {}, cfg = { sens: 1, vol: 0.6, mute: false };
const touchDev = matchMedia('(pointer:coarse)').matches;
const clamp = (v, a = -1, b = 1) => Math.max(a, Math.min(b, v));
let state = 'loading', prev = 'menu', yaw = -0.7, pitch = 0, bobT = 0, tSec = 0, missionT = 0;
let oi = 0, hold = 0, got = 0, tagged = 0, shield = 100, energy = 100, cd = 0, rechargeT = 0, hurtT = 0, toastT = 0;
let cp = { x: 0, z: 10 }, tJump = false, tUse = false, tSprint = false, grounded = true;
const pos = new THREE.Vector3(), vel = new THREE.Vector3();

/* ---------- Renderer / scene ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
$('game').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const sky = new THREE.Color(0xa8bccf), dusk = new THREE.Color(0x6a7fa6), day = new THREE.Color(0xb4c8dc);
scene.background = sky;
scene.fog = new THREE.FogExp2(0xa8bccf, 0.005);
const cam = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 700);
cam.rotation.order = 'YXZ';
const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x445566, 0.9);
const sun = new THREE.DirectionalLight(0xfff0d8, 1.4);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, far: 260 });
scene.add(hemi, sun, sun.target);

let seed = 7; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const H0 = (x, z) => Math.sin(x * 0.03) * Math.cos(z * 0.025) * 3 + Math.sin(x * 0.11 + z * 0.07) * 0.4;
const LAKE = { x: -10, z: -35, r: 10, y: H0(-10, -35) };
const H = (x, z) => { const t = clamp((Math.hypot(x - LAKE.x, z - LAKE.z) - LAKE.r) / 8, 0, 1); return LAKE.y * (1 - t) + H0(x, z) * t; };

/* ---------- Objectives ---------- */
const OBJ = [
  { t: 'Reach the relay outpost', type: 'reach', pts: [[45, -35]] },
  { t: 'Recover equipment crates', type: 'collect', pts: [[-30, -15], [20, -70], [-55, -50]] },
  { t: 'Restore the power station', type: 'hold', pts: [[-45, -95]] },
  { t: 'Activate the comms beacon', type: 'hold', pts: [[30, -128]] }
];
const keyPts = [[0, 10], ...OBJ.flatMap(o => o.pts)];
const nearKey = (x, z, r) => keyPts.some(p => Math.hypot(p[0] - x, p[1] - z) < r);

/* ---------- Terrain, lake, mountains ---------- */
const g = new THREE.PlaneGeometry(500, 500, 150, 150); g.rotateX(-Math.PI / 2);
const pa = g.attributes.position;
for (let i = 0; i < pa.count; i++) pa.setY(i, H(pa.getX(i), pa.getZ(i)));
g.computeVertexNormals();
const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xf0f5fa, roughness: 0.92 }));
ground.receiveShadow = true; scene.add(ground);
const lake = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r, 40), new THREE.MeshStandardMaterial({ color: 0x9fd8f0, roughness: 0.08, metalness: 0.6 }));
lake.rotation.x = -Math.PI / 2; lake.position.set(LAKE.x, LAKE.y + 0.05, LAKE.z); lake.receiveShadow = true; scene.add(lake);
for (let i = 0; i < 16; i++) {
  const a = i / 16 * Math.PI * 2, h = 90 + R() * 60, r = 60 + R() * 40;
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), new THREE.MeshStandardMaterial({ color: 0x7c8ca0, flatShading: true }));
  m.position.set(Math.cos(a) * 275, h / 2 - 8, Math.sin(a) * 275);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.38, h * 0.38, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true }));
  cap.position.set(m.position.x, h * 0.81 - 8, m.position.z);
  scene.add(m, cap);
}

/* ---------- Colliders, trees, rocks ---------- */
const circ = [], boxes = [], dummy = new THREE.Object3D();
const TN = 220;
const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 2, 6), new THREE.MeshStandardMaterial({ color: 0x4a3626 }), TN);
const cone = new THREE.InstancedMesh(new THREE.ConeGeometry(1.8, 5, 8), new THREE.MeshStandardMaterial({ color: 0x1f4a3a, roughness: 0.8 }), TN);
const capS = new THREE.InstancedMesh(new THREE.ConeGeometry(1.3, 2.6, 8), new THREE.MeshStandardMaterial({ color: 0xffffff }), TN);
cone.castShadow = trunk.castShadow = true;
for (let i = 0, n = 0; n < TN && i < 2000; i++) {
  const x = (R() - 0.5) * 440, z = (R() - 0.5) * 440;
  if (nearKey(x, z, 9) || Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 3) continue;
  const k = 0.8 + R() * 0.9, y = H(x, z);
  const put = (m, yy, s) => { dummy.position.set(x, y + yy * k, z); dummy.scale.set(k * s, k * s, k * s); dummy.updateMatrix(); m.setMatrixAt(n, dummy.matrix); };
  put(trunk, 1, 1); put(cone, 4, 1); put(capS, 5.6, 1);
  circ.push({ x, z, r: 0.7 * k }); n++;
}
scene.add(trunk, cone, capS);
const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1), new THREE.MeshStandardMaterial({ color: 0x8a93a0, flatShading: true }), 70);
rocks.castShadow = true;
for (let i = 0, n = 0; n < 70 && i < 1000; i++) {
  const x = (R() - 0.5) * 440, z = (R() - 0.5) * 440, s = 0.6 + R() * 1.7;
  if (nearKey(x, z, 8) || Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 2) continue;
  dummy.position.set(x, H(x, z) + s * 0.3, z); dummy.scale.set(s, s * 0.7, s); dummy.rotation.set(R() * 3, R() * 3, 0); dummy.updateMatrix();
  rocks.setMatrixAt(n++, dummy.matrix); circ.push({ x, z, r: s * 0.9 });
}
dummy.rotation.set(0, 0, 0); scene.add(rocks);

/* ---------- Buildings and ruins ---------- */
const wallM = new THREE.MeshStandardMaterial({ color: 0x6b7480, roughness: 0.95 });
const roofM = new THREE.MeshStandardMaterial({ color: 0xe8eef5 });
function block(x, z, w, d, h, roof) {
  const y = H(x, z) - 0.5;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h + 0.5, d), wallM);
  m.position.set(x, y + (h + 0.5) / 2, z); m.castShadow = m.receiveShadow = true; scene.add(m);
  if (roof) { const r = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.45, d + 0.6), roofM); r.position.set(x, y + h + 0.7, z); r.castShadow = true; scene.add(r); }
  boxes.push({ x, z, hw: w / 2, hd: d / 2 });
}
block(50, -44, 10, 8, 4, true); block(-20, 22, 7, 6, 3.5, true); block(70, -85, 8, 7, 3.5, true); block(0, -60, 14, 10, 5, true);
block(-65, -40, 8, 0.7, 3, false); block(-60, -33, 0.7, 6, 2, false); block(-70, -46, 5, 0.7, 4, false); block(-52, -58, 0.7, 6, 2.5, false);
block(-45, -103, 8, 6, 5, true);
const panelM = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2200, emissiveIntensity: 1.2 });
const panel = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), panelM); panel.position.set(-45, H(-45, -100) + 2.5, -99.95); scene.add(panel);
const beaconM = new THREE.MeshStandardMaterial({ color: 0x112233, emissive: 0x113344, emissiveIntensity: 1 });
const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.7, 14, 8), wallM); tower.position.set(30, H(30, -132) + 7, -132); tower.castShadow = true;
const orb = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), beaconM); orb.position.set(30, H(30, -132) + 14.8, -132);
scene.add(tower, orb); circ.push({ x: 30, z: -132, r: 0.9 });

/* ---------- Crates, marker ---------- */
const crates = OBJ[1].pts.map(p => {
  const c = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 1), new THREE.MeshStandardMaterial({ color: 0xff9a1f, emissive: 0x663300 }));
  c.position.set(p[0], H(p[0], p[1]) + 0.5, p[1]); c.castShadow = true; c.userData.got = false; scene.add(c); return c;
});
const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 40, 16, 1, true),
  new THREE.MeshBasicMaterial({ color: 0x33e0ff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
scene.add(marker);

/* ---------- Snow ---------- */
const SN = 1500, sp = new Float32Array(SN * 3);
for (let i = 0; i < SN; i++) { sp[i * 3] = (Math.random() - 0.5) * 60; sp[i * 3 + 1] = Math.random() * 30; sp[i * 3 + 2] = (Math.random() - 0.5) * 60; }
const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
const cvs = document.createElement('canvas'); cvs.width = cvs.height = 32;
const cx = cvs.getContext('2d'), gr = cx.createRadialGradient(16, 16, 0, 16, 16, 16);
gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, 32, 32);
const snowPts = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.28, map: new THREE.CanvasTexture(cvs), transparent: true, depthWrite: false }));
snowPts.frustumCulled = false; scene.add(snowPts);
function snow(dt) {
  const a = sg.attributes.position.array, px = cam.position.x, py = cam.position.y, pz = cam.position.z;
  for (let i = 0; i < SN; i++) {
    const j = i * 3; a[j] += Math.sin(tSec + i) * 0.4 * dt + 1.2 * dt; a[j + 1] -= (2 + (i % 5) * 0.4) * dt;
    if (a[j] - px > 30) a[j] -= 60; else if (a[j] - px < -30) a[j] += 60;
    if (a[j + 2] - pz > 30) a[j + 2] -= 60; else if (a[j + 2] - pz < -30) a[j + 2] += 60;
    if (a[j + 1] < py - 12) a[j + 1] += 30; else if (a[j + 1] > py + 18) a[j + 1] -= 30;
  }
  sg.attributes.position.needsUpdate = true;
}

/* ---------- Drones ---------- */
const drones = [];
function setS(d, s) { d.state = s; d.mat.color.setHex(s === 'patrol' ? 0x33e0ff : s === 'investigate' ? 0xffb020 : 0x555b66); }
[[20, -20], [40, -60], [-20, -60], [-40, -80], [10, -100], [30, -112], [-40, -20]].forEach(([hx, hz]) => {
  const grp = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: 0x33e0ff });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), new THREE.MeshStandardMaterial({ color: 0x2b3440, metalness: 0.8, roughness: 0.3 }));
  body.scale.y = 0.6; body.castShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 8, 24), mat); ring.rotation.x = Math.PI / 2;
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), mat); eye.position.z = 0.55;
  grp.add(body, ring, eye); scene.add(grp);
  drones.push({ g: grp, ring, mat, hx, hz, a: R() * 6, state: 'patrol', t: 0 });
});
function updateDrones(dt) {
  let hit = false;
  const moving = Math.hypot(vel.x, vel.z) > 7;
  for (const d of drones) {
    const p = d.g.position, dx = pos.x - p.x, dz = pos.z - p.z, dist = Math.hypot(dx, dz);
    d.ring.rotation.z += dt * (d.state === 'disabled' ? 0.3 : 3);
    let tx = p.x, tz = p.z, spd = 0, ty = H(p.x, p.z) + 2.5 + Math.sin(tSec * 2 + d.a) * 0.3;
    if (d.state === 'disabled') { d.t -= dt; ty = H(p.x, p.z) + 0.6; if (d.t <= 0) setS(d, 'patrol'); }
    else {
      if (d.state === 'patrol') {
        d.a += dt * 0.3; tx = d.hx + Math.cos(d.a) * 12; tz = d.hz + Math.sin(d.a) * 12; spd = 3;
        if (dist < 9 || (moving && dist < 18)) { setS(d, 'investigate'); beep(300, 0.2, 'square', 0.08); }
      } else {
        tx = pos.x; tz = pos.z; spd = dist > 4 ? 6 : 0;
        if (dist > 32) setS(d, 'patrol');
        if (dist < 6 && Math.abs(pos.y - p.y) < 6) { shield -= 10 * dt; hit = true; }
      }
    }
    const ex = tx - p.x, ez = tz - p.z, el = Math.hypot(ex, ez) || 1;
    if (spd) { p.x += ex / el * spd * dt; p.z += ez / el * spd * dt; d.g.rotation.y = Math.atan2(ex, ez); }
    p.y += (ty - p.y) * Math.min(1, dt * 3);
  }
  if (hit) { hurtT = 3; $('flash').style.opacity = 0.7; } else { $('flash').style.opacity = 0; if (hurtT > 0) hurtT -= dt; else shield = Math.min(100, shield + 6 * dt); }
  if (shield <= 0) { shield = 100; respawn(); drones.forEach(d => d.state === 'investigate' && setS(d, 'patrol')); toast('SHIELD FAILURE — RETURNING TO CHECKPOINT'); }
}

/* ---------- Energy tagging ---------- */
const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x66f0ff, transparent: true, opacity: 0 }));
beam.frustumCulled = false;
const spark = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshBasicMaterial({ color: 0x66f0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending }));
scene.add(beam, spark);
const _d = new THREE.Vector3(), _v = new THREE.Vector3();
function fire() {
  if (state !== 'play' || energy < 35 || cd > 0) return;
  energy -= 35; cd = 0.6; rechargeT = 1.2;
  cam.getWorldDirection(_d);
  let best = null, bd = 45;
  for (const d of drones) {
    _v.copy(d.g.position).sub(cam.position); const l = _v.length();
    if (d.state !== 'disabled' && l < bd && _v.normalize().dot(_d) > 0.985) { best = d; bd = l; }
  }
  const end = best ? best.g.position.clone() : cam.position.clone().addScalar(0).add(_d.clone().multiplyScalar(40));
  const start = cam.position.clone().add(_d.clone().multiplyScalar(0.4)).add(new THREE.Vector3(0, -0.25, 0));
  beam.geometry.setFromPoints([start, end]); beam.material.opacity = 1; spark.position.copy(end); spark.material.opacity = 1;
  beep(900, 0.18, 'sawtooth', 0.12, -600);
  if (best) { setS(best, 'disabled'); best.t = 7; tagged++; beep(200, 0.4, 'triangle', 0.15, -100); toast('DRONE DISABLED'); }
}
function combat(dt) {
  cd = Math.max(0, cd - dt);
  if (rechargeT > 0) rechargeT -= dt; else energy = Math.min(100, energy + 14 * dt);
  beam.material.opacity = Math.max(0, beam.material.opacity - dt * 4);
  spark.material.opacity = Math.max(0, spark.material.opacity - dt * 3); spark.scale.setScalar(1 + (1 - spark.material.opacity) * 2);
}

/* ---------- Movement ---------- */
function resolve() {
  for (const c of circ) {
    const dx = pos.x - c.x, dz = pos.z - c.z, r = c.r + 0.4, d2 = dx * dx + dz * dz;
    if (d2 < r * r) { const d = Math.sqrt(d2) || 0.001; pos.x = c.x + dx / d * r; pos.z = c.z + dz / d * r; }
  }
  for (const b of boxes) {
    const cx2 = clamp(pos.x, b.x - b.hw, b.x + b.hw), cz2 = clamp(pos.z, b.z - b.hd, b.z + b.hd);
    const dx = pos.x - cx2, dz = pos.z - cz2, d = Math.hypot(dx, dz);
    if (d < 0.4) {
      if (d > 1e-4) { pos.x = cx2 + dx / d * 0.4; pos.z = cz2 + dz / d * 0.4; }
      else { const px = b.hw - Math.abs(pos.x - b.x), pz = b.hd - Math.abs(pos.z - b.z);
        if (px < pz) pos.x += (pos.x >= b.x ? 1 : -1) * (px + 0.4); else pos.z += (pos.z >= b.z ? 1 : -1) * (pz + 0.4); }
    }
  }
}
const joy = { x: 0, y: 0 };
function move(dt) {
  let f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - joy.y;
  let s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joy.x;
  const l = Math.hypot(f, s); if (l > 1) { f /= l; s /= l; }
  const sprint = (keys.ShiftLeft || keys.ShiftRight || tSprint) && f > 0;
  const spd = sprint ? 9 : 5.2, sn = Math.sin(yaw), cs = Math.cos(yaw), k = Math.min(1, dt * 10);
  vel.x += ((-sn * f + cs * s) * spd - vel.x) * k; vel.z += ((-cs * f - sn * s) * spd - vel.z) * k;
  vel.y -= 24 * dt;
  if ((keys.Space || tJump) && grounded) { vel.y = 8; grounded = false; }
  pos.x = clamp(pos.x + vel.x * dt, -235, 235); pos.z = clamp(pos.z + vel.z * dt, -235, 235); resolve();
  pos.y += vel.y * dt;
  const gy = H(pos.x, pos.z) + 1.7;
  if (pos.y <= gy) { pos.y = gy; vel.y = 0; grounded = true; } else grounded = false;
  const spdNow = Math.hypot(vel.x, vel.z);
  if (grounded) bobT += dt * spdNow * 1.5;
  cam.position.set(pos.x, pos.y + Math.sin(bobT) * 0.05 * Math.min(1, spdNow / 5), pos.z);
  cam.rotation.set(pitch, yaw, Math.sin(bobT * 0.5) * 0.004 * Math.min(1, spdNow / 5));
}

/* ---------- Objectives ---------- */
function objective(dt) {
  const o = OBJ[oi], list = [];
  o.pts.forEach((p, i) => { if (!(o.type === 'collect' && crates[i].userData.got)) list.push({ x: p[0], z: p[1], i, d: Math.hypot(pos.x - p[0], pos.z - p[1]) }); });
  list.sort((a, b) => a.d - b.d);
  const t = list[0], use = keys.KeyE || tUse; let prompt = '', info = '';
  marker.position.set(t.x, H(t.x, t.z) + 20, t.z);
  if (o.type === 'reach') { info = 'Move to the marked location'; if (t.d < 4) return completeObj(); }
  else if (o.type === 'collect') {
    info = `Crates recovered: ${got}/${o.pts.length}`;
    if (t.d < 3) { prompt = 'PRESS E TO COLLECT EQUIPMENT'; if (use) { crates[t.i].userData.got = true; crates[t.i].visible = false; got++; beep(800, 0.15, 'sine', 0.2, 400); if (got >= o.pts.length) return completeObj(); } }
  } else {
    info = `${o.type === 'hold' && oi === 2 ? 'Power' : 'Beacon'} progress: ${Math.round(hold * 100)}%`;
    if (t.d < 4) { prompt = oi === 2 ? 'HOLD E TO RESTORE POWER' : 'HOLD E TO ACTIVATE BEACON'; if (use) hold += dt / 2.5; else hold = Math.max(0, hold - dt); if (hold >= 1) return completeObj(); }
    else hold = 0;
  }
  $('oN').textContent = `${oi + 1}/${OBJ.length}`; $('oT').textContent = o.t; $('oP').textContent = info;
  $('oD').textContent = `Distance: ${Math.round(t.d)} m`; $('prompt').textContent = prompt;
  $('pg').style.width = ((oi + (o.type === 'collect' ? got / o.pts.length : hold)) / OBJ.length * 100) + '%';
}
function completeObj() {
  beep(500, 0.3, 'sine', 0.25, 500); hold = 0; $('prompt').textContent = '';
  if (oi === 2) { panelM.emissive.setHex(0x22ff66); panelM.color.setHex(0x002210); }
  if (oi === 3) { beaconM.emissive.setHex(0x33e0ff); beaconM.emissiveIntensity = 3; oi++; $('pg').style.width = '100%'; return finish(); }
  oi++; cp = { x: pos.x, z: pos.z }; toast('OBJECTIVE COMPLETE — CHECKPOINT SAVED');
}
function finish() {
  state = 'complete'; document.exitPointerLock?.();
  const m = Math.floor(missionT / 60), s = String(Math.floor(missionT % 60)).padStart(2, '0');
  $('stats').textContent = `TIME ${m}:${s} · DRONES TAGGED ${tagged}`;
  setTimeout(() => state === 'complete' && show('complete'), 800);
}
function toast(t) { const e = $('toast'); e.textContent = t; e.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => e.style.opacity = 0, 2500); }

function respawn() { pos.set(cp.x, H(cp.x, cp.z) + 1.7, cp.z); vel.set(0, 0, 0); }
function reset() {
  oi = 0; hold = 0; got = 0; tagged = 0; missionT = 0; shield = 100; energy = 100; cd = 0; yaw = -0.7; pitch = 0;
  crates.forEach(c => { c.userData.got = false; c.visible = true; });
  panelM.emissive.setHex(0xff2200); panelM.color.setHex(0x220000); beaconM.emissive.setHex(0x113344); beaconM.emissiveIntensity = 1;
  drones.forEach(d => { d.g.position.set(d.hx, H(d.hx, d.hz) + 2.5, d.hz); setS(d, 'patrol'); });
  cp = { x: 0, z: 10 }; respawn();
}

/* ---------- Audio (procedural, never breaks the game) ---------- */
let ac, master;
function initAudio() {
  if (ac) { ac.resume?.(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.connect(ac.destination);
    const b = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(); src.buffer = b; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const wg = ac.createGain(); wg.gain.value = 0.3; src.connect(f); f.connect(wg); wg.connect(master); src.start();
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.12; lg.gain.value = 250; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    applyVol();
  } catch (e) { ac = null; }
}
function applyVol() { if (master) master.gain.value = cfg.mute ? 0 : cfg.vol; }
function beep(freq = 600, dur = 0.12, type = 'sine', vol = 0.2, slide = 0) {
  if (!ac || cfg.mute) return;
  try {
    const o = ac.createOscillator(), g2 = ac.createGain(), t = ac.currentTime;
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.linearRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g2.gain.setValueAtTime(vol, t); g2.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g2); g2.connect(master); o.start(t); o.stop(t + dur);
  } catch (e) { /* audio is optional */ }
}

/* ---------- UI / state ---------- */
const ovs = ['loading', 'menu', 'instr', 'settings', 'pause', 'complete'];
function show(id) {
  ovs.forEach(o => $(o).classList.toggle('show', o === id));
  $('hud').classList.toggle('on', id === null); document.body.classList.toggle('touch', touchDev && id === null);
}
function lock() { if (!touchDev) { try { const p = renderer.domElement.requestPointerLock(); p?.catch?.(() => {}); } catch (e) { /* ignore */ } } }
function resume() { state = 'play'; show(null); lock(); }
function pause() { if (state !== 'play') return; state = 'pause'; document.exitPointerLock?.(); show('pause'); }
const on = (id, f) => $(id).addEventListener('click', () => { initAudio(); beep(700, 0.08); f(); });
on('bStart', () => { reset(); resume(); });
on('bInstr', () => show('instr')); on('bIBack', () => show('menu'));
on('bSet', () => { prev = 'menu'; show('settings'); }); on('bPSet', () => { prev = 'pause'; show('settings'); }); on('bSBack', () => show(prev));
on('bResume', resume); on('bCP', () => { respawn(); resume(); }); on('bRestart', () => { reset(); resume(); });
on('bQuit', () => { state = 'menu'; show('menu'); }); on('bAgain', () => { reset(); resume(); });
$('sVol').oninput = e => { cfg.vol = e.target.value / 100; applyVol(); };
$('sSens').oninput = e => { cfg.sens = e.target.value / 100; };
$('sMute').onchange = e => { cfg.mute = e.target.checked; applyVol(); };
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== renderer.domElement && state === 'play' && !touchDev) pause(); });
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  if (e.code === 'KeyF') fire();
  if (e.code === 'KeyP') (state === 'play' ? pause() : null);
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
addEventListener('mousemove', e => {
  if (document.pointerLockElement !== renderer.domElement || state !== 'play') return;
  yaw -= e.movementX * 0.0022 * cfg.sens; pitch = clamp(pitch - e.movementY * 0.0022 * cfg.sens, -1.4, 1.4);
});
addEventListener('mousedown', e => { if (e.button === 0 && document.pointerLockElement === renderer.domElement) fire(); });
addEventListener('resize', () => { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

/* touch */
let jId = null, jx = 0, jy = 0, lId = null, lx = 0, ly = 0;
const cv = renderer.domElement;
cv.addEventListener('touchstart', e => { e.preventDefault(); for (const t of e.changedTouches) {
  if (t.clientX < innerWidth / 2 && jId === null) { jId = t.identifier; jx = t.clientX; jy = t.clientY; } else if (lId === null) { lId = t.identifier; lx = t.clientX; ly = t.clientY; } } }, { passive: false });
cv.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) {
  if (t.identifier === jId) { joy.x = clamp((t.clientX - jx) / 50); joy.y = clamp((t.clientY - jy) / 50); }
  else if (t.identifier === lId) { yaw -= (t.clientX - lx) * 0.005 * cfg.sens; pitch = clamp(pitch - (t.clientY - ly) * 0.005 * cfg.sens, -1.4, 1.4); lx = t.clientX; ly = t.clientY; } } }, { passive: false });
const tEnd = e => { for (const t of e.changedTouches) { if (t.identifier === jId) { jId = null; joy.x = joy.y = 0; } if (t.identifier === lId) lId = null; } };
cv.addEventListener('touchend', tEnd); cv.addEventListener('touchcancel', tEnd);
const hold2 = (id, set) => { const b = $(id); b.addEventListener('touchstart', e => { e.preventDefault(); set(true); }, { passive: false }); b.addEventListener('touchend', () => set(false)); b.addEventListener('touchcancel', () => set(false)); };
hold2('bJ', v => tJump = v); hold2('bU', v => tUse = v); hold2('bS', v => tSprint = v);
$('bT').addEventListener('touchstart', e => { e.preventDefault(); fire(); }, { passive: false });
$('bP').addEventListener('touchstart', e => { e.preventDefault(); pause(); }, { passive: false });

/* ---------- Main loop ---------- */
const clock = new THREE.Clock();
reset();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05); tSec += dt;
  const k = (Math.sin(tSec * 0.02) + 1) / 2;
  sky.copy(dusk).lerp(day, k); scene.fog.color.copy(sky); sun.intensity = 0.7 + k * 0.9; hemi.intensity = 0.5 + k * 0.5;
  if (state === 'play') {
    missionT += dt; move(dt); updateDrones(dt); if (state === 'play') objective(dt); combat(dt);
    $('sh').style.width = Math.max(0, shield) + '%'; $('en').style.width = energy + '%';
  } else if (state === 'menu' || state === 'loading') {
    cam.position.set(Math.cos(tSec * 0.1) * 55, 16, -30 + Math.sin(tSec * 0.1) * 55); cam.lookAt(0, 3, -30);
  }
  sun.position.set(cam.position.x + 60, cam.position.y + 80, cam.position.z + 30); sun.target.position.copy(cam.position);
  marker.visible = state === 'play'; marker.material.opacity = 0.22 + Math.sin(tSec * 3) * 0.08;
  snow(dt);
  renderer.render(scene, cam);
}
loop();
state = 'menu'; show('menu');
