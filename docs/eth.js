import {} from './min.ethers.js'

export const bnToN = bn => Number(bn.toString())
export const ethVal = (n, str=false) => str ? ethers.utils.formatEther(n) : Number(ethers.utils.formatEther(n))
export const truncateAddr = (addr, len=13) => {
  const padding = Math.floor((len - 5)/2)
  return addr.slice(0, 2+padding) + '...' + addr.slice(-padding)
}
export const toETH = amt => ethers.utils.parseEther(String(amt))
export const fromWei = amt => bnToN(amt)/1e18
export const txValue = amt => ({ value: toETH(amt) })
export const ZERO_ADDR = '0x0000000000000000000000000000000000000000'


export function isENS(ens) {
  return ens.slice(-4) === '.eth'
}

window.toETH = toETH
window.bnToN = bnToN
window.fromWei = fromWei

export const etherscanAddr = addr => `<a href="https://etherscan.io/address/${addr}" target="_blank" class="address">${addr}</a>`





export class Web3Provider {
  onConnectCbs = []
  ens = ''

  FORCED_CHAIN_ID = '0x2105'
  VALID_CHAINS = [
    // '0x1', // mainnet
    '0x7a69', // local
    '0xaa36a7', // sepolia
    '0x2105', // base
    // '0x14a34', // base sepolia
  ]

  CHAIN_NAMES = {
    '0x1': 'mainnet',
    '0xaa36a7': 'sepolia',
    '0x7a69': 'local',
    '0x2105': 'base',
    '0x14a34': 'baseSepolia',
  }

  ETHERSCAN_URLS = {
    mainnet: 'https://etherscan.io',
    sepolia: 'https://sepolia.etherscan.io',
    base: 'https://basescan.org',
    baseSepolia: 'https://sepolia.basescan.org',
  }



  hasConnected = false

  constructor() {
    if (window.ethereum) {
      try {
        this.provider = new ethers.providers.Web3Provider(window.ethereum, 'any')
        this.isEthBrowser = true

        let currentAccount

        this.provider.listAccounts().then(accounts => currentAccount = accounts[0])

        setRunInterval(async () => {
          const [connectedAccount, ...accounts] = await this.provider.listAccounts()
          if (currentAccount !== connectedAccount) {
            currentAccount = connectedAccount
            this.connect()
          }
        }, 500)

        this.isConnected()
          .then(async (addr) => {
            if (!addr) return

            this.hasConnected = true
            const currentChain = await this.currentChain()
            if (addr && !this.VALID_CHAINS.includes(currentChain)) {
              await this.switchChain(this.FORCED_CHAIN_ID)
            }
          })

        this.isConnected()
          .then(async addr => {
            try {
              if (addr) {
                const ens = await this.getENS(addr)
                if (isENS(ens)) this.ens = ens
              }
            } catch(_e) {}
          })
      } catch (e) {
        console.error(e)
      }

    } else {
      console.log('no Web3 detected')
      this.isEthBrowser = false
    }
  }

  async connectWallet() {
    const connected = await window.ethereum.request({ method: 'eth_requestAccounts' }, [])

    const currentChain = await this.currentChain()
    if (!this.VALID_CHAINS.includes(currentChain)) {
      await this.switchChain(this.FORCED_CHAIN_ID)
    }
    return connected
  }

  async currentChain() {
    return await window.ethereum.request({ method: 'eth_chainId' })
  }

  async switchChain(chainId) {
    if (!chainId) return

    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId }],
    })
    window.location.reload()
  }


  onConnect(cb, errorCb) {
    this.onConnectCbs.push(cb)
    this.isConnected()
      .then(addr => {
        if (addr) {
          return Promise.all([addr, this.getNetwork()])
        } else {
          return []
        }
      })
      .then(([addr, network]) => {
        if (addr) {
          cb(addr, network)
        }
      })
      .catch(errorCb)
  }

  connect() {
    this.onConnectCbs.forEach(async cb => cb(await this.isConnected()))
  }

  get signer() {
    return this.provider.getSigner()
  }

  async isConnected() {
    if (!this.isEthBrowser) return false

    try {
      return await this.signer.getAddress()
    } catch (e) {
      return false
    }
  }

  isWeb3() {
    return !!window.ethereum
  }

  rawContract(contractAddr, abi) {
    return new ethers.Contract(contractAddr, abi, this.provider)
  }

  async contract(contractAddr, abi) {
    const signer = await this.isConnected()
    if (signer) {
      return (new ethers.Contract(contractAddr, abi, this.provider)).connect(this.signer)
    }
  }

  isAddress(addr) {
    return ethers.utils.isAddress(addr)
  }

  BN(n) {
    return ethers.BigNumber.from(n)
  }

  async getENS(addr) {
    return this.provider.lookupAddress(addr)
  }

  async getTransactionCount(addr) {
    return this.provider.getTransactionCount(addr)
  }


  async formatAddr(addr, truncate=true, nameLength=19) {
    try {
      const ens = await this.getENS(addr)
      if (isENS(ens)) {
        return ens.length > nameLength
          ? ens.slice(0, nameLength-3) + '...'
          : ens
      } else {
        return truncate ? truncateAddr(addr, nameLength) : addr
      }
    } catch (e) {
      return truncate ? truncateAddr(addr, nameLength) : addr
    }
  }

  async getETHBalance(addr) {
    return (await this.provider.getBalance(addr)) / 1e18
  }

  async getNetwork() {
    const network = await this.provider.getNetwork()
    const hasName = network.name && network.name !== 'unknown'
    const { chainId } = network

    let name
    if (network.chainId === 1) {
      name = 'mainnet'
    } else if (network.chainId === 31337) {
      name = 'local'
    } else if (network.chainId === 11155111) {
      name = 'sepolia'
    } else if (network.chainId === 8453) {
      name = 'base'
    } else if (network.chainId === 84532) {
      name = 'baseSepolia'
    } else if (hasName) {
      name = network.name
    } else {
      name = network.chainId
    }

    return { name, chainId, hasName, network, etherscanLink: this.ETHERSCAN_URLS[name] || '' }
  }

  async contractEvents(contract, event, filterArgs) {
    const filter = contract.filters[event](...filterArgs)
    return (await contract.queryFilter(filter)).map(e => ({
      ...e.args,
      blockNumber: e.blockNumber,
      txHash: e.transactionHash
    }))
  }

  async setContractInfo(contractInfo) {
    this.contractInfo = contractInfo
  }
  async getContracts() {
    const n = await this.getNetwork()
    const networkName = (await this.getNetwork()).name
    const contractInfo = this.contractInfo

    const output = {}
    for (let c of Object.keys(contractInfo)) {
      output[c] = await this.contract(contractInfo[c].addr[networkName], contractInfo[c].abi)
    }
    return output
  }

  async addCoin(address, symbol, image='') {
    const connected = await window.ethereum.request({
      method: 'wallet_watchAsset',
      params: {
        type: 'ERC20',
        options: { address, symbol, image, decimals: 18 },
      }
    })

  }
}



export const provider = new Web3Provider()

window.__provider = provider

