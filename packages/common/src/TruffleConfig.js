/**
 * @notice This script contains private keys, mnemonics, and API keys that serve as default values so that it executes
 * even if the user has not set up their environment variables properly. Typically, these are sensitive secrets that
 * should never be shared publicly and ideally should not be stored in plain text.
 */

const path = require("path");

const HDWalletProvider = require("@truffle/hdwallet-provider");
const LedgerWalletProvider = require("@umaprotocol/truffle-ledger-provider");
const { GckmsConfig } = require("./gckms/GckmsConfig.js");
const { ManagedSecretProvider } = require("./gckms/ManagedSecretProvider.js");
const { PublicNetworks } = require("./PublicNetworks.js");
const { MetaMaskTruffleProvider } = require("./MetaMaskTruffleProvider.js");
require("dotenv").config();

// Fallback to a public mnemonic to prevent exceptions.
const mnemonic = process.env.MNEMONIC
  ? process.env.MNEMONIC
  : "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat";

// Fallback to a public private key to prevent exceptions.
const privateKey = process.env.PRIVATE_KEY
  ? process.env.PRIVATE_KEY
  : "0x348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709";

// Fallback to a backup non-prod API key.
const infuraApiKey = process.env.INFURA_API_KEY ? process.env.INFURA_API_KEY : "e34138b2db5b496ab5cc52319d2f0299";
const customNodeUrl = process.env.CUSTOM_NODE_URL;
const keyOffset = process.env.KEY_OFFSET ? parseInt(process.env.KEY_OFFSET) : 0; // Start at account 0 by default.
const numKeys = process.env.NUM_KEYS ? parseInt(process.env.NUM_KEYS) : 2; // Generate two wallets by default.
let singletonProvider;

// Default options
const gasPx = 20000000000; // 20 gwei
const gas = undefined; // Defining this as undefined (rather than leaving undefined) forces truffle estimate gas usage.

// If a custom node URL is provided, use that. Otherwise use an infura websocket connection.
const nodeUrl = customNodeUrl || `wss://${name}.infura.io/ws/v3/${infuraApiKey}`;

// Adds a public network.
// Note: All public networks can be accessed using keys from GCS using the ManagedSecretProvider or using a mnemonic in the
// shell environment.
function addPublicNetwork(networks, name, networkId) {
  const options = {
    networkCheckTimeout: 10000,
    network_id: networkId,
    gas: gas,
    gasPrice: gasPx
  };

  // GCS ManagedSecretProvider network.
  networks[name + "_gckms"] = {
    ...options,
    provider: function(provider = nodeUrl) {
      if (!singletonProvider) {
        singletonProvider = new ManagedSecretProvider(GckmsConfig, provider, 0, GckmsConfig.length);
      }
      return singletonProvider;
    }
  };

  // Private key network.
  networks[name + "_privatekey"] = {
    ...options,
    provider: function(provider = nodeUrl) {
      if (!singletonProvider) {
        singletonProvider = new HDWalletProvider([privateKey], provider);
      }
      return singletonProvider;
    }
  };

  // Mnemonic network.
  networks[name + "_mnemonic"] = {
    ...options,
    provider: function(provider = nodeUrl) {
      if (!singletonProvider) {
        singletonProvider = new HDWalletProvider(mnemonic, provider, keyOffset, numKeys);
      }
      return singletonProvider;
    }
  };

  const legacyLedgerOptions = {
    networkId: networkId,
    accountsLength: numKeys,
    accountsOffset: keyOffset
  };

  // Ledger has changed their standard derivation path since this library was created, so we must override the default one.
  const ledgerOptions = {
    ...legacyLedgerOptions,
    path: "44'/60'/0'/0/0"
  };

  // Normal ledger wallet network.
  networks[name + "_ledger"] = {
    ...options,
    provider: function(provider = nodeUrl) {
      if (!singletonProvider) {
        singletonProvider = new LedgerWalletProvider(ledgerOptions, provider);
      }
      return singletonProvider;
    }
  };

  // Legacy ledger wallet network.
  // Note: the default derivation path matches the "legacy" ledger account in Ledger Live.
  networks[name + "_ledger_legacy"] = {
    ...options,
    provider: function(provider = nodeUrl) {
      if (!singletonProvider) {
        singletonProvider = new LedgerWalletProvider(legacyLedgerOptions, provider);
      }
      return singletonProvider;
    }
  };
}

// Adds a local network.
// Note: local networks generally have more varied parameters, so the user can override any network option by passing
// a customOptions object.
function addLocalNetwork(networks, name, customOptions) {
  const defaultOptions = {
    host: "127.0.0.1",
    network_id: "*",
    port: 9545,
    gas: gas
  };

  networks[name] = {
    ...defaultOptions,
    ...customOptions
  };

  // Override custom options if environment variables are found
  if ("LOCALHOST" in process.env) {
    networks[name].host = process.env.LOCALHOST;
  }

  if ("LOCALPORT" in process.env) {
    networks[name].port = process.env.LOCALPORT;
  }
}

let networks = {};

// Public networks that need both a mnemonic and GCS ManagedSecretProvider network.
for (const [id, { name }] of Object.entries(PublicNetworks)) {
  addPublicNetwork(networks, name, id);
}

// CI requires a specific port and network ID because of peculiarities of the environment.
addLocalNetwork(networks, "ci", { port: 8545, network_id: 1234 });

// Develop and test networks are exactly the same and both use the default local parameters.
addLocalNetwork(networks, "develop");
addLocalNetwork(networks, "test");

// Coverage requires specific parameters to allow very high cost transactions.
addLocalNetwork(networks, "coverage", { port: 8545, network_id: 1234 });

// MetaMask truffle provider requires a longer timeout so that user has time to point web browser with metamask to localhost:3333
addLocalNetwork(networks, "metamask", {
  networkCheckTimeout: 500000,
  provider: function() {
    if (!singletonProvider) {
      singletonProvider = new MetaMaskTruffleProvider();
    }
    return singletonProvider;
  }
});

addLocalNetwork(networks, "mainnet-fork", { port: 1235, network_id: 1 });

function getTruffleConfig(truffleContextDir = "./") {
  return {
    // See <http://truffleframework.com/docs/advanced/configuration>
    // for more about customizing your Truffle configuration!
    networks: networks,
    plugins: ["solidity-coverage"],
    mocha: {
      enableTimeouts: false,
      before_timeout: 1800000
    },
    compilers: {
      solc: {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 199
          }
        }
      }
    },
    migrations_directory: path.join(truffleContextDir, "migrations"),
    contracts_directory: path.join(truffleContextDir, "contracts"),
    contracts_build_directory: path.join(truffleContextDir, "build/contracts")
  };
}

module.exports = { getTruffleConfig, nodeUrl };
