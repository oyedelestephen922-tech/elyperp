/**
 * Deploy ElyperpIntelRegistry to Robinhood Chain and verify it on Blockscout.
 *
 *   cd contracts
 *   npm install
 *   cp .env.example .env      # then fill it in
 *   npm run deploy
 *
 * Needs in .env:
 *   DEPLOYER_PRIVATE_KEY  key that pays the deploy gas (ETH on Robinhood Chain)
 *   OWNER_ADDRESS         wallet that controls the registry (add/remove publishers, pause)
 *   PUBLISHER_ADDRESS     address of the server key Elyperp publishes scans with
 */
import hre from "hardhat";
import { getAddress, isAddress, formatEther } from "viem";

function need(name: string): `0x${string}` {
  const v = process.env[name]?.trim();
  if (!v || !isAddress(v)) throw new Error(`${name} must be set to a 0x address in contracts/.env`);
  return getAddress(v);
}

async function main() {
  if (hre.network.name !== "robinhood") throw new Error("Run with --network robinhood (npm run deploy does this).");
  const owner = need("OWNER_ADDRESS");
  const publisher = need("PUBLISHER_ADDRESS");
  const [deployer] = await hre.viem.getWalletClients();
  if (!deployer) throw new Error("DEPLOYER_PRIVATE_KEY is missing from contracts/.env");
  const pc = await hre.viem.getPublicClient();
  const chainId = await pc.getChainId();
  if (chainId !== 4663) throw new Error(`Connected to chain ${chainId}, expected Robinhood Chain (4663).`);

  const bal = await pc.getBalance({ address: deployer.account.address });
  console.log(`Deployer   ${deployer.account.address}  (${formatEther(bal)} ETH)`);
  console.log(`Owner      ${owner}`);
  console.log(`Publisher  ${publisher}`);
  if (bal === 0n) throw new Error("The deployer has no ETH on Robinhood Chain for gas.");

  const reg = await hre.viem.deployContract("ElyperpIntelRegistry", [owner, publisher]);
  console.log(`\nDeployed ElyperpIntelRegistry at ${reg.address}`);
  console.log(`https://robinhoodchain.blockscout.com/address/${reg.address}`);

  console.log("\nWaiting a few blocks before verifying…");
  await new Promise((r) => setTimeout(r, 20_000));
  try {
    // "verify:verify" skips Blockscout, so call the Blockscout step directly. It throws if verification fails.
    await hre.run("verify:blockscout", { address: reg.address });
    console.log(`Verification done. Check the "Contract" tab: https://robinhoodchain.blockscout.com/address/${reg.address}?tab=contract`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/already verified/i.test(msg)) console.log("Already verified.");
    else console.log(`Verification didn't finish (${msg}).\nRetry with:  npm run verify -- ${reg.address} ${owner} ${publisher}`);
  }

  console.log(`\nNext: set NEXT_PUBLIC_INTEL_REGISTRY=${reg.address} in Vercel (Production), and ELYPERP_PUBLISHER_KEY to the publisher's private key.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
