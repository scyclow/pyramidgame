
require("@nomiclabs/hardhat-waffle")
require("hardhat-gas-reporter");
require("@nomiclabs/hardhat-web3");


const STUFF = require('../DEV_KEYS/stuff.json')

module.exports = {
  solidity: {
    compilers: [
      {version: "0.8.0"},
      {version: "0.8.23"},
      {
        version: "0.8.28",
        settings: {
          evmVersion: `cancun`,
        }
      },
    ]
  },
  networks: {
    hardhat: {
    //   forking: {
    //     url: `https://mainnet.infura.io/v3/${STUFF.INFURA_KEY}`,
    //     blockNumber: 17694569,
    //   },
      mining: {
        auto: true,
        interval: 12000
      },
    },

    mumbai: {
      url: STUFF.POLYGON_MUMBAI_URL,
      accounts: [`0x${STUFF.DEV1}`]
    },
    rinkeby: {
      url: STUFF.ETH_RINKEBY_URL,
      accounts: [`0x${STUFF.DEV1}`]
    },
    goerli: {
      url: STUFF.ETH_GOERLI_URL,
      accounts: [`0x${STUFF.DEV1}`]
    },

    sepolia: {
      url: STUFF.ETH_SEPOLIA_URL,
      accounts: [`0x${STUFF.DEV1}`]
    },

  },

  gasReporter: {
    currency: 'USD',
    gasPrice: 1000
  }
}