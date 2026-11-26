# Project map

[Back to the README](../README.md)

```text
manifest.json   SillyTavern manifest (loading_order 6, activate hook)
index.js        host: settings, per-chat world, injection, director pipeline, panel, commands, macros
engine.js       pure world model: schema, patching under the rules, scene brief, prompts
rules.js        pure: paths with walking time and openness, shortest routes, time caps, people in transit, rumours
senses.js       pure: what the user's character perceives (the HUD's view), Peek
hud.js          the floating HUD
llm.js          background calls (profile / OpenRouter model / current connection → generateRaw), JSON parsing
models.js       OpenRouter model list, reasoning-effort fallback, error wording (identical in Immersive Adventures)
dossier.js      what you learned about each person, your notes and removals
hints.js        the Ideas prompt and a filter that keeps only ideas resting on things you can see
faces.js        sprite, avatar or monogram faces
scenery.js      pure: place kind from free text, sky palette per time and weather, particle spec
backdrop.js     the backdrop layer: grade, painted scene, skyline drawings
particles.js    the weather canvas (rain, snow, fog, dust)
audio.js        pure: weather kind + place kind -> gains and filter cutoffs, thunder timing
player.js       the weather you can hear: one AudioContext, noise and filters, parameter ramps
art.js          pure: picture store, safe prompts, one-at-a-time queue (the image call itself is in index.js)
kit.js          shared panel kit (identical in Immersive Adventures)
settings.html   settings drawer
style.css       shared kit block + backdrop + particles + HUD
tests/          node tests/selftest.js · npm run lint (parse gate)
```

State lives in chat metadata key `immersive_worlds_state_v1`; your dossier notes and removals live in `immersive_worlds_notes_v1`. Worlds from 1.x, 2.0, 2.1 and 2.2 load unchanged.
