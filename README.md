# ProTanki New Supplies UI & Box Textures

Browser extension for play-protanki.com that changes how the supplies bar and the boxes look.

It only changes the look. Supplies, cooldowns and everything else in the game work exactly the same, the extension just draws them differently.

## What you get
- new supply icons and colours on the bar
- the tile fills with the supply's colour while the effect runs and a dark cover runs off during the cooldown
- a small flash and light beam when a supply is ready again, and sounds for it
- newer textures for the boxes
- supplies bar centered on the screen

## About safety
Everything is plain JavaScript and CSS, you can read it here. It only runs on play-protanki.com, doesn't ask for any browser permissions and doesn't send anything anywhere. It reads the messages the game already gets (to know when a cooldown ends) but never sends anything to the game or changes how it works.

If a game update breaks it, the extension turns itself off and the game goes back to looking normal.

## Install (Chrome, Edge, Brave, Opera)
1. Download the ZIP from Releases and unzip it.
2. Go to `chrome://extensions` (Edge: `edge://extensions`) and turn on Developer mode.
3. Click Load unpacked and pick the unzipped folder (the one with manifest.json in it).
4. Refresh the game (Ctrl+F5).

To update, replace the folder with the new version and hit the reload button on the extension.

## Something not working?
Press F12 in a battle and look in the console for a line starting with `[New Supplies] self-check:`. If something broke after a game update, open an issue and paste that line.
