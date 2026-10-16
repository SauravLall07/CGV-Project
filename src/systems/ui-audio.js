import { playSfx } from './sound-effects.js'

// Delegation covers current and rebuilt controls, mouse, keyboard-generated
// clicks and touch without listeners on every menu item.
export function installUISounds(root = document) {
  const control = event => event.target?.closest?.('button, input, select')
  const click = event => {
    const el = control(event)
    if (el && !el.disabled) playSfx('ui-click', { volume: 0.5 })
  }
  const focus = event => {
    const el = control(event)
    if (el && !el.disabled) playSfx('ui-nav', { cooldown: 0.1 })
  }
  const change = event => {
    const el = control(event)
    if (el && !el.disabled) playSfx('ui-change', { cooldown: 0.09 })
  }
  root.addEventListener('click', click)
  root.addEventListener('focusin', focus)
  root.addEventListener('input', change)
  return () => {
    root.removeEventListener('click', click)
    root.removeEventListener('focusin', focus)
    root.removeEventListener('input', change)
  }
}
