import { access } from 'node:fs/promises'

const assetRoot = new URL('../src/assets/', import.meta.url).href

export async function load(url, context, nextLoad) {
  const asset = new URL(url)
  const viteAsset = asset.search === '?url' || /\.(png|jpe?g|webp)$/i.test(asset.pathname)
  if (!asset.href.startsWith(assetRoot) || !viteAsset) {
    return nextLoad(url, context)
  }

  // Match Vite's explicit URL imports and implicit image URL imports without
  // parsing models or textures (moonlit-valley imports backdrop PNGs directly).
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
