const ganache = require('ganache');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function ok(desc, cond) {
  if (cond) { console.log('  ✅', desc); passed++; }
  else { console.log('  ❌', desc); failed++; }
}

async function expectRevert(promise, desc) {
  try {
    await promise;
    ok(desc + ' (expected revert, but succeeded)', false);
  } catch (err) {
    ok(desc, true);
  }
}

async function main() {
  const compiled = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'artifacts', 'compiled.json'), 'utf8'));
  const escrowArtifact = compiled.contracts['EscrowArc.sol']['EscrowArc'];
  const tokenArtifact = compiled.contracts['MockVUSDC.sol']['MockVUSDC'];

  const server = ganache.provider({ logging: { quiet: true } });
  const provider = new ethers.BrowserProvider(server);
  const accounts = await server.request({ method: 'eth_accounts', params: [] });
  const [deployer, client, freelancer, stranger] = await Promise.all(
    [0, 1, 2, 3].map((i) => provider.getSigner(accounts[i]))
  );

  const TokenFactory = new ethers.ContractFactory(tokenArtifact.abi, tokenArtifact.evm.bytecode.object, deployer);
  const token = await (await TokenFactory.deploy()).waitForDeployment();

  const EscrowFactory = new ethers.ContractFactory(escrowArtifact.abi, escrowArtifact.evm.bytecode.object, deployer);
  const escrow = await (await EscrowFactory.deploy(await token.getAddress())).waitForDeployment();

  const clientAddr = await client.getAddress();
  const freelancerAddr = await freelancer.getAddress();
  const AMOUNT = 100_000_000n; // 100 vUSDC (6 decimals)

  async function fundClient() {
    await (await token.mint(clientAddr, 1_000_000_000n)).wait();
  }
  async function newFundedEscrow() {
    await (await token.connect(client).approve(await escrow.getAddress(), AMOUNT)).wait();
    const receipt = await (await escrow.connect(client).createEscrow(freelancerAddr, AMOUNT, 'Logo design')).wait();
    const parsed = receipt.logs.map((l) => { try { return escrow.interface.parseLog(l); } catch { return null; } }).find((l) => l?.name === 'EscrowCreated');
    return parsed.args.escrowId;
  }

  console.log('\n1) Happy path: create -> accept -> release');
  await fundClient();
  {
    const id = await newFundedEscrow();
    const balBefore = await token.balanceOf(freelancerAddr);
    await (await escrow.connect(freelancer).acceptEscrow(id)).wait();
    await (await escrow.connect(client).releasePayment(id)).wait();
    const balAfter = await token.balanceOf(freelancerAddr);
    ok('freelancer received the escrowed amount', balAfter - balBefore === AMOUNT);
    const info = await escrow.getEscrow(id);
    ok('status is Released (3)', info.status === 3n);
  }

  console.log('\n2) Refund before acceptance (Funded state)');
  await fundClient();
  {
    const id = await newFundedEscrow();
    const balBefore = await token.balanceOf(clientAddr);
    await (await escrow.connect(client).refundEscrow(id)).wait();
    const balAfter = await token.balanceOf(clientAddr);
    ok('client got refunded before freelancer accepted', balAfter - balBefore === AMOUNT);
  }

  console.log('\n3) BUG FIX CHECK: refund after acceptance (Accepted state) but before release');
  await fundClient();
  {
    const id = await newFundedEscrow();
    await (await escrow.connect(freelancer).acceptEscrow(id)).wait();
    const balBefore = await token.balanceOf(clientAddr);
    await (await escrow.connect(client).refundEscrow(id)).wait();
    const balAfter = await token.balanceOf(clientAddr);
    ok('client CAN now refund after freelancer accepted but never delivered', balAfter - balBefore === AMOUNT);
    const info = await escrow.getEscrow(id);
    ok('status is Refunded (4)', info.status === 4n);
  }

  console.log('\n4) Refund must fail once payment is Released');
  await fundClient();
  {
    const id = await newFundedEscrow();
    await (await escrow.connect(freelancer).acceptEscrow(id)).wait();
    await (await escrow.connect(client).releasePayment(id)).wait();
    await expectRevert(escrow.connect(client).refundEscrow(id), 'refund reverts after release (funds already sent)');
  }

  console.log('\n5) Access control checks');
  await fundClient();
  {
    const id = await newFundedEscrow();
    await expectRevert(escrow.connect(stranger).acceptEscrow(id), 'stranger cannot accept the job');
    await expectRevert(escrow.connect(freelancer).releasePayment(id), 'freelancer cannot release payment (client-only)');
    await expectRevert(escrow.connect(stranger).refundEscrow(id), 'stranger cannot refund');
    await (await escrow.connect(freelancer).acceptEscrow(id)).wait();
    await expectRevert(escrow.connect(client).acceptEscrow(id), 'cannot accept twice / client cannot self-accept');
  }

  console.log('\n6) Cannot release before acceptance');
  await fundClient();
  {
    const id = await newFundedEscrow();
    await expectRevert(escrow.connect(client).releasePayment(id), 'release reverts if job was never accepted');
  }

  console.log(`\n---\n${passed} passed, ${failed} failed`);
  await server.disconnect?.();
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
