import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const [tool, ...args] = process.argv.slice(2);
if (!['forge', 'anvil'].includes(tool)) throw new Error('Choose forge or anvil');
const suffix = process.platform === 'win32' ? 'win32-amd64' : `${process.platform}-${process.arch === 'x64' ? 'amd64' : 'arm64'}`;
const executable = join(dirname(require.resolve(`@foundry-rs/${tool}-${suffix}/package.json`)), 'bin', `${tool}${process.platform === 'win32' ? '.exe' : ''}`);
const options = tool === 'forge' ? [...args, '--remappings', `@openzeppelin/contracts/=${dirname(require.resolve('@openzeppelin/contracts/package.json')).replaceAll('\\', '/')}/`] : args;
const result = spawnSync(executable, options, { stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
