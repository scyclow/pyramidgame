


export const CONTRACTS = {
  PyramidGame: {
    addr: {
      local: '0xbdEd0D2bf404bdcBa897a74E6657f1f12e5C6fb6',
      sepolia: '0x3b0E151c9be53B6316Ef7E7B7A18FF2713C6D609',
      base: ''
    },
    abi: [
      'event Contribution(address indexed sender, uint256 amount)',
      'event Distribution(address indexed recipient, uint256 amount)',
      'event ChildPyramidDeployed(address indexed childAddress, address indexed deployer, uint256 amount)',
      'function contribute() external payable',
      'function claimLeaderboardSlot() external',
      'function addToLeaderContributionBalance(uint256 tokenId, uint256 tokenAmount) external',
      'function outstandingContributions(address contributor) public view returns (uint256)',
      'function leaderboard() external view returns (address)',
      'function balanceOf(address account) public view returns (uint256)',
      'function transfer(address to, uint256 amount) public returns (bool)',
      'function approve(address spender, uint256 amount) public returns (bool)',
      'function allowance(address owner, address spender) public view returns (uint256)',
      'function transferFrom(address from, address to, uint256 amount) public returns (bool)',
      'function totalSupply() public view returns (uint256)',
      'function executeLeaderTransaction(address target, uint256 value, bytes calldata data, uint256 txNonce, uint256[] calldata leaderTokenIds, bytes[] calldata signatures) external',
      'function name() public view returns (string)',
      'function symbol() public view returns (string)',
      'function totalChildren() external view returns (uint256)',
      'function children(uint256 index) external view returns (address)',
      'function deployChildPyramidGame(string gameName, string tokenSymbol, string leaderSymbol) external payable returns (address)',
      'function wallet() external view returns (address)',
      'function parent() external view returns (address)',
    ]
  },
  PyramidGameLeaderboard: {
    addr: {
      local: '0xdfd861B9bA6E7961b72140AbD74F5411197B981D',
      sepolia: '',
      base: ''
    },
    abi: [
      'event MetadataUpdate(uint256 _tokenId)',
      'function ownerOf(uint256 tokenId) external view returns (address)',
      'function tokenURI(uint256 tokenId) external view returns (string)',
      'function contributions(uint256 tokenId) external view returns (uint256)',
      'function contributionTotal() external view returns (uint256)',
      'function totalSupply() external view returns (uint256)',
      'function lowestLeader() external view returns (uint256 tokenId, uint256 amount)',
      'function setRecipient(uint256 tokenId, address recipient) external',
      'function recipientOf(uint256 tokenId) external view returns (address)',
      'function balanceOf(address owner) external view returns (uint256)',
      'function transferFrom(address from, address to, uint256 tokenId) external',
      'function approve(address to, uint256 tokenId) external',
      'function getApproved(uint256 tokenId) external view returns (address)',
      'function symbol() external view returns (string)'
    ]
  },
  PyramidGameLeaderboardWallet: {
    addr: {
      local: '0xa06B7221053C11A19fbeeE1297aBc83F1BA0d7A3',
      sepolia: '',
      base: ''
    },
    abi: []
  }
}

