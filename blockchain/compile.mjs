import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import solc from 'solc';

const sourceUrl = new URL('../contracts/SchoolFees.sol', import.meta.url);
const artifactUrl = new URL('./artifact.json', import.meta.url);

/** Compile the contract; tests can pass { writeArtifact: false } to avoid filesystem output. */
export async function compile({ writeArtifact = true } = {}) {
  const source = await readFile(sourceUrl, 'utf8');
  const input = {
    language: 'Solidity',
    sources: { 'SchoolFees.sol': { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // solc 0.8.30 defaults to a newer EVM than Ganache 7 supports.
      evmVersion: 'shanghai',
      outputSelection: {
        '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter(({ severity }) => severity === 'error');
  if (errors.length) {
    throw new Error(errors.map(({ formattedMessage }) => formattedMessage).join('\n'));
  }
  for (const warning of output.errors ?? []) {
    console.warn(warning.formattedMessage);
  }

  const contract = output.contracts['SchoolFees.sol'].SchoolFees;
  const artifact = {
    contractName: 'SchoolFees',
    compilerVersion: solc.version(),
    evmVersion: 'shanghai',
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
    deployedBytecode: `0x${contract.evm.deployedBytecode.object}`,
  };

  if (writeArtifact) {
    await writeFile(artifactUrl, `${JSON.stringify(artifact, null, 2)}\n`);
  }
  return artifact;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const artifact = await compile();
    console.log(`Compiled ${artifact.contractName} with ${artifact.compilerVersion}`);
    console.log(`Artifact: ${artifactUrl.pathname}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
