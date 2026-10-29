import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const executableName = process.platform === 'win32' ? 'anvil.exe' : 'anvil';
const candidates = [
  join(process.env.USERPROFILE || homedir(), '.foundry', 'bin', executableName),
  executableName,
];

try {
  const executable = candidates.find((candidate) => {
    const result = spawnSync(candidate, ['--version'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10_000,
    });
    return !result.error && result.status === 0;
  });
  if (!executable) {
    throw new Error(`Anvil not found. Install official Foundry Anvil at ${candidates[0]} or on PATH; no PATH changes are required.`);
  }

  const stateDirectory = join(projectRoot, '.local-chain');
  await mkdir(stateDirectory, { recursive: true });
  // Keep Anvil's snapshot separate from any existing Ganache database.
  const stateFile = join(stateDirectory, 'anvil-state.json');
  console.log('Anvil local: http://127.0.0.1:8545 | chain ID 31337 | currency ETH');
  console.log('MetaMask: add this custom network with no block explorer, then import an Anvil-only test account using a development key printed below.');
  console.log('These prefunded accounts contain fake local ETH, not Sepolia ETH. Never use their keys on a public network or import a real wallet here.');
  console.log(`State: ${stateFile} (autosaved every 5 seconds and on normal exit). Stop with Ctrl+C.`);

  const child = spawn(executable, [
    '--host', '127.0.0.1',
    '--port', '8545',
    '--chain-id', '31337',
    '--state', stateFile,
    '--state-interval', '5',
  ], { cwd: projectRoot, stdio: 'inherit' });

  // Windows console Ctrl+C reaches Anvil directly. Do not force-kill it before
  // its shutdown handler can save state; forward signals on other platforms.
  const stop = (signal) => {
    if (process.platform !== 'win32' || signal !== 'SIGINT') child.kill(signal);
  };
  const onInterrupt = () => stop('SIGINT');
  const onTerminate = () => stop('SIGTERM');
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onTerminate);
  child.on('error', (error) => {
    console.error(`Could not start Anvil: ${error.message}`);
    process.exitCode = 1;
  });
  child.on('close', (code, signal) => {
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);
    process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1);
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
