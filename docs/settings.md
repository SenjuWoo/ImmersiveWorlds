# Settings

[Back to the README](../README.md)

**Extensions → Immersive Worlds.** The panel's Manage tab has the two most-used toggles.

| Setting | Default | What it does |
| --- | --- | --- |
| Enabled | on | Master switch |
| Update after each reply | on | Background director after every AI reply |
| Run every | reply | Director every N replies |
| Never write the user's words… | on | Agency line in the scene brief |
| Show time and place above the chat input | on | Status strip |
| Scene backdrop | Time-of-day grade | *Off* (your own background untouched), *grade only*, or *Painted scene* for the place you are in |
| Weather particles | on | Rain, snow, fog, dust; stops under reduced motion |
| Weather you can hear | off | The synthesised weather bed and thunder; silent while the tab is in the background |
| Volume | 60 | Master volume for the weather bed and thunder |
| Thunder, with a flash of lightning | on | The screen flashes and the clap follows 0.4–4 s later; no flash under reduced motion |
| Place sounds | on | Water, fire, room tone, leaves and a distant hum, mixed per place kind |
| One-shots | on | Birds, drips, creaks, footsteps, doors, coins, chairs and pages, at most one every 700 ms |
| Standing bar | on | A person's true feeling for you, −5…+5, as a bar in their card and a dot in the room list. Off removes the field from the director prompt entirely |
| Rumours | on | People who share a room pass on what they were told, at most one fact per room per tick, shown as **Told** in the listener's card with the teller named; never added to your own dossier |
| Who thinks what of whom | on | A person's opinion of another person, −5…+5, listed under **Toward** in their card. Off removes the field from the prompt |
| Scene backdrop → Generated picture | off | A generated picture of the place, day and night (needs an image backend); the painted scene shows until it is ready |
| Most pictures per chat | 12 | Cap on generated pictures (4–40) |
| Offer a Draw button on item cards | off | Item pictures, only when you press it |
| Draw portraits for people with no picture | off | Only people the HUD shows, from how you see them |
| Test image generation / Clear generated art | | Draws one small picture to prove the backend works; forgets this chat's pictures (files stay on disk) |
| Show the HUD | on | The floating HUD beside the chat (the status strip hides while it shows) |
| What the HUD reveals | Only what I sense | Or *Everything nearby*, or *Everything* (real names, hidden truths, secrets) |
| Background model | Current connection | Current connection, a connection profile, or *Pick a model* |
| Send it to / Model | OpenRouter | With *Pick a model*: OpenRouter (uses the OpenRouter key saved in SillyTavern; live list with prices) or the current connection with a model name you type (local backends) |
| Ideas button | On request | On request, after every update, or off |
| Style | Actions | Ideas as clickable first-person actions, or gentle nudges |
| Use expression sprites as faces | on | Character sprites when available |
| Skip model reasoning | on | Reasoning off for world updates (faster, cheaper) |
| Pause the director if the API rejects its request | on | Stops retry storms on providers that refuse the call |
| Growth | Lively | How much new content each pass may add |
| New people / items / places / off-screen events | on | Creation switches |
| Update tokens / World-build tokens | 1200 / 3000 | Response budgets |
| Temperature | 0.4 | Background-call temperature (Forge uses at least 0.8) |
| Prompt depth | 1 | Chat depth of the scene brief |
| Debug log | off | Verbose log in the browser console |
