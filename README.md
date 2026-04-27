# SimSpark Room Oracle

An interactive Sims-inspired room simulator. Describe a Sim or room vibe and get a stylized 3D room, object lore, and a build list to recreate in The Sims.

## Run Locally

Use any static file server from this directory:

```sh
python -m http.server 5173
```

Then open `http://localhost:5173`.

## NVIDIA Key

The app can call NVIDIA's OpenAI-compatible chat completions endpoint from the browser if the user enters their own API key. The key is not stored unless the user enables "Remember locally", and then it is stored only in that browser's `localStorage`.

Do not hardcode API keys in this project.

If no key is entered, the app uses a local procedural generator.

## Sharing

This is a static site and can be hosted on GitHub Pages, Netlify, Vercel, Cloudflare Pages, or any plain web server.

## Files

- `index.html`: app shell and CDN imports
- `styles.css`: responsive UI styling
- `app.js`: Three.js rendering, prompt generation, NVIDIA API call, and fallback generator
