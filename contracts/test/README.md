# Testing Contracts

All contracts in this directory are included only for the test suite, and are **not meant to be used in production**.

### `Mock1155.sol`

Used when there is a need for a non-ERC2981-compliant NFT contract in tests.

### `TestUser.sol`

Used for creating a failed `call` sending ETH currently, but could be extended to include other user tasks easier to encode in Solidity.