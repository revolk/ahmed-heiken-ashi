# Ahmed Heiken Ashi

Personal system for reading gold (XAUUSD) trading signals from Telegram channels.
Personal use only, not for resale or redistribution.

## Architecture

Telegram + MT5 feed engine/ (trade state machine), which persists via
persistence/ to MongoDB, and dashboard/ displays the live chart.

## Quick Start

npm install --ignore-scripts
cp .env.example .env
node index.js

See .env.example for required environment variables.

## Running Tests

npm test
node test/messageRouter.test.js
node test/persistenceLayer.test.js
node test/tickIngestor.test.js
node test/authService.test.js

## MT5 Bridge

The official MetaTrader5 library only runs on Windows, so
mt5-bridge/price_bridge.py must run on a separate Windows machine/VPS,
sending prices via WebSocket to priceFeed/.

## Dashboard

cd dashboard
npm install
npm run dev
npm run build

## Operational Notes

- The project assumes connection interruptions and auto-recovers missed events.
- .env must never be committed (already in .gitignore).
- index.js is the single entry point that wires everything together.
