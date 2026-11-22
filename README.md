# ProTanki New Supplies UI & Box Textures

Browser extension for [ProTanki](https://pro-tanki.online/en) that changes how the supplies bar and the boxes look.

It only changes the look. Supplies, cooldowns and everything else in the game work exactly the same, the extension just draws them differently.

## What you get
- new supply icons and colours on the bar
- the tile fills with the supply's colour while the effect runs and a dark cover runs off during the cooldown
- a small flash and light beam when a supply is ready again, and sounds for it
- newer textures for the boxes
- supplies bar centered on the screen

## About safety
Everything is plain JavaScript and CSS, you can read it here. It only runs on the game page (play-protanki.com), doesn't ask for any browser permissions and doesn't send anything anywhere. It reads the messages the game already gets (to know when a cooldown ends) but never sends anything to the game or changes how it works.

## Install (Chrome, Edge, Brave, Opera etc.)
1. Download the ZIP from Releases and extract it.
2. Go to `chrome://extensions` (Edge: `edge://extensions`, Brave: `brave://extensions`) or open the extensions menu of your browser, and turn on **Developer mode**. It's usually in the top right corner (in Edge it's in the left sidebar).
3. Click **Load unpacked** and pick the extracted folder (the one with `manifest.json` inside).
4. If you are already in game, refresh it with Ctrl+F5.

Don't delete or move the folder afterwards, the browser loads the extension from it.

## Updates
The game can change and break the extension. If that happens it turns itself off and the game looks normal again. I can't promise I'll fix it.
