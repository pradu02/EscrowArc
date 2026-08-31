export const ARC_TESTNET = {
  chainId: '0x4CEF52',
  chainName: 'Arc Testnet',
  // Arc uses native USDC for gas (18 decimals). The ERC-20 interface below
  // remains 6 decimals and is used for escrow amounts and allowances.
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: ['https://rpc.testnet.arc.network'],
  blockExplorerUrls: ['https://testnet.arcscan.app'],
}

// Deploy contracts/EscrowArc.sol in Remix with the vUSDC address below, then paste the new
// deployed address here before using the frontend.
export const ESCROW_CONTRACT_ADDRESS = '0x85d9E53e958EcDc74809dDF50711D377034De553'
export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000'
export const USDC_DECIMALS = 6

export const ESCROW_ABI = [
  'function createEscrow(address freelancer, uint256 amount, string description) returns (uint256)',
  'function acceptEscrow(uint256 escrowId)',
  'function releasePayment(uint256 escrowId)',
  'function refundEscrow(uint256 escrowId)',
  'function getEscrow(uint256 escrowId) view returns (tuple(address client, address freelancer, uint256 amount, uint8 status, string description))',
  'event EscrowCreated(uint256 indexed escrowId, address indexed client, address indexed freelancer, uint256 amount, string description)',
]

export const USDC_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
]
