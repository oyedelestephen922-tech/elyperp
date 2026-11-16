/**
 * Fallback for manual verification on Blockscout (if `npm run verify` is blocked).
 *
 *   npm run verify:files -- <contract address>
 *
 * Writes verify/ElyperpIntelRegistry.standard-input.json and prints what to enter on
 * https://robinhoodchain.blockscout.com/address/<address>/contract-verification
 * (method: "Solidity (Standard JSON input)").
 */
import fs from "fs";
import path from "path";
import hre from "hardhat";
import { encodeAbiParameters, getAddress, isAddress } from "viem";

async function main() {
  const address = process.argv[2] ?? process.env.REGISTRY_ADDRESS;
  const owner = process.env.OWNER_ADDRESS;
  const publisher = process.env.PUBLISHER_ADDRESS;
  await hre.run("compile");
  const fqn = "contracts/ElyperpIntelRegistry.sol:ElyperpIntelRegistry";
  const build = await hre.artifacts.getBuildInfo(fqn);
  if (!build) throw new Error("No build info; run npm run compile first.");
  fs.mkdirSync("verify", { recursive: true });
  const out = path.join("verify", "ElyperpIntelRegistry.standard-input.json");
  fs.writeFileSync(out, JSON.stringify(build.input, null, 2));
  console.log(`Wrote ${out}\n`);
  console.log(`Compiler:          v${build.solcLongVersion}`);
  console.log("Contract name:     ElyperpIntelRegistry");
  console.log("Optimization:      enabled, 200 runs; EVM version: paris");
  if (owner && publisher && isAddress(owner) && isAddress(publisher)) {
    const args = encodeAbiParameters([{ type: "address" }, { type: "address" }], [getAddress(owner), getAddress(publisher)]);
    console.log(`Constructor args:  ${args.slice(2)}  (ABI-encoded, without 0x)`);
  } else {
    console.log("Constructor args:  set OWNER_ADDRESS and PUBLISHER_ADDRESS in .env to print them");
  }
  if (address && isAddress(address)) console.log(`\nOpen: https://robinhoodchain.blockscout.com/address/${getAddress(address)}/contract-verification`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
