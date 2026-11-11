# PM2.5 KANCHANABURI — Online Pixel Board Game

## Updated build
- Wider rectangular 40-space board for clearer reading.
- Player lobby includes name and male/female engineer selection.
- Four team colors: red, blue, green, yellow.
- Multiplayer rooms for up to four players using Socket.IO.
- Server-authoritative 30-minute game timer, displayed as elapsed MM:SS from 00:00 to 30:00.
- Buying or passing an unowned property automatically advances to the next player's turn.
- For other spaces, the active player rolls once and presses End Turn to pass the turn.
- Kanchanaburi landscape background and pixel-art character assets.

## Run locally
1. Install Node.js 18+.
2. In this folder run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:3000`.

## Deploy on Render
- Build command: `npm install`
- Start command: `npm start`
- Runtime: Node
- Health check: `/health`

The game is a multiplayer prototype. Room state is held in server memory and will reset when the service restarts or redeploys.
