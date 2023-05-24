// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "./IERC2981.sol";

interface INFT is IERC1155, IERC2981 {
    struct Properties {
        address creator;
        bool isRedeemable;
        string redeemDescrip; // description of what you can redeem with the NFT
    }

    function getNftProperties(uint256 tokenId) external view returns (Properties memory);

    function getWhitelisted(address toCheck) external view returns (bool);

    function isExemptFromRoyalties(uint256 tokenId, address checkIfExempted) external view returns (bool);

    function getRoyaltyRate() external view returns (uint256, uint256);

    function setWhitelisted(address toSet, bool canMint) external;

    function setRoyalty(uint256 _rate, uint256 _scale) external;

    function setRoyaltyExemption(
        uint256 tokenId,
        address toModify,
        bool isExempt
    ) external;

    function setRedeem(
        uint256 tokenId,
        string memory description,
        bool _redeemable
    ) external;

    function mint(
        address account,
        uint256 amount,
        string memory _uri
    ) external;

    function mintBatch(
        address to,
        uint256[] memory amounts,
        string[] memory _uris
    ) external;
}
