// Independent of gameplay bindings: cinematic input is disabled, but this
// native button still supports pointer, Tab, Enter and Space activation.
export function createCinematicSkip(root) {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = 'Skip finale'
  Object.assign(button.style, {
    position: 'absolute', right: '24px', bottom: '24px',
    padding: '10px 18px', color: '#f0e6cf', background: '#111820',
    border: '1px solid #b08d3f', borderRadius: '4px',
    font: 'inherit', cursor: 'pointer', pointerEvents: 'auto', display: 'none'
  })
  root.appendChild(button)
  let callback = null
  function hide() {
    callback = null
    button.style.display = 'none'
    if (document.activeElement === button) button.blur()
  }
  function activate() {
    const finish = callback
    hide()
    finish?.()
  }
  button.addEventListener('click', activate)
  return {
    show(finish) {
      callback = finish
      button.style.display = 'block'
      button.focus({ preventScroll: true })
    },
    hide,
    dispose() {
      hide()
      button.removeEventListener('click', activate)
      button.remove()
    }
  }
}
