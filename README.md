# LionPay — Student Fees Portal

LionPay is an independent, University of Nigeria-inspired student fees portal built as my final-year project. It demonstrates a blockchain-backed fee collection flow: a Solidity contract settles payments in test ETH, each payment produces a verifiable on-chain receipt, and a bursary workspace exposes fee management, history, verification and withdrawal.

LionPay is not affiliated with the University of Nigeria. All blockchain activity runs on test networks only; mainnet is blocked in the UI.

## Stack

- React 19, TypeScript, Vite 8, Tailwind 4
- Shadcn component catalog under `components/ui`
- Solidity `^0.8.24` contract compiled with `solc` 0.8.30 (`evmVersion: shanghai`)
- `ethers` v6 + MetaMask for wallet payments
- `anvil` (Foundry) as the local chain for the live portal, `ganache` 7.9.2 for the `node:test` suite

## Develop

Requires Node 22.12 or later in the 22.x series.

```sh
npm ci
npm run dev
```

Open the loopback URL that Vite prints. Payments and receipts read from the deployed contract, so start Anvil and deploy before using the portal.

For a production build:

```sh
npm run build
npm run preview
```

## Local chain (Anvil)

The portal is restricted to Anvil's local test network. Anvil must be available at `%USERPROFILE%\.foundry\bin\anvil.exe` or on `PATH`; install it with Foundry's installer if it is missing. In a separate terminal:

```sh
npm run chain
npm run contract:deploy
```

`npm run chain` starts Anvil on `http://127.0.0.1:8545` with chain id `31337` and prints prefunded development accounts. These keys are for local testing only — never use them on a public network or import a real wallet into Anvil.

Run `contract:deploy` on first setup or after resetting `.local-chain`. Anvil persists the chain in that folder, so later sessions only need `npm run chain`; redeploying without a reset would create a different contract address.

`contract:deploy` seeds the fee schedule from a manual reference rate and writes `blockchain/deployment.json` and `public/deployment.json` so the frontend can auto-load the contract address, ABI, chain id and rate. Override the rate when needed:

```sh
NGN_PER_ETH=2500000 npm run contract:deploy
```

The rate is a fixed reference for this project, not a live exchange-rate feed. In the portal, MetaMask is switched to the Anvil network automatically. When a connected wallet holds less than 1 test ETH, the portal adds 10 test ETH from a dedicated Anvil test account automatically. A manual top-up is also available:

```sh
node blockchain/fund.mjs 0xYourStudentAddress
```

The funded ETH exists only on the local chain and has no monetary value.

## Deploy

Hosted on Netlify at https://lionpay-student-fees.netlify.app. `netlify.toml` sets the build command and `dist` publish folder.

```sh
npm run build
netlify deploy --prod --dir dist
```

## Contract tests

```sh
npm test
```

The suite covers exact ETH amounts, duplicate protection, inactive/unknown fees, owner-only administration, treasury withdrawal and reentrancy.

## Layout

- `contracts/SchoolFees.sol` — fee registry, payment and withdrawal logic
- `blockchain/` — compile and deploy scripts
- `src/portal.ts` — fees, ABI and wallet helpers
- `src/App.tsx` — the full portal UI (overview, pay, history, verify, profile, help, bursary)
- `test/SchoolFees.test.mjs` — node:test suite against an in-process ganache chain

## Optional server function

The default page is fully static. If a server-side endpoint is needed, adapt `functions/handler.ts`. With Deno installed:

```sh
npm run check:function
npm run dev:function
```

Vite proxies `/functions/v1/app` to the local function on `127.0.0.1:8000`.
