import express from 'express'
import cors from 'cors'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '1mb' }))

let _noir = null
let _backend = null
let _ready = false
let _readyPromise = null

function normalizeBase64(input) {
  if (typeof input !== 'string') throw new Error('bytecode must be a string')
  let value = input.trim()
  const commaIndex = value.indexOf(',')
  if (commaIndex !== -1 && /^data:.*;base64/i.test(value.slice(0, commaIndex))) {
    value = value.slice(commaIndex + 1)
  }
  value = value.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  const remainder = value.length % 4
  if (remainder === 1) throw new Error('invalid base64 length')
  if (remainder > 0) value += '='.repeat(4 - remainder)
  return value
}

async function ensureProver() {
  if (_ready) return
  if (!_readyPromise) {
    _readyPromise = initProver()
  }
  return _readyPromise
}

async function initProver() {
  const { Noir } = await import('@noir-lang/noir_js')
  const { UltraHonkBackend } = await import('@aztec/bb.js')
  const { cpus } = await import('os')

  const circuitPath = join(__dirname, '..', 'circuits', 'target', 'aegis.json')
  const circuit = JSON.parse(readFileSync(circuitPath, 'utf-8'))
  circuit.bytecode = normalizeBase64(circuit.bytecode)

  _noir = new Noir(circuit)
  _backend = new UltraHonkBackend(
    circuit.bytecode,
    { threads: Math.max(1, cpus().length - 1) }
  )

  console.log('[prover] Warming CRS...')
  await _backend.instantiate()
  _ready = true
  console.log('[prover] Ready')
}

function health(_req, res) {
  res.json({ status: _ready ? 'ready' : 'warming', ready: _ready })
}

app.get('/health', health)
app.get('/zk/health', health)

app.post('/zk/prove', async (req, res) => {
  try {
    const { inputs } = req.body
    if (!inputs) {
      return res.status(400).json({ success: false, error: 'Missing inputs' })
    }

    await ensureProver()
    const start = Date.now()

    const { witness, returnValue } = await _noir.execute(inputs)
    const proofResult = await _backend.generateProof(witness)
    const { proof } = proofResult

    const nullifier = typeof returnValue === 'string' ? returnValue : String(returnValue)

    console.log(`[prover] Proof generated in ${((Date.now() - start) / 1000).toFixed(1)}s`)

    res.json({
      success: true,
      proof: Buffer.from(proof).toString('hex'),
      nullifier,
    })
  } catch (err) {
    console.error('[prover] Error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`ZK Prover on http://localhost:${PORT}`)
  ensureProver().catch(err => console.error('[prover] Init failed:', err))
})
