import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ContractFactory, JsonRpcProvider, NonceManager, Wallet } from 'ethers';

export async function deployContracts(signer, { adminDelay = 172800, anchorAddress } = {}) {
  const contracts = {};
  const admin = await signer.getAddress();
  async function deploy(name, args) {
    const artifact = JSON.parse(await readFile(new URL(`../artifacts/${name}.json`, import.meta.url), 'utf8'));
    const contract = await new ContractFactory(artifact.abi, artifact.bytecode, signer).deploy(...args);
    await contract.waitForDeployment();
    contracts[name] = contract;
    return contract;
  }
  const access = await deploy('HoneyAccessManager', [admin, adminDelay]);
  const participants = await deploy('ParticipantRegistry', [access.target]);
  const batches = await deploy('BatchRegistry', [access.target, participants.target]);
  const custody = await deploy('CustodyChain', [batches.target]);
  const blend = await deploy('BlendRegistry', [batches.target]);
  const evidence = await deploy('EvidenceAnchor', [access.target, participants.target]);
  const recall = await deploy('RecallRegistry', [batches.target]);
  await (await batches.configure(blend.target, custody.target, recall.target)).wait();
  await (await access.grantRole(await access.ANCHOR_ROLE(), anchorAddress ?? admin)).wait();
  return contracts;
}

async function main() {
  const rpc = process.env.RPC_URL ?? 'http://127.0.0.1:8545';
  const provider = new JsonRpcProvider(rpc);
  const chainId = Number((await provider.getNetwork()).chainId);
  let signer;
  if (process.env.DEPLOYER_PRIVATE_KEY) signer = new Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  else if (chainId === 31337) signer = await provider.getSigner(0);
  else throw new Error('DEPLOYER_PRIVATE_KEY is required outside local Anvil');
  const contracts = await deployContracts(new NonceManager(signer), {
    adminDelay: Number(process.env.ADMIN_TRANSFER_DELAY ?? 172800),
    anchorAddress: process.env.RELAYER_ADDRESS,
  });
  const manifest = {
    chainId, deployedAt: new Date().toISOString(),
    contracts: Object.fromEntries(Object.entries(contracts).map(([name, contract]) => [name, contract.target])),
  };
  const directory = new URL('../deployments/', import.meta.url);
  await mkdir(directory, { recursive: true });
  const filename = new URL(`${chainId}.json`, directory);
  await writeFile(filename, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
  console.log(`Deployment saved to ${fileURLToPath(filename)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
