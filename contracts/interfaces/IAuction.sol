// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

interface IAuction {
    struct Auction {
        uint256 id; // id of auction
        address owner; // address of NFT owner
        address nftContract;
        uint256 nftId;
        uint256 startTime;
        uint256 endTime;
        uint256 reservePrice; // may need to be made private
        address currency; // use zero address or 0xeee for ETH
    }

    struct Bid {
        uint256 auctionId;
        address bidder;
        uint256 amount;
        uint256 timestamp;
    }

    event NewAuction(uint256 indexed auctionId, Auction newAuction);
    event AuctionCancelled(uint256 indexed auctionId);
    event BidPlaced(uint256 auctionId, uint256 amount);
    event ClaimNFT(uint256 auctionId, address winner, address recipient, uint256 amount);
    event BalanceUpdated(address indexed accountOf, address indexed tokenAddress, uint256 indexed newBalance);

    function getAuctionDetails(uint256 auctionId) external view returns (Auction memory);

    function getAuctionStatus(uint256 auctionId) external view returns (string memory);

    function getClaimableBalance(address account, address token) external view returns (uint256);

    //note: the next function (getBidDetails) may be removed
    function getBidDetails(uint256 auctionId, address bidder) external view returns (Bid memory);

    function getHighestBidder(uint256 auctionId) external view returns (address);

    function createAuction(
        address nftContract,
        uint256 id,
        uint256 startTime,
        uint256 endTime,
        uint256 reservePrice,
        address currency
    ) external returns (uint256);

    function bid(
        uint256 auctionId,
        uint256 fromBalance,
        uint256 externalFunds
    ) external payable returns (bool);

    function claimNft(uint256 auctionId, address recipient) external returns (bool);

    function claimFunds(address tokenContract) external;

    function cancelAuction(uint256 auctionId) external;
}
