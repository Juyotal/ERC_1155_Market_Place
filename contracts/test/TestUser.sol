// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

/**
  THIS CONTRACT ONLY FOR TESTING PURPOSES
 */

import "../interfaces/INFT.sol";
import "../interfaces/ISale.sol";
import "../interfaces/IAuction.sol";
import "hardhat/console.sol";

contract TestUser {
    function mintNFTandCreateSale(address nftContract, address saleContract) public {
        INFT NFT = INFT(nftContract);
        NFT.mint(address(this), 100, "ipfs://QmeSjSinHpPnmXmspMjwiXyN6zS4E9zccariGR3jxcaWtq/1");

        ISale Sale = ISale(saleContract);
        Sale.createSale(
            nftContract,
            1, // this should always be the first NFT
            100,
            block.timestamp,
            block.timestamp + 2629800, // + 1 month
            1 ether,
            10,
            address(0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa)
        );
    }

    function mintNFTandCreateAuction(
        address nftContract,
        address auctionContract,
        address approvedContract
    ) public {
        INFT NFT = INFT(nftContract);

        NFT.mint(address(this), 100, "ipfs://QmeSjSinHpPnmXmspMjwiXyN6zS4E9zccariGR3jxcaWtq/1");

        NFT.setApprovalForAll(approvedContract, true);

        IAuction Auction = IAuction(auctionContract);
        Auction.createAuction(
            nftContract,
            1, // this should always be the first NFT
            block.timestamp,
            block.timestamp + 2629800, // + 1 month
            1 ether,
            address(0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa)
        );
    }

    // should fail since not payable
    function failClaimFromSale(address saleContract) public {
        ISale Sale = ISale(saleContract);
        Sale.claimFunds(address(0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa));
    }

    // should fail since not payable
    function failClaimFromAuction(address auctionContract) public {
        IAuction Auction = IAuction(auctionContract);
        Auction.claimFunds(address(0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa));
    }

    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes memory
    ) public virtual returns (bytes4) {
        return this.onERC1155Received.selector;
    }
}
