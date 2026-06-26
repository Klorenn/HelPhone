import { Noir } from '@noir-lang/noir_js'
import { Buffer } from 'buffer'
import { StrKey } from '@stellar/stellar-sdk'
import circuit from '../../circuits/target/aegis.json'

let _noir = null
let _backend = null
let _UltraHonkBackend = null

const PROVER_INIT_TIMEOUT_MS = 2 * 60 * 1000
const PROOF_TIMEOUT_MS = 5 * 60 * 1000

function normalizeBase64(input, label = 'Base64 value') {
  if (typeof input !== 'string') {
    throw new Error(`${label} must be a string.`)
  }

  let value = input.trim()
  const commaIndex = value.indexOf(',')
  if (commaIndex !== -1 && /^data:.*;base64/i.test(value.slice(0, commaIndex))) {
    value = value.slice(commaIndex + 1)
  }

  value = value
    .replace(/\s+/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error(`${label} contains invalid Base64 characters.`)
  }

  const remainder = value.length % 4
  if (remainder === 1) {
    throw new Error(`${label} has an invalid Base64 length.`)
  }
  if (remainder > 0) {
    value += '='.repeat(4 - remainder)
  }

  return value
}

export function decodeBase64Bytes(input, label) {
  const normalized = normalizeBase64(input, label)
  const binary = atob(normalized)
  return Uint8Array.from(binary, c => c.charCodeAt(0))
}

export function decodeBase64Utf8(input, label) {
  return new TextDecoder().decode(decodeBase64Bytes(input, label))
}

function getCircuitArtifact() {
  return {
    ...circuit,
    bytecode: normalizeBase64(circuit.bytecode, 'ZK circuit bytecode'),
    debug_symbols: circuit.debug_symbols
      ? normalizeBase64(circuit.debug_symbols, 'ZK circuit debug symbols')
      : circuit.debug_symbols,
  }
}

function createBarretenbergLogger(onLog) {
  const seen = new Set()
  return message => {
    const text = String(message || '')
    let mapped = ''

    if (/Fetching bb wasm/i.test(text)) mapped = 'Loading Barretenberg WASM'
    else if (/Compiling bb wasm/i.test(text)) mapped = 'Compiling Barretenberg WASM'
    else if (/Compilation of bb wasm complete/i.test(text)) mapped = 'Barretenberg WASM ready'
    else if (/Initializing bb wasm/i.test(text)) mapped = 'Starting Barretenberg prover worker'
    else if (/Creating .* worker threads/i.test(text)) mapped = 'Starting Barretenberg worker threads'
    else if (/Falling back to one thread/i.test(text)) mapped = 'Using single-thread prover mode'

    if (mapped && !seen.has(mapped)) {
      seen.add(mapped)
      onLog(mapped)
    }
  }
}

function elapsedSeconds(startedAt) {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  return Math.round((now - startedAt) / 1000)
}

async function runWithProgress(label, task, {
  onLog,
  timeoutMs,
  firstProgressMs = 8000,
  progressEveryMs = 15000,
  progressMessage,
}) {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
  let done = false
  let progressInterval = null
  let timeoutId = null

  const firstProgress = setTimeout(() => {
    if (done) return
    onLog(progressMessage(elapsedSeconds(startedAt)))
    progressInterval = setInterval(() => {
      if (!done) onLog(progressMessage(elapsedSeconds(startedAt)))
    }, progressEveryMs)
  }, firstProgressMs)

  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      if (!done) {
        reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds. Check your connection to crs.aztec.network and try again.`))
      }
    }, timeoutMs)
  })

  try {
    return await Promise.race([Promise.resolve().then(task), timeout])
  } finally {
    done = true
    clearTimeout(firstProgress)
    if (timeoutId) clearTimeout(timeoutId)
    if (progressInterval) clearInterval(progressInterval)
  }
}

async function resetBackend() {
  const backend = _backend
  _backend = null
  if (backend && typeof backend.destroy === 'function') {
    try { await backend.destroy() } catch (_) {}
  }
}

async function init(onLog = () => {}) {
  if (_noir && _backend) return
  if (typeof globalThis.Buffer === 'undefined') {
    globalThis.Buffer = Buffer
  }
  if (!_UltraHonkBackend) {
    ;({ UltraHonkBackend: _UltraHonkBackend } = await import('@aztec/bb.js'))
  }
  const artifact = getCircuitArtifact()
  _backend = new _UltraHonkBackend(
    artifact.bytecode,
    { threads: 1, logger: createBarretenbergLogger(onLog) },
    { recursive: false }
  )
  _noir = new Noir(artifact)
}

// BN254 scalar field prime
const FIELD_PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617n

// stored_lon = floor(lon * 1e7) + 1_800_000_000
// stored_lat = floor(lat * 1e7) +   900_000_000
function encodeLng(lng) {
  return String(Math.floor(lng * 1e7) + 1_800_000_000)
}

function encodeLat(lat) {
  return String(Math.floor(lat * 1e7) + 900_000_000)
}

// Decode Stellar G... address → 32 bytes → BigInt → reduce mod BN254 prime → field element
function addressToField(stellarAddress) {
  const bytes = StrKey.decodeEd25519PublicKey(stellarAddress)
  let value = 0n
  for (const b of bytes) value = (value << 8n) | BigInt(b)
  return String(value % FIELD_PRIME)
}

// Persist secret per browser so nullifier is reproducible across sessions
function getOrCreateSecret() {
  const KEY = 'hp_zk_secret'
  const stored = localStorage.getItem(KEY)
  if (stored) return stored
  const bytes = crypto.getRandomValues(new Uint8Array(31)) // 248 bits < BN254 prime
  let value = 0n
  for (const b of bytes) value = (value << 8n) | BigInt(b)
  const secret = String(value % FIELD_PRIME)
  localStorage.setItem(KEY, secret)
  return secret
}

// Build 224-byte public inputs buffer for aegis_vault.claim_aid (7 × 32-byte BE fields)
// Layout: box_x_min | box_x_max | box_y_min | box_y_max | campaign_id | recipient_address | nullifier
function buildPublicInputsBytes(boxXMin, boxXMax, boxYMin, boxYMax, campaignId, recipientField, nullifier) {
  const fields = [
    BigInt(boxXMin),
    BigInt(boxXMax),
    BigInt(boxYMin),
    BigInt(boxYMax),
    BigInt(campaignId),
    BigInt(recipientField),
    BigInt(nullifier),
  ]
  const buf = new Uint8Array(224)
  fields.forEach((f, i) => {
    const hex = f.toString(16).padStart(64, '0')
    for (let j = 0; j < 32; j++) {
      buf[i * 32 + j] = parseInt(hex.slice(j * 2, j * 2 + 2), 16)
    }
  })
  return buf
}

function buildCampaignPrefix(publicInputsBytes) {
  return publicInputsBytes.slice(0, 160)
}

/**
 * Generate a ZK location proof in-browser via UltraHonk.
 * Takes ~30–60s on first call (WASM init + proving).
 *
 * @param {{ lat: number, lng: number, campaignId?: string, recipientAddress: string }} opts
 * @returns {{ proof: Uint8Array, publicInputsBytes: Uint8Array, nullifier: string }}
 */
export async function generateLocationProof({ lat, lng, campaignId = '1', recipientAddress, onLog = () => {} }) {
  onLog('Loading ZK circuit artifacts')
  await init(onLog)

  onLog('Validating Stellar wallet address')
  if (!recipientAddress || !StrKey.isValidEd25519PublicKey(recipientAddress)) {
    throw new Error('Connect a valid Stellar wallet before generating the proof.')
  }

  onLog('Preparing private location inputs')
  const secretId = getOrCreateSecret()
  const recipientField = addressToField(recipientAddress)

  // Global bounding box: covers entire world
  const BOX_X_MIN = '0'           // lon -180
  const BOX_X_MAX = '3600000000'  // lon +180
  const BOX_Y_MIN = '0'           // lat -90
  const BOX_Y_MAX = '1800000000'  // lat +90

  const inputs = {
    user_x:            encodeLng(lng),
    user_y:            encodeLat(lat),
    secret_id:         secretId,
    box_x_min:         BOX_X_MIN,
    box_x_max:         BOX_X_MAX,
    box_y_min:         BOX_Y_MIN,
    box_y_max:         BOX_Y_MAX,
    campaign_id:       campaignId,
    recipient_address: recipientField,
  }

  onLog('Executing Noir circuit witness')
  const { witness, returnValue } = await _noir.execute(inputs)

  onLog('Preparing Barretenberg prover and CRS')
  try {
    await runWithProgress('Barretenberg prover setup', () => _backend.instantiate(), {
      onLog,
      timeoutMs: PROVER_INIT_TIMEOUT_MS,
      firstProgressMs: 7000,
      progressEveryMs: 12000,
      progressMessage: seconds => `Still preparing prover/CRS (${seconds}s). First run downloads and caches CRS data.`,
    })
  } catch (err) {
    await resetBackend()
    throw err
  }
  onLog('Barretenberg prover ready')

  onLog('Generating UltraHonk proof')
  let proofResult
  try {
    proofResult = await runWithProgress('UltraHonk proof generation', () => _backend.generateProof(witness), {
      onLog,
      timeoutMs: PROOF_TIMEOUT_MS,
      firstProgressMs: 10000,
      progressEveryMs: 20000,
      progressMessage: seconds => `Still generating UltraHonk proof (${seconds}s). Keep this tab open.`,
    })
  } catch (err) {
    await resetBackend()
    throw err
  }
  const { proof, publicInputs } = proofResult
  onLog('UltraHonk proof generated')

  // returnValue is the nullifier (field element)
  const nullifier = typeof returnValue === 'string'
    ? returnValue
    : String(returnValue)

  const publicInputsBytes = buildPublicInputsBytes(
    BOX_X_MIN, BOX_X_MAX, BOX_Y_MIN, BOX_Y_MAX,
    campaignId, recipientField, nullifier
  )

  onLog('Packing public inputs for Stellar')

  return {
    proof,
    publicInputsBytes,
    publicInputsPrefix: buildCampaignPrefix(publicInputsBytes),
    nullifier,
    publicInputs,
  }
}
