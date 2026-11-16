import "dotenv/config";
import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";

// Keys come from contracts/.env on your own computer (never committed).
const deployerKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
const accounts = deployerKey ? [deployerKey.startsWith("0x") ? deployerKey : `0x${deployerKey}`] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "paris" },
  },
  networks: {
    robinhood: {
      url: process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
      chainId: 4663,
      accounts,
    },
  },
  // Robinhood Chain's explorer is Blockscout, which needs no API key.
  blockscout: {
    enabled: true,
    customChains: [
      {
        network: "robinhood",
        chainId: 4663,
        urls: {
          apiURL: "https://robinhoodchain.blockscout.com/api",
          browserURL: "https://robinhoodchain.blockscout.com",
        },
      },
    ],
  },
  etherscan: { enabled: false },
  sourcify: { enabled: false },
};

export default config;
