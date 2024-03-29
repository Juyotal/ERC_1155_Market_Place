// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interfaces/IAuction.sol";
import "./interfaces/IRegistry.sol";

interface INFT {
    function royaltyInfo(uint256 id, uint256 _salePrice) external view returns (address, uint256);

    function balanceOf(address account, uint256 id) external view returns (uint256);

    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) external;

    function supportsInterface(bytes4 interfaceID) external returns (bool);
}

/// @title NFTAuction
/// @notice Allows auctioning of the ERC1155 NFTs in a first-price auction
/// @dev Assumes the existence of a Registry as specified in IRegistry
/// @dev Assumes an ERC2981-compliant NFT, as specified below
contract NFTAuction is IAuction, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Counters for Counters.Counter;

    // address alias for using ETH as a currency
    address constant ETH = address(0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa);

    Counters.Counter private _auctionId;
    IRegistry private Registry;

    mapping(uint256 => Auction) private auctions;
    mapping(uint256 => bool) private cancelled;
    mapping(uint256 => bool) private claimed;
    mapping(uint256 => address) private highestBid;
    mapping(uint256 => mapping(address => Bid)) private bids;
    // user => token => amount
    mapping(address => mapping(address => uint256)) private claimableFunds;
    // token => amount
    mapping(address => uint256) private escrow;

    constructor(address registry) {
        Registry = IRegistry(registry);
    }

    /// @notice Returns a struct with an auction's details
    /// @param auctionId the index of the auction being queried
    /// @return an "Auction" struct with the details of the auction requested
    function getAuctionDetails(uint256 auctionId) external view returns (Auction memory) {
        require(auctionId <= _auctionId.current() && auctionId > 0, "auction does not exist");
        return auctions[auctionId];
    }

    /// @notice Returns the status of a particular auction
    /// @dev statuses are: PENDING, CANCELLED, ACTIVE, ENDED, ENDED & CLAIMED
    /// @param auctionId the index of the auction being queried
    /// @return a string of the auction's status
    function getAuctionStatus(uint256 auctionId) public view override returns (string memory) {
        require(auctionId <= _auctionId.current() && auctionId > 0, "auction does not exist");
        if (cancelled[auctionId] || !Registry.isPlatformContract(address(this))) return "CANCELLED";
        if (claimed[auctionId]) return "ENDED & CLAIMED";
        if (block.timestamp < auctions[auctionId].startTime) return "PENDING";
        if (block.timestamp >= auctions[auctionId].startTime && block.timestamp < auctions[auctionId].endTime)
            return "ACTIVE";
        if (block.timestamp > auctions[auctionId].endTime) return "ENDED";
        revert("error");
    }

    /// @notice Returns the in-contract balance of a specific address for a specific token
    /// @dev use address(0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa) for ETH
    /// @param account the address to query the balance of
    /// @param token the address of the token to query the balance for
    /// @return the uint256 balance of the token queired for the address queried
    function getClaimableBalance(address account, address token) external view returns (uint256) {
        return claimableFunds[account][token];
    }

    /// @notice Returns details of a specific bid
    /// @dev the amount of an outbid bid is reduced to zero
    /// @param auctionId the index of the auction the bid was places in
    /// @param bidder the address of the bidder
    /// @return a Bid struct with details of a specific bid
    function getBidDetails(uint256 auctionId, address bidder) external view returns (Bid memory) {
        return bids[auctionId][bidder];
    }

    /// @notice Returns the address of the current highest bidder in a particular auction
    /// @param auctionId the index of the auction being queried
    /// @return the address of the highest bidder
    function getHighestBidder(uint256 auctionId) external view returns (address) {
        return highestBid[auctionId];
    }

    /// @notice Creates a first-price auction for a ERC1155 NFT
    /// @dev NFT contract must be ERC2981-compliant and recognized by Registry
    /// @dev use address(0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa) for ETH
    /// @param nftContract the address of the NFT contract
    /// @param id the id of the NFT on the NFT contract
    /// @param startTime uint256 timestamp when the auction should commence
    /// @param endTime uint256 timestamp when auction should end
    /// @param reservePrice minimum price for bids
    /// @param currency address of the token bids should be made in
    /// @return the index of the auction being created
    function createAuction(
        address nftContract,
        uint256 id,
        uint256 startTime,
        uint256 endTime,
        uint256 reservePrice,
        address currency
    ) external nonReentrant returns (uint256) {
        INFT NftContract = INFT(nftContract);
        require(Registry.isPlatformContract(nftContract) == true, "NFT not in approved contract");
        require(Registry.isPlatformContract(address(this)) == true, "This contract is deprecated");
        require(Registry.isApprovedCurrency(currency) == true, "currency not supported");
        require(NftContract.supportsInterface(0x2a55205a), "contract must support ERC2981");
        require(NftContract.balanceOf(msg.sender, id) > 0, "does not own NFT");
        require(endTime > startTime, "error in start/end params");

        _auctionId.increment();
        uint256 auctionId = _auctionId.current();

        auctions[auctionId] = Auction({
            id: auctionId,
            owner: msg.sender,
            nftContract: nftContract,
            nftId: id,
            startTime: startTime,
            endTime: endTime,
            reservePrice: reservePrice,
            currency: currency
        });

        NftContract.safeTransferFrom(msg.sender, address(this), id, 1, "");

        emit NewAuction(auctionId, auctions[auctionId]);

        return auctionId;
    }

    /// @notice Allows bidding on a specifc auction
    /// @dev use address(0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa) for ETH
    /// @param auctionId the index of the auction to bid on
    /// @param amountFromBalance the amount to bid from msg.sender's balance in this contract
    /// @param externalFunds the amount to bid from funds in msg.sender's personal balance
    /// @return a bool indicating success
    function bid(
        uint256 auctionId,
        uint256 amountFromBalance,
        uint256 externalFunds
    ) external payable nonReentrant returns (bool) {
        require(Registry.isPlatformContract(address(this)) == true, "This contract is deprecated");
        require(keccak256(bytes(getAuctionStatus(auctionId))) == keccak256(bytes("ACTIVE")), "auction is not active");
        uint256 totalAmount = amountFromBalance +
            externalFunds +
            // this allows the top bidder to top off their bid
            bids[auctionId][msg.sender].amount;
        require(totalAmount > bids[auctionId][highestBid[auctionId]].amount, "bid not high enough");
        require(totalAmount >= auctions[auctionId].reservePrice, "bid is lower than reserve price");
        require(amountFromBalance <= claimableFunds[msg.sender][auctions[auctionId].currency], "not enough balance");

        if (auctions[auctionId].currency != ETH) {
            IERC20 Token = IERC20(auctions[auctionId].currency);

            Token.safeTransferFrom(msg.sender, address(this), externalFunds);
        } else {
            require(msg.value == externalFunds, "mismatch of value and args");
            require(
                msg.value + amountFromBalance > bids[auctionId][highestBid[auctionId]].amount,
                "insufficient ETH sent"
            );
        }

        // next highest bid can be made claimable now,
        // also helps for figuring out how much more net is in escrow
        address lastBidder = highestBid[auctionId];
        uint256 lastAmount = bids[auctionId][lastBidder].amount;
        escrow[auctions[auctionId].currency] += totalAmount - lastAmount;

        if (bids[auctionId][msg.sender].bidder == address(0)) {
            bids[auctionId][msg.sender].bidder = msg.sender;
        }

        if (lastBidder != msg.sender) {
            bids[auctionId][lastBidder].amount = 0;
            claimableFunds[lastBidder][auctions[auctionId].currency] += lastAmount;
            emit BalanceUpdated(
                lastBidder,
                auctions[auctionId].currency,
                claimableFunds[lastBidder][auctions[auctionId].currency]
            );
        }
        if (amountFromBalance > 0) {
            claimableFunds[msg.sender][auctions[auctionId].currency] -= amountFromBalance;
            emit BalanceUpdated(msg.sender, auctions[auctionId].currency, amountFromBalance);
        }
        bids[auctionId][msg.sender].amount = totalAmount;
        bids[auctionId][msg.sender].timestamp = block.timestamp;

        highestBid[auctionId] = msg.sender;

        emit BidPlaced(auctionId, totalAmount);

        return true;
    }

    /// @notice Allows the winner of the auction to claim their NFT
    /// @notice Alternatively, allows auctioner to reclaim on an unsuccessful auction
    /// @dev this function delivers the NFT and moves the bid to the auctioner's claimable balance
    ///   and also accounts for the system fee and royalties (if applicable)
    /// @param auctionId the index of the auction to bid on
    /// @param recipient the address the NFT should be sent to
    /// @return a bool indicating success
    function claimNft(uint256 auctionId, address recipient) external returns (bool) {
        require(msg.sender == highestBid[auctionId] || msg.sender == auctions[auctionId].owner, "cannot claim nft");
        bytes32 status = keccak256(bytes(getAuctionStatus(auctionId)));
        require(
            status == keccak256(bytes("CANCELLED")) || status == keccak256(bytes("ENDED")),
            "nft not available for claiming"
        );
        INFT Nft = INFT(auctions[auctionId].nftContract);
        uint256 totalFundsToPay = msg.sender == auctions[auctionId].owner
            ? 0
            : bids[auctionId][highestBid[auctionId]].amount;
        if (msg.sender == highestBid[auctionId]) {
            require(block.timestamp > auctions[auctionId].endTime, "cannot claim from auction");
            require(
                bids[auctionId][highestBid[auctionId]].amount >= auctions[auctionId].reservePrice,
                "reserve price not met"
            );
        } else if (msg.sender == auctions[auctionId].owner) {
            require(
                cancelled[auctionId] ||
                    (bids[auctionId][highestBid[auctionId]].amount < auctions[auctionId].reservePrice &&
                        block.timestamp > auctions[auctionId].endTime),
                "owner cannot reclaim nft"
            );
        }

        // accounting logic
        if (totalFundsToPay > 0) {
            _nftPayment(auctionId, totalFundsToPay, Nft);
        }

        Nft.safeTransferFrom(address(this), recipient, auctions[auctionId].nftId, 1, "");
        claimed[auctionId] = true;

        emit ClaimNFT(auctions[auctionId].id, msg.sender, recipient, bids[auctionId][highestBid[auctionId]].amount);

        return true;
    }

    /// @notice Withdraws in-contract balance of a particular token
    /// @dev use address(0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa) for ETH
    /// @param tokenContract the address of the token to claim
    function claimFunds(address tokenContract) external {
        require(claimableFunds[msg.sender][tokenContract] > 0, "nothing to claim");
        uint256 payout = claimableFunds[msg.sender][tokenContract];
        if (tokenContract != ETH) {
            IERC20 Token = IERC20(tokenContract);
            claimableFunds[msg.sender][tokenContract] = 0;
            Token.safeTransfer(msg.sender, payout);
        } else {
            claimableFunds[msg.sender][tokenContract] = 0;
            (bool success, ) = msg.sender.call{value: payout}("");
            require(success, "ETH payout failed");
        }
        emit BalanceUpdated(msg.sender, tokenContract, claimableFunds[msg.sender][tokenContract]);
    }

    /// @notice Allows contract owner to send NFT to auction winner and funds to auctioner's balance
    /// @dev prevents assets from being stuck if winner does not claim
    /// @param auctionId the index of the auction to resolve
    function resolveAuction(uint256 auctionId) external onlyOwner {
        require(keccak256(bytes(getAuctionStatus(auctionId))) == keccak256(bytes("ENDED")), "can only resolve ENDED");
        uint256 winningBid = bids[auctionId][highestBid[auctionId]].amount;
        require(winningBid > 0, "no bids: cannot resolve");
        INFT Nft = INFT(auctions[auctionId].nftContract);
        _nftPayment(auctionId, winningBid, Nft);

        Nft.safeTransferFrom(address(this), highestBid[auctionId], auctions[auctionId].nftId, 1, "");
        claimed[auctionId] = true;

        emit ClaimNFT(
            auctions[auctionId].id,
            msg.sender,
            highestBid[auctionId],
            bids[auctionId][highestBid[auctionId]].amount
        );
    }

    /// @notice Allows contract owner or auctioner to cancel a pending or active auction
    /// @param auctionId the index of the auction to cancel
    function cancelAuction(uint256 auctionId) external {
        require(msg.sender == auctions[auctionId].owner || msg.sender == owner(), "only owner or sale creator");
        require(
            keccak256(bytes(getAuctionStatus(auctionId))) == keccak256(bytes("ACTIVE")) ||
                keccak256(bytes(getAuctionStatus(auctionId))) == keccak256(bytes("PENDING")),
            "must be active or pending"
        );
        cancelled[auctionId] = true;
        // current highest bid moves from escrow to being reclaimable
        address highestBidder = highestBid[auctionId];
        uint256 _highestBid = bids[auctionId][highestBidder].amount;

        escrow[auctions[auctionId].currency] -= _highestBid;
        claimableFunds[highestBidder][auctions[auctionId].currency] += _highestBid;
        emit BalanceUpdated(
            highestBidder,
            auctions[auctionId].currency,
            claimableFunds[highestBidder][auctions[auctionId].currency]
        );
        emit AuctionCancelled(auctionId);
    }

    /// @notice internal function for handling royalties and system fee
    function _nftPayment(
        uint256 auctionId,
        uint256 fundsToPay,
        INFT Nft
    ) internal {
        escrow[auctions[auctionId].currency] -= fundsToPay;
        // if this is from successful auction
        (address artistAddress, uint256 royalties) = Nft.royaltyInfo(auctions[auctionId].nftId, fundsToPay);

        // system fee
        (address systemWallet, uint256 fee) = Registry.feeInfo(fundsToPay);
        fundsToPay -= fee;
        claimableFunds[systemWallet][auctions[auctionId].currency] += fee;
        emit BalanceUpdated(
            systemWallet,
            auctions[auctionId].currency,
            claimableFunds[systemWallet][auctions[auctionId].currency]
        );

        // artist royalty if artist isn't the seller
        if (auctions[auctionId].owner != artistAddress) {
            fundsToPay -= royalties;
            claimableFunds[artistAddress][auctions[auctionId].currency] += royalties;
            emit BalanceUpdated(
                artistAddress,
                auctions[auctionId].currency,
                claimableFunds[artistAddress][auctions[auctionId].currency]
            );
        }

        // seller gains
        claimableFunds[auctions[auctionId].owner][auctions[auctionId].currency] += fundsToPay;
        emit BalanceUpdated(
            auctions[auctionId].owner,
            auctions[auctionId].currency,
            claimableFunds[auctions[auctionId].owner][auctions[auctionId].currency]
        );
    }

    /// @notice allows contract to receive ERC1155 NFTs
    function onERC1155Received(
        address operator,
        address from,
        uint256 id,
        uint256 value,
        bytes memory data
    ) external pure returns (bytes4) {
        // 0xf23a6e61 = bytes4(keccak256("onERC1155Received(address,address,uint256,uint256,bytes)")
        return 0xf23a6e61;
    }
}
