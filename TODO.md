# TODO

## Production readiness

- Deploy `aegis_vault` to testnet/mainnet and set `VITE_AEGIS_VAULT_ID`
- Decide whether `helphone-contract` should be deployed separately or bundled per environment
- Add a real indexer for Soroban events if long-term audit/search is needed
- Add tests for the `record_expert_verification` read/write path
- Add a user-facing history view for the `Stellar Expert` records
- Replace the localStorage fallback once on-chain reads are fully stable
- Add linting and automated frontend tests

## UX follow-up

- [x] Add keyboard navigation for the Mapbox search suggestions (↑/↓/Enter/Esc + ARIA combobox)
- [x] Close the search suggestion dropdown on blur/click outside (pointerdown outside)
- [x] Show a direct link to the transaction hash (ZK checkpoint + offer receipt → Stellar Expert testnet)
- Add a loading state for on-chain verification refresh (partially covered by checkpoint `recording` state)

