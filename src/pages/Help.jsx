import { useState, useEffect, useRef, Fragment } from 'react'
import { Link } from 'react-router-dom'
import { StellarWalletsKit } from '@creit-tech/stellar-wallets-kit/sdk'
import { KitEventType } from '@creit-tech/stellar-wallets-kit/types'
import { StrKey } from '@stellar/stellar-sdk'
import Map, { Marker, Popup, Source, Layer, NavigationControl, useMap } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { getRequest, getActiveRequests, getResponder, getResponderCount, createRequest, acceptRequest, markArrived, resolveRequest, cancelRequest, getRanking, ensureAccountFunded, getExpertVerifications, recordExpertVerification as writeExpertVerification, claimAid } from '../lib/contract'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

const MAP_STYLES = [
  { id: 'satellite', name: 'Warm',     url: 'mapbox://styles/kl0ren/cmqn3p0zx000q01s69sp8ai7b', desc: 'Custom warm style with earth greens and coral accents. Great for everyday use.' },
  { id: 'claro',     name: 'Standard', url: 'mapbox://styles/mapbox/standard',                 desc: 'Clean, neutral base map. Good contrast for reading streets and names.' },
  { id: 'dark',      name: 'Dark 2D',  url: 'mapbox://styles/mapbox/dark-v11',                 desc: 'Dark background — reduces glare, ideal for low-light or nighttime use.' },
]

// ── Character sets by gender ──────────────────────────────────────
const CHARS = {
  male:        ['runner', 'pacheco', 'growth', 'jumping-air'],
  female:      ['chilly', 'meela-pantalones', 'feliz', 'pondering'],
  undisclosed: ['cube-leg', 'roboto', 'mechanical-love'],
  default:     ['looking-ahead', 'waiting', 'bueno']
}

function pickChar(gender, seed = '') {
  const pool = CHARS[gender] || CHARS.default
  const idx = seed.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % pool.length
  return pool[idx]
}

function CharMarker({ charName, accentColor = '#FF7A6B', lat, lng, onClick, children }) {
  return (
    <Marker latitude={lat} longitude={lng} onClick={onClick}>
      <div style={{ position: 'relative', width: 52, height: 52, cursor: 'pointer' }}>
        <img src={`/assets/chars/${charName}.png`}
             style={{ width: 52, height: 52, objectFit: 'contain', filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.28))' }} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 13, height: 13,
             borderRadius: '50%', background: accentColor, border: '2.5px solid #fff',
             boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
      </div>
      {children}
    </Marker>
  )
}

// ── Map helpers ───────────────────────────────────────────────────
function MapController({ center, zoom = 14 }) {
  const { current: map } = useMap()
  useEffect(() => {
    if (center && map) map.flyTo({ center: [center[1], center[0]], zoom, duration: 1200 })
  }, [center, zoom, map])
  return null
}

function RouteLine({ from, to, color = '#7357FF' }) {
  const id = `route-${from[0]}-${from[1]}-${to[0]}-${to[1]}`
  return (
    <Source id={id} type="geojson" data={{
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[from[1], from[0]], [to[1], to[0]]] }
    }}>
      <Layer id={`${id}-line`} type="line"
        paint={{
          'line-color': color,
          'line-width': 2,
          'line-opacity': 0.65,
          'line-dasharray': [10, 6]
        }}
      />
    </Source>
  )
}

// ── localStorage ─────────────────────────────────────────────────
function loadProfile() {
  try { return JSON.parse(localStorage.getItem('hp_profile') || '{}') } catch { return {} }
}

const DEFAULT_CENTER = [20, 0]
const EXPERT_STORAGE_KEY = 'hp_stellar_expert_verification'

function loadExpertVerification() {
  try { return JSON.parse(localStorage.getItem(EXPERT_STORAGE_KEY) || 'null') } catch { return null }
}

function normalizeExpertVerification(raw, fallbackWallet = '') {
  if (!raw) return null
  const walletAddress = raw.walletAddress || raw.wallet || raw.wallet_address || fallbackWallet || ''
  const verifiedAtRaw = raw.verifiedAt || raw.verified_at || raw.at || null
  const verifiedAt = typeof verifiedAtRaw === 'number'
    ? new Date(verifiedAtRaw * 1000).toISOString()
    : verifiedAtRaw || new Date().toISOString()

  return {
    walletAddress,
    verifiedAt,
    network: raw.network || 'testnet',
    lastAction: raw.lastAction || raw.action || '',
    actionTxHash: raw.actionTxHash || raw.action_tx_hash || raw.tx_hash || raw.txHash || '',
    verificationTxHash: raw.verificationTxHash || raw.verification_tx_hash || '',
    lastTxHash: raw.lastTxHash || raw.verificationTxHash || raw.verification_tx_hash || raw.tx_hash || raw.txHash || '',
    proofFingerprint: raw.proofFingerprint || raw.proof_fingerprint || '',
    proofs: raw.proofs || {},
    history: raw.history || [],
  }
}

// ── Step indicator ────────────────────────────────────────────────
function Step({ n, title, subtitle, done, active, help, children }) {
  return (
    <div style={{ marginBottom: '6px', opacity: (!active && !done) ? 0.38 : 1, transition: 'opacity 0.3s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: children ? '12px' : 0 }}>
        <div style={{
          width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
          background: done ? '#3F8487' : active ? '#FF7A6B' : 'rgba(255,255,255,0.1)',
          border: `2px solid ${done ? '#3F8487' : active ? '#FF7A6B' : 'rgba(255,255,255,0.2)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px', fontWeight: '700',
          color: (done || active) ? '#fff' : 'rgba(242,236,220,0.4)'
        }}>
          {done ? '✓' : n}
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: done ? '#3F8487' : active ? 'rgba(242,236,220,0.95)' : 'rgba(242,236,220,0.45)' }}>
              {title}
            </div>
            {help && <HelpTip label={`${title} help`}>{help}</HelpTip>}
          </div>
          {subtitle && <div style={{ fontSize: '11px', color: 'rgba(242,236,220,0.35)', marginTop: '1px' }}>{subtitle}</div>}
        </div>
      </div>
      {children && <div style={{ marginLeft: '36px' }}>{children}</div>}
    </div>
  )
}

function ZkProgressLog({ entries, active }) {
  if (!active && entries.length === 0) return null
  return (
    <div style={{
      marginTop: '10px', padding: '10px 12px', borderRadius: '8px',
      background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(255,255,255,0.08)'
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '7px', fontSize: '10px', letterSpacing: '1px',
        color: 'rgba(242,236,220,0.4)', fontWeight: 700
      }}>
        <span>PROOF LOG</span>
        {active && <span style={{ color: '#FF7A6B' }}>RUNNING</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {entries.map(entry => (
          <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: '56px 1fr', gap: '8px', alignItems: 'baseline' }}>
            <span style={{ fontSize: '10px', color: 'rgba(242,236,220,0.25)', fontVariantNumeric: 'tabular-nums' }}>{entry.at}</span>
            <span style={{ fontSize: '11px', color: 'rgba(242,236,220,0.62)', lineHeight: 1.35 }}>{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function stellarExpertTxUrl(txHash) {
  return txHash ? `https://stellar.expert/explorer/testnet/tx/${txHash}` : ''
}

function stellarExpertAccountUrl(walletAddress) {
  return walletAddress ? `https://stellar.expert/explorer/testnet/account/${walletAddress}` : ''
}

function actionLabel(action = '') {
  const normalized = String(action || '').replace(/_zk_proof$/, '')
  const labels = {
    request_created: 'Help request',
    aid_offered: 'Help offer',
    aid_claimed: 'Aid claim',
    location_proof: 'Location proof',
  }
  return labels[normalized] || normalized.replace(/_/g, ' ') || 'Checkpoint'
}

function receiptCopy(action = '') {
  const normalized = String(action || '').replace(/_zk_proof$/, '')
  if (normalized === 'aid_offered') {
    return {
      title: 'Help offer registered',
      body: 'Your help offer is on Stellar. The person asking for help can see your responder pin, and the ZK checkpoint is attached when it finishes.',
    }
  }
  if (normalized === 'request_created') {
    return {
      title: 'Help request registered',
      body: 'Your help request is on Stellar. Nearby helpers can see it, and the ZK checkpoint is attached when it finishes.',
    }
  }
  if (normalized === 'aid_claimed') {
    return {
      title: 'Aid claim registered',
      body: 'The aid claim is on Stellar and can be checked from the transaction link.',
    }
  }
  return {
    title: 'Checkpoint registered',
    body: 'The action is on Stellar. The transaction link is the public receipt.',
  }
}

function shortHash(hash = '') {
  return hash ? `${hash.slice(0, 10)}...${hash.slice(-8)}` : ''
}

function receiptTxHash(record) {
  return record?.verificationTxHash || record?.actionTxHash || record?.lastTxHash || ''
}

function HelpTip({ label, children }) {
  const [open, setOpen] = useState(false)
  return (
    <span
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }}
    >
      <button
        type="button"
        aria-label={label || 'More information'}
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        style={{
          width: '20px', height: '20px', borderRadius: '50%', border: '1px solid rgba(242,236,220,0.22)',
          background: 'rgba(255,255,255,0.05)', color: 'rgba(242,236,220,0.68)',
          fontSize: '12px', fontWeight: 800, lineHeight: 1, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0
        }}
      >
        ?
      </button>
      {open && (
        <span style={{
          position: 'absolute', top: '26px', left: 0, zIndex: 80,
          width: '220px', padding: '10px 11px', borderRadius: '9px',
          background: '#101c18', border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 14px 36px rgba(0,0,0,0.44)', color: 'rgba(242,236,220,0.72)',
          fontSize: '11px', lineHeight: 1.45, fontWeight: 500, letterSpacing: 0
        }}>
          {children}
        </span>
      )}
    </span>
  )
}

function HelpOnboardingModal({ open, onClose, onConnectWallet }) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (open) setStep(0)
  }, [open])

  if (!open) return null

  const totalSteps = 4

  const steps = [
    {
      label: 'Request',
      title: 'Help when you need it',
      body: 'HelPhone connects you with people nearby when you\'re in an emergency. You can request help or offer help to others. Everything runs on Stellar — fast, public, and verifiable.',
    },
    {
      label: 'Receipt',
      title: 'Your action goes on-chain first',
      body: 'When you request or offer help, Stellar confirms it in seconds. That creates a public transaction hash — your receipt. The action comes first, the proof comes after.',
    },
    {
      label: 'ZK',
      title: 'ZK proof protects your privacy',
      body: 'A zero-knowledge proof confirms you\'re really at your location without revealing your exact coordinates. It runs in your browser and gets attached as a checkpoint after the on-chain action.',
    },
    {
      label: 'Wallet',
      title: 'Connect your preferred wallet',
      body: 'Your Stellar wallet only signs transactions — it\'s not a tracking tool. Connect to request help, offer help, or verify your identity on the network.',
      isLast: true,
    },
  ]

  const current = steps[step]

  async function handleLastAction() {
    if (step === totalSteps - 1) {
      onClose()
      await onConnectWallet()
    } else {
      setStep(s => s + 1)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px'
    }}>
      <div style={{
        width: '100%', maxWidth: '460px',
        borderRadius: '18px', background: '#1c2c24', border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 24px 80px rgba(0,0,0,0.62)', overflow: 'hidden',
        transition: 'opacity 0.25s'
      }}>
        <div style={{
          padding: '18px 20px 0', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', gap: '12px'
        }}>
          <div style={{ fontSize: '10px', letterSpacing: '1.4px', color: '#7fb8ba', fontWeight: 900 }}>
            HELPHONE GUIDE
          </div>
          <button
            type="button"
            aria-label="Close guide"
            onClick={onClose}
            style={{
              width: '34px', height: '34px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.05)', color: 'rgba(242,236,220,0.65)',
              cursor: 'pointer', fontSize: '18px', lineHeight: 1
            }}
          >
            x
          </button>
        </div>

        <div style={{ padding: '14px 24px 0', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} style={{
              flex: 1, height: '4px', borderRadius: '4px',
              background: i === step ? '#FF7A6B' : i < step ? '#3F8487' : 'rgba(255,255,255,0.1)',
              transition: 'background 0.3s'
            }} />
          ))}
        </div>

        <div style={{ padding: '26px 24px 8px', textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: '74px', height: '34px', padding: '0 12px',
            borderRadius: '999px', background: 'rgba(63,132,135,0.14)',
            border: '1px solid rgba(63,132,135,0.28)', color: '#7fb8ba',
            fontSize: '11px', fontWeight: 900, letterSpacing: '1px', marginBottom: '16px'
          }}>
            {step + 1}/4 · {current.label}
          </div>
          <h2 style={{ margin: '0 0 10px', color: '#F4ECDC', fontSize: '22px', lineHeight: 1.15, fontWeight: 700 }}>
            {current.title}
          </h2>
          <p style={{ margin: 0, color: 'rgba(242,236,220,0.55)', fontSize: '14px', lineHeight: 1.6, padding: '0 6px' }}>
            {current.body}
          </p>
        </div>

        <div style={{ padding: '24px', display: 'flex', gap: '10px' }}>
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(s => s - 1)}
              style={{
                padding: '12px 18px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.05)', color: 'rgba(242,236,220,0.65)',
                fontSize: '14px', fontWeight: 600, cursor: 'pointer', minWidth: '80px'
              }}
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={handleLastAction}
            style={{
              flex: 1, minHeight: '48px', borderRadius: '10px', border: 'none',
              background: step === totalSteps - 1 ? '#7357FF' : '#FF7A6B',
              color: '#fff', fontSize: '15px', fontWeight: 700,
              cursor: 'pointer', transition: 'background 0.2s'
            }}
          >
            {step === totalSteps - 1 ? 'Connect preferred wallet' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}

function FlowProgressModal({
  open,
  onClose,
  title,
  accentColor,
  receiptAction,
  location,
  profile,
  walletAddress,
  entries,
  active,
  txHash,
  actionTxHash,
  proofTxHash,
  error,
  canRetryProof,
  onRetryProof,
}) {
  if (!open) return null
  const copy = receiptCopy(receiptAction)
  const primaryTxHash = proofTxHash || actionTxHash || txHash || ''
  const txUrl = stellarExpertTxUrl(primaryTxHash)
  const actionUrl = stellarExpertTxUrl(actionTxHash)
  const proofUrl = stellarExpertTxUrl(proofTxHash)
  const hasActionReceipt = Boolean(actionTxHash)
  const hasProofReceipt = Boolean(proofTxHash)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9997, background: 'rgba(0,0,0,0.68)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px'
    }}>
      <div style={{
        width: '100%', maxWidth: '480px', maxHeight: 'calc(100vh - 36px)',
        overflow: 'auto', borderRadius: '14px', background: '#1c2c24',
        border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 24px 72px rgba(0,0,0,0.58)'
      }}>
        <div style={{
          padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          <div style={{
            width: '10px', height: '10px', borderRadius: '50%',
            background: active ? accentColor : error ? '#FF7A6B' : '#3F8487',
            boxShadow: active ? `0 0 0 6px ${accentColor}22` : 'none',
            flexShrink: 0
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '10px', letterSpacing: '1.4px', fontWeight: 700, color: 'rgba(242,236,220,0.35)' }}>
              {active ? 'PROCESSING' : error ? 'NEEDS ATTENTION' : 'REGISTERED'}
            </div>
            <h3 style={{ margin: '3px 0 0', fontSize: '18px', lineHeight: 1.2, color: '#F4ECDC' }}>{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close progress"
            style={{
              width: '36px', height: '36px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.05)', color: 'rgba(242,236,220,0.65)',
              cursor: 'pointer', fontSize: '18px', lineHeight: 1
            }}
          >
            x
          </button>
        </div>

        <div style={{ padding: '16px 18px 18px' }}>
          <div style={{
            marginBottom: '12px', padding: '11px 12px', borderRadius: '10px',
            background: hasActionReceipt ? 'rgba(63,132,135,0.12)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${hasActionReceipt ? 'rgba(63,132,135,0.25)' : 'rgba(255,255,255,0.06)'}`
          }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: hasActionReceipt ? '#7fb8ba' : '#F4ECDC', marginBottom: '4px' }}>
              {hasActionReceipt ? copy.title : actionLabel(receiptAction)}
            </div>
            <div style={{ fontSize: '11px', lineHeight: 1.45, color: 'rgba(242,236,220,0.54)' }}>
              {copy.body}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
            {[
              ['Location', location ? `${location[0].toFixed(5)}, ${location[1].toFixed(5)}` : 'Not set'],
              ['Alias', profile.nickname || 'Anonymous'],
              ['Contact', profile.contact || 'Not provided'],
              ['Wallet', walletAddress ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-6)}` : 'Not connected'],
            ].map(([label, value]) => (
              <div key={label} style={{
                padding: '9px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)', minWidth: 0
              }}>
                <div style={{ fontSize: '9px', letterSpacing: '1px', color: 'rgba(242,236,220,0.32)', marginBottom: '4px' }}>{label}</div>
                <div style={{ fontSize: '11px', color: '#F4ECDC', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
              </div>
            ))}
          </div>

          {(hasActionReceipt || hasProofReceipt) && (
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px',
              marginBottom: '12px'
            }}>
              <div style={{
                padding: '10px 11px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)', minWidth: 0
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px' }}>
                  <span style={{ fontSize: '9px', letterSpacing: '1px', color: 'rgba(242,236,220,0.32)' }}>ACTION TX</span>
                  <HelpTip label="Action transaction help">This is the real receipt for requesting help or accepting a help request. It only appears after Stellar confirms the transaction.</HelpTip>
                </div>
                {actionUrl ? (
                  <a href={actionUrl} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: '#7fb8ba', textDecoration: 'none', wordBreak: 'break-all' }}>
                    {shortHash(actionTxHash)}
                  </a>
                ) : (
                  <div style={{ fontSize: '11px', color: 'rgba(242,236,220,0.34)' }}>{hasActionReceipt ? 'Recorded' : 'Waiting'}</div>
                )}
              </div>
              <div style={{
                padding: '10px 11px', borderRadius: '8px', background: hasProofReceipt ? 'rgba(63,132,135,0.1)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${hasProofReceipt ? 'rgba(63,132,135,0.25)' : 'rgba(255,255,255,0.06)'}`, minWidth: 0
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px' }}>
                  <span style={{ fontSize: '9px', letterSpacing: '1px', color: 'rgba(242,236,220,0.32)' }}>ZK TX</span>
                  <HelpTip label="ZK transaction help">This checkpoint records the ZK proof. It can take longer than the main action and can be retried.</HelpTip>
                </div>
                {proofUrl ? (
                  <a href={proofUrl} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: '#7fb8ba', textDecoration: 'none', wordBreak: 'break-all' }}>
                    {shortHash(proofTxHash)}
                  </a>
                ) : (
                  <div style={{ fontSize: '11px', color: error ? '#FF7A6B' : 'rgba(242,236,220,0.34)' }}>
                    {error ? 'Pending retry' : active ? 'Generating' : 'Pending'}
                  </div>
                )}
              </div>
            </div>
          )}

          <ZkProgressLog entries={entries} active={active} />

          {error && (
            <div style={{
              marginTop: '10px', padding: '10px 12px', borderRadius: '8px',
              border: '1px solid rgba(255,122,107,0.25)', background: 'rgba(255,122,107,0.08)',
              color: '#FF7A6B', fontSize: '12px', lineHeight: 1.45
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            {canRetryProof && (
              <button
                type="button"
                onClick={onRetryProof}
                style={{
                  padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,122,107,0.26)',
                  background: 'rgba(255,122,107,0.12)', color: '#FF7A6B',
                  fontSize: '12px', fontWeight: 700, cursor: 'pointer'
                }}
              >
                Retry ZK
              </button>
            )}
            {txUrl ? (
              <a
                href={txUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: '8px', textAlign: 'center',
                  background: '#3F8487', color: '#fff', fontSize: '12px', fontWeight: 700,
                  textDecoration: 'none', border: '1px solid rgba(63,132,135,0.22)'
                }}
              >
                Open receipt on Stellar Expert
              </a>
            ) : (
              <div style={{
                flex: 1, padding: '10px 12px', borderRadius: '8px', textAlign: 'center',
                background: 'rgba(255,255,255,0.04)', color: 'rgba(242,236,220,0.38)',
                fontSize: '12px', fontWeight: 700, border: '1px solid rgba(255,255,255,0.07)'
              }}>
                Receipt appears after Stellar confirms
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.05)', color: 'rgba(242,236,220,0.72)',
                fontSize: '12px', fontWeight: 700, cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Emergency types ──────────────────────────────────────────────
const EMERGENCY_TYPES = [
  { id: 'lost',    icon: '🧭', label: 'I\'m lost',             desc: 'Don\'t know where I am or how to get back' },
  { id: 'fallen',  icon: '🩹', label: 'Fell / injured',       desc: 'Need assistance after a fall or injury' },
  { id: 'medical', icon: '🏥', label: 'Medical emergency',     desc: 'Health issue that can\'t wait' },
  { id: 'car',     icon: '🔧', label: 'Car trouble',          desc: 'Vehicle broke down on the road' },
  { id: 'danger',  icon: '🛡️', label: 'I feel unsafe',        desc: 'Unsafe situation, need someone nearby' },
  { id: 'other',   icon: '⋯',  label: 'Something else',        desc: 'Another type of emergency' },
]

const ET_ICONS = {
  lost: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36z" fill="currentColor" strokeWidth="0"/>
    </svg>
  ),
  fallen: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="4.5" r="1.8" fill="currentColor" stroke="none"/>
      <path d="M9 9c-1.5 1.5-2.5 3.5-2 5.5"/>
      <path d="M12 7v5l3.5 4"/>
      <path d="M10 12.5 7 18"/>
    </svg>
  ),
  medical: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      <polyline points="8 12.5 10 10.5 12 14 14 9 16 12.5" strokeWidth="1.5"/>
    </svg>
  ),
  car: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 17H3a2 2 0 0 1-2-2v-4a2 2 0 0 1 .5-1.5L5 6h14l3.5 3.5A2 2 0 0 1 23 11v4a2 2 0 0 1-2 2h-2"/>
      <circle cx="7.5" cy="17" r="2.5"/>
      <circle cx="16.5" cy="17" r="2.5"/>
    </svg>
  ),
  danger: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <circle cx="12" cy="16.5" r="0.8" fill="currentColor" stroke="none"/>
    </svg>
  ),
  other: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="5.5" cy="12" r="1.8" fill="currentColor"/>
      <circle cx="12" cy="12" r="1.8" fill="currentColor"/>
      <circle cx="18.5" cy="12" r="1.8" fill="currentColor"/>
    </svg>
  ),
}

// ── Main component ────────────────────────────────────────────────
export default function Help() {
  const [mode, setMode] = useState('get') // 'get' | 'offer'

  const [profile, setProfile] = useState(() => {
    const p = loadProfile()
    return { nickname: p.nickname || '', contact: p.contact || '' }
  })

  const [emergencyType, setEmergencyType] = useState(null)
  const [showEmergencyModal, setShowEmergencyModal] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(true)

  const [zkState, setZkState] = useState('idle') // 'idle' | 'loading' | 'done' | 'error'
  const [zkError, setZkError] = useState('')
  const [zkProof, setZkProof] = useState(null)
  const [zkLog, setZkLog] = useState([])
  const [flowPopupOpen, setFlowPopupOpen] = useState(false)
  const [flowPopupTitle, setFlowPopupTitle] = useState('Processing request')
  const [flowAction, setFlowAction] = useState('')
  const [flowTxHash, setFlowTxHash] = useState('')
  const [flowActionTxHash, setFlowActionTxHash] = useState('')
  const [flowProofTxHash, setFlowProofTxHash] = useState('')
  const [flowWalletAddress, setFlowWalletAddress] = useState('')
  const [pendingProofRegistration, setPendingProofRegistration] = useState(null)
  const [claimState, setClaimState] = useState('idle') // 'idle' | 'loading' | 'done' | 'error'
  const [claimError, setClaimError] = useState('')

  const [location, setLocation] = useState(null)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [searchSuggestions, setSearchSuggestions] = useState([])
  const [searchSuggestLoading, setSearchSuggestLoading] = useState(false)

  const [requestId, setRequestId] = useState(null)
  const [requestStatus, setRequestStatus] = useState('idle')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [responders, setResponders] = useState([])
  const [popupMarker, setPopupMarker] = useState(null)
  const [selectedChar, setSelectedChar] = useState(null)
  const [mapStyleIndex, setMapStyleIndex] = useState(0)
  const [styleOpen, setStyleOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [showMobileForm, setShowMobileForm] = useState(false)
  const [expertPopupOpen, setExpertPopupOpen] = useState(false)
  const [expertRecord, setExpertRecord] = useState(() => normalizeExpertVerification(loadExpertVerification()))

  // Offer mode: live requests on the map
  const [openRequests, setOpenRequests] = useState([])
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [offerSubmitting, setOfferSubmitting] = useState(false)
  const [lastOfferReceipt, setLastOfferReceipt] = useState(null)

  const [walletAddress, setWalletAddress] = useState('')
  const activeWalletAddress = walletAddress
  const isWalletConnected = !!activeWalletAddress
  const activeExpertRecord = expertRecord?.walletAddress === activeWalletAddress ? expertRecord : null
  const styleSelectorRef = useRef(null)
  const profileRef = useRef(null)
  const sidebarRef = useRef(null)

  // ── ZK proofs ─────────────────────────────────────────────────
  const [proofs, setProofs] = useState({ location: false, humanity: false, reputation: false })

  function appendZkLog(message) {
    const at = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setZkLog(prev => [...prev, { id: `${Date.now()}-${prev.length}`, at, message }].slice(-8))
  }

  function clearZkLog() {
    setZkLog([])
  }

  function startFlowPopup(title, walletAddress = activeWalletAddress, action = '') {
    setFlowPopupTitle(title)
    setFlowAction(action)
    setFlowTxHash('')
    setFlowActionTxHash('')
    setFlowProofTxHash('')
    setFlowWalletAddress(walletAddress || '')
    setFlowPopupOpen(true)
  }

  function recordLocalExpertCheckpoint(action, txHash = '', walletAddress = activeWalletAddress) {
    if (!walletAddress) return null
    const previous = normalizeExpertVerification(loadExpertVerification(), walletAddress) || {}
    const historyEntry = {
      action,
      txHash: txHash || '',
      actionTxHash: txHash || '',
      verificationTxHash: '',
      proofFingerprint: '',
      at: new Date().toISOString(),
    }
    const next = {
      walletAddress,
      verifiedAt: new Date().toISOString(),
      network: 'testnet',
      lastAction: action,
      lastTxHash: txHash || '',
      actionTxHash: txHash || '',
      verificationTxHash: '',
      proofFingerprint: '',
      proofs: { ...proofs },
      history: [...(previous.history || []), historyEntry].slice(-10),
    }
    localStorage.setItem(EXPERT_STORAGE_KEY, JSON.stringify(next))
    setExpertRecord(next)
    return next
  }

  async function recordExpertVerification(action, txHash = '', proofFingerprint = '', walletAddress = activeWalletAddress) {
    if (!walletAddress) return null
    const previous = normalizeExpertVerification(loadExpertVerification(), walletAddress) || {}
    const actionTxHash = txHash || ''
    const historyEntry = {
      action,
      txHash: actionTxHash,
      actionTxHash,
      verificationTxHash: '',
      proofFingerprint: proofFingerprint || '',
      at: new Date().toISOString(),
    }
    const next = {
      walletAddress,
      verifiedAt: new Date().toISOString(),
      network: 'testnet',
      lastAction: action,
      lastTxHash: actionTxHash,
      actionTxHash,
      verificationTxHash: '',
      proofFingerprint: proofFingerprint || '',
      proofs: { ...proofs },
      history: [...(previous.history || []), historyEntry].slice(-10),
    }
    localStorage.setItem(EXPERT_STORAGE_KEY, JSON.stringify(next))
    setExpertRecord(next)
    try {
      const verificationResult = await writeExpertVerification(walletAddress, action, actionTxHash, proofFingerprint || '', StellarWalletsKit)
      const verificationTxHash = verificationResult?.hash || ''
      const completedEntry = {
        ...historyEntry,
        txHash: verificationTxHash || actionTxHash,
        verificationTxHash,
      }
      const merged = {
        ...next,
        walletAddress,
        verifiedAt: new Date().toISOString(),
        lastTxHash: verificationTxHash || actionTxHash,
        actionTxHash,
        verificationTxHash,
        proofs: { ...proofs },
        history: [...(previous.history || []), completedEntry].slice(-10),
      }
      localStorage.setItem(EXPERT_STORAGE_KEY, JSON.stringify(merged))
      setExpertRecord(merged)
      return { ...verificationResult, verificationTxHash, actionTxHash }
    } catch (err) {
      console.warn('On-chain expert verification write failed:', err?.message || err)
      return null
    }
  }

  useEffect(() => {
    setProofs(p => ({ ...p, location: false }))
    setZkState('idle')
    setZkError('')
    setZkProof(null)
    clearZkLog()
    setClaimState('idle')
    setClaimError('')
  }, [location?.[0], location?.[1]])

  useEffect(() => {
    if (!isWalletConnected || !activeWalletAddress) {
      setProofs(p => ({ ...p, humanity: false, reputation: false }))
      return
    }
    let mounted = true
    async function check() {
      try {
        const funded = await ensureAccountFunded(activeWalletAddress)
        if (mounted) setProofs(p => ({ ...p, humanity: funded }))
        if (funded) {
          const ranking = await getRanking()
          const inRanking = ranking.find(e => e.responder === activeWalletAddress)
          if (mounted) setProofs(p => ({ ...p, reputation: !!inRanking && inRanking.total_arrivals > 0 }))
        }
      } catch {}
    }
    check()
    return () => { mounted = false }
  }, [isWalletConnected, activeWalletAddress])

  useEffect(() => {
    let mounted = true
    let offState = () => {}
    let offDisconnect = () => {}

    async function syncWallet() {
      try {
        const { address } = await StellarWalletsKit.getAddress()
        if (mounted) setWalletAddress(address || '')
      } catch {
        if (mounted) setWalletAddress('')
      }
    }

    syncWallet()
    offState = StellarWalletsKit.on(KitEventType.STATE_UPDATED, (event) => {
      if (!mounted) return
      setWalletAddress(event?.payload?.address || '')
    })
    offDisconnect = StellarWalletsKit.on(KitEventType.DISCONNECT, () => {
      if (mounted) setWalletAddress('')
      setProfileOpen(false)
    })

    return () => {
      mounted = false
      offState()
      offDisconnect()
    }
  }, [])

  useEffect(() => {
    let mounted = true
    async function syncExpert() {
      if (!activeWalletAddress) {
        const cached = normalizeExpertVerification(loadExpertVerification())
        if (mounted) setExpertRecord(cached)
        return
      }
      try {
        const cached = normalizeExpertVerification(loadExpertVerification(), activeWalletAddress)
        const records = await getExpertVerifications(activeWalletAddress, 10)
        const history = (records || []).map((record) => normalizeExpertVerification(record, activeWalletAddress)).filter(Boolean)
        if (history.length && mounted) {
          const latest = history[history.length - 1]
          const merged = {
            ...latest,
            verificationTxHash: cached?.verificationTxHash || latest.verificationTxHash || '',
            lastTxHash: cached?.verificationTxHash || latest.lastTxHash || cached?.lastTxHash || '',
            walletAddress: activeWalletAddress,
            proofs: cached?.proofs || latest.proofs || {},
            history: cached?.history?.length ? cached.history : history,
          }
          localStorage.setItem(EXPERT_STORAGE_KEY, JSON.stringify(merged))
          setExpertRecord(merged)
        } else if (mounted) {
          const cached = normalizeExpertVerification(loadExpertVerification(), activeWalletAddress)
          setExpertRecord(cached)
        }
      } catch {
        if (mounted) {
          const cached = normalizeExpertVerification(loadExpertVerification(), activeWalletAddress)
          setExpertRecord(cached)
        }
      }
    }

    syncExpert()
    return () => { mounted = false }
  }, [activeWalletAddress])

  useEffect(() => {
    if (!sidebarRef.current) return
    if (showMobileForm) {
      sidebarRef.current.classList.add('hp-mobile-open')
    } else {
      sidebarRef.current.classList.remove('hp-mobile-open')
    }
  }, [showMobileForm])

  useEffect(() => {
    if (!styleOpen) return
    function onDocClick(e) {
      if (styleSelectorRef.current && !styleSelectorRef.current.contains(e.target)) setStyleOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [styleOpen])

  useEffect(() => {
    if (!profileOpen) return
    function onDocClick(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [profileOpen])

  useEffect(() => { localStorage.setItem('hp_profile', JSON.stringify(profile)) }, [profile])

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchSuggestions([])
      return
    }

    let mounted = true
    const timeout = setTimeout(async () => {
      try {
        setSearchSuggestLoading(true)
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery.trim())}.json?access_token=${MAPBOX_TOKEN}&autocomplete=true&limit=5`
        )
        const data = await res.json()
        if (!mounted) return
        setSearchSuggestions(data.features || [])
      } catch {
        if (mounted) setSearchSuggestions([])
      } finally {
        if (mounted) setSearchSuggestLoading(false)
      }
    }, 260)

    return () => {
      mounted = false
      clearTimeout(timeout)
    }
  }, [searchQuery])

  // Pre-warm ZK prover on mount
  useEffect(() => {
    let cancelled = false
    async function prewarm() {
      try {
        const { warmProver } = await import('../lib/zk.js')
        if (!cancelled) await warmProver()
      } catch {}
    }
    prewarm()
    return () => { cancelled = true }
  }, [])

  // Auto-request location on mount
  useEffect(() => { requestLocation() }, [])

  // Load open requests when in offer mode (poll every 5s)
  useEffect(() => {
    if (mode !== 'offer') return
    let mounted = true

    async function load() {
      try {
        const ids = await getActiveRequests()
        const requests = []
        for (const id of ids) {
          const req = await getRequest(id)
          if (req && (req.status === 'Pending' || req.status === 'Enroute')) {
            requests.push(req)
          }
        }
        if (mounted) setOpenRequests(requests)
      } catch (_) {}
    }

    load()
    const interval = setInterval(load, 5000)
    return () => { mounted = false; clearInterval(interval) }
  }, [mode])

  // ── Geolocation ──────────────────────────────────────────────
  function requestLocation() {
    if (!navigator.geolocation) { setLocationError('Browser does not support geolocation. Search by city.'); return }
    setLocating(true)
    setLocationError('')
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocation([pos.coords.latitude, pos.coords.longitude]); setLocating(false) },
      (err) => {
        setLocating(false)
        setLocationError(err.code === 1
          ? 'Location blocked. Search by city, or click the map to drop a pin.'
          : 'Could not get location. Search below or click the map.')
      },
      { timeout: 12000 }
    )
  }

  async function handleGenerateProof() {
    if (!location || !isWalletConnected || !activeWalletAddress) return
    startFlowPopup('Generating location proof', activeWalletAddress, 'location_proof')
    clearZkLog()
    appendZkLog('Starting ZK proof')
    setZkState('loading')
    setZkError('')
    try {
      const { generateLocationProof } = await import('../lib/zk.js')
      const result = await generateLocationProof({
        lat: location[0],
        lng: location[1],
        recipientAddress: activeWalletAddress,
        onLog: appendZkLog,
      })
      setZkProof(result)
      setProofs(p => ({ ...p, location: true }))
      setZkState('done')
      appendZkLog('ZK proof ready')
    } catch (err) {
      setZkError(err.message || 'Proof generation failed')
      setZkState('error')
      appendZkLog('Proof generation failed')
    }
  }

  async function ensureLocationProof(recipientAddress = activeWalletAddress) {
    if (!location) throw new Error('Set your location first.')
    if (!recipientAddress) throw new Error('Connect your Stellar wallet first.')
    if (!StrKey.isValidEd25519PublicKey(recipientAddress)) {
      throw new Error('Reconnect a valid Stellar wallet before generating the proof.')
    }
    if (zkProof && zkState === 'done') return zkProof

    setZkState('loading')
    setZkError('')
    try {
      const { generateLocationProof } = await import('../lib/zk.js')
      const result = await generateLocationProof({
        lat: location[0],
        lng: location[1],
        recipientAddress,
        onLog: appendZkLog,
      })
      setZkProof(result)
      setProofs(p => ({ ...p, location: true }))
      setZkState('done')
      appendZkLog('ZK proof ready')
      return result
    } catch (err) {
      const message = err.message || 'Proof generation failed'
      setZkError(message)
      setZkState('error')
      appendZkLog('Proof generation failed')
      throw new Error(message)
    }
  }

  async function runProofAfterRegistration(action, txHash, walletAddress, pinnedLocation = location) {
    if (!pinnedLocation || !walletAddress) return
    const locationSnapshot = [pinnedLocation[0], pinnedLocation[1]]
    setFlowAction(action)
    setFlowActionTxHash(txHash || '')
    if (txHash) setFlowTxHash(txHash)
    setPendingProofRegistration({ action, txHash, walletAddress, location: locationSnapshot })
    appendZkLog('On-chain registration is done')
    appendZkLog('Starting ZK proof in the background')
    setZkState('loading')
    setZkError('')
    try {
      const { generateLocationProof } = await import('../lib/zk.js')
      const result = await generateLocationProof({
        lat: pinnedLocation[0],
        lng: pinnedLocation[1],
        recipientAddress: walletAddress,
        onLog: appendZkLog,
      })
      setZkProof(result)
      setProofs(p => ({ ...p, location: true }))
      setZkState('done')
      appendZkLog('ZK proof ready')
      appendZkLog('Recording ZK proof checkpoint on Stellar')
      const verification = await recordExpertVerification(`${action}_zk_proof`, txHash, result?.nullifier || '', walletAddress)
      if (verification?.verificationTxHash || verification?.hash) {
        const proofTx = verification.verificationTxHash || verification.hash
        setFlowTxHash(proofTx)
        setFlowProofTxHash(proofTx)
        appendZkLog('ZK proof registered on Stellar')
        setPendingProofRegistration(null)
      } else {
        throw new Error('ZK proof was generated, but the Stellar checkpoint transaction was not confirmed.')
      }
    } catch (err) {
      const message = err.message || 'Proof generation failed'
      setZkError(`The help action is already registered. ZK proof is pending: ${message}`)
      setZkState('error')
      appendZkLog('Help is registered; ZK proof can be retried later')
    }
  }

  function retryPendingProofRegistration() {
    if (!pendingProofRegistration) {
      setZkState('idle')
      setZkError('')
      return
    }
    clearZkLog()
    setFlowPopupTitle('Completing ZK checkpoint')
    setFlowAction(pendingProofRegistration.action || '')
    setFlowActionTxHash(pendingProofRegistration.txHash || '')
    setFlowTxHash(pendingProofRegistration.txHash || '')
    setFlowWalletAddress(pendingProofRegistration.walletAddress || '')
    setFlowPopupOpen(true)
    void runProofAfterRegistration(
      pendingProofRegistration.action,
      pendingProofRegistration.txHash,
      pendingProofRegistration.walletAddress,
      pendingProofRegistration.location
    )
  }

  async function promptWalletConnection() {
    try {
      const { address } = await StellarWalletsKit.authModal()
      if (address) {
        setWalletAddress(address)
        return address
      }
    } catch (err) {
      if (err?.message) {
        console.warn('Wallet connection cancelled or failed:', err.message)
      }
    }
    return ''
  }

  async function handleClaimAid() {
    const address = activeWalletAddress || await promptWalletConnection()
    if (!zkProof || !address) {
      return
    }
    startFlowPopup('Claiming aid on Stellar', address, 'aid_claimed')
    setClaimState('loading')
    setClaimError('')
    try {
      const result = await claimAid(address, zkProof.publicInputsBytes, zkProof.proof, StellarWalletsKit)
      setFlowTxHash(result.hash || '')
      setFlowActionTxHash(result.hash || '')
      const verification = await recordExpertVerification('aid_claimed', result.hash, zkProof?.nullifier || '', address)
      if (verification?.verificationTxHash || verification?.hash) {
        const proofTx = verification.verificationTxHash || verification.hash
        setFlowProofTxHash(proofTx)
        setFlowTxHash(proofTx)
      }
      setClaimState('done')
    } catch (err) {
      setClaimError(err.message || 'Claim failed')
      setClaimState('error')
    }
  }

  async function handleSearch(e) {
    e.preventDefault()
    const q = searchQuery.trim()
    if (!q) return
    setSearchError('')
    setSearchSuggestions([])
    setSearchLoading(true)
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${MAPBOX_TOKEN}&limit=1`
      )
      const data = await res.json()
      if (!data.features?.length) { setSearchError('Place not found.'); setSearchLoading(false); return }
      const [lng, lat] = data.features[0].center
      setLocation([lat, lng])
      setLocationError('')
      setSearchSuggestions([])
    } catch { setSearchError('Search failed. Check your connection.') }
    setSearchLoading(false)
  }

  function selectSearchSuggestion(feature) {
    if (!feature?.center) return
    const [lng, lat] = feature.center
    setLocation([lat, lng])
    setLocationError('')
    setSearchQuery(feature.place_name || feature.text || '')
    setSearchSuggestions([])
    setSearchError('')
  }

  // ── Submit request (Get Help) ─────────────────────────────────
  async function handleSubmit() {
    if (!location) { setSubmitError('Set your location first.'); return }
    if (!emergencyType) { setSubmitError('Select what happened.'); return }
    const address = activeWalletAddress || await promptWalletConnection()
    if (!address) {
      setSubmitError('Connect your Stellar wallet first.')
      return
    }
    clearZkLog()
    startFlowPopup('Requesting help', address, 'request_created')
    setSubmitting(true); setSubmitError('')
    try {
      appendZkLog('Checking Stellar testnet account')
      await ensureAccountFunded(address)
      appendZkLog('Creating on-chain help request')
      const { requestId: id, hash } = await createRequest(
        address,
        location[0], location[1],
        emergencyType,
        profile.nickname || '',
        profile.contact || '',
        StellarWalletsKit
      )
      setFlowTxHash(hash || '')
      setFlowActionTxHash(hash || '')
      setRequestId(id)
      setRequestStatus('Pending')
      appendZkLog('Request registered on Stellar')
      appendZkLog('Opening Stellar Expert checkpoint')
      recordLocalExpertCheckpoint('request_created', hash, address)
      void runProofAfterRegistration('request_created', hash, address, [...location])
    } catch (err) {
      setSubmitError('Could not send. ' + (err.message || ''))
    }
    setSubmitting(false)
  }

  // ── Offer Help — accept a request ────────────────────────────
  async function handleOffer(req) {
    if (!location) { alert('Enable your location first so the requester can see you on the map.'); return }
    const address = activeWalletAddress || await promptWalletConnection()
    if (!address) {
      return
    }
    setOfferSubmitting(true)
    try {
      clearZkLog()
      startFlowPopup('Offering help', address, 'aid_offered')
      appendZkLog('Checking Stellar testnet account')
      await ensureAccountFunded(address)
      const eta = Math.round(Math.random() * 480 + 180) // 3–11 min in seconds
      appendZkLog('Accepting request on-chain')
      const result = await acceptRequest(
        address,
        req.id,
        location[0], location[1],
        eta,
        StellarWalletsKit
      )
      setFlowTxHash(result.hash || '')
      setFlowActionTxHash(result.hash || '')
      setSelectedRequest(null)
      setLastOfferReceipt({
        requestId: req.id,
        nickname: req.nickname || 'Anonymous',
        emergencyType: req.emergency_type,
        txHash: result.hash || '',
        at: new Date().toISOString(),
      })
      setOpenRequests(prev => prev.filter(r => r.id !== req.id))
      appendZkLog('Offer registered on Stellar')
      appendZkLog('Opening Stellar Expert checkpoint')
      recordLocalExpertCheckpoint('aid_offered', result.hash, address)
      void runProofAfterRegistration('aid_offered', result.hash, address, [...location])
    } catch (err) {
      alert('Could not accept request: ' + (err.message || ''))
    }
    setOfferSubmitting(false)
  }

  // ── Poll responders (Get Help mode, replaces Supabase realtime) ───
  useEffect(() => {
    if (!requestId) return
    let mounted = true

    async function poll() {
      try {
        const count = await getResponderCount(requestId)
        for (let i = 0; i < count; i++) {
          const r = await getResponder(requestId, i)
          if (!r) continue
          if (mounted) {
            setResponders(prev => {
              if (prev.find(p => p.responder === r.responder)) return prev
              return [...prev, r]
            })
            setRequestStatus('Enroute')
          }
        }
      } catch (_) {}
    }

    poll()
    const interval = setInterval(poll, 3000)
    return () => { mounted = false; clearInterval(interval) }
  }, [requestId])

  // ── Derived ──────────────────────────────────────────────────
  const step1Done = !!location
  const step2Done = !!emergencyType
  const step3Done = profile.nickname && profile.contact
  const currentStep = !step1Done ? 1 : requestStatus === 'idle' ? (!step2Done ? 2 : step3Done ? 4 : 3) : 5

  const myChar = selectedChar || pickChar('default', profile.nickname || 'me')

  const statusConfig = {
    Pending: { label: 'WAITING FOR RESPONDER', color: '#a2a586', bg: 'rgba(162,165,134,0.12)', msg: 'Your pin is live. Waiting for someone nearby.' },
    Enroute: { label: 'RESPONDER ON THE WAY',  color: '#7357FF', bg: 'rgba(115,87,255,0.12)', msg: 'Stay where you are. Help is coming.' },
    Resolved: { label: 'RESOLVED',             color: '#3F8487', bg: 'rgba(63,132,135,0.12)', msg: 'This request has been resolved.' },
    Cancelled: { label: 'CANCELLED',           color: '#a2a586', bg: 'rgba(162,165,134,0.12)', msg: 'Request cancelled.' },
  }
  const statusInfo = statusConfig[requestStatus]

  const isGetMode = mode === 'get'
  const accentColor = isGetMode ? '#FF7A6B' : '#7357FF'

  const S = {
    input: { width: '100%', padding: '9px 11px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: 'rgba(242,236,220,0.9)', fontSize: '13px', outline: 'none', boxSizing: 'border-box' },
    btnGhost: { padding: '8px 12px', background: 'rgba(255,255,255,0.08)', color: 'rgba(242,236,220,0.8)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', width: '100%' },
    errorMsg: { fontSize: '11px', color: '#FF7A6B', marginTop: '6px' },
    divider:  { borderTop: '1px solid rgba(255,255,255,0.07)', margin: '16px 0' }
  }

  return (
    <div id="helphone-help-wrap" style={{ display: 'flex', height: '100vh', fontFamily: "'Inter','Helvetica Neue',sans-serif" }}>

      {/* ── SIDEBAR ──────────────────────────────────────────── */}
      <aside ref={sidebarRef} id="helphone-help-sidebar" style={{
        width: '340px', minWidth: '340px', background: '#234B4E',
        color: 'rgba(242,236,220,0.9)', display: 'flex', flexDirection: 'column',
        overflowY: 'auto', zIndex: 1000, boxShadow: '4px 0 32px rgba(0,0,0,0.25)'
      }}>
        <div style={{ padding: '20px 20px 36px' }}>

          {/* Logo + back */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <Link to="/" style={{ fontFamily: "'Instrument Serif',serif", fontSize: '20px', textDecoration: 'none', display: 'flex' }}>
              <span style={{ color: '#F4ECDC', fontStyle: 'italic' }}>Hel</span>
              <span style={{ color: '#a2a586' }}>Phone</span>
            </Link>
            <Link to="/" style={{ fontSize: '12px', color: 'rgba(242,236,220,0.35)', textDecoration: 'none' }}>← Back</Link>
          </div>

          {/* ── Mode toggle ── */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: '6px', marginBottom: '24px',
            background: 'rgba(0,0,0,0.2)', borderRadius: '10px', padding: '4px'
          }}>
            {[['get', 'Get Help', '#FF7A6B'], ['offer', 'Offer Help', '#7357FF']].map(([m, label, color]) => (
              <button key={m} onClick={() => { setMode(m); setSelectedRequest(null); setEmergencyType(null); setRequestStatus('idle'); setRequestId(null); if (!isWalletConnected) promptWalletConnection() }} style={{
                padding: '10px 0', borderRadius: '7px', border: 'none',
                background: mode === m ? color : 'transparent',
                color: mode === m ? '#fff' : 'rgba(242,236,220,0.45)',
                fontWeight: '600', fontSize: '13px', cursor: 'pointer',
                transition: 'all 0.2s'
              }}>{label}</button>
            ))}
          </div>



          {/* ── GET HELP mode ── */}
          {isGetMode && (
            <>
              {requestStatus === 'idle' ? (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '5px' }}>
                    <h2 style={{ margin: 0, fontFamily: "'Instrument Serif',serif", fontWeight: 400, fontSize: '20px', color: '#F4ECDC', lineHeight: 1.2 }}>
                      Request help nearby
                    </h2>
                    <HelpTip label="Request help flow help">Requesting help creates a public Stellar request. Your wallet signs it, then the Action TX receipt appears, followed by the ZK checkpoint.</HelpTip>
                  </div>
                  <p style={{ margin: 0, fontSize: '12px', color: 'rgba(242,236,220,0.4)', lineHeight: 1.5 }}>
                    Fill in the steps below. Nearby people will be notified.
                  </p>
                </div>
              ) : (
                <div style={{ padding: '12px 14px', borderRadius: '10px', marginBottom: '20px', background: statusInfo?.bg, border: `1px solid ${statusInfo?.color}44` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusInfo?.color, flexShrink: 0 }} />
                    <span style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '1.5px', color: statusInfo?.color }}>{statusInfo?.label}</span>
                    {requestStatus === 'Enroute' && responders[0]?.eta_seconds && (
                      <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'rgba(242,236,220,0.5)' }}>ETA {Math.round(responders[0].eta_seconds / 60)} min</span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: '12px', color: 'rgba(242,236,220,0.45)', lineHeight: 1.4 }}>{statusInfo?.msg}</p>
                </div>
              )}

              {/* Step 1: Location */}
              <Step n="1" title="Your location"
                subtitle={locating ? 'Requesting…' : location ? `${location[0].toFixed(4)}, ${location[1].toFixed(4)}` : 'Not set'}
                done={step1Done} active={currentStep === 1 || (!step1Done && requestStatus === 'idle')}
                help="Your location sets the map pin and the private inputs for the proof. You can use GPS, search for a place, or click the map."
              >
                {requestStatus === 'idle' && (
                  <>
                    {locating && <p style={{ fontSize: '12px', color: 'rgba(242,236,220,0.45)', margin: '0 0 8px' }}>Asking for your location…</p>}
                    {locationError && <p style={{ fontSize: '12px', color: '#FF7A6B', margin: '0 0 8px', lineHeight: 1.4 }}>{locationError}</p>}
                    {!locating && !location && (
                      <button style={{ ...S.btnGhost, marginBottom: '8px' }} onClick={requestLocation}>Allow location access</button>
                    )}
                    {location && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 10px', borderRadius: '8px', background: 'rgba(63,132,135,0.15)', border: '1px solid rgba(63,132,135,0.3)', marginBottom: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#3F8487' }}>Location set ✓</span>
                        <button onClick={requestLocation} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(242,236,220,0.35)', fontSize: '11px', cursor: 'pointer', padding: 0 }}>refresh</button>
                      </div>
                    )}
                    <form onSubmit={handleSearch} style={{ display: 'flex', gap: '6px', position: 'relative' }}>
                      <input style={S.input} placeholder="Or search city, country…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} autoComplete="off" />
                      <button type="submit" style={{ padding: '9px 12px', background: '#FF7A6B', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }} disabled={searchLoading}>
                        {searchLoading ? '…' : 'Go'}
                      </button>
                      {(searchSuggestions.length > 0 || searchSuggestLoading) && searchQuery.trim() && (
                        <div style={{
                          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 20,
                          background: '#1c2c24', border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '10px', overflow: 'hidden', boxShadow: '0 10px 28px rgba(0,0,0,0.35)'
                        }}>
                          {searchSuggestLoading && (
                            <div style={{ padding: '10px 12px', fontSize: '11px', color: 'rgba(242,236,220,0.35)' }}>
                              Searching references...
                            </div>
                          )}
                          {searchSuggestions.map((feature) => (
                            <button
                              key={feature.id}
                              type="button"
                              onClick={() => selectSearchSuggestion(feature)}
                              style={{
                                width: '100%', padding: '10px 12px', border: 'none',
                                background: 'transparent', color: 'rgba(242,236,220,0.9)',
                                textAlign: 'left', cursor: 'pointer', display: 'block'
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <div style={{ fontSize: '12px', fontWeight: 600, lineHeight: 1.3 }}>{feature.place_name}</div>
                              <div style={{ fontSize: '10px', color: 'rgba(242,236,220,0.34)', marginTop: '2px' }}>
                                {feature.place_type?.join(' · ') || 'reference'}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </form>
                    {searchError && <p style={S.errorMsg}>{searchError}</p>}
                    {!location && <p style={{ fontSize: '11px', color: 'rgba(242,236,220,0.3)', margin: '6px 0 0' }}>You can also click the map to drop a pin.</p>}
                  </>
                )}
              </Step>

              {/* Step 2: What happened */}
              <Step n="2" title="What happened?" subtitle={step2Done ? EMERGENCY_TYPES.find(e => e.id === emergencyType)?.label : 'Select one'}
                done={step2Done} active={currentStep === 2 && requestStatus === 'idle'}
                help="This describes what kind of help is needed. It is registered with the request so helpers understand the situation."
              >
                {requestStatus === 'idle' && !step2Done && (
                  <button onClick={() => setShowEmergencyModal(true)} style={{
                    ...S.btnGhost, display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                  }}>
                    <span>Pick a type</span>
                    <span style={{ fontSize: '16px', opacity: 0.5 }}>›</span>
                  </button>
                )}
                {requestStatus === 'idle' && step2Done && (() => {
                  const et = EMERGENCY_TYPES.find(e => e.id === emergencyType)
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#FF7A6B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff' }}>
                        {ET_ICONS[et.id]}
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: '#F4ECDC', flex: 1 }}>{et.label}</span>
                      <button onClick={() => setShowEmergencyModal(true)} style={{ background: 'none', border: 'none', color: 'rgba(242,236,220,0.35)', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px', padding: '4px' }}>
                        Change <span style={{ fontSize: '14px' }}>›</span>
                      </button>
                    </div>
                  )
                })()}
              </Step>

              {/* Step 3: Your info */}
              <Step n="3" title="Your info" subtitle={step3Done ? `${profile.nickname} · ${profile.contact}` : 'Optional — how responders reach you'}
                done={step3Done} active={currentStep === 3 && requestStatus === 'idle'}
                help="Your nickname and contact help responders coordinate. Contact is stored in the on-chain action, so use something you are comfortable sharing."
              >
                {requestStatus === 'idle' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                    <input style={S.input} placeholder="Nickname or name" maxLength={30}
                      value={profile.nickname} onChange={e => setProfile(p => ({ ...p, nickname: e.target.value }))} />
                    <input style={S.input} placeholder="@telegram or +54 11 5555-5555" maxLength={40}
                      value={profile.contact} onChange={e => setProfile(p => ({ ...p, contact: e.target.value }))} />
                    <div style={{ fontSize: '9.5px', color: 'rgba(242,236,220,0.18)', lineHeight: 1.4 }}>
                      How responders reach you. Stored on-chain.
                    </div>
                  </div>
                )}
              </Step>

              {/* Step 4: Send */}
              <Step n="4" title="Send request" subtitle={step1Done && step2Done ? 'Ready to go' : 'Complete the steps above'}
                done={requestStatus !== 'idle'} active={currentStep === 4 && requestStatus === 'idle'}
                help="If no wallet is connected, this button opens Stellar Wallets Kit. The receipt appears only after Stellar confirms the transaction."
              >
                {requestStatus === 'idle' && (
                  <>
                    <p style={{ fontSize: '11px', color: 'rgba(242,236,220,0.35)', margin: '0 0 10px', lineHeight: 1.5 }}>
                      Your pin appears on the map. People nearby will see your request and reach out.
                    </p>
                    <button onClick={handleSubmit} disabled={submitting || !step1Done || !step2Done}
                      style={{ width: '100%', padding: '13px', background: step1Done && step2Done && isWalletConnected ? '#FF7A6B' : 'rgba(255,255,255,0.08)', color: step1Done && step2Done && isWalletConnected ? '#fff' : 'rgba(242,236,220,0.25)', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '600', cursor: step1Done && step2Done ? 'pointer' : 'default', opacity: submitting ? 0.6 : 1, transition: 'all 0.2s' }}>
                      {submitting ? 'Sending…' : !isWalletConnected ? 'Connect wallet first' : 'Request help'}
                    </button>
                    {submitError && <p style={S.errorMsg}>{submitError}</p>}
                    <ZkProgressLog entries={zkLog} active={submitting || zkState === 'loading'} />
                  </>
                )}
              </Step>
            </>
          )}

          {/* ── OFFER HELP mode ── */}
          {!isGetMode && (
            <>
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '5px' }}>
                  <h2 style={{ margin: 0, fontFamily: "'Instrument Serif',serif", fontWeight: 400, fontSize: '20px', color: '#F4ECDC', lineHeight: 1.2 }}>
                    People who need help
                  </h2>
                  <HelpTip label="Offer help flow help">Offering help accepts a request on Stellar. That creates a receipt for the helper and shows their responder pin.</HelpTip>
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: 'rgba(242,236,220,0.4)', lineHeight: 1.5 }}>
                  {openRequests.length === 0 ? 'No one nearby needs help right now.' : `${openRequests.length} active request${openRequests.length > 1 ? 's' : ''} on the map. Tap a pin to help.`}
                </p>
              </div>

              {lastOfferReceipt && (
                <div style={{
                  padding: '12px 13px', borderRadius: '10px', marginBottom: '14px',
                  background: 'rgba(115,87,255,0.12)', border: '1px solid rgba(115,87,255,0.28)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#7357FF', flexShrink: 0 }} />
                    <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.2px', color: '#B3A6FF' }}>HELP REGISTERED</span>
                    <HelpTip label="Helper receipt help">This is the helper receipt. It is not the wallet account page: it opens the help transaction or the ZK checkpoint once it is ready.</HelpTip>
                  </div>
                  <p style={{ margin: '0 0 9px', fontSize: '12px', color: 'rgba(242,236,220,0.52)', lineHeight: 1.45 }}>
                    You are helping {lastOfferReceipt.nickname}. This receipt is public and checkable on Stellar.
                  </p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <a
                      href={stellarExpertTxUrl(flowProofTxHash || lastOfferReceipt.txHash) || stellarExpertAccountUrl(activeWalletAddress)}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        flex: 1, padding: '8px 10px', borderRadius: '8px',
                        background: '#7357FF', color: '#fff', textDecoration: 'none',
                        fontSize: '11px', fontWeight: 800, textAlign: 'center'
                      }}
                    >
                      View receipt
                    </a>
                    {pendingProofRegistration?.action === 'aid_offered' && zkState === 'error' && (
                      <button onClick={retryPendingProofRegistration} style={{
                        padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(255,122,107,0.25)',
                        background: 'rgba(255,122,107,0.12)', color: '#FF7A6B',
                        fontSize: '11px', fontWeight: 800, cursor: 'pointer'
                      }}>
                        Retry ZK
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div style={S.divider} />

              {/* Selected request detail */}
              {selectedRequest ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                    <img src={`/assets/chars/${pickChar('default', selectedRequest.id)}.png`}
                      style={{ width: '44px', height: '44px', objectFit: 'contain' }} alt="" />
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#F4ECDC' }}>{selectedRequest.nickname || 'Anonymous'}</div>
                      {(() => {
                        const et = EMERGENCY_TYPES.find(e => e.id === selectedRequest.emergency_type)
                        return et ? (
                          <div style={{ fontSize: '11px', color: 'rgba(242,236,220,0.5)', marginTop: '2px' }}>
                            {et.icon} {et.label}
                          </div>
                        ) : null
                      })()}
                      <div style={{ fontSize: '11px', color: 'rgba(242,236,220,0.4)' }}>{selectedRequest.contact || ''}</div>
                    </div>
                    <button onClick={() => setSelectedRequest(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(242,236,220,0.35)', fontSize: '18px', cursor: 'pointer' }}>×</button>
                  </div>

                  <button onClick={() => handleOffer(selectedRequest)} disabled={offerSubmitting || !location}
                    style={{ width: '100%', padding: '13px', background: isWalletConnected ? '#7357FF' : 'rgba(255,255,255,0.08)', color: isWalletConnected ? '#fff' : 'rgba(242,236,220,0.25)', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '600', cursor: location ? 'pointer' : 'default', opacity: offerSubmitting ? 0.6 : 1 }}>
                    {offerSubmitting ? 'Confirming…' : !isWalletConnected ? 'Connect wallet first' : 'I\'ll help this person'}
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', color: 'rgba(242,236,220,0.34)', fontSize: '11px', lineHeight: 1.45 }}>
                    <HelpTip label="Help offer button help">When you confirm, you sign an `accept_request` transaction. That hash is your public helper receipt.</HelpTip>
                    <span>Helping creates your own public receipt after Stellar confirms.</span>
                  </div>
                  {!location && <p style={S.errorMsg}>Enable your location so they can see you on the map.</p>}
                  <ZkProgressLog entries={zkLog} active={offerSubmitting || zkState === 'loading'} />
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '11px', letterSpacing: '1.5px', fontWeight: '600', color: '#3F8487', marginBottom: '10px' }}>ACTIVE REQUESTS</div>
                  {openRequests.length === 0
                    ? <p style={{ fontSize: '12px', color: 'rgba(242,236,220,0.3)', lineHeight: 1.5 }}>No one nearby needs help right now. Check back soon.</p>
                    : openRequests.map(req => (
                      <button key={req.id} onClick={() => setSelectedRequest(req)}
                        style={{ width: '100%', marginBottom: '8px', padding: '10px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left' }}>
                        <img src={`/assets/chars/${pickChar('default', req.id)}.png`} style={{ width: '36px', height: '36px', objectFit: 'contain', flexShrink: 0 }} alt="" />
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: '#F4ECDC' }}>{req.nickname || 'Anonymous'}</div>
                          {(() => {
                            const et = EMERGENCY_TYPES.find(e => e.id === req.emergency_type)
                            return et ? (
                              <div style={{ fontSize: '10px', color: 'rgba(242,236,220,0.3)', marginTop: '1px' }}>
                                {et.icon} {et.label}
                              </div>
                            ) : null
                          })()}
                        </div>
                        <div style={{ marginLeft: 'auto', width: '8px', height: '8px', borderRadius: '50%', background: '#FF7A6B', flexShrink: 0 }} />
                      </button>
                    ))
                  }
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      {/* ── MAP ──────────────────────────────────────────────── */}
      <div id="helphone-help-map" style={{ flex: 1, position: 'relative' }}>
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          initialViewState={{ longitude: DEFAULT_CENTER[1], latitude: DEFAULT_CENTER[0], zoom: 2 }}
          style={{ width: '100%', height: '100%' }}
          mapStyle={MAP_STYLES[mapStyleIndex].url}
          onClick={e => {
            if (isGetMode && requestStatus === 'idle') {
              setLocation([e.lngLat.lat, e.lngLat.lng])
            }
          }}
        >
          {location && <MapController center={location} zoom={14} />}
          <NavigationControl position="bottom-right" />

          {/* My location marker (Get Help) */}
          {isGetMode && location && (
            <CharMarker charName={myChar} accentColor="#FF7A6B" lat={location[0]} lng={location[1]}
              onClick={() => setPopupMarker(p => p === 'user' ? null : 'user')}>
              {popupMarker === 'user' && (
                <Popup latitude={location[0]} longitude={location[1]} onClose={() => setPopupMarker(null)} closeButton={false}>
                  <strong style={{ color: '#FF7A6B' }}>You</strong>
                  {profile.nickname && <><br />{profile.nickname}</>}
                </Popup>
              )}
            </CharMarker>
          )}

          {/* My location marker (Offer Help) */}
          {!isGetMode && location && (
            <CharMarker charName={myChar} accentColor="#7357FF" lat={location[0]} lng={location[1]}
              onClick={() => setPopupMarker(p => p === 'responder-me' ? null : 'responder-me')}>
              {popupMarker === 'responder-me' && (
                <Popup latitude={location[0]} longitude={location[1]} onClose={() => setPopupMarker(null)} closeButton={false}>
                  <strong style={{ color: '#7357FF' }}>You (responder)</strong>
                  {profile.nickname && <><br />{profile.nickname}</>}
                </Popup>
              )}
            </CharMarker>
          )}

          {/* Responder markers + route lines (Get Help mode) */}
          {isGetMode && location && responders.map(r => (
            <Fragment key={r.id}>
              <CharMarker charName={pickChar('default', r.responder)} accentColor="#7357FF"
                lat={r.lat} lng={r.lng}
                onClick={() => setPopupMarker(p => p === `resp-${r.id}` ? null : `resp-${r.id}`)}>
                {popupMarker === `resp-${r.id}` && (
                  <Popup latitude={r.lat} longitude={r.lng} onClose={() => setPopupMarker(null)} closeButton={false}>
                    <strong style={{ color: '#7357FF' }}>Responder</strong>
                    <br /><span style={{ fontSize: '11px', color: '#a2a586' }}>{r.responder ? r.responder.slice(0, 8) + '…' : 'Responder'}</span>
                    {r.eta_seconds && <><br />ETA: {Math.round(r.eta_seconds / 60)} min</>}
                  </Popup>
                )}
              </CharMarker>
              <RouteLine from={[r.lat, r.lng]} to={location} />
            </Fragment>
          ))}

          {/* Open request markers (Offer Help mode) */}
          {!isGetMode && openRequests.map(req => (
            <CharMarker key={req.id} charName={pickChar('default', req.id)} accentColor="#FF7A6B"
              lat={req.lat} lng={req.lng}
              onClick={() => { setSelectedRequest(req); setPopupMarker(`req-${req.id}`) }}>
              {popupMarker === `req-${req.id}` && (
                <Popup latitude={req.lat} longitude={req.lng} onClose={() => setPopupMarker(null)} closeButton={false}>
                  <strong style={{ color: '#FF7A6B' }}>{req.nickname || 'Anonymous'}</strong>
                  <br /><span style={{ fontSize: '11px', color: '#a2a586' }}>Needs help · Click sidebar to respond</span>
                </Popup>
              )}
            </CharMarker>
          ))}
        </Map>

        {/* Style selector */}
        <div ref={styleSelectorRef} style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 10 }}>
          <button onClick={() => setStyleOpen(o => !o)} style={{
            padding: '7px 14px', background: '#234B4E', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '20px', color: 'rgba(242,236,220,0.85)', fontSize: '12px', fontWeight: '600',
            cursor: 'pointer', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', gap: '7px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
          }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#7357FF', flexShrink: 0 }} />
            {MAP_STYLES[mapStyleIndex].name} <span style={{ opacity: 0.5 }}>▾</span>
          </button>
          {styleOpen && (
            <div style={{
              marginTop: '6px', background: '#1c2c24', borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: '220px'
            }}>
              {MAP_STYLES.map((s, i) => (
                <button key={s.id} onClick={() => { setMapStyleIndex(i); setStyleOpen(false) }}
                  style={{
                    width: '100%', padding: '10px 14px', border: 'none', borderBottom: i < MAP_STYLES.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    background: i === mapStyleIndex ? 'rgba(115,87,255,0.12)' : 'transparent',
                    color: i === mapStyleIndex ? '#B3A6FF' : 'rgba(242,236,220,0.7)',
                    cursor: 'pointer', textAlign: 'left', display: 'block',
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                  onMouseLeave={e => e.currentTarget.style.background = i === mapStyleIndex ? 'rgba(115,87,255,0.12)' : 'transparent'}
                >
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '2px' }}>{s.name}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(242,236,220,0.35)', lineHeight: 1.4 }}>{s.desc}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Help onboarding button */}
        <button
          type="button"
          aria-label="Open HelPhone help guide"
          onClick={() => setShowOnboarding(true)}
          style={{
            position: 'absolute', top: '12px', right: '68px', zIndex: 10,
            width: '44px', height: '44px', borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.12)', background: '#234B4E',
            color: '#F4ECDC', fontSize: '18px', fontWeight: 900,
            cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            backdropFilter: 'blur(8px)'
          }}
        >
          ?
        </button>

        {/* Profile circle */}
        <div ref={profileRef} style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 10 }}>
          <button onClick={() => {
            if (isWalletConnected) {
              setProfileOpen(o => !o)
              return
            }
            promptWalletConnection()
          }} style={{
            width: '44px', height: '44px', borderRadius: '50%', padding: 0, cursor: 'pointer',
            background: profile.nickname || isWalletConnected ? '#234B4E' : 'rgba(35,75,78,0.55)',
            border: `2px solid ${isWalletConnected ? 'rgba(115,87,255,0.4)' : 'rgba(255,255,255,0.12)'}`,
            overflow: 'hidden',
            backdropFilter: 'blur(8px)',
            boxShadow: isWalletConnected ? '0 0 0 3px rgba(115,87,255,0.15), 0 4px 16px rgba(0,0,0,0.3)' : '0 4px 16px rgba(0,0,0,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            {profile.nickname || isWalletConnected ? (
              <img src={`/assets/chars/${myChar}.png`}
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} alt="" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(242,236,220,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
            )}
          </button>

          {profileOpen && isWalletConnected && (
            <div style={{
              position: 'absolute', top: '52px', right: '0',
              width: '300px', background: '#1c2c24', borderRadius: '16px',
              border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden',
              boxShadow: '0 12px 48px rgba(0,0,0,0.6)'
            }}>
              {/* Profile header card */}
              <div style={{ padding: '20px 20px 16px', background: 'rgba(115,87,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: '52px', height: '52px', borderRadius: '12px', overflow: 'hidden', background: '#234B4E', flexShrink: 0, border: '2px solid rgba(115,87,255,0.3)' }}>
                    <img src={`/assets/chars/${myChar}.png`} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} alt="" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: '#F4ECDC', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {profile.nickname || 'Anonymous'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(242,236,220,0.35)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {activeWalletAddress.slice(0, 8)}...{activeWalletAddress.slice(-6)}
                    </div>
                    {receiptTxHash(activeExpertRecord) && (
                      <button onClick={() => setExpertPopupOpen(true)} style={{ marginTop: '8px', padding: '3px 8px', borderRadius: '999px', border: '1px solid rgba(63,132,135,0.25)', background: 'rgba(63,132,135,0.12)', color: '#3F8487', fontSize: '9px', fontWeight: 700, letterSpacing: '0.8px', cursor: 'pointer' }}>
                        VIEW RECEIPT
                      </button>
                    )}
                  </div>
                  <button onClick={async () => { await StellarWalletsKit.disconnect(); setWalletAddress(''); setProfileOpen(false) }} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: 'rgba(242,236,220,0.35)', fontSize: '13px', cursor: 'pointer', padding: '6px 8px', lineHeight: 1 }}>
                    ✕
                  </button>
                </div>
              </div>

              {/* ZK attestion header */}
              <div style={{ padding: '14px 20px 6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                  <div style={{ fontSize: '10px', letterSpacing: '1.8px', fontWeight: '700', color: 'rgba(115,87,255,0.5)' }}>
                    ZK ATTESTATIONS
                  </div>
                  <HelpTip label="ZK attestations help">These are trust signals. The app registers the action quickly; proofs are added as checkpoints when they finish.</HelpTip>
                </div>

                    {/* Alias */}
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(242,236,220,0.5)' }}>On-chain alias</div>
                        {profile.nickname && <div style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(63,132,135,0.15)', color: '#3F8487', letterSpacing: '0.5px' }}>SET</div>}
                      </div>
                      <input style={{
                        width: '100%', padding: '8px 10px', background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px',
                        color: 'rgba(242,236,220,0.9)', fontSize: '13px', outline: 'none',
                        boxSizing: 'border-box'
                      }} placeholder="Anonymous" maxLength={20}
                        value={profile.nickname} onChange={e => setProfile(p => ({ ...p, nickname: e.target.value }))} />
                      <div style={{ fontSize: '9.5px', color: 'rgba(242,236,220,0.18)', marginTop: '4px', lineHeight: 1.4 }}>
                        A pseudonym reveals nothing. No on-chain storage — it exists only in this session.
                      </div>
                    </div>

                    {/* Contact info */}
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(242,236,220,0.5)' }}>Contact</div>
                        {profile.contact && <div style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(63,132,135,0.15)', color: '#3F8487', letterSpacing: '0.5px' }}>SET</div>}
                      </div>
                      <input style={{
                        width: '100%', padding: '8px 10px', background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px',
                        color: 'rgba(242,236,220,0.9)', fontSize: '13px', outline: 'none',
                        boxSizing: 'border-box'
                      }} placeholder="@telegram or +54 11 5555-5555" maxLength={40}
                        value={profile.contact} onChange={e => setProfile(p => ({ ...p, contact: e.target.value }))} />
                      <div style={{ fontSize: '9.5px', color: 'rgba(242,236,220,0.18)', marginTop: '4px', lineHeight: 1.4 }}>
                        How responders reach you. Stored on-chain.
                      </div>
                    </div>

                    {/* Character picker */}
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(242,236,220,0.5)', marginBottom: '6px' }}>
                        Map avatar <span style={{ fontWeight: 400, color: 'rgba(242,236,220,0.2)' }}>· tap to override auto-pick</span>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {CHARS.default.map(name => (
                          <button key={name} onClick={() => setSelectedChar(c => c === name ? null : name)}
                            style={{
                              width: '40px', height: '40px', padding: 0, borderRadius: '8px', overflow: 'hidden', cursor: 'pointer',
                              background: myChar === name ? 'rgba(115,87,255,0.15)' : 'rgba(255,255,255,0.03)',
                              border: myChar === name ? '2px solid #7357FF' : '2px solid rgba(255,255,255,0.06)',
                            }}>
                            <img src={`/assets/chars/${name}.png`} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} alt="" />
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* ZK proof badges */}
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '14px', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                        <div style={{ fontSize: '9px', letterSpacing: '1.5px', fontWeight: '700', color: 'rgba(242,236,220,0.2)' }}>
                          ZK PROOFS
                        </div>
                        <HelpTip label="ZK proofs help">The proof validates data without exposing it fully. If it takes too long or fails, the help action stays registered and you can retry.</HelpTip>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {[
                          { key: 'location', label: 'Proof of Location', desc: 'Generated automatically when you request or offer help' },
                          { key: 'humanity', label: 'Proof of Humanity', desc: 'Funded Stellar wallet — sybil resistant' },
                          { key: 'reputation', label: 'Proof of Reputation', desc: 'Completed arrivals on the HelPhone network' },
                        ].map(p => {
                          const active = proofs[p.key]
                          return (
                            <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 8px', borderRadius: '8px', background: active ? 'rgba(63,132,135,0.08)' : 'rgba(255,255,255,0.02)' }}>
                              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: active ? '#3F8487' : 'rgba(242,236,220,0.12)', flexShrink: 0 }} />
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '11px', fontWeight: 500, color: active ? '#3F8487' : 'rgba(242,236,220,0.25)' }}>{p.label}</div>
                                <div style={{ fontSize: '9px', color: active ? 'rgba(63,132,135,0.5)' : 'rgba(242,236,220,0.12)', marginTop: '1px' }}>{p.desc}</div>
                              </div>
                              <div style={{ fontSize: '8px', padding: '2px 5px', borderRadius: '4px', background: active ? 'rgba(63,132,135,0.15)' : 'rgba(242,236,220,0.04)', color: active ? '#3F8487' : 'rgba(242,236,220,0.15)', letterSpacing: '0.5px' }}>
                                {active ? 'ACTIVE' : 'INACTIVE'}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* ZK Location Proof generator */}
                      <div style={{ marginTop: '12px' }}>
                        {zkState === 'idle' && !proofs.location && location && (
                          <button onClick={handleGenerateProof} style={{
                            width: '100%', padding: '9px 12px',
                            background: 'rgba(115,87,255,0.12)', border: '1px solid rgba(115,87,255,0.25)',
                            borderRadius: '8px', color: '#B3A6FF', fontSize: '12px', fontWeight: '600',
                            cursor: 'pointer', textAlign: 'center'
                          }}>
                            Generate ZK Proof Now
                          </button>
                        )}
                        {zkState === 'idle' && !proofs.location && !location && (
                          <div style={{ fontSize: '10px', color: 'rgba(242,236,220,0.2)', textAlign: 'center', padding: '6px 0' }}>
                            Set your location first to generate proof
                          </div>
                        )}
                        {zkState === 'loading' && (
                          <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'rgba(115,87,255,0.08)', border: '1px solid rgba(115,87,255,0.15)' }}>
                            <div style={{ fontSize: '11px', fontWeight: '600', color: '#B3A6FF', marginBottom: '4px' }}>Generating proof…</div>
                            <div style={{ fontSize: '10px', color: 'rgba(242,236,220,0.3)' }}>UltraHonk circuit · checkpoint after on-chain action</div>
                            <div style={{ marginTop: '8px', height: '2px', background: 'rgba(115,87,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: '60%', background: '#7357FF', borderRadius: '2px', animation: 'mdblink 1.5s ease-in-out infinite' }} />
                            </div>
                          </div>
                        )}
                        {zkState === 'error' && (
                          <div style={{ fontSize: '10px', color: '#FF7A6B', marginTop: '6px', lineHeight: 1.4 }}>
                            {zkError}
                            <button onClick={pendingProofRegistration ? retryPendingProofRegistration : () => setZkState('idle')} style={{ marginLeft: '6px', background: 'none', border: 'none', color: 'rgba(242,236,220,0.3)', cursor: 'pointer', fontSize: '10px' }}>retry</button>
                          </div>
                        )}
                        {zkState === 'done' && zkProof && (
                          <div style={{ marginTop: '8px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(63,132,135,0.08)', border: '1px solid rgba(63,132,135,0.2)' }}>
                            <div style={{ fontSize: '10px', fontWeight: '600', color: '#3F8487', marginBottom: '4px' }}>Proof generated ✓</div>
                            <div style={{ fontSize: '9px', color: 'rgba(63,132,135,0.5)', fontFamily: 'monospace', wordBreak: 'break-all', lineHeight: 1.4 }}>
                              nullifier: {zkProof.nullifier.slice(0, 20)}…
                            </div>
                            <div style={{ marginTop: '8px' }}>
                              {claimState === 'idle' && (
                                <button onClick={handleClaimAid} style={{
                                  width: '100%', padding: '8px', background: '#3F8487', border: 'none',
                                  borderRadius: '6px', color: '#fff', fontSize: '11px', fontWeight: '600', cursor: 'pointer'
                                }}>
                                  Claim Aid On-chain →
                                </button>
                              )}
                              {claimState === 'loading' && (
                                <div style={{ fontSize: '10px', color: '#3F8487', textAlign: 'center' }}>Submitting proof…</div>
                              )}
                              {claimState === 'done' && (
                                <div style={{ fontSize: '10px', color: '#3F8487', fontWeight: '600', textAlign: 'center' }}>Aid claimed ✓</div>
                              )}
                              {claimState === 'error' && (
                                <div style={{ fontSize: '10px', color: '#FF7A6B', lineHeight: 1.4 }}>
                                  {claimError}
                                  <button onClick={() => setClaimState('idle')} style={{ marginLeft: '6px', background: 'none', border: 'none', color: 'rgba(242,236,220,0.3)', cursor: 'pointer', fontSize: '10px' }}>retry</button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
              </div>
              )}
        </div>

        <FlowProgressModal
          open={flowPopupOpen}
          onClose={() => setFlowPopupOpen(false)}
          title={flowPopupTitle}
          accentColor={accentColor}
          receiptAction={flowAction}
          location={location}
          profile={profile}
          walletAddress={flowWalletAddress || activeWalletAddress}
          entries={zkLog}
          active={submitting || offerSubmitting || claimState === 'loading' || zkState === 'loading'}
          txHash={flowProofTxHash || flowTxHash || ''}
          actionTxHash={flowActionTxHash || ''}
          proofTxHash={flowProofTxHash || ''}
          error={submitError || zkError || claimError || ''}
          canRetryProof={Boolean(pendingProofRegistration) && zkState === 'error'}
          onRetryProof={retryPendingProofRegistration}
        />

        <HelpOnboardingModal
          open={showOnboarding}
          onClose={() => setShowOnboarding(false)}
          onConnectWallet={() => promptWalletConnection()}
        />

        {expertPopupOpen && activeExpertRecord && (
          <div onClick={() => setExpertPopupOpen(false)} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.66)',
            zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              width: '100%', maxWidth: '420px', borderRadius: '18px',
              background: '#1c2c24', border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 24px 72px rgba(0,0,0,0.6)', overflow: 'hidden'
            }}>
              <div style={{ padding: '20px 22px', background: 'rgba(63,132,135,0.08)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '10px', letterSpacing: '1.8px', fontWeight: 700, color: '#3F8487', marginBottom: '8px' }}>
                  VERIFIED CHECKPOINT
                </div>
                <h3 style={{ margin: 0, fontSize: '24px', lineHeight: 1.1, color: '#F4ECDC' }}>
                  {receiptCopy(activeExpertRecord.lastAction).title}
                </h3>
                <p style={{ margin: '8px 0 0', fontSize: '13px', lineHeight: 1.5, color: 'rgba(242,236,220,0.62)' }}>
                  {receiptCopy(activeExpertRecord.lastAction).body}
                </p>
              </div>
              <div style={{ padding: '18px 22px 22px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                  {[
                    ['Wallet', activeExpertRecord.walletAddress ? `${activeExpertRecord.walletAddress.slice(0, 8)}...${activeExpertRecord.walletAddress.slice(-6)}` : 'Unknown'],
                    ['Action', actionLabel(activeExpertRecord.lastAction)],
                    ['Network', activeExpertRecord.network || 'testnet'],
                    ['Time', activeExpertRecord.verifiedAt ? new Date(activeExpertRecord.verifiedAt).toLocaleString() : 'n/a'],
                  ].map(([label, value]) => (
                    <div key={label} style={{ padding: '10px 12px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: '9px', letterSpacing: '1px', color: 'rgba(242,236,220,0.32)', marginBottom: '4px' }}>{label}</div>
                      <div style={{ fontSize: '12px', color: '#F4ECDC', wordBreak: 'break-word' }}>{value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '10px', letterSpacing: '1.4px', fontWeight: 700, color: 'rgba(242,236,220,0.3)', marginBottom: '8px' }}>
                    VERIFICATION
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div style={{ padding: '10px 12px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', minWidth: 0 }}>
                      <div style={{ fontSize: '9px', letterSpacing: '1px', color: 'rgba(242,236,220,0.32)', marginBottom: '5px' }}>ACTION TX</div>
                      {activeExpertRecord.actionTxHash || activeExpertRecord.lastTxHash ? (
                        <a
                          href={stellarExpertTxUrl(activeExpertRecord.actionTxHash || activeExpertRecord.lastTxHash)}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: '11px', color: '#7fb8ba', textDecoration: 'none', wordBreak: 'break-all' }}
                        >
                          {shortHash(activeExpertRecord.actionTxHash || activeExpertRecord.lastTxHash)}
                        </a>
                      ) : (
                        <div style={{ fontSize: '11px', color: 'rgba(242,236,220,0.34)' }}>Not available</div>
                      )}
                    </div>
                    <div style={{
                      padding: '10px 12px', borderRadius: '10px',
                      background: activeExpertRecord.verificationTxHash ? 'rgba(63,132,135,0.1)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${activeExpertRecord.verificationTxHash ? 'rgba(63,132,135,0.25)' : 'rgba(255,255,255,0.06)'}`,
                      minWidth: 0
                    }}>
                      <div style={{ fontSize: '9px', letterSpacing: '1px', color: 'rgba(242,236,220,0.32)', marginBottom: '5px' }}>ZK TX</div>
                      {activeExpertRecord.verificationTxHash ? (
                        <a
                          href={stellarExpertTxUrl(activeExpertRecord.verificationTxHash)}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: '11px', color: '#7fb8ba', textDecoration: 'none', wordBreak: 'break-all' }}
                        >
                          {shortHash(activeExpertRecord.verificationTxHash)}
                        </a>
                      ) : (
                        <div style={{ fontSize: '11px', color: 'rgba(242,236,220,0.34)' }}>Pending</div>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '10px', letterSpacing: '1.4px', fontWeight: 700, color: 'rgba(242,236,220,0.3)', marginBottom: '8px' }}>
                    ACTIVITY
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {(activeExpertRecord.history || []).slice().reverse().map((item, index) => (
                      <div key={`${item.at}-${index}`} style={{ padding: '8px 10px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                          <div style={{ fontSize: '12px', color: '#F4ECDC' }}>{actionLabel(item.action)}</div>
                          <div style={{ fontSize: '10px', color: 'rgba(242,236,220,0.28)' }}>{new Date(item.at).toLocaleTimeString()}</div>
                        </div>
                        {item.txHash && (
                          <a
                            href={stellarExpertTxUrl(item.txHash)}
                            target="_blank"
                            rel="noreferrer"
                            style={{ display: 'block', fontSize: '10px', color: 'rgba(63,132,135,0.82)', marginTop: '4px', wordBreak: 'break-all', textDecoration: 'none' }}
                          >
                            {item.proofFingerprint ? 'zk tx' : 'tx'} {shortHash(item.txHash)}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {receiptTxHash(activeExpertRecord) ? (
                    <a
                      href={stellarExpertTxUrl(receiptTxHash(activeExpertRecord))}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        flex: 1, padding: '11px 14px', borderRadius: '12px', border: '1px solid rgba(63,132,135,0.25)',
                        background: '#3F8487', color: '#fff', fontSize: '14px', fontWeight: 700, textDecoration: 'none', textAlign: 'center'
                      }}
                    >
                      Open receipt
                    </a>
                  ) : (
                    <div style={{
                      flex: 1, padding: '11px 14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)',
                      background: 'rgba(255,255,255,0.04)', color: 'rgba(242,236,220,0.36)', fontSize: '14px', fontWeight: 700, textAlign: 'center'
                    }}>
                      No receipt transaction yet
                    </div>
                  )}
                  <button onClick={() => setExpertPopupOpen(false)} style={{
                    padding: '11px 14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.05)', color: 'rgba(242,236,220,0.72)', fontSize: '14px', fontWeight: 700, cursor: 'pointer'
                  }}>
                    OK
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Hint overlay */}
        {!location && (
          <div id="hp-hint-overlay" style={{ position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: '#234B4E', color: 'rgba(242,236,220,0.8)', padding: '10px 18px', borderRadius: '24px', fontSize: '13px', fontWeight: '500', boxShadow: '0 4px 20px rgba(0,0,0,0.25)', pointerEvents: 'none', zIndex: 999, whiteSpace: 'nowrap' }}>
            {locating ? 'Getting your location…' : isGetMode ? 'Allow location or click map to drop your pin' : 'Enable location to show responders where you are'}
          </div>
        )}

        {/* Mobile form toggle */}
        <button id="hp-mobile-form-toggle" onClick={() => setShowMobileForm(o => !o)} style={{
          position: 'absolute', bottom: '20px', right: '20px', zIndex: 100,
          width: '50px', height: '50px', borderRadius: '50%', padding: 0,
          background: '#FF7A6B', border: 'none', cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(255,122,107,0.5)',
          display: 'none', alignItems: 'center', justifyContent: 'center'
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {showMobileForm ? (
              <polyline points="18 15 12 9 6 15" />
            ) : (
              <polyline points="6 9 12 15 18 9" />
            )}
          </svg>
        </button>
      </div>

      {/* ── Emergency type modal ─────────────────────────────────── */}
      {showEmergencyModal && (
        <div onClick={() => setShowEmergencyModal(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#1c3535', borderRadius: '20px', padding: '24px',
            width: '100%', maxWidth: '400px', maxHeight: '85vh', overflowY: 'auto',
            boxShadow: '0 24px 64px rgba(0,0,0,0.55)'
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#F4ECDC', lineHeight: 1.2 }}>What happened?</h2>
                <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'rgba(242,236,220,0.4)', lineHeight: 1.4 }}>
                  Pick one so the right people are notified.
                </p>
              </div>
              <button onClick={() => setShowEmergencyModal(false)} style={{
                width: '32px', height: '32px', borderRadius: '50%', border: 'none', flexShrink: 0, marginLeft: '12px',
                background: 'rgba(255,255,255,0.1)', color: 'rgba(242,236,220,0.7)',
                fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {EMERGENCY_TYPES.map(et => {
                const isSelected = emergencyType === et.id
                return (
                  <button key={et.id}
                    onClick={() => { setEmergencyType(et.id); setSubmitError(''); setShowEmergencyModal(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '14px',
                      width: '100%', padding: '14px',
                      background: isSelected ? 'rgba(255,122,107,0.08)' : 'rgba(255,255,255,0.04)',
                      border: `1.5px solid ${isSelected ? '#FF7A6B' : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: '14px', cursor: 'pointer', textAlign: 'left',
                      transition: 'border-color 0.15s, background 0.15s'
                    }}
                  >
                    <div style={{
                      width: '48px', height: '48px', borderRadius: '12px', flexShrink: 0,
                      background: isSelected ? '#FF7A6B' : 'rgba(255,255,255,0.08)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: isSelected ? '#fff' : 'rgba(242,236,220,0.65)',
                      transition: 'background 0.15s'
                    }}>
                      {ET_ICONS[et.id]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '15px', fontWeight: '600', color: '#F4ECDC', marginBottom: '2px' }}>{et.label}</div>
                      <div style={{ fontSize: '12px', color: 'rgba(242,236,220,0.35)', lineHeight: 1.3 }}>{et.desc}</div>
                    </div>
                    {isSelected && (
                      <div style={{
                        width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
                        background: '#FF7A6B', display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          #helphone-help-wrap { position: relative; }
          #helphone-help-sidebar {
            position: fixed !important;
            bottom: 0 !important;
            left: 0 !important;
            width: 100% !important;
            min-width: 0 !important;
            max-height: 70vh !important;
            border-radius: 20px 20px 0 0 !important;
            box-shadow: 0 -8px 40px rgba(0,0,0,0.35) !important;
            transform: translateY(calc(100% - 50px)) !important;
            transition: transform 0.35s cubic-bezier(0.22, 0.75, 0.2, 1) !important;
            z-index: 2000 !important;
          }
          #helphone-help-sidebar.hp-mobile-open {
            transform: translateY(0) !important;
          }
          #helphone-help-sidebar::before {
            content: '';
            display: block;
            width: 36px;
            height: 4px;
            border-radius: 2px;
            background: rgba(255,255,255,0.15);
            margin: 10px auto 0;
          }
          #helphone-help-map { height: 100vh !important; flex: none !important; }
          #hp-mobile-form-toggle { display: flex !important; }
          #helphone-help-sidebar > div { padding-top: 8px !important; }
          #hp-hint-overlay { bottom: 80px !important; font-size: 12px !important; padding: 8px 14px !important; max-width: calc(100vw - 40px) !important; overflow: hidden !important; text-overflow: ellipsis !important; }
        }
      `}</style>
    </div>
  )
}
