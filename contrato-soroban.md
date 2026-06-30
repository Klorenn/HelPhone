# Contrato Soroban — HelPhone

## Stack

- **Red:** Stellar Testnet
- **Lenguaje:** Rust (Soroban SDK)
- **Herramientas:** `soroban-cli`, `stellar-rpc-client` (frontend)

---

## Data Structures

```rust
#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub enum DataKey {
    Request(u64),          // request_id → Request
    Responder(u64, u32),  // (request_id, responder_index) → Responder
    RequestCount,          // u64 — autoincrement counter
    ResponderCount(u64),   // (request_id) → u32 — responder count per request
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Request {
    pub requester: Address,        // wallet del que pide ayuda
    pub lat: i64,                  // latitud * 1_000_000 (ej: -3432 → -34.32)
    pub lng: i64,                  // longitud * 1_000_000
    pub emergency_type: String,    // 'lost'|'fallen'|'medical'|'car'|'danger'|'other'
    pub nickname: String,          // alias opcional (max 32 chars)
    pub contact: String,           // medio de contacto (tel, telegram, etc.)
    pub status: Status,
    pub created_at: u64,           // Unix timestamp (seconds)
    pub resolved_at: Option<u64>,  // cuándo se resolvió/cerró
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub enum Status {
    Pending,    // abierto, esperando responders
    Enroute,    // alguien ya va en camino
    Resolved,   // se resolvió la situación
    Cancelled,  // el requester canceló
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Responder {
    pub responder: Address,    // wallet del que ayuda
    pub lat: i64,              // posición cuando aceptó
    pub lng: i64,
    pub eta_seconds: u32,      // ETA estimado en segundos
    pub arrived: bool,         // si realmente llegó
    pub responded_at: u64,     // timestamp
}
```

---

## Funciones

### `create_request`

```rust
fn create_request(
    env: Env,
    requester: Address,
    lat: i64,
    lng: i64,
    nickname: String,
    contact: String,
) -> u64
```

- Emite `RequestCreated { id, requester, lat, lng }`
- Requiere `requester.require_auth()`
- Incrementa `RequestCount`, guarda `Request` con `status: Pending`

### `accept_request`

```rust
fn accept_request(
    env: Env,
    responder: Address,
    request_id: u64,
    lat: i64,
    lng: i64,
    eta_seconds: u32,
) -> u32  // devuelve el index del responder
```

- Requiere `responder.require_auth()`
- Requiere que `request.status == Pending`
- Setea `request.status = Enroute`
- Guarda `Responder`, incrementa `ResponderCount`
- Emite `RequestAccepted { request_id, responder, eta_seconds }`

### `update_location`

```rust
fn update_location(
    env: Env,
    responder: Address,
    request_id: u64,
    lat: i32,
    lng: i32,
)
```

- **Sin `require_auth`** — la posición es pública (ya se ve en el mapa). El frontend la firma con un keypair efímero (`getTrackingSigner`) para no pedir firma de wallet cada pocos segundos.
- Busca el `Responder` que coincide con `responder` dentro del request y actualiza `lat`/`lng`.
- Panic `NotFound` si el responder no existe en ese request.
- Emite `LocUpd { request_id, responder, lat, lng }`.
- ⚠️ Trade-off: al no tener auth, cualquiera puede falsificar la posición de un responder. Aceptable para tracking de demo; gatear con `responder.require_auth()` si se quiere endurecer.

### `mark_arrived`

```rust
fn mark_arrived(
    env: Env,
    responder: Address,
    request_id: u64,
)
```

- Marca `responder.arrived = true`
- Emite `ResponderArrived { request_id, responder }`

### `resolve_request`

```rust
fn resolve_request(
    env: Env,
    requester: Address,
    request_id: u64,
)
```

- Requiere `requester.require_auth()`
- Solo quien creó el request puede resolverlo
- Setea `status: Resolved`, guarda `resolved_at`
- Emite `RequestResolved { request_id }`

### `cancel_request`

```rust
fn cancel_request(
    env: Env,
    requester: Address,
    request_id: u64,
)
```

- Requiere `requester.require_auth()`
- Solo funciona si `status == Pending`
- Setea `status: Cancelled`
- Emite `RequestCancelled { request_id }`

### `get_request`

```rust
fn get_request(env: Env, request_id: u64) -> Option<Request>
```

- Read-only. Devuelve el request o `None`.

### `get_responder`

```rust
fn get_responder(env: Env, request_id: u64, index: u32) -> Option<Responder>
```

- Read-only. Devuelve un responder específico.

### `get_request_count`

```rust
fn get_request_count(env: Env) -> u64
```

### `get_active_requests`

```rust
fn get_active_requests(env: Env, max: u32) -> Vec<u64>
```

- Itera request IDs desde `RequestCount` hacia atrás, devuelve los que están `Pending` o `Enroute`.
- Máximo `max` resultados.

### `get_responder_count`

```rust
fn get_responder_count(env: Env, request_id: u64) -> u32
```

### `get_ranking`

```rust
fn get_ranking(env: Env, limit: u32) -> Vec<RankingEntry>
```

- Devuelve los responders con más arribos, ordenados descendente.

```rust
#[contracttype]
pub struct RankingEntry {
    pub responder: Address,
    pub total_arrivals: u32,
}
```

---

## Events

```rust
#[contractevent]
pub enum HelPhoneEvent {
    RequestCreated { id: u64, requester: Address, lat: i64, lng: i64, created_at: u64 },
    RequestAccepted { request_id: u64, responder: Address, eta_seconds: u32 },
    ResponderArrived { request_id: u64, responder: Address },
    RequestResolved { request_id: u64, resolved_at: u64 },
    RequestCancelled { request_id: u64 },
    LocationUpdated { request_id: u64, responder: Address, lat: i32, lng: i32 },
}
```

El frontend se subscribe a estos events via `getEvents()` del RPC de Stellar para actualizar el mapa en tiempo real (reemplaza los `supabase.channel` subscriptions).

---

## Deploy (Testnet)

```bash
# 1. Build (usa stellar CLI)
stellar contract build

# 2. Deploy a testnet
stellar contract deploy \
  --wasm target/wasm32v1-none/release/helphone_contract.wasm \
  --network testnet \
  --source helphone-deployer
```

### Deployed

| Campo | Valor |
|---|---|
| **Contract ID** | `CBO66W2GEGZZNGKLYU2R7QNUA7FKBHMDATNTJXRJS3R6GP7PVXI244YU` |
| **Network** | Stellar Testnet |
| **Tx (upload)** | `abdd1f6280305b4b544df5616cb8331b3f86024b8b16f274508b14a43d749536` |
| **Tx (deploy)** | `c713d22d379eaf7cc6983948e25e6e531483243d1223d7c9e378e7726d44b0ee` |
| **Wasm size** | 11,966 bytes |
| **Functions** | 11 exported |
| **Wallet source** | `helphone-deployer` (`GAEFEAC7...`) |
| **Código fuente** | `contract/contracts/helphone-contract/src/lib.rs` |

Verificado: `get_request_count` → 0, `create_request` → devuelve id 1 con evento `RqCreated` emitido.

### Identity

```bash
stellar keys generate helphone-deployer --network testnet
stellar keys fund helphone-deployer --network testnet
```

---

## Frontend Migration

| Hoy (Supabase) | Mañana (Soroban) | Estado |
|---|---|---|
| `supabase.from('requests').insert(...)` | `contract.create_request(...)` via `stellar-wallet-kit` | ✅ |
| `supabase.from('responders').insert(...)` | `contract.accept_request(...)` | ✅ |
| `supabase.channel(...).on('postgres_changes', ...)` | Poll cada 5s `get_active_requests` / cada 3s `get_responder_count` | ✅ |
| `supabase.from('responders').select(...).eq('status','arrived')` | `contract.get_ranking(...)` | Pendiente en Ranking.jsx |
| No hay fees | Los writes pagan fee mínimo en XLM (~0.00001 XLM) | ✅ |
| Photos (base64 en DB) | Eliminado — no on-chain | ✅ |
| `gender` field | Reemplazado por `contact` (tel/telegram) | ✅ |
| Sin emergency type | `emergency_type: String` agregado al contrato v2 | ✅ |
| Sin wallet obligatorio | Wallet Stellar conectada (Testnet) | ✅ |

### Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/lib/contract.js` | Helper con todas las funciones del contrato Soroban |
| `src/pages/Help.jsx` | Sacado Supabase, conectado al contrato, polling, emergency type, ZK proofs |
| `src/pages/Ranking.jsx` | Migrado a `get_ranking()` del contrato |
| `src/main.jsx` | WalletProvider `PUBLIC → TESTNET` |
| `src/lib/supabase.js` | **Eliminado** |
| `@supabase/supabase-js` | **Eliminado** de package.json |

### Contract v2

- **Contract ID**: `CDKOCBOBOBZOE3WRIQSHRU6Q75VX5UNP7BRBEXCI4QCC5QXQIGUSJZZU`
- `Request` struct ahora incluye `emergency_type: String`
- `create_request` recibe 6 args (se agregó `emergency_type` entre `lng` y `nickname`)

### Contract v3 (deployado — actual)

- **Contract ID**: `CDP5XZ7UYCGSQBYRDYM2OEAUQJULBZPULSQXK7LGNAJTRXRG3VHZLSHY`
- **Network**: Stellar Testnet
- Agregada función `update_location` (tracking live de responders) + evento `LocUpd`.
- **Privacidad**: el frontend manda `nickname` y `contact` **vacíos** on-chain (`createRequest(..., '', '', ...)`). Nombre/contacto reales quedan solo en `localStorage` del navegador.
- **Ubicación**: solo va al chain una versión gruesa (`anonymizeLocation` redondea a 2 decimales, ~1 km). La coordenada exacta se usa únicamente como witness privado del proof ZK (Noir), que prueba "estoy dentro de la zona" sin revelar dónde.
- Es el ID que usa `src/lib/contract.js` (`CONTRACT_ID`).

---

## Próximos Pasos

1. ✅ Crear proyecto Rust con `stellar contract init`
2. ✅ Implementar el contrato
3. ✅ Build + Deploy a testnet
4. ✅ Migrar `Help.jsx` — sacar Supabase, conectar al contrato
5. ✅ Migrar `Ranking.jsx` — leer ranking del contrato
6. ✅ Eliminar `src/lib/supabase.js` y `@supabase/supabase-js`
7. ✅ ZK proof badges — dinámicos en vez de "SOON"
8. ⬜ Test end-to-end
