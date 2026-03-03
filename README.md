# OPNet DeFi — Vault + Lending Protocol

> ✅ Contracts are **AssemblyScript** compiled to **WebAssembly (.wasm)** — this is the ONLY format OPNet accepts.

---

## ⚠️ How OPNet Contracts Actually Work

OPNet contracts look like TypeScript but are **AssemblyScript** — a strictly-typed subset that compiles to WebAssembly.

| Feature | TypeScript (wrong ❌) | AssemblyScript (correct ✅) |
|---------|----------------------|---------------------------|
| Big numbers | `bigint` | `u256` from `@btc-vision/as-bignum` |
| Persistent state | any variable | `StoredU256`, `AddressMemoryMap` etc. |
| Build tool | `tsc` | `asc` (AssemblyScript compiler) |
| Output | `.js` | `.wasm` file |
| Floating point | allowed | **FORBIDDEN** — non-deterministic |
| Maps | `Map<K,V>` | `AddressMemoryMap` + storage pointers |
| Method selector | string switch | `encodeSelector('method(type,type)')` |

---

## Project Structure

```
opnet-defi/
├── contracts/                         # AssemblyScript smart contracts
│   ├── src/
│   │   ├── vault/Vault.ts             ← Share-based vault (AssemblyScript)
│   │   └── lending/LendingExtension.ts ← Borrow/repay (AssemblyScript)
│   ├── asconfig.json                  ← AssemblyScript build → .wasm
│   └── package.json
│
└── frontend/                          # Next.js 14 — no backend
    ├── app/
    │   ├── components/
    │   │   ├── Header.tsx
    │   │   ├── TokenStatsCard.tsx      ← Wallet balance + vault + lending
    │   │   ├── VaultActionPanel.tsx
    │   │   └── LendingActionPanel.tsx
    │   ├── hooks/
    │   │   ├── useWallet.ts
    │   │   └── useVaultData.ts
    │   └── lib/opnet.ts
    └── .env.example
```

---

## Building the Contracts

### Step 1 — Clone the OFFICIAL OPNet template

```bash
git clone https://github.com/btc-vision/example-contracts opnet-vault
cd opnet-vault
npm install
```

This gives you the correct `asconfig.json`, `package.json`, and AssemblyScript setup.

### Step 2 — Replace the contract files

```bash
# Copy this repo's contracts into the template's src/contracts/ folder
cp Vault.ts            src/contracts/Vault.ts
cp LendingExtension.ts src/contracts/LendingExtension.ts
```

### Step 3 — Add build targets to asconfig.json

Edit the template's `asconfig.json` and add:

```json
{
  "targets": {
    "vault": {
      "outFile": "build/Vault.wasm",
      "entry": "src/contracts/Vault.ts",
      "optimizeLevel": 3,
      "shrinkLevel": 1
    },
    "lending": {
      "outFile": "build/LendingExtension.wasm",
      "entry": "src/contracts/LendingExtension.ts",
      "optimizeLevel": 3,
      "shrinkLevel": 1
    }
  }
}
```

### Step 4 — Build

```bash
npx asc src/contracts/Vault.ts --config asconfig.json --target vault
npx asc src/contracts/LendingExtension.ts --config asconfig.json --target lending
# Output: build/Vault.wasm  +  build/LendingExtension.wasm
```

---

## Deploy with OP Wallet

1. Open the OP Wallet Chrome extension
2. Switch to **Testnet**
3. Click **Deploy**
4. Drag in `build/Vault.wasm` → confirm BTC tx → copy address
5. Repeat for `build/LendingExtension.wasm` → copy address

---

## Frontend (Codespace + Vercel)

```bash
cd frontend
cp .env.example .env.local
# Fill in your deployed addresses
npm install
npm run dev
```

**Vercel deploy:** Import repo → set root to `frontend` → add env vars → deploy.

### Environment variables

```env
NEXT_PUBLIC_PILL_ADDRESS=0xb09fc29c112af8293539477e23d8df1d3126639642767d707277131352040cbb
NEXT_PUBLIC_MOTO_ADDRESS=0xfd4473840751d58d9f8b73bdd57d6c5260453d5518bd7cd02d0a4cf3df9bf4dd
NEXT_PUBLIC_OPNET_NETWORK=testnet
NEXT_PUBLIC_VAULT_CONTRACT_ADDRESS=opt1sq...your_vault
NEXT_PUBLIC_LENDING_CONTRACT_ADDRESS=opt1sq...your_lending
NEXT_PUBLIC_PILL_BTC_ADDRESS=opt1sqp5gx9k0nrqph3sy3aeyzt673dz7ygtqxcfdqfle
NEXT_PUBLIC_MOTO_BTC_ADDRESS=opt1sqzkx6wm5acawl9m6nay2mjsm6wagv7gazcgtczds
```

---

## Vault Logic

- Deposit PILL/MOTO → receive vault shares (1:1 on first deposit, then proportional)
- Withdraw shares → receive underlying tokens back
- Exchange rate = `totalShares / totalAssets` — appreciates as assets grow

## Lending Logic

- Deposit PILL as collateral → borrow up to 66% value in MOTO (150% CR)
- Deposit MOTO as collateral → borrow up to 66% value in PILL
- 5% APR simple interest, accrued per Bitcoin block
- Repay anytime; withdraw collateral if CR stays ≥ 150%

## Official Resources

- Runtime: https://github.com/btc-vision/btc-runtime
- Template: https://github.com/btc-vision/example-contracts
- OP_20 example: https://github.com/btc-vision/OP_20
- OP Wallet: https://opnet.org
- Testnet faucet: https://faucet.opnet.org
