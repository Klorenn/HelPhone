# HelPhone

HelPhone is a React + Vite community emergency response app built on Stellar. It combines wallet-gated help requests, Soroban contracts, and a local ZK prover for private location attestation.

## What it does

- Request help from nearby people
- Offer help to active requests on the map
- Generate a ZK location proof through the local prover server
- Fund testnet accounts automatically through Friendbot
- Record a final `Stellar Expert` verification on-chain and locally

## Stack

- React 19
- Vite 8
- Mapbox GL
- Stellar SDK + Soroban contracts
- Noir + Barretenberg for ZK
- Stellar Wallets Kit for wallet connect

## Local setup

```bash
npm install
npm run dev
```

`npm run dev` starts both services:
- `http://localhost:3000`
- Vite app
- local ZK prover on `http://localhost:3001`

Build:

```bash
npm run build
npm run preview
```

## Environment

Create or edit `.env`:

```bash
VITE_MAPBOX_TOKEN=...
VITE_AEGIS_VAULT_ID=...
VITE_ZK_PROVER_URL=/zk
```

`VITE_MAPBOX_TOKEN` is required for location search.
`VITE_AEGIS_VAULT_ID` is required for the ZK claim flow.
`VITE_ZK_PROVER_URL` defaults to `/zk`, which Vite proxies to the local prover.

## Wallet flow

- The sidebar profile button opens the Stellar Wallets Kit auth modal.
- The user must connect a wallet before requesting or offering help.
- The connected address is used for proof generation, funding checks, and contract calls.

## ZK flow

- `server/index.js` loads the Noir circuit from `circuits/target/aegis.json`.
- The local prover warms CRS once on startup.
- `src/lib/zk.js` requests proofs from the local prover instead of blocking the browser.
- Browser fallback is disabled by default. Set `VITE_ZK_BROWSER_FALLBACK=true` only for debugging.
- The proof fingerprint is recorded with the final verification event.

## On-chain records

HelPhone now stores a verification history in the `helphone-contract` Soroban contract.

Each record includes:

- wallet address
- action name
- transaction hash
- proof fingerprint
- timestamp

That record is also mirrored into localStorage for the popup UI.

## Project structure

```text
src/
  App.jsx
  App.css
  main.jsx
  lib/
  pages/
contract/
  contracts/helphone-contract/
contracts/
  aegis_vault/
  noir_verifier/
circuits/
docs/
```

## Useful commands

```bash
npm run build
npm run dev
npm run server
```

Contract checks:

```bash
cd contract && cargo test
cd contracts/aegis_vault && cargo test
cd contracts/noir_verifier && cargo test
```

## Notes

- The repo is already under git.
- The ZK bundle is intentionally large and loaded on demand.
- `Stellar Expert` is the final verification popup shown after successful on-chain actions.
