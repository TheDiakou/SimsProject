import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const $ = (id) => document.getElementById(id);

const els = {
  prompt: $("prompt"),
  generate: $("generate"),
  reroll: $("reroll"),
  randomIdea: $("randomIdea"),
  status: $("status"),
  scene: $("scene"),
  roomTitle: $("roomTitle"),
  roomStory: $("roomStory"),
  selectedName: $("selectedName"),
  selectedNote: $("selectedNote"),
  buildList: $("buildList"),
  copyJson: $("copyJson"),
  copyList: $("copyList"),
  apiKey: $("apiKey"),
  rememberKey: $("rememberKey"),
  model: $("model"),
};

const ideas = [
  "A divorced werewolf baker wants a tiny apartment above a bakery, cozy but slightly feral.",
  "A glamorous vampire influencer needs a sun-proof boudoir with fake plants and dramatic secrets.",
  "A broke alien scientist is pretending to be a normal roommate in a suspiciously neon studio.",
  "A rich legacy heir needs a gold bedroom that quietly reveals family scandal and expensive loneliness.",
  "A cottagecore plant mom and her three cats need a chaotic greenhouse bedroom with thrifted magic.",
  "A teen runaway spellcaster needs a starter room that feels safe, cheap, and secretly powerful."
];

const palettes = {
  witchy: { wall: "#353348", floor: "#5a3b2c", accent: "#8c61c8", light: "#f1b757" },
  vampire: { wall: "#211725", floor: "#32222a", accent: "#aa1e4e", light: "#de6f58" },
  rich: { wall: "#efe3c0", floor: "#6b4a24", accent: "#c99528", light: "#ffd27a" },
  starter: { wall: "#d9d1bb", floor: "#8b6b4f", accent: "#4e86a6", light: "#fff1c7" },
  alien: { wall: "#102a3a", floor: "#1d4050", accent: "#31e6c4", light: "#68f2d5" },
  plant: { wall: "#d9e3ce", floor: "#7a4f31", accent: "#3b8b54", light: "#ffe4a1" },
  goth: { wall: "#25202d", floor: "#37303a", accent: "#7d4fa6", light: "#c07bff" },
};

let renderer;
let scene;
let camera;
let controls;
let raycaster;
let pointer;
let clickable = [];
let currentRoom;
let seedOffset = 0;

initThree();
restoreKey();
generateRoom();

els.generate.addEventListener("click", () => generateRoom(true));
els.reroll.addEventListener("click", () => {
  seedOffset += 101;
  renderRoom(currentRoom || localRoom(els.prompt.value));
});
els.randomIdea.addEventListener("click", () => {
  els.prompt.value = ideas[Math.floor(Math.random() * ideas.length)];
  generateRoom(true);
});
els.copyJson.addEventListener("click", () => copyText(JSON.stringify(currentRoom, null, 2), "Copied room JSON."));
els.copyList.addEventListener("click", () => copyText(currentRoom.buildList.map((item) => `- ${item}`).join("\n"), "Copied build list."));
els.rememberKey.addEventListener("change", persistKeyChoice);
els.apiKey.addEventListener("input", persistKeyChoice);

document.querySelectorAll("[data-preset]").forEach((button) => {
  button.addEventListener("click", () => {
    els.prompt.value = button.dataset.preset;
    generateRoom(true);
  });
});

async function generateRoom(allowAi = false) {
  setStatus("Generating room...", "work");
  const prompt = els.prompt.value.trim() || ideas[0];

  if (allowAi && els.apiKey.value.trim()) {
    try {
      const aiRoom = await generateWithNvidia(prompt);
      currentRoom = normalizeRoom(aiRoom, prompt);
      renderRoom(currentRoom);
      setStatus("Generated with NVIDIA. The key stayed in this browser session.", "ok");
      return;
    } catch (error) {
      console.warn(error);
      setStatus(`NVIDIA failed, using local generator: ${error.message}`, "warn");
    }
  }

  currentRoom = localRoom(prompt);
  renderRoom(currentRoom);
  setStatus(allowAi ? "Generated locally. Add a valid NVIDIA key for model output." : "Ready. Local generator loaded.", "ok");
}

async function generateWithNvidia(prompt) {
  const apiKey = els.apiKey.value.trim();
  const model = els.model.value.trim() || "deepseek-ai/deepseek-v3.1";
  const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.75,
      max_tokens: 1800,
      messages: [
        {
          role: "system",
          content: "You design whimsical Sims rooms. Return only strict JSON with no markdown. Schema: {title:string, story:string, palette:{wall:string,floor:string,accent:string,light:string}, objects:[{type:string,label:string,x:number,z:number,color:string,note:string}], buildList:string[]}. Types must be from bed,desk,sofa,plant,rug,lamp,shelf,painting,clutter,mirror,books,catbed,telescope. Coordinates x and z must be between -3 and 3. Include 9 to 14 objects. Hex colors only."
        },
        { role: "user", content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${text.slice(0, 140)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  const jsonText = content.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  return JSON.parse(jsonText);
}

function localRoom(prompt) {
  const text = prompt.toLowerCase();
  const style = pickStyle(text);
  const palette = palettes[style];
  const sim = inferSim(text);
  const mood = inferMood(text, style);
  const rand = seededRandom(hash(prompt) + seedOffset);
  const objects = baseObjects(style, palette, sim, mood).map((obj, index) => ({
    ...obj,
    x: clamp(obj.x + (rand() - 0.5) * 0.55, -3.1, 3.1),
    z: clamp(obj.z + (rand() - 0.5) * 0.55, -3.1, 3.1),
    id: `${obj.type}-${index}`,
  }));

  return {
    title: titleFor(style, sim),
    story: `This room belongs to ${sim}, built around ${mood}. It reads like a Sims save file with motives, secrets, and one very specific design obsession: every object hints at who lives here, what they are hiding, and what they are about to do next.`,
    palette,
    objects,
    buildList: buildListFor(style, sim, objects),
  };
}

function pickStyle(text) {
  if (/vampire|blood|goth|blackout|crypt|cursed/.test(text)) return "vampire";
  if (/rich|gold|heir|legacy|luxury|mansion/.test(text)) return "rich";
  if (/starter|broke|cheap|tiny|apartment|college/.test(text)) return "starter";
  if (/alien|science|lab|neon|space/.test(text)) return "alien";
  if (/plant|greenhouse|cottage|garden|cat/.test(text)) return "plant";
  if (/goth|emo|haunted/.test(text)) return "goth";
  return "witchy";
}

function inferSim(text) {
  if (text.includes("vampire")) return "a dramatic vampire trying to seem normal";
  if (text.includes("alien")) return "an alien scientist with a very flimsy human disguise";
  if (text.includes("college")) return "a broke college Sim with suspiciously ambitious dreams";
  if (text.includes("heir") || text.includes("legacy")) return "a legacy heir with money, pressure, and family rumors";
  if (text.includes("cat")) return "a plant-loving Sim whose cat clearly owns the lease";
  if (text.includes("spell") || text.includes("witch")) return "a cozy spellcaster who calls clutter a ritual system";
  return "a Sim with main-character energy and questionable taste";
}

function inferMood(text, style) {
  const moods = {
    vampire: "romantic menace, blackout comfort, and antique drama",
    rich: "expensive taste, inherited pressure, and curated perfection",
    starter: "budget survival, thrifted hope, and tiny-space problem solving",
    alien: "glowing experiments, star charts, and social camouflage",
    plant: "sunlit chaos, terracotta warmth, and leafy obsession",
    goth: "moody walls, soft rebellion, and candlelit secrets",
    witchy: "warm lamps, moon symbols, herbs, and cozy occult clutter",
  };
  return text.includes("cursed") ? "barely contained curse energy and suspiciously meaningful decor" : moods[style];
}

function titleFor(style, sim) {
  const titles = {
    vampire: "Cursed Vampire Blackout Suite",
    rich: "Legacy Heir Golden Drama Room",
    starter: "Starter Home Glow-Up Nook",
    alien: "Alien Scientist Disguise Studio",
    plant: "Plant Mom Greenhouse Bedroom",
    goth: "Soft Goth Secret-Keeper Room",
    witchy: "Cozy Witchy Moonlit Bedroom",
  };
  return titles[style] || `Room for ${sim}`;
}

function baseObjects(style, p, sim, mood) {
  const notes = {
    bed: `The bed is positioned like ${sim} planned the room at 2 a.m. and somehow made it charming.`,
    desk: `This desk is where ${mood} turns into unpaid bills, skill-building, and dramatic screenshots.`,
    sofa: "A social object that says guests are welcome, but only if they understand the household lore.",
    plant: "A plant with more personality than most townies. It is thriving despite suspicious circumstances.",
    rug: "The rug ties the room together and hides at least one bad build-mode decision.",
    lamp: "Warm lighting makes the room feel expensive, haunted, or emotionally stable depending on the angle.",
    shelf: "A shelf full of tiny storytelling props, because Sims rooms need evidence of a life lived.",
    painting: "Wall art chosen for vibes first and resale value never.",
    clutter: "Clutter that makes the room feel lived-in instead of catalogue-perfect.",
    mirror: "A mirror placed for outfit checks, occult symbolism, or vampire irony.",
    books: "Books stacked where a responsible Sim would put storage.",
    catbed: "The cat bed is placed in the best spot, proving who actually controls this household.",
    telescope: "A telescope for science, romance, alien contact, or neighbor drama.",
  };
  const common = [
    { type: "bed", label: "Story-Heavy Bed", x: -2.1, z: 1.5, color: p.accent, note: notes.bed },
    { type: "desk", label: "Skill Grind Desk", x: 1.7, z: -1.6, color: p.floor, note: notes.desk },
    { type: "rug", label: "Moodboard Rug", x: 0, z: 0.45, color: p.accent, note: notes.rug },
    { type: "lamp", label: "Vibe-Saving Lamp", x: -2.6, z: -1.6, color: p.light, note: notes.lamp },
    { type: "shelf", label: "Lore Shelf", x: 2.65, z: 0.2, color: p.floor, note: notes.shelf },
    { type: "painting", label: "Suspicious Wall Art", x: -0.8, z: -3.05, color: p.accent, note: notes.painting },
    { type: "clutter", label: "Personality Clutter", x: 0.8, z: -0.8, color: p.light, note: notes.clutter },
    { type: "books", label: "Unread Skill Books", x: 2.1, z: 1.5, color: p.accent, note: notes.books },
  ];
  const extras = {
    vampire: [
      { type: "mirror", label: "Ironic Antique Mirror", x: 2.7, z: -2.1, color: "#222222", note: notes.mirror },
      { type: "sofa", label: "Velvet Brooding Settee", x: -0.8, z: -1.3, color: "#7c1436", note: notes.sofa },
    ],
    rich: [
      { type: "sofa", label: "Inheritance Sofa", x: -0.8, z: -1.3, color: "#d4a73c", note: notes.sofa },
      { type: "mirror", label: "Gold Ego Mirror", x: 2.7, z: -2.1, color: "#d9b85d", note: notes.mirror },
    ],
    starter: [
      { type: "plant", label: "One Affordable Plant", x: -2.8, z: -0.2, color: "#3e8a4d", note: notes.plant },
      { type: "sofa", label: "Thrifted Futon", x: -0.8, z: -1.3, color: "#4e86a6", note: notes.sofa },
    ],
    alien: [
      { type: "telescope", label: "Definitely Normal Telescope", x: -2.5, z: -1.9, color: "#31e6c4", note: notes.telescope },
      { type: "clutter", label: "Specimen Jars", x: 1, z: 1.7, color: "#68f2d5", note: notes.clutter },
    ],
    plant: [
      { type: "plant", label: "Dramatic Monstera", x: -2.8, z: -0.2, color: "#3b8b54", note: notes.plant },
      { type: "catbed", label: "Royal Cat Bed", x: 1.8, z: 1.8, color: "#e59f5d", note: notes.catbed },
      { type: "plant", label: "Overwatered Fern", x: 2.6, z: -1.5, color: "#2d7a44", note: notes.plant },
    ],
    goth: [
      { type: "mirror", label: "Dramatic Black Mirror", x: 2.7, z: -2.1, color: "#101010", note: notes.mirror },
      { type: "sofa", label: "Sad Velvet Sofa", x: -0.8, z: -1.3, color: "#65407d", note: notes.sofa },
    ],
    witchy: [
      { type: "plant", label: "Potion Herb Planter", x: -2.8, z: -0.2, color: "#3b8b54", note: notes.plant },
      { type: "catbed", label: "Familiar's Cat Bed", x: 1.8, z: 1.8, color: "#8556a7", note: notes.catbed },
      { type: "telescope", label: "Moon Phase Telescope", x: -2.5, z: -1.9, color: "#8c61c8", note: notes.telescope },
    ],
  };
  return [...common, ...(extras[style] || extras.witchy)];
}

function buildListFor(style, sim, objects) {
  const styleItems = {
    vampire: ["Dark wallpaper", "Blackout curtains", "Velvet seating", "Antique mirror", "Red accent lighting"],
    rich: ["Gold accents", "Ornate wall art", "Expensive bed frame", "Polished wood floor", "Family portrait wall"],
    starter: ["Cheap bed", "Thrifted desk", "Mismatched rug", "Compact storage", "One hopeful plant"],
    alien: ["Neon lights", "Science clutter", "Telescope", "Metal shelves", "Star chart art"],
    plant: ["Terracotta planters", "Hanging greenery", "Warm wood floor", "Cat bed", "Sunlit wall color"],
    goth: ["Dark wall paint", "Purple accent decor", "Candles", "Black mirror", "Moody rug"],
    witchy: ["Moon decor", "Herb planters", "Purple blanket", "Warm lamps", "Books and potion clutter"],
  };
  return [
    `Design for ${sim}`,
    ...(styleItems[style] || styleItems.witchy),
    ...objects.slice(0, 6).map((obj) => obj.label),
  ];
}

function normalizeRoom(room, prompt) {
  const fallback = localRoom(prompt);
  const palette = { ...fallback.palette, ...(room.palette || {}) };
  const objects = Array.isArray(room.objects) && room.objects.length ? room.objects : fallback.objects;
  return {
    title: String(room.title || fallback.title).slice(0, 80),
    story: String(room.story || fallback.story).slice(0, 800),
    palette,
    objects: objects.slice(0, 16).map((obj, index) => ({
      id: `${obj.type || "clutter"}-${index}`,
      type: validType(obj.type),
      label: String(obj.label || obj.type || "Story Object").slice(0, 60),
      x: clamp(Number(obj.x) || 0, -3.1, 3.1),
      z: clamp(Number(obj.z) || 0, -3.1, 3.1),
      color: validHex(obj.color) ? obj.color : palette.accent,
      note: String(obj.note || "A tiny storytelling object with suspiciously good vibes.").slice(0, 260),
    })),
    buildList: Array.isArray(room.buildList) ? room.buildList.slice(0, 18).map(String) : fallback.buildList,
  };
}

function validType(type) {
  const valid = ["bed", "desk", "sofa", "plant", "rug", "lamp", "shelf", "painting", "clutter", "mirror", "books", "catbed", "telescope"];
  return valid.includes(type) ? type : "clutter";
}

function validHex(color) {
  return /^#[0-9a-f]{6}$/i.test(color || "");
}

function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x201625);
  camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
  camera.position.set(5, 5, 7);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  els.scene.appendChild(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0.8, 0);
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("resize", resize);
  resize();
  animate();
}

function renderRoom(room) {
  currentRoom = room;
  clickable = [];
  scene.clear();
  scene.background = new THREE.Color(room.palette.wall);
  addLights(room.palette);
  addRoomShell(room.palette);
  room.objects.forEach(addObject);
  updateOutput(room);
}

function addLights(palette) {
  const ambient = new THREE.HemisphereLight(0xffffff, 0x2a1c2f, 1.8);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(4, 7, 5);
  key.castShadow = true;
  scene.add(key);
  const mood = new THREE.PointLight(palette.light, 3.2, 9);
  mood.position.set(-2.4, 2.7, -1.8);
  scene.add(mood);
}

function addRoomShell(p) {
  const floor = mesh(new THREE.BoxGeometry(7.2, 0.16, 7.2), p.floor, [0, -0.08, 0]);
  floor.receiveShadow = true;
  scene.add(floor);
  const backWall = mesh(new THREE.BoxGeometry(7.2, 3.7, 0.16), p.wall, [0, 1.78, -3.6]);
  const leftWall = mesh(new THREE.BoxGeometry(0.16, 3.7, 7.2), p.wall, [-3.6, 1.78, 0]);
  scene.add(backWall, leftWall);
  const grid = new THREE.GridHelper(7.2, 12, 0xffffff, 0xffffff);
  grid.material.opacity = 0.12;
  grid.material.transparent = true;
  scene.add(grid);
}

function addObject(obj) {
  const group = new THREE.Group();
  group.position.set(obj.x, 0, obj.z);
  group.userData = obj;
  const c = obj.color;

  if (obj.type === "bed") {
    group.add(mesh(new THREE.BoxGeometry(1.5, 0.34, 2.1), c, [0, 0.32, 0]));
    group.add(mesh(new THREE.BoxGeometry(1.5, 0.18, 0.38), "#f5eddc", [0, 0.64, -0.7]));
  } else if (obj.type === "desk") {
    group.add(mesh(new THREE.BoxGeometry(1.45, 0.16, 0.74), c, [0, 0.76, 0]));
    group.add(mesh(new THREE.BoxGeometry(0.12, 0.76, 0.12), c, [-0.56, 0.36, -0.24]));
    group.add(mesh(new THREE.BoxGeometry(0.12, 0.76, 0.12), c, [0.56, 0.36, 0.24]));
  } else if (obj.type === "sofa") {
    group.add(mesh(new THREE.BoxGeometry(1.8, 0.45, 0.8), c, [0, 0.35, 0]));
    group.add(mesh(new THREE.BoxGeometry(1.8, 0.9, 0.18), c, [0, 0.72, 0.4]));
  } else if (obj.type === "plant") {
    group.add(mesh(new THREE.CylinderGeometry(0.24, 0.19, 0.34, 20), "#b16d43", [0, 0.18, 0]));
    group.add(mesh(new THREE.ConeGeometry(0.48, 1.1, 8), c, [0, 0.95, 0]));
  } else if (obj.type === "rug") {
    group.add(mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.04, 48), c, [0, 0.04, 0], [Math.PI / 2, 0, 0]));
  } else if (obj.type === "lamp") {
    group.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 16), "#4c3b45", [0, 0.6, 0]));
    group.add(mesh(new THREE.ConeGeometry(0.35, 0.45, 24), c, [0, 1.35, 0]));
    const light = new THREE.PointLight(c, 1.2, 3);
    light.position.set(0, 1.25, 0);
    group.add(light);
  } else if (obj.type === "shelf") {
    group.add(mesh(new THREE.BoxGeometry(0.95, 1.7, 0.22), c, [0, 0.85, 0]));
    [0.38, 0.84, 1.3].forEach((y) => group.add(mesh(new THREE.BoxGeometry(1.06, 0.08, 0.3), "#f4dfb0", [0, y, 0])));
  } else if (obj.type === "painting") {
    group.add(mesh(new THREE.BoxGeometry(1.25, 0.82, 0.06), c, [0, 1.65, 0]));
  } else if (obj.type === "mirror") {
    group.add(mesh(new THREE.BoxGeometry(0.82, 1.45, 0.08), "#d6f3ff", [0, 1.15, 0]));
    group.add(mesh(new THREE.TorusGeometry(0.52, 0.04, 10, 36), c, [0, 1.15, 0], [0, 0, 0]));
  } else if (obj.type === "books") {
    for (let i = 0; i < 5; i += 1) group.add(mesh(new THREE.BoxGeometry(0.16, 0.46 + i * 0.03, 0.34), i % 2 ? c : "#f1b757", [-0.34 + i * 0.17, 0.25, 0]));
  } else if (obj.type === "catbed") {
    group.add(mesh(new THREE.TorusGeometry(0.43, 0.14, 12, 32), c, [0, 0.22, 0], [Math.PI / 2, 0, 0]));
    group.add(mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 32), "#ffe0bb", [0, 0.15, 0]));
  } else if (obj.type === "telescope") {
    group.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.1, 18), c, [0, 0.9, 0], [0, 0, Math.PI / 2.6]));
    group.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 12), "#2e2732", [0, 0.45, 0]));
  } else {
    group.add(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), c, [0, 0.25, 0]));
    group.add(mesh(new THREE.SphereGeometry(0.18, 18, 18), "#fff1c7", [0.18, 0.62, -0.12]));
  }

  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.userData = obj;
      clickable.push(child);
    }
  });
  scene.add(group);
}

function mesh(geometry, color, position, rotation = [0, 0, 0]) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.08 });
  const item = new THREE.Mesh(geometry, material);
  item.position.set(...position);
  item.rotation.set(...rotation);
  return item;
}

function updateOutput(room) {
  els.roomTitle.textContent = room.title;
  els.roomStory.textContent = room.story;
  els.selectedName.textContent = "Nothing selected";
  els.selectedNote.textContent = "Click furniture or decor in the room.";
  els.buildList.innerHTML = "";
  room.buildList.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    els.buildList.appendChild(li);
  });
}

function onPointerDown(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(clickable, false)[0];
  if (!hit) return;
  const obj = hit.object.userData;
  els.selectedName.textContent = obj.label;
  els.selectedNote.textContent = obj.note;
}

function resize() {
  const rect = els.scene.getBoundingClientRect();
  camera.aspect = rect.width / Math.max(rect.height, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(rect.width, rect.height, false);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

function setStatus(message, type) {
  els.status.textContent = message;
  els.status.style.background = type === "warn" ? "rgba(241, 183, 87, 0.2)" : type === "work" ? "rgba(155, 77, 202, 0.14)" : "rgba(63, 180, 121, 0.16)";
}

async function copyText(text, message) {
  await navigator.clipboard.writeText(text || "");
  setStatus(message, "ok");
}

function persistKeyChoice() {
  if (els.rememberKey.checked && els.apiKey.value.trim()) {
    localStorage.setItem("simspark.nvidiaKey", els.apiKey.value.trim());
    localStorage.setItem("simspark.rememberKey", "true");
  } else {
    localStorage.removeItem("simspark.nvidiaKey");
    localStorage.removeItem("simspark.rememberKey");
  }
}

function restoreKey() {
  if (localStorage.getItem("simspark.rememberKey") === "true") {
    els.apiKey.value = localStorage.getItem("simspark.nvidiaKey") || "";
    els.rememberKey.checked = Boolean(els.apiKey.value);
  }
}

function hash(input) {
  let value = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    value ^= input.charCodeAt(i);
    value += (value << 1) + (value << 4) + (value << 7) + (value << 8) + (value << 24);
  }
  return value >>> 0;
}

function seededRandom(seed) {
  let t = seed || 1;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
