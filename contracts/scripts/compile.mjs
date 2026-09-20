import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import solc from 'solc';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const sources = {};
for (const name of await readdir(path.join(root, 'src'))) {
  if (name.endsWith('.sol')) sources[name] = { content: await readFile(path.join(root, 'src', name), 'utf8') };
}
const output = JSON.parse(solc.compile(JSON.stringify({
  language: 'Solidity', sources,
  settings: {
    optimizer: { enabled: true, runs: 200 }, evmVersion: 'paris',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
  },
}), { import: (name) => {
  try { return { contents: require('node:fs').readFileSync(require.resolve(name), 'utf8') }; }
  catch (error) { return { error: error.message }; }
} }));
for (const error of output.errors ?? []) console.error(error.formattedMessage);
if (output.errors?.some((error) => error.severity === 'error')) process.exit(1);
await mkdir(path.join(root, 'artifacts'), { recursive: true });
for (const [source, contracts] of Object.entries(output.contracts)) {
  if (source.includes('/')) continue;
  for (const [name, contract] of Object.entries(contracts)) {
    if (!contract.evm.bytecode.object) continue;
    await writeFile(path.join(root, 'artifacts', `${name}.json`), JSON.stringify({
      contractName: name, abi: contract.abi,
      bytecode: `0x${contract.evm.bytecode.object}`,
      deployedBytecode: `0x${contract.evm.deployedBytecode.object}`,
    }, null, 2));
  }
}
console.log(`Compiled ${Object.keys(sources).length} Bhramari contract sources with Solidity ${solc.version()}.`);
