import { expect } from "chai";
import hre from "hardhat";
import { getAddress, keccak256, encodeAbiParameters, toHex } from "viem";

const HASH = keccak256(toHex("agentsi-report-1"));
const HASH2 = keccak256(toHex("agentsi-report-2"));
const T = "0xffe4cc7ee5dfd6734631dfc65c0feef40428d33e";

async function deploy() {
  const [owner, publisher, stranger] = await hre.viem.getWalletClients();
  const reg = await hre.viem.deployContract("ElyperpIntelRegistry", [owner.account.address, publisher.account.address]);
  const asPub = await hre.viem.getContractAt("ElyperpIntelRegistry", reg.address, { client: { wallet: publisher } });
  const asStranger = await hre.viem.getContractAt("ElyperpIntelRegistry", reg.address, { client: { wallet: stranger } });
  const now = BigInt((await (await hre.viem.getPublicClient()).getBlock()).timestamp);
  return { reg, asPub, asStranger, owner, publisher, stranger, now };
}

describe("ElyperpIntelRegistry", () => {
  it("sets owner and initial publisher", async () => {
    const { reg, owner, publisher } = await deploy();
    expect(await reg.read.owner()).to.equal(getAddress(owner.account.address));
    expect(await reg.read.isPublisher([publisher.account.address])).to.equal(true);
  });

  it("publishes a scan and stores the latest record", async () => {
    const { reg, asPub, now } = await deploy();
    await asPub.write.publish(["robinhood", T, HASH, 4, now - 10n]);
    const r = await reg.read.latest(["robinhood", T]);
    expect(r.reportHash).to.equal(HASH);
    expect(r.tier).to.equal(4);
    expect(r.scannedAt).to.equal(now - 10n);
    expect(r.count).to.equal(1);
    expect(await reg.read.totalScans()).to.equal(1n);
    const key = keccak256(encodeAbiParameters([{ type: "string" }, { type: "string" }], ["robinhood", T]));
    expect(await reg.read.keyOf(["robinhood", T])).to.equal(key);
    expect((await reg.read.recordOf([key])).reportHash).to.equal(HASH);
  });

  it("emits ScanPublished with the full detail", async () => {
    const { reg, asPub, publisher, now } = await deploy();
    await asPub.write.publish(["robinhood", T, HASH, 4, now]);
    const [ev] = await reg.getEvents.ScanPublished();
    expect(ev.args.chain).to.equal("robinhood");
    expect(ev.args.token).to.equal(T);
    expect(ev.args.reportHash).to.equal(HASH);
    expect(ev.args.publisher).to.equal(getAddress(publisher.account.address));
  });

  it("only accepts newer scans", async () => {
    const { reg, asPub, now } = await deploy();
    await asPub.write.publish(["robinhood", T, HASH, 4, now - 100n]);
    await expect(asPub.write.publish(["robinhood", T, HASH2, 2, now - 100n])).to.be.rejectedWith("NotNewer");
    await expect(asPub.write.publish(["robinhood", T, HASH2, 2, now - 200n])).to.be.rejectedWith("NotNewer");
    await asPub.write.publish(["robinhood", T, HASH2, 2, now - 50n]);
    const r = await reg.read.latest(["robinhood", T]);
    expect(r.reportHash).to.equal(HASH2);
    expect(r.tier).to.equal(2);
    expect(r.count).to.equal(2);
  });

  it("keeps tokens on different chains apart", async () => {
    const { reg, asPub, now } = await deploy();
    await asPub.write.publish(["robinhood", T, HASH, 4, now]);
    expect((await reg.read.latest(["base", T])).count).to.equal(0);
  });

  it("rejects bad input", async () => {
    const { asPub, now } = await deploy();
    const zero = `0x${"0".repeat(64)}` as const;
    await expect(asPub.write.publish(["robinhood", T, zero, 4, now])).to.be.rejectedWith("EmptyHash");
    await expect(asPub.write.publish(["robinhood", T, HASH, 6, now])).to.be.rejectedWith("BadTier");
    await expect(asPub.write.publish(["", T, HASH, 4, now])).to.be.rejectedWith("BadChain");
    await expect(asPub.write.publish(["x".repeat(33), T, HASH, 4, now])).to.be.rejectedWith("BadChain");
    await expect(asPub.write.publish(["robinhood", "", HASH, 4, now])).to.be.rejectedWith("BadToken");
    await expect(asPub.write.publish(["robinhood", "a".repeat(131), HASH, 4, now])).to.be.rejectedWith("BadToken");
    await expect(asPub.write.publish(["robinhood", T, HASH, 4, now + 3600n])).to.be.rejectedWith("ScanInFuture");
  });

  it("blocks non-publishers and respects removal", async () => {
    const { reg, asPub, asStranger, publisher, now } = await deploy();
    await expect(asStranger.write.publish(["robinhood", T, HASH, 4, now])).to.be.rejectedWith("NotPublisher");
    await reg.write.setPublisher([publisher.account.address, false]);
    await expect(asPub.write.publish(["robinhood", T, HASH, 4, now])).to.be.rejectedWith("NotPublisher");
  });

  it("pause stops publishing; only owner can pause or add publishers", async () => {
    const { reg, asPub, asStranger, stranger, now } = await deploy();
    await expect(asStranger.write.setPaused([true])).to.be.rejectedWith("NotOwner");
    await expect(asStranger.write.setPublisher([stranger.account.address, true])).to.be.rejectedWith("NotOwner");
    await reg.write.setPaused([true]);
    await expect(asPub.write.publish(["robinhood", T, HASH, 4, now])).to.be.rejectedWith("IsPaused");
    await reg.write.setPaused([false]);
    await asPub.write.publish(["robinhood", T, HASH, 4, now]);
  });

  it("transfers ownership in two steps", async () => {
    const { reg, asStranger, stranger } = await deploy();
    await reg.write.transferOwnership([stranger.account.address]);
    expect(await reg.read.pendingOwner()).to.equal(getAddress(stranger.account.address));
    await asStranger.write.acceptOwnership();
    expect(await reg.read.owner()).to.equal(getAddress(stranger.account.address));
    await expect(reg.write.setPaused([true])).to.be.rejectedWith("NotOwner");
  });
});
