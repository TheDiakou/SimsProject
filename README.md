# SimRooms Studio

An interactive Sims-inspired room simulator. Describe a Sim or room vibe and get a stylized 3D room, object lore, model-assisted concept art, and a build list to recreate in The Sims.

## Run Locally

Use any static file server from this directory:

```sh
python -m http.server 5173
```

Then open `http://localhost:5173`.

## NVIDIA Key

The app can call NVIDIA's OpenAI-compatible chat completions endpoint from the browser if the user enters their own API key. It also includes image model choices for concept art generation through NVIDIA's image generation endpoint.

The key is not stored unless the user enables "Remember locally", and then it is stored only in that browser's `localStorage`.

Do not hardcode API keys in this project.

If no key is entered, the app uses a local procedural generator for the 3D room. Concept art requires a live NVIDIA image model call.

## Sharing

This is a static site and can be hosted on GitHub Pages, Netlify, Vercel, Cloudflare Pages, or any plain web server.

## Files

- `index.html`: app shell, model selectors, and CDN imports
- `styles.css`: responsive awwwards-inspired UI styling
- `app.js`: Three.js room rendering, prompt generation, NVIDIA model calls, concept art, and fallback generator
