// Loading screen with a real progress bar (Phase 1 foundation). The brief
// calls loading screens out as worth Polish marks and as a hedge against "a
// slow first load looking like a crash" — so this is driven by the asset
// loader's actual onProgress fraction, not a fake timer.
//
// It's also shown during every level transition: the level manager calls
// show() before tearing down and hide() once the next level is built, so a
// slow future level load never shows a frozen old scene.

export function createLoadingScreen(assets) {
  const root = document.createElement('div')
  root.id = 'loading-screen'
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '18px',
    background: '#12121f',
    color: '#e8e8f0',
    font: '600 16px/1 system-ui, sans-serif',
    letterSpacing: '0.08em',
    zIndex: '100',
    opacity: '1',
    transition: 'opacity 260ms ease-out'
  })

  const title = document.createElement('div')
  title.textContent = 'CHRONO EXPRESS'
  title.style.fontSize = '22px'
  title.style.letterSpacing = '0.22em'

  const track = document.createElement('div')
  Object.assign(track.style, {
    width: 'min(320px, 60vw)',
    height: '4px',
    background: 'rgba(255, 255, 255, 0.15)',
    borderRadius: '2px',
    overflow: 'hidden'
  })

  const fill = document.createElement('div')
  Object.assign(fill.style, {
    width: '0%',
    height: '100%',
    background: '#5a7cff',
    transition: 'width 160ms ease-out'
  })
  track.appendChild(fill)

  const label = document.createElement('div')
  label.textContent = 'Loading'
  label.style.fontSize = '12px'
  label.style.opacity = '0.7'

  root.append(title, track, label)
  document.body.appendChild(root)

  let visible = true
  let hideTimer = null

  function setProgress(fraction) {
    const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100)
    fill.style.width = `${pct}%`
    label.textContent = `Loading ${pct}%`
  }

  function show() {
    visible = true
    clearTimeout(hideTimer)
    root.style.display = 'flex'
    // Force reflow so the opacity transition replays after display change.
    void root.offsetWidth
    root.style.opacity = '1'
  }

  function hide() {
    if (!visible) return
    visible = false
    root.style.opacity = '0'
    hideTimer = setTimeout(() => {
      if (!visible) root.style.display = 'none'
    }, 300)
  }

  // React to real asset progress when a level actually queues loads.
  const offProgress = assets.onProgress((fraction) => setProgress(fraction))
  const offLoad = assets.onLoad(() => { setProgress(1); hide() })

  function dispose() {
    offProgress()
    offLoad()
    clearTimeout(hideTimer)
    root.remove()
  }

  return { show, hide, setProgress, dispose }
}
