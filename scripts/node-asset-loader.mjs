import { access } from 'node:fs/promises'

const assetRoot = new URL('../src/assets/', import.meta.url).href

export async function load(url, context, nextLoad) {
  const asset = new URL(url)
  if (!asset.href.startsWith(assetRoot) || asset.search !== '?url') {
    return nextLoad(url, context)
  }

  // Match Vite's explicit URL imports without parsing models or textures.
  // Check existence so missing assets still fail rather than being mocked away.
  asset.search = ''
  asset.hash = ''
  await access(asset)
  return {
    format: 'module',
    source: `export default ${JSON.stringify(asset.href)};`,
    shortCircuit: true
  }
}
