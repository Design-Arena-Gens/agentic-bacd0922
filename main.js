import * as THREE from 'https://cdn.skypack.dev/three@0.158.0';
import { EffectComposer } from 'https://cdn.skypack.dev/three@0.158.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.skypack.dev/three@0.158.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://cdn.skypack.dev/three@0.158.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'https://cdn.skypack.dev/three@0.158.0/examples/jsm/postprocessing/BokehPass.js';

const CANVAS_TARGET_WIDTH = 3840;
const CANVAS_TARGET_HEIGHT = 2160;
const TARGET_FPS = 24;
const FRAME_INTERVAL = 1 / TARGET_FPS;

const canvas = document.getElementById('scene');
const overlay = document.getElementById('overlay');
const startButton = document.getElementById('start-button');
const sirenEl = document.getElementById('siren-audio');

let audioCtx;
let sirenGain;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
renderer.setSize(CANVAS_TARGET_WIDTH, CANVAS_TARGET_HEIGHT, false);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#000814');
scene.fog = new THREE.FogExp2('#001022', 0.055);

const camera = new THREE.PerspectiveCamera(42, CANVAS_TARGET_WIDTH / CANVAS_TARGET_HEIGHT, 0.1, 120);
camera.position.set(4.6, 1.78, 7.2);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(new THREE.Vector2(CANVAS_TARGET_WIDTH, CANVAS_TARGET_HEIGHT), 0.8, 0.9, 0.4);
bloomPass.threshold = 0.2;
bloomPass.strength = 0.95;
bloomPass.radius = 0.8;
composer.addPass(bloomPass);

const bokehPass = new BokehPass(scene, camera, {
  focus: 3.2,
  aperture: 0.0005,
  maxblur: 0.01,
  width: CANVAS_TARGET_WIDTH,
  height: CANVAS_TARGET_HEIGHT
});
composer.addPass(bokehPass);

const clock = new THREE.Clock();
let accumulator = 0;

const asphaltTexture = createAsphaltTexture();
asphaltTexture.wrapS = asphaltTexture.wrapT = THREE.RepeatWrapping;
asphaltTexture.repeat.set(12, 32);

const roughnessTexture = asphaltTexture.clone();

const normalTexture = createNormalTexture();
normalTexture.wrapS = normalTexture.wrapT = THREE.RepeatWrapping;
normalTexture.repeat.set(12, 32);

const streetGeometry = new THREE.PlaneGeometry(60, 160, 320, 320);
streetGeometry.rotateX(-Math.PI / 2);
addPuddleDisplacement(streetGeometry);

const streetMaterial = new THREE.MeshStandardMaterial({
  color: new THREE.Color('#081325').multiplyScalar(0.9),
  metalness: 0.92,
  roughness: 0.18,
  map: asphaltTexture,
  normalMap: normalTexture,
  roughnessMap: roughnessTexture,
  envMapIntensity: 1.4
});

const street = new THREE.Mesh(streetGeometry, streetMaterial);
street.receiveShadow = true;
scene.add(street);

const curbLeft = createCurb(60, 160, true);
const curbRight = createCurb(60, 160, false);
scene.add(curbLeft, curbRight);

const buildings = createBuildings();
scene.add(buildings);

const neonElements = createNeonElements();
scene.add(neonElements);

const steamGroup = createSteamPlumes();
scene.add(steamGroup);

const rainSystem = createRain();
scene.add(rainSystem);

const man = createWalker();
scene.add(man);

const lightRig = createLights();
scene.add(lightRig);

setupSirenAudio();

const backgroundSampler = new THREE.CubeTextureLoader().load([
  'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1495107334309-fcf20504a5ab?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1495107334309-fcf20504a5ab?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=800&q=80'
]);
backgroundSampler.mapping = THREE.CubeReflectionMapping;
scene.environment = backgroundSampler;

let cameraDrift = 0;

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  accumulator += delta;

  while (accumulator >= FRAME_INTERVAL) {
    updateScene(FRAME_INTERVAL);
    accumulator -= FRAME_INTERVAL;
  }

  composer.render();
}

function updateScene(delta) {
  const time = clock.elapsedTime;

  cameraDrift += delta;
  const sway = Math.sin(cameraDrift * 0.35) * 0.18;
  const bob = Math.sin(cameraDrift * 0.7) * 0.05;
  camera.position.lerp(new THREE.Vector3(3.8 + sway, 1.72 + bob, 5.4), 0.04);
  camera.lookAt(new THREE.Vector3(0, 1.6, man.position.z - 1.8));

  man.position.z -= delta * 0.85;
  if (man.position.z < -40) {
    man.position.z = 10;
  }

  man.userData.walkCycle(man, delta);

  rainSystem.rotation.y += delta * 0.02;
  rainSystem.userData.update(delta);

  steamGroup.children.forEach((plume) => {
    plume.userData.update(delta);
  });

  neonElements.children.forEach((child) => {
    if (child.userData && child.userData.pulse) {
      child.material.emissiveIntensity = 0.5 + Math.sin(time * child.userData.speed) * 0.4;
    }
  });

  streetMaterial.map.offset.y -= delta * 0.08;
  streetMaterial.normalMap.offset.y -= delta * 0.04;
  streetMaterial.roughnessMap.offset.y -= delta * 0.06;

  lightRig.userData.update(delta);
}

function createAsphaltTexture() {
  const size = 1024;
  const data = new Uint8Array(size * size * 3);
  const random = mulberry32(1245789);

  for (let i = 0; i < size * size; i++) {
    const stride = i * 3;
    const value = Math.pow(random(), 1.2) * 180 + Math.sin(i * 0.00013) * 12;
    data[stride] = value;
    data[stride + 1] = value * 0.92;
    data[stride + 2] = value * 0.85;
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBFormat);
  texture.needsUpdate = true;
  return texture;
}

function createNormalTexture() {
  const size = 512;
  const data = new Uint8Array(size * size * 3);
  const random = mulberry32(94321);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const stride = i * 3;
      const angle = random() * Math.PI * 2;
      const strength = random() * 0.6 + 0.4;
      data[stride] = (Math.cos(angle) * strength * 127 + 128) & 255;
      data[stride + 1] = (Math.sin(angle) * strength * 127 + 128) & 255;
      data[stride + 2] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBFormat);
  texture.needsUpdate = true;
  return texture;
}

function addPuddleDisplacement(geometry) {
  const random = mulberry32(458123);
  const position = geometry.attributes.position;
  const count = position.count;
  for (let i = 0; i < count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const puddle = Math.exp(-Math.pow((x + 2) * 0.4, 2) - Math.pow((z % 4) * 0.8, 2)) * 0.08;
    const ripple = Math.sin(z * 2 + random() * Math.PI * 2) * 0.004;
    position.setY(i, puddle + ripple);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

function createCurb(width, depth, leftSide) {
  const geometry = new THREE.BoxGeometry(2, 0.6, depth);
  const material = new THREE.MeshStandardMaterial({
    color: leftSide ? '#212d40' : '#141824',
    roughness: 0.45,
    metalness: 0.1
  });
  const curb = new THREE.Mesh(geometry, material);
  curb.position.set(leftSide ? -width / 2 - 0.8 : width / 2 + 0.8, 0.3, 0);
  curb.castShadow = true;
  return curb;
}

function createBuildings() {
  const group = new THREE.Group();
  const random = mulberry32(893);
  const palette = ['#11294d', '#1c1f3a', '#29316b'];
  const neonPalette = ['#a2d2ff', '#ffb703', '#6639a6'];

  for (let i = 0; i < 20; i++) {
    const width = random() * 2 + 1.5;
    const height = random() * 8 + 6;
    const depth = random() * 2 + 1.5;

    const geometry = new THREE.BoxGeometry(width, height, depth);
    const color = new THREE.Color(palette[Math.floor(random() * palette.length)]);
    color.offsetHSL((random() - 0.5) * 0.02, 0.05, (random() - 0.5) * 0.05);

    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: new THREE.Color(neonPalette[Math.floor(random() * neonPalette.length)]).multiplyScalar(random() * 0.05),
      roughness: 0.7,
      metalness: 0.2
    });

    const building = new THREE.Mesh(geometry, material);
    building.position.set(
      (random() > 0.5 ? 1 : -1) * (random() * 8 + 6),
      height / 2,
      random() * 90 - 40
    );
    building.castShadow = true;
    group.add(building);

    const windows = createWindowStreaks(width, height, depth);
    windows.position.copy(building.position);
    group.add(windows);
  }
  return group;
}

function createWindowStreaks(width, height, depth) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color: '#a2d2ff',
    transparent: true,
    opacity: 0.18
  });

  for (let y = 0; y < height * 1.2; y += 1.2) {
    const geo = new THREE.PlaneGeometry(width * 0.9, 0.12);
    const stripe = new THREE.Mesh(geo, material.clone());
    stripe.material.color.offsetHSL(Math.random() * 0.12, 0.5, Math.random() * 0.1);
    stripe.position.set(0, y - height / 2, depth / 2 + 0.01);
    group.add(stripe);

    const stripeBack = stripe.clone();
    stripeBack.position.set(0, y - height / 2, -depth / 2 - 0.01);
    stripeBack.rotateY(Math.PI);
    group.add(stripeBack);
  }

  return group;
}

function createNeonElements() {
  const group = new THREE.Group();

  const signGeo = new THREE.PlaneGeometry(3, 1);
  const signMat = new THREE.MeshBasicMaterial({
    color: '#6639a6',
    transparent: true,
    opacity: 0.9
  });
  const sign = new THREE.Mesh(signGeo, signMat);
  sign.position.set(-8, 3.2, -6);
  sign.userData = { pulse: true, speed: 1.4 };
  group.add(sign);

  const barGeo = new THREE.BoxGeometry(0.2, 5, 0.2);
  const barMat = new THREE.MeshStandardMaterial({
    color: '#a2d2ff',
    emissive: new THREE.Color('#a2d2ff'),
    emissiveIntensity: 1.8,
    metalness: 0.1,
    roughness: 0.4
  });
  const bar = new THREE.Mesh(barGeo, barMat);
  bar.position.set(6.2, 2.5, -4.5);
  bar.userData = { pulse: true, speed: 0.9 };
  group.add(bar);

  const flare = createLightFlare('#ffb703');
  flare.position.set(2.8, 3.6, -2.5);
  group.add(flare);

  return group;
}

function createLightFlare(color) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, `${color}ff`);
  gradient.addColorStop(0.3, `${color}aa`);
  gradient.addColorStop(1, '#0000');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, blending: THREE.AdditiveBlending });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(4, 4, 1);
  sprite.userData = { pulse: true, speed: 1.6 };
  return sprite;
}

function createSteamPlumes() {
  const group = new THREE.Group();
  const texture = generateSteamTexture();

  for (let i = 0; i < 3; i++) {
    const material = new THREE.SpriteMaterial({
      map: texture,
      color: new THREE.Color('#a2d2ff').multiplyScalar(0.65),
      transparent: true,
      opacity: 0.6
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(-1.5 + i * 1.2, 0.1, -4 - i * 12);
    sprite.scale.set(1.2, 1.8, 1);
    sprite.userData = {
      offset: Math.random() * Math.PI * 2,
      update(delta) {
        const t = performance.now() * 0.0006 + this.offset;
        sprite.position.y = 0.1 + Math.sin(t) * 0.4;
        sprite.material.opacity = 0.32 + Math.sin(t * 1.4) * 0.12;
      }
    };
    group.add(sprite);
  }
  return group;
}

function generateSteamTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;
  const random = mulberry32(98321);

  for (let i = 0; i < size * size; i++) {
    const value = Math.pow(random(), 2.2) * 255;
    data[i * 4] = 200;
    data[i * 4 + 1] = 215;
    data[i * 4 + 2] = 255;
    data[i * 4 + 3] = value;
  }

  ctx.putImageData(imageData, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

function createRain() {
  const count = 12000;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const random = mulberry32(71237);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (random() - 0.5) * 20;
    positions[i * 3 + 1] = random() * 12 + 4;
    positions[i * 3 + 2] = (random() - 0.5) * 60;
    speeds[i] = random() * 6 + 8;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('speed', new THREE.BufferAttribute(speeds, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#a2d2ff') }
    },
    vertexShader: `
      attribute float speed;
      uniform float uTime;
      void main() {
        vec3 pos = position;
        pos.y -= mod(uTime * speed, 14.0);
        if (pos.y < -2.0) {
          pos.y += 14.0;
        }
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = 1.2;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        float alpha = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(uColor, alpha * 0.8);
      }
    `,
    transparent: true,
    depthWrite: false
  });

  const rain = new THREE.Points(geometry, material);
  rain.userData = {
    update(delta) {
      material.uniforms.uTime.value += delta;
    }
  };
  return rain;
}

function createWalker() {
  const group = new THREE.Group();
  group.position.set(0, 0, 4);

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: '#222222',
    metalness: 0.15,
    roughness: 0.45
  });

  const coatGeometry = new THREE.CapsuleGeometry(0.32, 1.6, 12, 24);
  const coat = new THREE.Mesh(coatGeometry, bodyMaterial);
  coat.position.y = 1.3;
  coat.castShadow = true;
  group.add(coat);

  const headGeometry = new THREE.SphereGeometry(0.22, 32, 16);
  const head = new THREE.Mesh(headGeometry, bodyMaterial.clone());
  head.position.y = 2.25;
  group.add(head);

  const brimGeometry = new THREE.CylinderGeometry(0.38, 0.38, 0.04, 32);
  const brim = new THREE.Mesh(brimGeometry, bodyMaterial.clone());
  brim.position.y = 2.05;
  group.add(brim);

  const hatTopGeometry = new THREE.CylinderGeometry(0.2, 0.22, 0.28, 32);
  const hatTop = new THREE.Mesh(hatTopGeometry, bodyMaterial.clone());
  hatTop.position.y = 2.25;
  group.add(hatTop);

  const legGeometry = new THREE.CylinderGeometry(0.07, 0.09, 0.9, 12);
  const legLeft = new THREE.Mesh(legGeometry, bodyMaterial.clone());
  const legRight = new THREE.Mesh(legGeometry, bodyMaterial.clone());
  legLeft.position.set(-0.12, 0.45, 0.08);
  legRight.position.set(0.12, 0.45, -0.08);
  group.add(legLeft, legRight);

  const armGeometry = new THREE.CylinderGeometry(0.06, 0.07, 0.9, 12);
  const armLeft = new THREE.Mesh(armGeometry, bodyMaterial.clone());
  armLeft.position.set(-0.32, 1.1, 0.1);
  armLeft.rotation.z = Math.PI / 2.4;
  const armRight = new THREE.Mesh(armGeometry, bodyMaterial.clone());
  armRight.position.set(0.32, 1.1, -0.1);
  armRight.rotation.z = -Math.PI / 2.4;
  group.add(armLeft, armRight);

  group.userData.walkCycle = (walker, delta) => {
    walker.userData.phase = (walker.userData.phase || 0) + delta * 3.2;
    const stride = Math.sin(walker.userData.phase) * 0.3;
    const opposite = Math.sin(walker.userData.phase + Math.PI) * 0.3;
    legLeft.rotation.x = stride;
    legRight.rotation.x = opposite;
    armLeft.rotation.x = opposite * 0.6;
    armRight.rotation.x = stride * 0.6;
    walker.position.x = Math.sin(walker.userData.phase * 0.5) * 0.22;
  };

  return group;
}

function createLights() {
  const group = new THREE.Group();
  const ambient = new THREE.AmbientLight('#0a1128', 0.4);
  group.add(ambient);

  const keyLight = new THREE.DirectionalLight('#a2d2ff', 0.8);
  keyLight.position.set(-6, 8, 6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  group.add(keyLight);

  const fillLight = new THREE.DirectionalLight('#6639a6', 0.35);
  fillLight.position.set(4, 5, -4);
  group.add(fillLight);

  const rimLight = new THREE.PointLight('#ffb703', 0.8, 18, 2);
  rimLight.position.set(1.8, 2.6, -1.5);
  group.add(rimLight);

  const streetlights = [];
  for (let i = -6; i <= 6; i += 3) {
    const lamp = createStreetLamp(new THREE.Color('#a2d2ff').offsetHSL((i % 2) * 0.05, 0.1, (i % 2) * 0.05));
    lamp.position.set(-2.6, 0, i * 3 - 6);
    group.add(lamp);
    streetlights.push(lamp);

    const lampRight = createStreetLamp(new THREE.Color('#6639a6').offsetHSL((-i % 2) * 0.06, 0.05, 0));
    lampRight.position.set(2.6, 0, i * 3 - 4.8);
    group.add(lampRight);
    streetlights.push(lampRight);
  }

  group.userData.update = (delta) => {
    streetlights.forEach((lamp, idx) => {
      const intensity = 0.7 + Math.sin(performance.now() * 0.0008 + idx) * 0.15;
      lamp.children[1].intensity = intensity;
    });
  };

  return group;
}

function createStreetLamp(color) {
  const group = new THREE.Group();
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 4.2, 12);
  const poleMat = new THREE.MeshStandardMaterial({
    color: '#1b1f32',
    metalness: 0.8,
    roughness: 0.25
  });
  const pole = new THREE.Mesh(poleGeo, poleMat);
  pole.position.y = 2.1;
  group.add(pole);

  const headGeo = new THREE.SphereGeometry(0.22, 24, 16);
  const headMat = new THREE.MeshStandardMaterial({
    color: color.clone().multiplyScalar(0.3),
    emissive: color,
    emissiveIntensity: 1.4,
    roughness: 0.1,
    metalness: 0.4
  });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 4.2;
  group.add(head);

  const light = new THREE.SpotLight(color, 0.7, 16, Math.PI / 4.2, 0.7, 2);
  light.position.set(0, 4.1, 0);
  light.target.position.set(0, 0, -1);
  group.add(light);
  group.add(light.target);

  return group;
}

function setupSirenAudio() {
  sirenEl.volume = 0.0;
}

function startAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  const merger = audioCtx.createGain();
  merger.gain.value = 0.25;
  merger.connect(audioCtx.destination);

  const carrier = audioCtx.createOscillator();
  carrier.type = 'sine';
  carrier.frequency.value = 620;

  const lfo = audioCtx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.45;

  const lfoGain = audioCtx.createGain();
  lfoGain.gain.value = 120;
  lfo.connect(lfoGain);
  lfoGain.connect(carrier.frequency);

  sirenGain = audioCtx.createGain();
  sirenGain.gain.value = 0.0;
  carrier.connect(sirenGain);
  sirenGain.connect(merger);

  carrier.start();
  lfo.start();

  audioCtx.resume().then(() => {
    const now = audioCtx.currentTime;
    sirenGain.gain.linearRampToValueAtTime(0.18, now + 3);
  });
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function handleResize() {
  const aspect = window.innerWidth / window.innerHeight;
  const renderWidth = Math.min(CANVAS_TARGET_WIDTH, window.innerWidth);
  const renderHeight = Math.min(CANVAS_TARGET_HEIGHT, window.innerHeight);

  renderer.setSize(renderWidth, renderHeight, false);
  composer.setSize(renderWidth, renderHeight);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', handleResize);
handleResize();

startButton.addEventListener('click', () => {
  overlay.classList.add('hidden');
  startAudio();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && audioCtx) {
    sirenGain.gain.linearRampToValueAtTime(0.0, audioCtx.currentTime + 1);
  } else if (!document.hidden && audioCtx) {
    sirenGain.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 2);
  }
});

animate();
