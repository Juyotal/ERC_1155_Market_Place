// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

/**
 * @title An NFT contract
 * @dev based on OZ's ERC1155, implements ERC2981 for royalties
 */
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165Storage.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/INFT.sol";

contract NFTcontract is ERC1155, ERC165Storage, Ownable, INFT {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenId;

    // _uri is for a base uri if all NFTs will use the same service/domain to store the metadata JSON
    // if each NFT will have a full uri/url, it should be left as an empty string
    string private _uri;

    // scale: how many zeroes should follow the royalty rate
    // in the default values, there would be a 5% tax on a 18 decimal asset
    uint256 private rate = 500;
    uint256 private scale = 1e4;

    mapping(uint256 => string) private uris;
    mapping(uint256 => Properties) private properties;
    mapping(uint256 => mapping(address => bool)) private royaltyExemptions;
    mapping(address => bool) private whitelisted;

    // make sure mint has relevant details - see comments on mintSingle
    event RedeemDetailsSet(uint256 indexed tokenId, bool indexed redeemable, string indexed description);
    event WhitelistUpdated(address indexed addressSet, bool indexed canMint);
    event RoyaltyDetailsSet(uint256 indexed rate, uint256 indexed scale);
    event RoyaltyExemptionModified(uint256 indexed tokenId, address indexed toModify, bool indexed isExempt);
    event BaseUriSet(string uri);

    constructor(string memory uri_) ERC1155("") {
        _uri = uri_;
        ERC165Storage._registerInterface(type(IERC2981).interfaceId);
        ERC165Storage._registerInterface(type(IERC1155).interfaceId);
        ERC165Storage._registerInterface(type(IERC1155MetadataURI).interfaceId);
    }

    /// @notice Gives the full url of the location of the metadata of a particular NFT
    /// @dev can support either a base URI with the tokenId appended or full individual URIs for each NFT
    /// @param tokenId the index of the NFT to fetch the metadata location for
    /// @return a string with the full location of the metadata JSON
    function uri(uint256 tokenId) public view override returns (string memory) {
        require(tokenId <= _tokenId.current(), "NFT: tokenId out of range");
        return bytes(_uri).length > 0 ? string(abi.encodePacked(_uri, uris[tokenId])) : uris[tokenId];
    }

    /// @notice Fetches a struct (object) of properties for a specific NFT
    /// @param tokenId the index of the NFT to fetch the details for
    /// @return an object with the creator address and redeemability of the NFT
    function getNftProperties(uint256 tokenId) external view override returns (Properties memory) {
        return properties[tokenId];
    }

    /// @notice Checks if an address is whitelisted to mint
    /// @param toCheck the address to check
    /// @return bool indicating if address is whitelisted or not
    function getWhitelisted(address toCheck) external view returns (bool) {
        return whitelisted[toCheck] || toCheck == owner();
    }

    /// @notice Checks if a address is exempt from paying royalties on a specific NFT
    /// @param tokenId the index of the NFT to be checked
    /// @param checkIfExempted the address to check for royalty exemption
    function isExemptFromRoyalties(uint256 tokenId, address checkIfExempted) external view override returns (bool) {
        return royaltyExemptions[tokenId][checkIfExempted];
    }

    /// @notice Given an NFT and the amount of a price, returns pertinent royalty information
    /// @dev This function is specified in EIP-2981
    /// @param tokenId the index of the NFT to calculate royalties on
    /// @param _salePrice the amount the NFT is being sold for
    /// @return the address to send the royalties to, and the amount to send
    function royaltyInfo(uint256 tokenId, uint256 _salePrice) external view override returns (address, uint256) {
        uint256 royaltyAmount = (_salePrice * rate) / scale;
        return (properties[tokenId].creator, royaltyAmount);
    }

    /// @notice gets the global royalty rate
    /// @dev divide rate by scale to get the percentage taken as royalties
    /// @return a tuple of (rate, scale)
    function getRoyaltyRate() external view returns (uint256, uint256) {
        return (rate, scale);
    }

    /// @notice Adds or removes address from whitelist
    /// @dev call will fail if whitelist status is already set to the desired state
    /// @param toSet the address to be updated in the whitelist
    /// @param canMint the status to place in whitelist
    function setWhitelisted(address toSet, bool canMint) external onlyOwner {
        if (canMint == whitelisted[toSet]) {
            string memory boolString = canMint == true ? "true" : "false";
            revert(string(abi.encodePacked("whitelist status is already ", boolString)));
        }
        whitelisted[toSet] = canMint;
        emit WhitelistUpdated(toSet, canMint);
    }

    /// @notice Sets the global variables relating to royalties
    /// @param _rate the amount, that when adjusted with the scale, represents the royalty rate
    /// @param _scale the amount of decimal places to scale the rate when applying
    /// example: given an 18-decimal currency, a rate of 5 with a scale of 1e4 would be 5%
    /// since this is 0.05 to an 18-decimal currency
    function setRoyalty(uint256 _rate, uint256 _scale) external override onlyOwner {
        rate = _rate;
        scale = _scale;
        emit RoyaltyDetailsSet(_rate, _scale);
    }

    /// @notice Exempts or reincludes an address from paying a royalty on a given NFT
    /// @param tokenId the index of the NFT to exclude the address from paying royalties on
    /// @param toModify the address to exclude from royalties or reinstate
    /// @param isExempt if address is being exempted from royalties or reinstated
    function setRoyaltyExemption(
        uint256 tokenId,
        address toModify,
        bool isExempt
    ) external override {
        require(_msgSender() == properties[tokenId].creator, "NFT: only NFT creator");
        if (isExempt == royaltyExemptions[tokenId][toModify]) {
            string memory boolString = isExempt == true ? "true" : "false";
            revert(string(abi.encodePacked("royalty status is already ", boolString)));
        }

        royaltyExemptions[tokenId][toModify] = isExempt;

        emit RoyaltyExemptionModified(tokenId, toModify, isExempt);
    }

    /// @notice Sets the information about redeeming an NFT
    /// @dev if there is no update to the description, an empty string should be passed in
    /// @param tokenId the index of the NFT the details are being set for
    /// @param _description either the description of the feature or a URL to one
    /// @param _redeemable a bool showing if the NFT is still redeemable or not
    function setRedeem(
        uint256 tokenId,
        string memory _description,
        bool _redeemable
    ) external override {
        require(msg.sender == owner() || msg.sender == properties[tokenId].creator, "setRedeem:only creator or admin");
        properties[tokenId].isRedeemable = _redeemable;
        // next line currently allows description to be updated
        // this should be thought about, as it enables a certain level of rug pull
        if (bytes(_description).length > 0) properties[tokenId].redeemDescrip = _description;

        emit RedeemDetailsSet(tokenId, _redeemable, _description);
    }

    /// @notice Sets base URI string of all NFTs in this contract
    /// @param uri_ the base URI string to be set
    function setBaseUri(string memory uri_) external onlyOwner {
        _uri = uri_;
        emit BaseUriSet(uri_);
    }

    /// @notice mints any number of NFTs to a particular tokenId
    /// @dev the dbId is not stored, and is for the purposes of syncing a traditional database
    /// @param account the address the NFTs will be minted to
    /// @param amount the amount of NFTs to mint
    /// @param uri_ the URI of the NFT
    function mint(
        address account,
        uint256 amount,
        string memory uri_
    ) public {
        require(whitelisted[msg.sender] || msg.sender == owner(), "not authorized to mint");

        _tokenId.increment();
        uint256 tokenId = _tokenId.current();
        // should always pass, but just in case
        require(properties[tokenId].creator == address(0), "NFT has already been minted");
        _mint(account, tokenId, amount, "");
        properties[tokenId].creator = msg.sender;
        _setTokenUri(tokenId, uri_);
    }

    /// @notice mints any number of NFTs to an array of tokenIds
    /// @custom:warning this function can be very expensive in gas if array sizes are large
    /// @dev dbIds are not stored, and are for the purposes of syncing a traditional database
    /// @param to an array of the addresses the NFTs will be minted to
    /// @param amounts an array of the amounts of NFTs to mint for each tokenId
    /// @param _uris an array of the URIs of the NFTs
    function mintBatch(
        address to,
        uint256[] memory amounts,
        string[] memory _uris
    ) public {
        require(whitelisted[msg.sender] || msg.sender == owner(), "not authorized to mint");
        require(amounts.length == _uris.length, "arrays must have equal length");
        uint256[] memory ids = new uint256[](amounts.length);
        for (uint256 i = 0; i < amounts.length; i++) {
            _tokenId.increment();
            uint256 tokenId = _tokenId.current();
            // should always pass, but just in case
            require(properties[tokenId].creator == address(0), "NFT has already been minted");
            ids[i] = tokenId;
        }
        _mintBatch(to, ids, amounts, "");
        for (uint256 i = 0; i < amounts.length; i++) {
            properties[ids[i]].creator = msg.sender;
            _setTokenUri(ids[i], _uris[i]);
        }
    }

    /// @notice function for setting the URI of an NFT
    /// @dev currently URI can only be set at mint
    /// @param tokenId the index of the NFT the URI is being set for
    /// @param tokenUri the URI of the NFT
    function _setTokenUri(uint256 tokenId, string memory tokenUri) internal {
        uris[tokenId] = tokenUri;
        emit URI(tokenUri, tokenId);
    }

    /// @dev returns true if this contract implements the interface defined by `interfaceId`
    /// @dev ofr more on interface ids, see https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[EIP section]
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC165Storage, IERC165, ERC1155)
        returns (bool)
    {
        return ERC165Storage.supportsInterface(interfaceId);
    }
}
