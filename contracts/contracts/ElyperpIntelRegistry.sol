// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title Elyperp Intelligence Registry
 * @notice Public, append-only record of the token scans shown on Elyperp Intelligence
 *         (https://www.elyperp.xyz/intelligence). For each token it keeps the latest
 *         scan: a hash of the Agent SI report, its risk tier and when the data was read.
 *         Every scan ever published is also emitted as a ScanPublished event.
 *
 *         The full report is not stored here. Anyone can fetch it from Agent SI and check
 *         it against `reportHash` (see `docs` in the Elyperp repo for the hash recipe).
 *
 *         This contract holds no funds and has no token. Only addresses the owner approves
 *         as publishers can write, and a newer scan can never be replaced by an older one.
 */
contract ElyperpIntelRegistry {
    /// Risk tiers, lowest to highest. 0 means the scan had no tier.
    uint8 public constant TIER_UNKNOWN = 0;
    uint8 public constant TIER_HAZARD = 1;
    uint8 public constant TIER_FRAGILE = 2;
    uint8 public constant TIER_WATCHLIST = 3;
    uint8 public constant TIER_SOLID = 4;
    uint8 public constant TIER_FORTIFIED = 5;

    uint256 public constant MAX_CHAIN_LENGTH = 32;
    uint256 public constant MAX_TOKEN_LENGTH = 130;
    /// How far in the future a scan time may be, to allow for clock drift.
    uint64 public constant MAX_CLOCK_DRIFT = 5 minutes;

    struct Record {
        bytes32 reportHash; // hash of the Agent SI report this scan came from
        uint8 tier; // TIER_* constant
        uint64 scannedAt; // when Agent SI read the data (unix seconds)
        uint64 publishedAt; // block time this record was written
        uint32 count; // how many scans have been published for this token
    }

    address public owner;
    address public pendingOwner;
    bool public paused;
    mapping(address => bool) public isPublisher;
    uint256 public totalScans;

    mapping(bytes32 => Record) private _records;

    event ScanPublished(
        bytes32 indexed key,
        string chain,
        string token,
        bytes32 reportHash,
        uint8 tier,
        uint64 scannedAt,
        address indexed publisher
    );
    event PublisherSet(address indexed publisher, bool allowed);
    event Paused(bool paused);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotPublisher();
    error NotPendingOwner();
    error IsPaused();
    error ZeroAddress();
    error EmptyHash();
    error BadTier(uint8 tier);
    error BadChain();
    error BadToken();
    error ScanInFuture(uint64 scannedAt);
    error NotNewer(uint64 scannedAt, uint64 latestScannedAt);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address initialOwner, address initialPublisher) {
        if (initialOwner == address(0)) revert ZeroAddress();
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
        if (initialPublisher != address(0)) {
            isPublisher[initialPublisher] = true;
            emit PublisherSet(initialPublisher, true);
        }
    }

    // ---------------------------------------------------------------- write

    /**
     * @param chain       Agent SI chain id, e.g. "robinhood", "solana" (lowercase).
     * @param token       Token address. EVM addresses lowercase; other chains as written.
     * @param reportHash  Hash of the Agent SI report.
     * @param tier        TIER_* constant.
     * @param scannedAt   When Agent SI read the data (unix seconds). Must be newer than
     *                    the scan already stored for this token.
     */
    function publish(string calldata chain, string calldata token, bytes32 reportHash, uint8 tier, uint64 scannedAt)
        external
    {
        if (!isPublisher[msg.sender]) revert NotPublisher();
        if (paused) revert IsPaused();
        if (reportHash == bytes32(0)) revert EmptyHash();
        if (tier > TIER_FORTIFIED) revert BadTier(tier);
        uint256 cl = bytes(chain).length;
        if (cl == 0 || cl > MAX_CHAIN_LENGTH) revert BadChain();
        uint256 tl = bytes(token).length;
        if (tl == 0 || tl > MAX_TOKEN_LENGTH) revert BadToken();
        if (scannedAt > block.timestamp + MAX_CLOCK_DRIFT) revert ScanInFuture(scannedAt);

        bytes32 key = keyOf(chain, token);
        Record storage r = _records[key];
        if (scannedAt <= r.scannedAt) revert NotNewer(scannedAt, r.scannedAt);

        r.reportHash = reportHash;
        r.tier = tier;
        r.scannedAt = scannedAt;
        r.publishedAt = uint64(block.timestamp);
        unchecked {
            r.count += 1;
            totalScans += 1;
        }
        emit ScanPublished(key, chain, token, reportHash, tier, scannedAt, msg.sender);
    }

    // ---------------------------------------------------------------- read

    function keyOf(string calldata chain, string calldata token) public pure returns (bytes32) {
        return keccak256(abi.encode(chain, token));
    }

    /// Latest scan for a token. `count == 0` means it has never been published.
    function latest(string calldata chain, string calldata token) external view returns (Record memory) {
        return _records[keyOf(chain, token)];
    }

    function recordOf(bytes32 key) external view returns (Record memory) {
        return _records[key];
    }

    // ---------------------------------------------------------------- admin

    function setPublisher(address publisher, bool allowed) external onlyOwner {
        if (publisher == address(0)) revert ZeroAddress();
        isPublisher[publisher] = allowed;
        emit PublisherSet(publisher, allowed);
    }

    function setPaused(bool value) external onlyOwner {
        paused = value;
        emit Paused(value);
    }

    /// Two-step transfer so ownership can't be sent to a mistyped address.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }
}
