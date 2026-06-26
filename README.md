# HelPhone

HelPhone is a React + Vite community emergency response app built on Stellar. It combines wallet-gated help requests, Soroban contracts, and a browser ZK flow for private location attestation.

## What it does

- Request help from nearby people
- Offer help to active requests on the map
- Generate a ZK location proof in the browser
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

Dev server:
- `http://localhost:3000`

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
```

`VITE_MAPBOX_TOKEN` is required for location search.
`VITE_AEGIS_VAULT_ID` is required for the ZK claim flow.

## Wallet flow

- The sidebar profile button opens the Stellar Wallets Kit auth modal.
- The user must connect a wallet before requesting or offering help.
- The connected address is used for proof generation, funding checks, and contract calls.

## ZK flow

- `src/lib/zk.js` loads the Noir circuit from `circuits/target/aegis.json`.
- The proof is generated lazily in the browser.
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
