# Elyperp Intelligence registry

`ElyperpIntelRegistry` is a small contract on Robinhood Chain (chain ID 4663) that keeps a public record of the token scans shown on [elyperp.xyz/intelligence](https://www.elyperp.xyz/intelligence).

For each token it stores the latest scan: a **hash of the Agent SI report**, the **risk tier** (HAZARD … FORTIFIED) and **when the data was read**. Every scan is also emitted as a `ScanPublished` event. The SI Score number and the full report are not stored on-chain; anyone can fetch the report from Agent SI and check it against the hash.

- No funds, no token, no upgrade mechanism.
- Only addresses the owner approves as **publishers** can write. Elyperp's server is the publisher.
- A newer scan can never be overwritten by an older one.
- The owner can add or remove publishers, pause publishing, and hand ownership over (two steps).

## Three addresses, three roles

| Role | What it is | Where its key lives |
|---|---|---|
| **Deployer** | Pays the deploy gas. Has no power afterwards. | `contracts/.env` on your computer, only while deploying |
| **Owner** | Your own wallet. Controls publishers and pause. | Your wallet (MetaMask, Rabby…). Only its address goes in `.env` |
| **Publisher** | A new key used only by Elyperp's server to write scans. | Vercel env `ELYPERP_PUBLISHER_KEY` (server only) |

Use a **fresh wallet** for the publisher and fund it with a little ETH on Robinhood Chain (0.002 ETH lasts a long time: gas is around 0.02 gwei). Never use your main wallet's key for it.

## Deploy and verify (from VS Code's terminal)

```bash
cd contracts
npm install
cp .env.example .env        # fill in DEPLOYER_PRIVATE_KEY, OWNER_ADDRESS, PUBLISHER_ADDRESS
npm test                    # 9 tests on a local chain
npm run deploy              # deploys to Robinhood Chain and verifies on Blockscout
```

The deploy prints the contract address and a Blockscout link. If verification doesn't finish (Blockscout sometimes blocks automated requests), retry:

```bash
npm run verify -- <contract address> <owner address> <publisher address>
```

or verify by hand:

```bash
npm run verify:files -- <contract address>
```

This writes `verify/ElyperpIntelRegistry.standard-input.json` and prints the compiler version and constructor arguments. Open the printed Blockscout link, choose **Solidity (Standard JSON input)**, and upload the file.

## Switch it on in Elyperp

In Vercel → Project `elyperp` → Settings → Environment Variables (Production):

- `NEXT_PUBLIC_INTEL_REGISTRY` = the contract address
- `ELYPERP_PUBLISHER_KEY` = the publisher wallet's private key (mark it **Sensitive**)

Then redeploy. `NEXT_PUBLIC_` values are built into the site, so a redeploy is required. From then on, each finished scan is recorded after the user gets their report, and the report page shows a **Robinhood Chain record** section.

The server limits its own spending:
- It skips a scan already on-chain or older than the one stored.
- It re-records a token at most every 6 hours unless the tier changed.
- It sends at most 30 transactions an hour per server instance.
- It stops if the publisher has less than 0.0005 ETH.

## Report hash

```
keccak256(utf8("agentsi:v1|" + id + "|" + chain + "|" + token + "|" + createdAt + "|" + score.points + "|" + score.tier))
```

`chain` is Agent SI's chain id in lowercase. EVM token addresses are lowercase; other chains use the address as written. Values come from `GET https://agentsi.site/api/report/<token>?chain=<chain>`. Code: `src/lib/intel/registry.ts`.

## Admin calls

Use Blockscout's **Write contract** tab while connected with the owner wallet:
- `setPublisher(address, bool)` adds or removes a publisher (for example, when rotating the server key).
- `setPaused(bool)` pauses or resumes publishing.
- `transferOwnership(address)`, then `acceptOwnership()` from the new owner, moves ownership.
