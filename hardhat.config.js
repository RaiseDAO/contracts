require("dotenv").config();
// require("./tasks/tasks.js");
// require('solidity-coverage');
require('hardhat-contract-sizer');
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");

let mnemonic = process.env.MNEMONIC

module.exports = {
  networks: {
    hardhat: {
      accounts: {
        count: 1500,
        // mnemonic
      },
    },
  
    localhost: {
      url: "http://localhost:8545"
    },

    arbitrum: {
      url: "https://arb-mainnet.g.alchemy.com/v2/sed2doasaR61XQZ8pP_ggLgTlVZ4kP5M",
      chainId: 42161
    },
  
    arbitrum_testnet: {
      accounts: {
        count: 14,
        mnemonic
      },
      url: `https://arb-rinkeby.g.alchemy.com/v2/lueCkNKw2xlRHIkr2vArEu-GUdCxnoql`,
      chainId: 421611
    },
  
    rinkeby: {
      accounts: {
        count: 14,
        mnemonic
      },
      url: `https://eth-rinkeby.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      chainId: 4
    }
  },

  etherscan: {
    apiKey: process.env.ETHERSCAN_API
  },
  
  solidity: {
    version: "0.8.10",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },

  mocha: {
    timeout: 800000
  }
}