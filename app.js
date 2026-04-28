import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const $ = (id) => document.getElementById(id);

const chatModels = [
  { id: "glm-5-1", value: "z-ai/glm-5.1", label: "GLM 5.1", default: true },
];

const imageModels = [
  { value: "black-forest-labs/flux.1-dev", label: "FLUX.1 Dev", endpoint: "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev", body: "flux" },
  { value: "black-forest-labs/flux.1-schnell", label: "FLUX.1 Schnell", endpoint: "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell", body: "flux" },
  { value: "black-forest-labs/flux.2-klein-4b", label: "FLUX.2 Klein 4B", endpoint: "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b", body: "flux" },
  { value: "stabilityai/stable-diffusion-3-medium", label: "Stable Diffusion 3 Medium", endpoint: "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-3-medium", body: "sd" },
  { value: "stabilityai/stable-diffusion-xl", label: "Stable Diffusion XL", endpoint: "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-xl", body: "sd" },
];

const els = {
  prompt: $("prompt"),
  generate: $("generate"),
  generateImage: $("generateImage"),
  testKey: $("testKey"),
  reroll: $("reroll"),
  randomIdea: $("randomIdea"),
  status: $("status"),
  generationMode: $("generationMode"),
  scene: $("scene"),
  roomTitle: $("roomTitle"),
  roomStory: $("roomStory"),
  roomSize: $("roomSize"),
  objectCount: $("objectCount"),
  selectedName: $("selectedName"),
  selectedNote: $("selectedNote"),
  buildList: $("buildList"),
  copyJson: $("copyJson"),
  copyList: $("copyList"),
  apiKey: $("apiKey"),
  rememberKey: $("rememberKey"),
  chatModel: $("chatModel"),
  imageModel: $("imageModel"),
  roomCards: $("roomCards"),
  conceptImage: $("conceptImage"),
  clearImage: $("clearImage"),
  progressTitle: $("progressTitle"),
  progressTimer: $("progressTimer"),
  progressBar: $("progressBar"),
  progressText: $("progressText"),
};

const ideas = [
  "A divorced werewolf baker wants a tiny apartment above a bakery, cozy but slightly feral.",
  "A glamorous vampire influencer needs a sun-proof boudoir with fake plants and dramatic secrets.",
  "A broke alien scientist is pretending to be a normal roommate in a suspiciously neon studio.",
  "A rich legacy heir needs a gold bedroom that quietly reveals family scandal and expensive loneliness.",
  "A cottagecore plant mom and her three cats need a chaotic greenhouse bedroom with thrifted magic.",
  "A runaway teen spellcaster needs a starter room that feels safe, cheap, and secretly powerful."
];

const palettes = {
  witchy: { wall: "#363047", floor: "#5b3b2b", accent: "#9d70dd", light: "#f5c96a", trim: "#ead8b8" },
  vampire: { wall: "#20131b", floor: "#342029", accent: "#b91647", light: "#ff705f", trim: "#b69b85" },
  rich: { wall: "#e8d7ab", floor: "#6a4824", accent: "#d4a72f", light: "#ffd67d", trim: "#fff1cc" },
  starter: { wall: "#d6cfbd", floor: "#8b6a4e", accent: "#4f89ad", light: "#fff0bb", trim: "#f4ead8" },
  alien: { wall: "#102936", floor: "#1c4050", accent: "#33e5c5", light: "#7af6de", trim: "#b9fff2" },
  plant: { wall: "#dae4ce", floor: "#754b2f", accent: "#3c9058", light: "#ffe2a1", trim: "#f5ebd7" },
  goth: { wall: "#24202d", floor: "#38303d", accent: "#8956b2", light: "#c78cff", trim: "#c9b8d8" },
};

const roomTemplates = [
  { key: "witchy", label: "Witchy Greenhouse", text: "A cozy spellcaster greenhouse bedroom with cats, moon maps, herbs, old books, and maximal clutter." },
  { key: "vampire", label: "Vampire Loft", text: "A dramatic vampire loft with blackout curtains, antique mirrors, velvet, and secrets." },
  { key: "alien", label: "Alien Lab", text: "An alien scientist lab bedroom with neon specimens, telescope, and fake human decor." },
  { key: "rich", label: "Legacy Suite", text: "A wealthy legacy heir suite with gold trim, portraits, heirlooms, and expensive drama." },
];

let renderer;
let scene;
let camera;
let controls;
let raycaster;
let pointer;
let clickable = [];
let currentRoom;
let seedOffset = 0;
let progressStartedAt = 0;
let progressTimerId = 0;

initControls();
initThree();
restoreKey();
renderRoomCards();
generateRoom(false);

els.generate.addEventListener("click", () => generateRoom(true));
els.generateImage.addEventListener("click", () => generateConceptImage());
els.testKey.addEventListener("click", () => testNvidiaKey());
els.reroll.addEventListener("click", () => {
  seedOffset += 157;
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
els.clearImage.addEventListener("click", resetConceptImage);

document.querySelectorAll("[data-preset]").forEach((button) => {
  button.addEventListener("click", () => {
    els.prompt.value = button.dataset.preset;
    generateRoom(true);
  });
});

function initControls() {
  const defaultChatIndex = Math.max(0, chatModels.findIndex((model) => model.default));
  chatModels.forEach((model, index) => els.chatModel.add(new Option(model.label, model.id, index === defaultChatIndex, index === defaultChatIndex)));
  imageModels.forEach((model, index) => els.imageModel.add(new Option(model.label, model.value, index === 0, index === 0)));
}

async function generateRoom(allowAi = false) {
  setStatus("Composing the room world...", "work");
  const prompt = els.prompt.value.trim() || ideas[0];
  let aiError = null;

  if (allowAi && els.apiKey.value.trim()) {
    try {
      startProgress("Text model stream", `Connecting to ${selectedLabel(els.chatModel)}...`);
      const aiRoom = await generateWithNvidia(prompt);
      currentRoom = normalizeRoom(aiRoom, prompt);
      renderRoom(currentRoom);
      els.generationMode.textContent = "NVIDIA model";
      finishProgress("Room JSON received and rendered.");
      setStatus(`Generated with ${selectedLabel(els.chatModel)}.`, "ok");
      return;
    } catch (error) {
      console.warn(error);
      aiError = friendlyError(error);
      failProgress(`NVIDIA text generation failed: ${aiError}`);
    }
  }

  currentRoom = localRoom(prompt);
  renderRoom(currentRoom);
  els.generationMode.textContent = "Local engine";
  if (aiError) {
    setStatus(`NVIDIA failed, so the local room engine rendered this instead. ${aiError}`, "warn");
  } else {
    setStatus(allowAi ? "Generated locally because no NVIDIA key is currently entered." : "Local generator loaded. Add a key only if you want live NVIDIA calls.", "ok");
  }
}

async function testNvidiaKey() {
  if (!els.apiKey.value.trim()) {
    setStatus("Paste a NVIDIA API key first, then run the test.", "warn");
    return;
  }
  setStatus(`Testing ${selectedLabel(els.chatModel)}...`, "work");
  try {
    startProgress("Key test stream", `Sending a tiny test request to ${selectedLabel(els.chatModel)}...`);
    const response = await nvidiaChatRequest([
      { role: "user", content: "Reply with exactly this JSON and nothing else: {\"ok\":true,\"provider\":\"nvidia\"}" }
    ], 96, {
      reasoningEffortOverride: "none",
      onDelta: ({ text, reasoning }) => updateStreamProgress(text, reasoning),
    });
    const content = response.choices?.[0]?.message?.content || "";
    if (!content) throw new Error("The request succeeded but returned no message content.");
    finishProgress("NVIDIA returned streamed text successfully.");
    setStatus(`NVIDIA key works for ${selectedLabel(els.chatModel)}.`, "ok");
  } catch (error) {
    console.warn(error);
    failProgress(`NVIDIA key test failed: ${friendlyError(error)}`);
    setStatus(`NVIDIA key test failed. ${friendlyError(error)}`, "warn");
  }
}

async function generateWithNvidia(prompt) {
  const data = await nvidiaChatRequest([
    {
      role: "system",
      content: "Design a Sims-inspired 3D room. Return only compact valid JSON, no markdown. Schema: {title:string, roomType:string, dimensions:{width:number,depth:number,height:number}, story:string, palette:{wall:string,floor:string,accent:string,light:string,trim:string}, zones:[{name:string,description:string}], objects:[{type:string,label:string,x:number,z:number,rotation:number,color:string,note:string}], buildList:string[]}. Object types: bed,desk,sofa,plant,rug,lamp,shelf,painting,clutter,mirror,books,catbed,telescope,window,curtain,wardrobe,chair,table,divider,poster,candle,console,crystal. Coordinates x and z must be -3.2 to 3.2. Include 10 to 14 objects. Use hex colors only."
    },
    { role: "user", content: prompt }
  ], 1200, {
    onDelta: ({ text, reasoning }) => updateStreamProgress(text, reasoning),
  });
  const content = data.choices?.[0]?.message?.content || "";
  return JSON.parse(extractJson(content));
}

async function nvidiaChatRequest(messages, maxTokens, options = {}) {
  const model = selectedChatModel();
  const body = {
    model: model.value,
    temperature: 0.72,
    max_tokens: maxTokens,
    messages,
    stream: Boolean(options.onDelta),
  };
  if (hasSameOriginProxy()) {
    const proxied = await fetch("/api/nvidia-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: els.apiKey.value.trim(), body, fallbacks: fallbackChatBodies(body, model) }),
    });
    if (!proxied.ok) throw new Error(`${proxied.status} ${(await proxied.text()).slice(0, 260)}`);
    if (body.stream) return readNvidiaStream(proxied, options.onDelta);
    return proxied.json();
  }

  if (isStaticGithubPages()) {
    throw new Error("This GitHub Pages deployment is static, and NVIDIA blocks direct browser calls with CORS. Use the Cloudflare Pages deployment so the included /api proxy can call NVIDIA on the free tier.");
  }

  const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Accept: body.stream ? "text/event-stream" : "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${els.apiKey.value.trim()}`,
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) throw new Error(`${response.status} ${(await response.text()).slice(0, 260)}`);
  if (body.stream) return readNvidiaStream(response, options.onDelta);
  return response.json();
}

async function generateConceptImage() {
  if (!els.apiKey.value.trim()) {
    setStatus("Paste a NVIDIA key to generate concept art. The 3D room still works without one.", "warn");
    return;
  }
  const room = currentRoom || localRoom(els.prompt.value);
  setStatus(`Generating concept art with ${selectedLabel(els.imageModel)}...`, "work");
  startProgress("Image model progress", `Preparing prompt for ${selectedLabel(els.imageModel)}...`);
  els.conceptImage.textContent = "Rendering a moodboard image...";

  const imagePrompt = [
    `A beautiful award-winning website hero image of a Sims-inspired miniature 3D room called ${room.title}.`,
    room.story,
    `Palette: wall ${room.palette.wall}, floor ${room.palette.floor}, accent ${room.palette.accent}.`,
    "Isometric room diorama, collectible toy-like furniture, cozy game UI mood, detailed interior design, not photorealistic people, no text, no watermark."
  ].join(" ");

  try {
    const model = selectedImageModel();
    advanceProgress(24, "Prompt packaged. Sending image request to NVIDIA...");
    const response = hasSameOriginProxy()
      ? await fetch("/api/nvidia-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: els.apiKey.value.trim(), model: model.value, body: imageRequestBody(model, imagePrompt) }),
      })
      : isStaticGithubPages()
        ? null
        : await fetch(model.endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${els.apiKey.value.trim()}`,
      },
      body: JSON.stringify(imageRequestBody(model, imagePrompt))
    });

    if (!response) throw new Error("This GitHub Pages deployment is static, and NVIDIA image models require the included /api proxy on Cloudflare Pages.");

    if (!response.ok) throw new Error(`${response.status} ${(await response.text()).slice(0, 260)}`);
    advanceProgress(72, "NVIDIA returned an image payload. Decoding response...");
    const data = await response.json();
    const url = imageUrlFromResponse(data);
    if (!url) throw new Error("No image URL returned by the selected model.");
    els.conceptImage.innerHTML = "";
    const img = document.createElement("img");
    img.alt = `${room.title} concept art`;
    img.src = url;
    els.conceptImage.appendChild(img);
    finishProgress("Concept art decoded and displayed.");
    setStatus(`Concept art generated with ${selectedLabel(els.imageModel)}.`, "ok");
  } catch (error) {
    console.warn(error);
    els.conceptImage.textContent = "Image generation did not return an image. Try another image model from the dropdown.";
    failProgress(`Image generation failed: ${friendlyError(error)}`);
    setStatus(`Image generation failed. ${friendlyError(error)}`, "warn");
  }
}

function selectedImageModel() {
  return imageModels.find((model) => model.value === els.imageModel.value) || imageModels[0];
}

function selectedChatModel() {
  return chatModels.find((model) => model.id === els.chatModel.value) || chatModels[0];
}

function fallbackChatBodies(body, selectedModel) {
  return [];
}

function hasSameOriginProxy() {
  return !isStaticGithubPages() && location.protocol.startsWith("http");
}

function isStaticGithubPages() {
  return location.hostname.endsWith("github.io");
}

async function readNvidiaStream(response, onDelta) {
  if (!response.body) return response.json();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let reasoning = "";
  let streamError = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;

      try {
        const item = JSON.parse(payload);
        if (item.type === "status") {
          appendProgressLine(item.message || "NVIDIA stream status update.");
          continue;
        }
        if (item.type === "error") {
          streamError = item.message || "NVIDIA stream failed.";
          appendProgressLine(`NVIDIA stream error: ${streamError}`);
          continue;
        }
        const choice = item.choices?.[0] || {};
        const delta = choice.delta || {};
        const message = choice.message || {};
        const textDelta = delta.content || message.content || "";
        const reasoningDelta = delta.reasoning_content || delta.reasoning || delta.thinking || message.reasoning_content || "";
        content += textDelta;
        reasoning += reasoningDelta;
        onDelta?.({ text: content, reasoning, textDelta, reasoningDelta });
      } catch (error) {
        appendProgressLine(`Unparsed stream event: ${payload.slice(0, 180)}`);
      }
    }
  }

  if (streamError) throw new Error(streamError);

  if (!content.trim()) {
    throw new Error("The streamed response finished without final message content. Try GLM 5.1 again.");
  }

  return { choices: [{ message: { content } }] };
}

function imageRequestBody(model, prompt) {
  if (model.body === "flux") {
    return { prompt, width: 1024, height: 1024, cfg_scale: 5, mode: "base", samples: 1, seed: 0, steps: 36 };
  }
  return { prompt, width: 1024, height: 1024, cfg_scale: 7, samples: 1, seed: 0, steps: 35 };
}

function imageUrlFromResponse(data) {
  const candidates = [
    data?.url,
    data?.image_url,
    data?.data?.[0]?.url,
    data?.data?.[0]?.image_url,
    data?.data?.[0]?.b64_json && `data:image/png;base64,${data.data[0].b64_json}`,
    data?.artifacts?.[0]?.base64 && `data:image/png;base64,${data.artifacts[0].base64}`,
    data?.artifacts?.[0]?.image && `data:image/png;base64,${data.artifacts[0].image}`,
    data?.images?.[0]?.url,
    data?.images?.[0]?.b64_json && `data:image/png;base64,${data.images[0].b64_json}`,
  ];
  return candidates.find(Boolean) || "";
}

function localRoom(prompt) {
  const text = prompt.toLowerCase();
  const style = pickStyle(text);
  const palette = palettes[style];
  const sim = inferSim(text);
  const mood = inferMood(text, style);
  const rand = seededRandom(hash(prompt) + seedOffset);
  const wallTypes = new Set(["painting", "poster", "window", "curtain", "mirror"]);
  const objects = baseObjects(style, palette, sim, mood)
    .map((obj, index) => ({
      ...obj,
      x: clamp(obj.x + (wallTypes.has(obj.type) ? 0 : (rand() - 0.5) * 0.44), -3.25, 3.25),
      z: clamp(obj.z + (wallTypes.has(obj.type) ? 0 : (rand() - 0.5) * 0.44), -3.25, 3.25),
      rotation: obj.rotation ?? (wallTypes.has(obj.type) ? 0 : Math.round((rand() - 0.5) * 30)),
      id: `${obj.type}-${index}`,
    }));

  return {
    title: titleFor(style),
    roomType: `${style} Sims diorama`,
    dimensions: { width: 7.4, depth: 7.4, height: 4.2 },
    story: `This is a tiny playable-feeling room for ${sim}. The design language is ${mood}: every wall, rug, lamp, and clutter stack is there to make a Sims player immediately imagine traits, wants, fears, and a save-file scandal.`,
    palette,
    zones: zonesFor(style),
    objects,
    buildList: buildListFor(style, sim, objects),
  };
}

function pickStyle(text) {
  if (/vampire|blood|blackout|crypt|cursed/.test(text)) return "vampire";
  if (/rich|gold|heir|legacy|luxury|mansion/.test(text)) return "rich";
  if (/starter|broke|cheap|tiny|apartment|college/.test(text)) return "starter";
  if (/alien|science|lab|neon|space/.test(text)) return "alien";
  if (/plant|greenhouse|cottage|garden|cat/.test(text)) return "plant";
  if (/goth|emo|haunted/.test(text)) return "goth";
  return "witchy";
}

function inferSim(text) {
  if (text.includes("vampire")) return "a dramatic vampire trying to pass as a harmless neighbor";
  if (text.includes("alien")) return "an alien scientist whose human disguise is one bad conversation from failing";
  if (text.includes("college")) return "a broke college Sim grinding skills between chaos and ramen";
  if (text.includes("heir") || text.includes("legacy")) return "a legacy heir carrying money, pressure, and family rumors";
  if (text.includes("cat")) return "a plant-loving Sim whose cat has final approval on all furniture";
  if (text.includes("spell") || text.includes("witch")) return "a cozy spellcaster who turns clutter into ritual infrastructure";
  return "a Sim with main-character energy and suspiciously specific taste";
}

function inferMood(text, style) {
  const moods = {
    vampire: "velvet menace, blackout comfort, antique drama, and romance novel lighting",
    rich: "inherited money, museum-level polish, emotional distance, and portrait-wall pressure",
    starter: "budget survival, thrift-store hope, tiny-space tricks, and deeply earned coziness",
    alien: "glowing experiments, star charts, specimen clutter, and not-quite-human normalcy",
    plant: "sunlit chaos, terracotta warmth, cat-owned corners, and leafy overcommitment",
    goth: "soft rebellion, candlelit secrecy, purple shadows, and dramatic wall art",
    witchy: "moon symbols, herb shelves, warm lamps, old books, and cozy occult clutter",
  };
  return text.includes("cursed") ? "barely contained curse energy with suspiciously meaningful decor" : moods[style];
}

function titleFor(style) {
  return {
    vampire: "Cursed Vampire Blackout Loft",
    rich: "Legacy Heir Golden Suite",
    starter: "Starter Home Glow-Up Room",
    alien: "Alien Scientist Disguise Lab",
    plant: "Plant Mom Greenhouse Studio",
    goth: "Soft Goth Secret-Keeper Room",
    witchy: "Cozy Witchy Greenhouse Bedroom",
  }[style];
}

function zonesFor(style) {
  const common = [
    { name: "Sleep", description: "A mood-first bed zone with enough personality to identify the Sim instantly." },
    { name: "Skill", description: "Desk or hobby area for career grind, occult research, science, writing, or social avoidance." },
    { name: "Lore Wall", description: "A vertical storytelling strip filled with portraits, posters, mirrors, shelves, and secrets." },
  ];
  const extra = {
    vampire: { name: "Blackout Nook", description: "Curtains, velvet seating, and suspiciously theatrical lamps." },
    rich: { name: "Inheritance Display", description: "Gold accents and family objects that feel expensive and emotionally loaded." },
    starter: { name: "Tiny Fix", description: "Cheap multifunctional furniture arranged like a survival puzzle." },
    alien: { name: "Specimen Corner", description: "Neon experiments and telescope placement for late-night abductions." },
    plant: { name: "Greenhouse Edge", description: "Layered plants, terracotta, and a cat-approved sunny corner." },
    goth: { name: "Candle Drama", description: "Moody seating and wall decor for screenshots that look like album covers." },
    witchy: { name: "Ritual Corner", description: "Herbs, crystals, books, moon charts, and cat familiar infrastructure." },
  };
  return [...common, extra[style]];
}

function baseObjects(style, p, sim, mood) {
  const notes = objectNotes(sim, mood);
  const common = [
    { type: "bed", label: "Trait-Revealing Bed", x: -2.12, z: 1.42, color: p.accent, note: notes.bed },
    { type: "rug", label: "Screenshot Rug", x: -0.25, z: 0.42, color: p.accent, note: notes.rug },
    { type: "desk", label: "Skill Grind Desk", x: 1.92, z: -1.62, color: p.floor, note: notes.desk },
    { type: "chair", label: "Barely Ergonomic Chair", x: 1.2, z: -1.2, color: p.accent, note: notes.chair },
    { type: "shelf", label: "Lore Shelf", x: 3.06, z: 0.1, rotation: -90, color: p.floor, note: notes.shelf },
    { type: "lamp", label: "Mood-Saving Lamp", x: -2.92, z: -1.95, color: p.light, note: notes.lamp },
    { type: "painting", label: "Personality Poster", x: -1.1, z: -3.33, color: p.accent, note: notes.painting },
    { type: "window", label: "Room-Defining Window", x: 1.35, z: -3.37, color: p.trim, note: notes.window },
    { type: "curtain", label: "Dramatic Curtains", x: 2.15, z: -3.34, color: p.accent, note: notes.curtain },
    { type: "books", label: "Unread Skill Books", x: 2.45, z: 1.55, color: p.accent, note: notes.books },
    { type: "clutter", label: "Actually Useful Clutter", x: 0.68, z: -0.86, color: p.light, note: notes.clutter },
    { type: "candle", label: "Suspicious Candle Cluster", x: -1.1, z: -1.52, color: p.light, note: notes.candle },
    { type: "wardrobe", label: "CAS Emergency Wardrobe", x: -3.05, z: 0.26, rotation: 90, color: p.floor, note: notes.wardrobe },
    { type: "table", label: "Tiny Drama Table", x: 0.85, z: 1.55, color: p.floor, note: notes.table },
  ];

  const extras = {
    vampire: [
      { type: "mirror", label: "Ironic Antique Mirror", x: 3.24, z: -2.18, rotation: -90, color: "#d6e5ef", note: notes.mirror },
      { type: "sofa", label: "Velvet Brooding Settee", x: -0.95, z: -1.72, color: "#7e1537", note: notes.sofa },
      { type: "console", label: "Forbidden Letter Console", x: -3.08, z: -2.2, rotation: 90, color: "#402130", note: notes.console },
      { type: "divider", label: "Coffin Privacy Screen", x: 0.1, z: 2.82, color: "#2c1a24", note: notes.divider },
    ],
    rich: [
      { type: "sofa", label: "Inheritance Settee", x: -0.95, z: -1.72, color: "#d4a72f", note: notes.sofa },
      { type: "mirror", label: "Gold Ego Mirror", x: 3.24, z: -2.18, rotation: -90, color: "#e8c45a", note: notes.mirror },
      { type: "console", label: "Family Portrait Console", x: -3.08, z: -2.2, rotation: 90, color: "#754b25", note: notes.console },
      { type: "crystal", label: "Overpriced Crystal Bowl", x: 0.82, z: 1.55, color: "#fff0a5", note: notes.crystal },
    ],
    starter: [
      { type: "plant", label: "One Affordable Plant", x: -2.88, z: -0.35, color: "#3e8a4d", note: notes.plant },
      { type: "sofa", label: "Thrifted Futon", x: -0.95, z: -1.72, color: "#4f89ad", note: notes.sofa },
      { type: "divider", label: "Makeshift Room Divider", x: 0.12, z: 2.82, color: "#b9aa8c", note: notes.divider },
      { type: "poster", label: "Dream Job Poster", x: -2.7, z: -3.34, color: "#ffb35c", note: notes.poster },
    ],
    alien: [
      { type: "telescope", label: "Definitely Normal Telescope", x: -2.55, z: -2.18, color: "#33e5c5", note: notes.telescope },
      { type: "clutter", label: "Specimen Jars", x: 1.02, z: 1.75, color: "#7af6de", note: notes.clutter },
      { type: "console", label: "Human Disguise Console", x: -3.08, z: -2.2, rotation: 90, color: "#1f5264", note: notes.console },
      { type: "crystal", label: "Glowing Meteor Shard", x: 0.92, z: 1.55, color: "#7af6de", note: notes.crystal },
    ],
    plant: [
      { type: "plant", label: "Dramatic Monstera", x: -2.88, z: -0.35, color: "#3c9058", note: notes.plant },
      { type: "catbed", label: "Royal Cat Bed", x: 1.85, z: 1.86, color: "#e59f5d", note: notes.catbed },
      { type: "plant", label: "Overwatered Fern", x: 2.72, z: -0.86, color: "#2e7a45", note: notes.plant },
      { type: "plant", label: "Hanging Vine Wall", x: -3.12, z: -1.0, rotation: 90, color: "#4aa663", note: notes.plant },
      { type: "poster", label: "Plant Care Calendar", x: -2.7, z: -3.34, color: "#7fbf7c", note: notes.poster },
    ],
    goth: [
      { type: "mirror", label: "Dramatic Black Mirror", x: 3.24, z: -2.18, rotation: -90, color: "#111111", note: notes.mirror },
      { type: "sofa", label: "Sad Velvet Sofa", x: -0.95, z: -1.72, color: "#6d4984", note: notes.sofa },
      { type: "poster", label: "Album-Cover Poster", x: -2.7, z: -3.34, color: "#b782e0", note: notes.poster },
      { type: "crystal", label: "Questionable Crystal", x: 0.82, z: 1.55, color: "#b782e0", note: notes.crystal },
    ],
    witchy: [
      { type: "plant", label: "Potion Herb Planter", x: -2.88, z: -0.35, color: "#3c9058", note: notes.plant },
      { type: "catbed", label: "Familiar's Cat Bed", x: 1.85, z: 1.86, color: "#9d70dd", note: notes.catbed },
      { type: "telescope", label: "Moon Phase Telescope", x: -2.55, z: -2.18, color: "#9d70dd", note: notes.telescope },
      { type: "crystal", label: "Charged Crystal Cluster", x: 0.82, z: 1.55, color: "#e1c2ff", note: notes.crystal },
      { type: "poster", label: "Moon Calendar Poster", x: -2.7, z: -3.34, color: "#c9a8ff", note: notes.poster },
    ],
  };

  return [...common, ...(extras[style] || extras.witchy)];
}

function objectNotes(sim, mood) {
  return {
    bed: `The bed placement tells you ${sim} has priorities: comfort first, routing second, screenshots always.`,
    desk: `This is where ${mood} becomes skill points, unpaid bills, and late-night save-file decisions.`,
    chair: "The chair looks cute enough for a screenshot and questionable enough for actual posture.",
    sofa: "Guests can sit here, but the room makes it clear they are entering someone else's lore.",
    plant: "This plant is not just decor. It is proof the Sim believes they can fix everything with sunlight and denial.",
    rug: "The rug acts like a visual spawn point for the whole room, hiding bad flooring choices beautifully.",
    lamp: "The lamp is doing emotional labor for every object around it.",
    shelf: "A vertical inventory of who lives here: tiny trophies, weird jars, half-finished hobbies, and evidence.",
    painting: "Wall art chosen for narrative value over resale value, as all Sims art should be.",
    poster: "A cheap poster with expensive personality. Perfect for telegraphing wants and backstory.",
    clutter: "The clutter makes the room feel played-in instead of catalogue-perfect.",
    mirror: "A mirror for outfit checks, occult irony, or staring dramatically after a bad date.",
    books: "Skill books stacked where a responsible Sim would put storage.",
    catbed: "The cat bed is in a premium location, confirming who owns the household.",
    telescope: "For science, romance, alien contact, or neighborhood drama. Usually all four.",
    window: "The window changes the whole mood: lighting, aspiration, and whether vampires are making good choices.",
    curtain: "Curtains that turn architecture into personality.",
    candle: "Candles: the cheapest way to imply mystery, ritual, or poor fire-safety decisions.",
    wardrobe: "A CAS emergency station for when the Sim's life changes but the outfit has not caught up.",
    table: "A tiny surface for keys, crystals, homework, or a plot-relevant coffee cup.",
    console: "A console table that exists mainly to hold secrets at waist height.",
    divider: "The divider makes one room feel like three, which is exactly the kind of Sims trick people love.",
    crystal: "A shiny object with enough mystical ambiguity to work in almost any expansion pack.",
  };
}

function buildListFor(style, sim, objects) {
  const items = {
    vampire: ["Blackout curtains", "Velvet loveseat", "Dark paneled wallpaper", "Antique mirror", "Red practical lights", "Old letter clutter"],
    rich: ["Gold-trim wallpaper", "Polished wood floor", "Ornate bed", "Family portraits", "Console table", "Warm chandelier lighting"],
    starter: ["Cheap double bed", "Thrifted desk", "Futon", "Mismatched rug", "Compact wardrobe", "Poster wall"],
    alien: ["Neon wall lights", "Telescope", "Metal desk", "Specimen clutter", "Star chart posters", "Cool blue flooring"],
    plant: ["Terracotta planters", "Green wallpaper", "Cat bed", "Hanging vines", "Wood floors", "Soft yellow lamps"],
    goth: ["Dark wallpaper", "Purple velvet sofa", "Candles", "Black mirror", "Band posters", "Crystal clutter"],
    witchy: ["Moon calendar", "Herb planters", "Purple bedding", "Warm lamps", "Bookshelves", "Crystal clutter"],
  };
  return [`Design target: ${sim}`, ...(items[style] || items.witchy), ...objects.slice(0, 8).map((obj) => obj.label)];
}

function normalizeRoom(room, prompt) {
  const fallback = localRoom(prompt);
  const palette = { ...fallback.palette, ...(room.palette || {}) };
  const sourceObjects = Array.isArray(room.objects) && room.objects.length ? room.objects : fallback.objects;
  return {
    title: String(room.title || fallback.title).slice(0, 88),
    roomType: String(room.roomType || fallback.roomType).slice(0, 64),
    dimensions: normalizeDimensions(room.dimensions),
    story: String(room.story || fallback.story).slice(0, 900),
    palette,
    zones: Array.isArray(room.zones) ? room.zones.slice(0, 5) : fallback.zones,
    objects: sourceObjects.slice(0, 28).map((obj, index) => ({
      id: `${validType(obj.type)}-${index}`,
      type: validType(obj.type),
      label: String(obj.label || obj.type || "Story Object").slice(0, 68),
      x: clamp(Number(obj.x) || 0, -3.25, 3.25),
      z: clamp(Number(obj.z) || 0, -3.25, 3.25),
      rotation: Number(obj.rotation) || 0,
      color: validHex(obj.color) ? obj.color : palette.accent,
      note: String(obj.note || "A small storytelling object with big save-file energy.").slice(0, 320),
    })),
    buildList: Array.isArray(room.buildList) ? room.buildList.slice(0, 22).map(String) : fallback.buildList,
  };
}

function normalizeDimensions(dimensions = {}) {
  return {
    width: clamp(Number(dimensions.width) || 7.4, 5.8, 9.2),
    depth: clamp(Number(dimensions.depth) || 7.4, 5.8, 9.2),
    height: clamp(Number(dimensions.height) || 4.2, 3.2, 5.2),
  };
}

function validType(type) {
  const valid = ["bed", "desk", "sofa", "plant", "rug", "lamp", "shelf", "painting", "clutter", "mirror", "books", "catbed", "telescope", "window", "curtain", "wardrobe", "chair", "table", "divider", "poster", "candle", "console", "crystal"];
  return valid.includes(type) ? type : "clutter";
}

function validHex(color) {
  return /^#[0-9a-f]{6}$/i.test(color || "");
}

function initThree() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(6.8, 5.7, 7.5);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  els.scene.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 5;
  controls.maxDistance = 14;
  controls.target.set(0, 1.15, 0);

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
  scene.background = new THREE.Color(0x11110f);
  addLights(room.palette);
  addRoomShell(room);
  addZones(room);
  room.objects.forEach(addObject);
  updateOutput(room);
  renderRoomCards(room.roomType || room.title);
}

function addLights(p) {
  scene.add(new THREE.HemisphereLight(0xfff4dd, 0x161014, 2.2));
  const sun = new THREE.DirectionalLight(0xfff1d0, 3.2);
  sun.position.set(4.6, 7.8, 5.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun);
  const accent = new THREE.PointLight(p.light, 4, 8.5);
  accent.position.set(-2.8, 2.25, -2.1);
  scene.add(accent);
  const rim = new THREE.PointLight(p.accent, 2.4, 9);
  rim.position.set(3, 2.8, 2.8);
  scene.add(rim);
}

function addRoomShell(room) {
  const { width, depth, height } = room.dimensions;
  const p = room.palette;
  const floor = mesh(new THREE.BoxGeometry(width, 0.18, depth), p.floor, [0, -0.09, 0]);
  floor.receiveShadow = true;
  scene.add(floor);

  const backWall = mesh(new THREE.BoxGeometry(width, height, 0.18), p.wall, [0, height / 2 - 0.04, -depth / 2]);
  const leftWall = mesh(new THREE.BoxGeometry(0.18, height, depth), p.wall, [-width / 2, height / 2 - 0.04, 0]);
  scene.add(backWall, leftWall);

  addTrim(width, depth, height, p.trim);
  addWallpaperPattern(width, depth, height, p.accent);
  addCeilingGrid(width, depth, height, p.trim);
  const platform = mesh(new THREE.BoxGeometry(width + 0.45, 0.12, depth + 0.45), "#090908", [0, -0.22, 0]);
  scene.add(platform);
}

function addTrim(width, depth, height, color) {
  const strips = [
    [new THREE.BoxGeometry(width, 0.1, 0.16), [0, 0.18, -depth / 2 + 0.08]],
    [new THREE.BoxGeometry(0.16, 0.1, depth), [-width / 2 + 0.08, 0.18, 0]],
    [new THREE.BoxGeometry(width, 0.12, 0.18), [0, height - 0.18, -depth / 2 + 0.08]],
    [new THREE.BoxGeometry(0.18, 0.12, depth), [-width / 2 + 0.08, height - 0.18, 0]],
  ];
  strips.forEach(([geo, pos]) => scene.add(mesh(geo, color, pos)));
}

function addWallpaperPattern(width, depth, height, color) {
  for (let x = -width / 2 + 0.65; x < width / 2; x += 0.72) {
    scene.add(mesh(new THREE.BoxGeometry(0.035, height - 0.6, 0.035), color, [x, height / 2, -depth / 2 + 0.102]));
  }
  for (let z = -depth / 2 + 0.65; z < depth / 2; z += 0.72) {
    scene.add(mesh(new THREE.BoxGeometry(0.035, height - 0.6, 0.035), color, [-width / 2 + 0.102, height / 2, z]));
  }
}

function addCeilingGrid(width, depth, height, color) {
  for (let x = -width / 2 + 0.9; x < width / 2; x += 1.35) scene.add(mesh(new THREE.BoxGeometry(0.06, 0.06, depth), color, [x, height + 0.05, 0]));
  for (let z = -depth / 2 + 0.9; z < depth / 2; z += 1.35) scene.add(mesh(new THREE.BoxGeometry(width, 0.06, 0.06), color, [0, height + 0.06, z]));
}

function addZones(room) {
  const colors = [room.palette.accent, room.palette.light, room.palette.trim, "#ffffff"];
  room.zones?.slice(0, 4).forEach((zone, index) => {
    const x = [-2.1, 1.9, -2.15, 1.85][index] || 0;
    const z = [1.95, -1.95, -1.95, 1.95][index] || 0;
    const zoneMesh = mesh(new THREE.CylinderGeometry(0.76, 0.76, 0.025, 46), colors[index], [x, 0.025, z], [0, 0, 0], 0.18);
    zoneMesh.userData = { label: zone.name, note: zone.description, type: "zone" };
    clickable.push(zoneMesh);
    scene.add(zoneMesh);
  });
}

function addObject(obj) {
  const group = new THREE.Group();
  group.position.set(obj.x, 0, obj.z);
  group.rotation.y = THREE.MathUtils.degToRad(obj.rotation || 0);
  group.userData = obj;
  const c = obj.color;

  const add = (geo, color, pos, rot = [0, 0, 0], opacity = 1) => group.add(mesh(geo, color, pos, rot, opacity));

  if (obj.type === "bed") {
    add(new THREE.BoxGeometry(1.65, 0.42, 2.15), c, [0, 0.34, 0]);
    add(new THREE.BoxGeometry(1.65, 0.28, 0.32), "#f4eadb", [0, 0.77, -0.74]);
    add(new THREE.BoxGeometry(1.54, 0.18, 1.15), lighten(c, 0.22), [0, 0.68, 0.34]);
    add(new THREE.BoxGeometry(1.85, 1.0, 0.18), darken(c, 0.16), [0, 0.78, -1.16]);
  } else if (obj.type === "desk") {
    add(new THREE.BoxGeometry(1.55, 0.16, 0.76), c, [0, 0.82, 0]);
    [-0.62, 0.62].forEach((x) => [-0.28, 0.28].forEach((z) => add(new THREE.BoxGeometry(0.1, 0.82, 0.1), darken(c, 0.1), [x, 0.4, z])));
    add(new THREE.BoxGeometry(0.48, 0.32, 0.08), "#1d2530", [0.26, 1.08, -0.16]);
  } else if (obj.type === "chair") {
    add(new THREE.BoxGeometry(0.58, 0.16, 0.58), c, [0, 0.48, 0]);
    add(new THREE.BoxGeometry(0.58, 0.78, 0.12), c, [0, 0.83, 0.26]);
    add(new THREE.CylinderGeometry(0.04, 0.04, 0.48, 12), darken(c, 0.18), [0, 0.24, 0]);
  } else if (obj.type === "sofa") {
    add(new THREE.BoxGeometry(1.9, 0.46, 0.86), c, [0, 0.36, 0]);
    add(new THREE.BoxGeometry(1.92, 0.96, 0.18), darken(c, 0.08), [0, 0.76, 0.4]);
    add(new THREE.BoxGeometry(0.22, 0.62, 0.86), darken(c, 0.08), [-1.06, 0.56, 0]);
    add(new THREE.BoxGeometry(0.22, 0.62, 0.86), darken(c, 0.08), [1.06, 0.56, 0]);
  } else if (obj.type === "plant") {
    add(new THREE.CylinderGeometry(0.25, 0.19, 0.36, 20), "#b86d42", [0, 0.18, 0]);
    add(new THREE.ConeGeometry(0.52, 1.05, 9), c, [0, 0.94, 0]);
    add(new THREE.SphereGeometry(0.32, 16, 16), lighten(c, 0.18), [0.18, 1.23, 0.08]);
  } else if (obj.type === "rug") {
    add(new THREE.CylinderGeometry(1.25, 1.25, 0.035, 64), c, [0, 0.04, 0], [0, 0, 0], 0.78);
    add(new THREE.TorusGeometry(1.04, 0.026, 8, 64), lighten(c, 0.3), [0, 0.07, 0], [Math.PI / 2, 0, 0]);
  } else if (obj.type === "lamp") {
    add(new THREE.CylinderGeometry(0.055, 0.055, 1.22, 16), "#3e333a", [0, 0.62, 0]);
    add(new THREE.ConeGeometry(0.38, 0.46, 26), c, [0, 1.36, 0]);
    const light = new THREE.PointLight(c, 1.6, 3.4);
    light.position.set(0, 1.25, 0);
    group.add(light);
  } else if (obj.type === "shelf") {
    add(new THREE.BoxGeometry(0.94, 1.82, 0.22), c, [0, 0.92, 0]);
    [0.38, 0.86, 1.34].forEach((y) => add(new THREE.BoxGeometry(1.08, 0.075, 0.32), lighten(c, 0.25), [0, y, 0]));
    add(new THREE.SphereGeometry(0.1, 12, 12), "#f4d36b", [-0.25, 1.05, -0.13]);
  } else if (["painting", "poster"].includes(obj.type)) {
    add(new THREE.BoxGeometry(1.18, 0.82, 0.055), c, [0, 1.72, 0]);
    add(new THREE.BoxGeometry(0.9, 0.56, 0.06), lighten(c, 0.28), [0, 1.72, 0.035]);
  } else if (obj.type === "window") {
    add(new THREE.BoxGeometry(1.22, 1.02, 0.06), "#9fd8ff", [0, 1.72, 0], [0, 0, 0], 0.72);
    add(new THREE.BoxGeometry(1.38, 0.08, 0.09), c, [0, 2.26, 0.02]);
    add(new THREE.BoxGeometry(1.38, 0.08, 0.09), c, [0, 1.18, 0.02]);
    add(new THREE.BoxGeometry(0.08, 1.1, 0.09), c, [-0.68, 1.72, 0.02]);
    add(new THREE.BoxGeometry(0.08, 1.1, 0.09), c, [0.68, 1.72, 0.02]);
  } else if (obj.type === "curtain") {
    add(new THREE.BoxGeometry(0.28, 1.34, 0.08), c, [-0.58, 1.62, 0]);
    add(new THREE.BoxGeometry(0.28, 1.34, 0.08), c, [0.58, 1.62, 0]);
    add(new THREE.CylinderGeometry(0.035, 0.035, 1.55, 12), "#efe1bd", [0, 2.34, 0], [0, 0, Math.PI / 2]);
  } else if (obj.type === "mirror") {
    add(new THREE.BoxGeometry(0.84, 1.42, 0.06), "#ccecff", [0, 1.28, 0], [0, 0, 0], 0.8);
    add(new THREE.TorusGeometry(0.56, 0.045, 10, 42), c, [0, 1.28, 0.04]);
  } else if (obj.type === "books") {
    for (let i = 0; i < 6; i += 1) add(new THREE.BoxGeometry(0.15, 0.42 + i * 0.025, 0.34), i % 2 ? c : "#f0c765", [-0.43 + i * 0.17, 0.24, 0]);
  } else if (obj.type === "catbed") {
    add(new THREE.TorusGeometry(0.44, 0.14, 12, 36), c, [0, 0.23, 0], [Math.PI / 2, 0, 0]);
    add(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 36), "#ffe0bd", [0, 0.16, 0]);
    add(new THREE.SphereGeometry(0.16, 14, 14), "#2b2525", [0.08, 0.32, 0.04]);
  } else if (obj.type === "telescope") {
    add(new THREE.CylinderGeometry(0.13, 0.13, 1.15, 20), c, [0, 0.95, 0], [0, 0, Math.PI / 2.6]);
    add(new THREE.CylinderGeometry(0.045, 0.045, 1.15, 12), "#2c2831", [0, 0.48, 0]);
    add(new THREE.CylinderGeometry(0.04, 0.04, 0.95, 12), "#2c2831", [0.28, 0.4, 0.18], [0.45, 0, 0.3]);
  } else if (obj.type === "wardrobe") {
    add(new THREE.BoxGeometry(1.0, 1.82, 0.48), c, [0, 0.91, 0]);
    add(new THREE.BoxGeometry(0.035, 1.58, 0.52), lighten(c, 0.18), [0, 0.94, 0.03]);
    add(new THREE.SphereGeometry(0.04, 12, 12), "#f4d16a", [-0.12, 0.94, 0.29]);
    add(new THREE.SphereGeometry(0.04, 12, 12), "#f4d16a", [0.12, 0.94, 0.29]);
  } else if (obj.type === "table" || obj.type === "console") {
    const w = obj.type === "console" ? 1.32 : 0.92;
    add(new THREE.BoxGeometry(w, 0.16, 0.54), c, [0, 0.68, 0]);
    [-w / 2 + 0.12, w / 2 - 0.12].forEach((x) => [-0.2, 0.2].forEach((z) => add(new THREE.BoxGeometry(0.08, 0.66, 0.08), darken(c, 0.15), [x, 0.34, z])));
  } else if (obj.type === "divider") {
    [-0.42, 0, 0.42].forEach((x, i) => add(new THREE.BoxGeometry(0.38, 1.45, 0.08), i % 2 ? lighten(c, 0.1) : c, [x, 0.78, 0]));
  } else if (obj.type === "candle") {
    [-0.18, 0.05, 0.24].forEach((x, i) => {
      add(new THREE.CylinderGeometry(0.08, 0.08, 0.28 + i * 0.08, 16), "#f5e8c8", [x, 0.15 + i * 0.04, 0]);
      add(new THREE.SphereGeometry(0.07, 12, 12), c, [x, 0.34 + i * 0.08, 0]);
    });
  } else if (obj.type === "crystal") {
    add(new THREE.OctahedronGeometry(0.26), c, [0, 0.35, 0]);
    add(new THREE.OctahedronGeometry(0.18), lighten(c, 0.28), [0.25, 0.28, 0.12]);
  } else {
    add(new THREE.BoxGeometry(0.5, 0.48, 0.5), c, [0, 0.25, 0]);
    add(new THREE.SphereGeometry(0.17, 16, 16), "#fff1c7", [0.18, 0.6, -0.12]);
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

function mesh(geometry, color, position, rotation = [0, 0, 0], opacity = 1) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.76,
    metalness: 0.06,
    transparent: opacity < 1,
    opacity,
  });
  const item = new THREE.Mesh(geometry, material);
  item.position.set(...position);
  item.rotation.set(...rotation);
  return item;
}

function updateOutput(room) {
  els.roomTitle.textContent = room.title;
  els.roomStory.textContent = room.story;
  els.roomSize.textContent = `${room.dimensions.width.toFixed(1)} x ${room.dimensions.depth.toFixed(1)}`;
  els.objectCount.textContent = `${room.objects.length} objects`;
  els.selectedName.textContent = "Nothing selected";
  els.selectedNote.textContent = "Click furniture, wall decor, or clutter in the room.";
  els.buildList.innerHTML = "";
  room.buildList.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    els.buildList.appendChild(li);
  });
}

function renderRoomCards(active = "") {
  els.roomCards.innerHTML = "";
  roomTemplates.forEach((template) => {
    const p = palettes[template.key];
    const button = document.createElement("button");
    button.className = `room-card ${active.toLowerCase().includes(template.key) ? "active" : ""}`;
    button.style.setProperty("--swatch", `linear-gradient(135deg, ${p.wall}, ${p.floor} 55%, ${p.accent})`);
    button.innerHTML = `<span class="room-swatch"></span><strong>${template.label}</strong><span>${template.text}</span>`;
    button.addEventListener("click", () => {
      els.prompt.value = template.text;
      generateRoom(true);
    });
    els.roomCards.appendChild(button);
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
  els.selectedName.textContent = obj.label || obj.name || "Room Detail";
  els.selectedNote.textContent = obj.note || obj.description || "A detail that helps the room feel playable.";
}

function resize() {
  const rect = els.scene.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
  renderer.setSize(rect.width, rect.height, false);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

function extractJson(content) {
  const trimmed = content.trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1) return trimmed;
  return trimmed.slice(start, end + 1);
}

function selectedLabel(select) {
  return select.options[select.selectedIndex]?.textContent || select.value;
}

function setStatus(message, type) {
  els.status.textContent = message;
  els.status.style.borderColor = type === "warn" ? "rgba(255, 135, 183, 0.35)" : type === "work" ? "rgba(143, 215, 255, 0.32)" : "rgba(215, 255, 95, 0.28)";
  els.status.style.color = type === "warn" ? "#ffb2cc" : type === "work" ? "#bfe9ff" : "#d7ff5f";
}

function startProgress(title, message) {
  clearInterval(progressTimerId);
  progressStartedAt = Date.now();
  els.progressTitle.textContent = title;
  els.progressTimer.textContent = "0s";
  els.progressBar.style.width = "8%";
  els.progressText.textContent = message;
  progressTimerId = setInterval(() => {
    const elapsed = Math.max(0, Math.round((Date.now() - progressStartedAt) / 1000));
    els.progressTimer.textContent = `${elapsed}s`;
    const current = Number.parseFloat(els.progressBar.style.width) || 8;
    if (current < 88) els.progressBar.style.width = `${Math.min(88, current + 0.55)}%`;
  }, 1000);
}

function advanceProgress(percent, message) {
  els.progressBar.style.width = `${clamp(percent, 0, 100)}%`;
  appendProgressLine(message);
}

function finishProgress(message) {
  clearInterval(progressTimerId);
  els.progressBar.style.width = "100%";
  appendProgressLine(message);
  const elapsed = Math.max(0, Math.round((Date.now() - progressStartedAt) / 1000));
  els.progressTimer.textContent = `${elapsed}s done`;
}

function failProgress(message) {
  clearInterval(progressTimerId);
  els.progressBar.style.width = "100%";
  appendProgressLine(message);
  const elapsed = progressStartedAt ? Math.max(0, Math.round((Date.now() - progressStartedAt) / 1000)) : 0;
  els.progressTimer.textContent = `${elapsed}s stopped`;
}

function updateStreamProgress(text, reasoning) {
  const progress = clamp(18 + Math.floor((text.length + reasoning.length) / 70), 18, 94);
  els.progressBar.style.width = `${progress}%`;
  const blocks = [];
  if (reasoning) blocks.push(`[thinking stream]\n${tail(reasoning, 1600)}`);
  if (text) blocks.push(`[room JSON stream]\n${tail(text, 2600)}`);
  els.progressText.textContent = blocks.join("\n\n") || "Connected. Waiting for first tokens from NVIDIA...";
  els.progressText.scrollTop = els.progressText.scrollHeight;
}

function appendProgressLine(message) {
  const prefix = els.progressText.textContent && els.progressText.textContent !== "Waiting for the next model call." ? "\n" : "";
  els.progressText.textContent = tail(`${els.progressText.textContent}${prefix}${message}`, 5200);
  els.progressText.scrollTop = els.progressText.scrollHeight;
}

function tail(value, maxLength) {
  return value.length > maxLength ? `...${value.slice(-maxLength)}` : value;
}

function friendlyError(error) {
  const message = String(error.message || error).replace(/Bearer\s+[A-Za-z0-9_.-]+/g, "Bearer [hidden]");
  if (/failed to fetch|load failed|networkerror/i.test(message)) {
    return `${message}. This usually means the browser blocked the NVIDIA request with CORS, or the network could not reach NVIDIA from this page.`;
  }
  return message;
}

async function copyText(text, message) {
  await navigator.clipboard.writeText(text || "");
  setStatus(message, "ok");
}

function resetConceptImage() {
  els.conceptImage.className = "concept-empty";
  els.conceptImage.textContent = "Use an NVIDIA image model to generate a moodboard image for the room.";
}

function persistKeyChoice() {
  if (els.rememberKey.checked && els.apiKey.value.trim()) {
    localStorage.setItem("simrooms.nvidiaKey", els.apiKey.value.trim());
    localStorage.setItem("simrooms.rememberKey", "true");
  } else {
    localStorage.removeItem("simrooms.nvidiaKey");
    localStorage.removeItem("simrooms.rememberKey");
  }
}

function restoreKey() {
  if (localStorage.getItem("simrooms.rememberKey") === "true") {
    els.apiKey.value = localStorage.getItem("simrooms.nvidiaKey") || "";
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

function lighten(color, amount) {
  return shiftColor(color, Math.abs(amount));
}

function darken(color, amount) {
  return shiftColor(color, -Math.abs(amount));
}

function shiftColor(color, amount) {
  const hex = validHex(color) ? color.slice(1) : "999999";
  const num = parseInt(hex, 16);
  const r = clamp(Math.round(((num >> 16) & 255) + 255 * amount), 0, 255);
  const g = clamp(Math.round(((num >> 8) & 255) + 255 * amount), 0, 255);
  const b = clamp(Math.round((num & 255) + 255 * amount), 0, 255);
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}
