// EAS (Ethereum Attestation Service) Contract ABI
export const EAS_ABI = [
  // Attested event from the transaction logs
  "event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schemaId)",
  
  // View function to get attestation data
  "function getAttestation(bytes32 uid) external view returns (tuple(bytes32 uid, bytes32 schema, uint64 time, uint64 expirationTime, uint64 revocationTime, bytes32 refUID, address recipient, address attester, bool revocable, bytes data))",
  
  // Main attest function
  "function attest(tuple(bytes32 schema, tuple(address recipient, uint64 expirationTime, bool revocable, bytes32 refUID, bytes data, uint256 value) data) request) external payable returns (bytes32)"
];

// Import the Sapience ABI from the copied ABI file
import SapienceABI from './Sapience.json';

// Export the imported Sapience ABI
export const SAPIENCE_ABI = SapienceABI;

// ERC20 Token ABI - Standard
export const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)", 
  "function approve(address spender, uint256 value) returns (bool)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function transferFrom(address from, address to, uint256 value) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)"
];

// Contract addresses - These will be extracted from attestation data instead of hardcoded
export const FIXED_ADDRESSES = {
  // EAS on Arbitrum (from Sage's utils/eas.ts)
  EAS_CONTRACT: "0xbD75f629A22Dc1ceD33dDA0b68c546A1c035c458"
};

// Event signatures and schema IDs
export const EAS_CONFIG = {
  // From Sage's utils/eas.ts
  SCHEMA_ID: "0x2dbb0921fa38ebc044ab0a7fe109442c456fb9ad39a68ce0a32f193744d17744",
  
  // Event signature hash from transaction logs
  ATTESTED_EVENT_SIGNATURE: "0x8bf46bf4cfd674fa735a3d63ec1c9ad4153f033c290341f3a588b75685141b35",
  
  // Schema structure: 'address marketAddress,uint256 marketId,bytes32 questionId,uint160 prediction,string comment'
  SCHEMA_STRUCTURE: "address marketAddress, uint256 marketId, bytes32 questionId, uint160 prediction, string comment"
};