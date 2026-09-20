import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { RelayStore } from './store.mjs';
import { Relayer } from './relayer.mjs';

export async function loadConfig(env = process.env) {
  const chainId = Number(env.CHAIN_ID ?? 31337);
  let contractAddress = env.EVIDENCE_ANCHOR_ADDRESS;
  if (!contractAddress) {
    const manifest = JSON.parse(await readFile(new URL(`../../../contracts/deployments/${chainId}.json`, import.meta.url), 'utf8'));
    if (manifest.chainId !== chainId) throw new Error('Deployment chain ID mismatch');
    contractAddress = manifest.contracts.EvidenceAnchor;
  }
  if (!env.BHRAMARI_RELAYER_TOKEN || env.BHRAMARI_RELAYER_TOKEN.length < 32) throw new Error('Set BHRAMARI_RELAYER_TOKEN to at least 32 random characters');
  if (!env.RELAYER_PRIVATE_KEY || !/^(0x)?[0-9a-f]{64}$/i.test(env.RELAYER_PRIVATE_KEY)) throw new Error('RELAYER_PRIVATE_KEY is required');
  const confirmations = Number(env.CHAIN_CONFIRMATIONS ?? (chainId === 31337 ? 1 : 3));
  if (!Number.isSafeInteger(chainId) || chainId < 1 || !Number.isInteger(confirmations) || confirmations < 1) throw new Error('Invalid chain configuration');
  return {
    chainId, contractAddress, confirmations,
    rpcUrl: env.RPC_URL ?? 'http://127.0.0.1:8545',
    apiBaseUrl: (env.API_BASE_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, ''),
    privateKey: env.RELAYER_PRIVATE_KEY, token: env.BHRAMARI_RELAYER_TOKEN,
    databasePath: env.LEDGER_DB_PATH ?? fileURLToPath(new URL('../data/relayer.sqlite', import.meta.url)),
  };
}

export function createLedgerServer(relayer, token) {
  const expected = Buffer.from(`Bearer ${token}`);
  return createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, body) => { response.statusCode = status; response.end(JSON.stringify(body)); };
    if (request.method === 'GET' && request.url === '/health') {
      return send(relayer.lastError ? 503 : 200, {
        service: 'Bhramari trust-ledger', status: relayer.lastError ? 'degraded' : 'ok',
        chainId: relayer.config.chainId, lastSuccess: relayer.lastSuccess,
      });
    }
    const provided = Buffer.from(request.headers.authorization ?? '');
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return send(401, { error: 'Unauthorised' });
    if (request.method !== 'POST' || request.url !== '/api/v1/trust/verify') return send(404, { error: 'Not found' });
    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 32_768) return send(413, { error: 'Request too large' });
        chunks.push(chunk);
      }
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      return send(200, await relayer.verify(payload));
    } catch (error) {
      const validationError = error instanceof SyntaxError || /Invalid|Expected|proof/i.test(error.message);
      return send(validationError ? 400 : 503, { error: validationError ? 'Invalid verification request' : 'Chain verification unavailable' });
    }
  });
}

async function main() {
  const config = await loadConfig();
  const store = new RelayStore(config.databasePath);
  const relayer = new Relayer(config, store);
  await relayer.validateChain();
  const server = createLedgerServer(relayer, config.token);
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  const port = Number(process.env.LEDGER_PORT ?? 8001);
  server.listen(port, process.env.LEDGER_HOST ?? '127.0.0.1', () => console.log(`Bhramari trust-ledger listening on ${port}`));
  await relayer.poll();
  const timer = setInterval(() => relayer.poll(), Number(process.env.LEDGER_POLL_MS ?? 5000));
  const stop = () => { clearInterval(timer); server.close(); relayer.close(); store.close(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
