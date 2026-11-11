# PM2.5 KANCHANABURI — Online Pixel Board Game

## Features
- Wide readable 40-space board with 45-degree isometric presentation.
- Kanchanaburi attractions as properties.
- Environmental-engineering player tokens (pixel-style hard hat, safety vest and sampling kit).
- Online rooms for up to four players using Socket.IO.
- Shareable room links: `https://YOUR-DOMAIN/?room=ROOMCODE`.
- User-supplied Kanchanaburi landscape image is used as the page background.

## Run locally
1. Install Node.js 18+.
2. In this folder run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:3000` in multiple browser windows/devices on the same network.

## Deploy on Render
1. Upload this folder to a GitHub repository.
2. Create a Render **Web Service** connected to that repository.
3. Build command: `npm install`
4. Start command: `npm start`
5. After deploy, open the Render URL. Share links like `https://YOUR-RENDER-SERVICE.onrender.com/?room=ROOMCODE`.

The room URL is generated from the browser's current host by the client in production; this project is a deployable source package, not a live hosted service yet.

## Notes
This is a playable multiplayer prototype. It currently includes room creation/joining, synchronized turns, dice, property purchase, rent and random community events. Add persistence/reconnect recovery, trade, mortgages, buildings, and stronger anti-cheat validation before production use.

## Player character sprites
Four environmental-engineer character sprites are included under `assets/`:
- `engineer-red.png`
- `engineer-blue.png`
- `engineer-green.png`
- `engineer-yellow.png`

Each player appears as a pixel-art engineer wearing a white hard hat, team-color jacket, cargo trousers and work boots. The same sprites are used in the player panel and on the board. `character-design-reference.png` contains the full four-color turnaround reference.


## Latest update: movement and dice animations
- Player tokens animate one space at a time after a dice roll.
- Dice animate while the roll is being processed.
- Unowned purchasable properties show a private purchase dialog to the player who landed there, after a 3-second pause.
- The dialog shows the exact property name and price, with Buy / Don't buy actions.
- Male and female character sprites are provided in four team colors (maroon, blue, green, orange).
