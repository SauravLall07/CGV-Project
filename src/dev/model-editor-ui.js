const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

function button(label, command, title = '') {
  const el = document.createElement('button')
  el.type = 'button'
  el.textContent = label
  el.dataset.command = command
  if (title) el.title = title
  return el
}

function numberInput(group, axis, step = '0.01') {
  const input = document.createElement('input')
  input.type = 'number'
  input.step = step
  input.dataset.group = group
  input.dataset.axis = axis
  return input
}

function makeAxisRow(label, group, step = '0.01') {
  const row = document.createElement('div')
  row.className = 'mw-axis-row'
  const name = document.createElement('span')
  name.className = 'mw-axis-label'
  name.textContent = label
  row.appendChild(name)

  const inputs = {}
  for (const axis of ['x', 'y', 'z']) {
    const wrap = document.createElement('label')
    wrap.className = `mw-axis mw-axis-${axis}`
    const tag = document.createElement('span')
    tag.textContent = axis.toUpperCase()
    const input = numberInput(group, axis, step)
    wrap.append(tag, input)
    row.appendChild(wrap)
    inputs[axis] = input
  }
  return { row, inputs }
}

export function createModelEditorUI({ onCommand }) {
  const style = document.createElement('style')
  style.textContent = `
    #model-workshop-ui { position: fixed; inset: 0; z-index: 80; pointer-events: none; color: #e8edf5; font: 13px/1.35 ${FONT}; user-select: none; }
    #model-workshop-ui * { box-sizing: border-box; }
    #model-workshop-ui .mw-panel { position: absolute; top: 12px; bottom: 12px; width: 292px; display: flex; flex-direction: column; pointer-events: auto; background: rgba(13,17,24,.95); border: 1px solid rgba(116,139,168,.36); border-radius: 10px; box-shadow: 0 12px 36px rgba(0,0,0,.38); backdrop-filter: blur(12px); overflow: hidden; }
    #model-workshop-ui .mw-left { left: 12px; }
    #model-workshop-ui .mw-right { right: 12px; }
    #model-workshop-ui .mw-head { padding: 12px 13px 10px; border-bottom: 1px solid rgba(116,139,168,.22); }
    #model-workshop-ui .mw-title { font-size: 15px; font-weight: 800; letter-spacing: .07em; color: #d9e7f7; }
    #model-workshop-ui .mw-sub { margin-top: 3px; color: #8291a5; font-size: 11px; }
    #model-workshop-ui .mw-search-row { display: flex; gap: 6px; padding: 9px; border-bottom: 1px solid rgba(116,139,168,.17); }
    #model-workshop-ui input, #model-workshop-ui select { width: 100%; min-width: 0; border: 1px solid rgba(128,151,181,.28); background: #0a0d13; color: #e8edf5; border-radius: 5px; padding: 5px 6px; outline: none; font: 12px ${FONT}; }
    #model-workshop-ui input:focus, #model-workshop-ui select:focus { border-color: #5ea5db; box-shadow: 0 0 0 1px rgba(94,165,219,.28); }
    #model-workshop-ui button { border: 1px solid rgba(128,151,181,.28); background: #171e29; color: #dce5ef; border-radius: 5px; padding: 6px 8px; cursor: pointer; font: 700 11px ${FONT}; white-space: nowrap; }
    #model-workshop-ui button:hover { background: #202a38; border-color: rgba(150,178,212,.48); }
    #model-workshop-ui button.active { background: #294c66; border-color: #6ab2e5; color: #fff; }
    #model-workshop-ui button:disabled { opacity: .38; cursor: default; }
    #model-workshop-ui .mw-tree { flex: 1; overflow: auto; padding: 5px; }
    #model-workshop-ui .mw-tree-row { display: grid; grid-template-columns: 18px minmax(0,1fr) auto; align-items: center; min-height: 26px; border-radius: 4px; padding-right: 5px; color: #bac6d5; cursor: default; }
    #model-workshop-ui .mw-tree-row:hover { background: rgba(108,139,171,.12); }
    #model-workshop-ui .mw-tree-row.selected { background: rgba(65,145,196,.28); color: #fff; }
    #model-workshop-ui .mw-tree-indent { display: inline-block; }
    #model-workshop-ui .mw-tree-toggle { border: 0; background: transparent; padding: 0; width: 18px; height: 22px; color: #718198; }
    #model-workshop-ui .mw-tree-toggle:hover { background: transparent; }
    #model-workshop-ui .mw-tree-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 4px 2px; }
    #model-workshop-ui .mw-tree-type { font-size: 9px; color: #718198; text-transform: uppercase; letter-spacing: .04em; }
    #model-workshop-ui .mw-inspector { flex: 1; overflow: auto; padding: 10px; }
    #model-workshop-ui .mw-section { padding: 9px 0 11px; border-bottom: 1px solid rgba(116,139,168,.16); }
    #model-workshop-ui .mw-section:last-child { border-bottom: 0; }
    #model-workshop-ui .mw-section-title { margin-bottom: 8px; color: #7eb5da; font-size: 10px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
    #model-workshop-ui .mw-object-name { font-size: 14px; font-weight: 800; color: #f0f4f9; overflow-wrap: anywhere; }
    #model-workshop-ui .mw-meta { color: #7f8da0; font-size: 10px; margin-top: 3px; overflow-wrap: anywhere; }
    #model-workshop-ui .mw-axis-row { display: grid; grid-template-columns: 48px repeat(3,minmax(0,1fr)); gap: 5px; align-items: center; margin: 5px 0; }
    #model-workshop-ui .mw-axis-label { color: #9aa8b9; font-size: 11px; }
    #model-workshop-ui .mw-axis { display: flex; align-items: center; gap: 3px; min-width: 0; }
    #model-workshop-ui .mw-axis > span { width: 10px; font-size: 9px; font-weight: 800; }
    #model-workshop-ui .mw-axis-x > span { color: #ef6a6a; } #model-workshop-ui .mw-axis-y > span { color: #73d391; } #model-workshop-ui .mw-axis-z > span { color: #6ea8ee; }
    #model-workshop-ui .mw-check { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: #b5c1cf; margin: 7px 0; }
    #model-workshop-ui .mw-check input { width: auto; }
    #model-workshop-ui .mw-dimensions { display: grid; grid-template-columns: repeat(3,1fr); gap: 6px; }
    #model-workshop-ui .mw-dim { padding: 6px; border-radius: 5px; background: #0a0d13; border: 1px solid rgba(128,151,181,.18); }
    #model-workshop-ui .mw-dim b { display: block; color: #738399; font-size: 9px; } #model-workshop-ui .mw-dim span { color: #dce5ef; font-variant-numeric: tabular-nums; }
    #model-workshop-ui .mw-actions { display: flex; flex-wrap: wrap; gap: 6px; }
    #model-workshop-ui .mw-light-grid { display: grid; grid-template-columns: 82px 1fr; gap: 6px; align-items: center; }
    #model-workshop-ui .mw-light-grid label { color: #9aa8b9; font-size: 11px; }
    #model-workshop-ui .mw-light-grid input[type=color] { height: 30px; padding: 2px; }
    #model-workshop-ui .mw-toolbar { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); display: flex; gap: 5px; padding: 7px; pointer-events: auto; background: rgba(13,17,24,.94); border: 1px solid rgba(116,139,168,.36); border-radius: 8px; backdrop-filter: blur(10px); }
    #model-workshop-ui .mw-bottom { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); max-width: calc(100vw - 640px); display: flex; flex-wrap: wrap; justify-content: center; gap: 5px; padding: 7px; pointer-events: auto; background: rgba(13,17,24,.94); border: 1px solid rgba(116,139,168,.36); border-radius: 8px; backdrop-filter: blur(10px); }
    #model-workshop-ui .mw-status { position: absolute; left: 315px; bottom: 16px; max-width: 420px; padding: 6px 9px; background: rgba(10,13,19,.85); border-radius: 5px; color: #8fa0b5; font-size: 10px; pointer-events: none; }
    #model-workshop-ui .mw-help { padding: 8px 10px; border-top: 1px solid rgba(116,139,168,.17); color: #74859a; font-size: 10px; }
    #model-workshop-ui .mw-empty { padding: 16px 8px; color: #74859a; text-align: center; }
    @media (max-width: 980px) { #model-workshop-ui .mw-panel { width: 245px; } #model-workshop-ui .mw-status { left: 258px; } #model-workshop-ui .mw-bottom { max-width: calc(100vw - 520px); } }
  `
  document.head.appendChild(style)

  const root = document.createElement('div')
  root.id = 'model-workshop-ui'
  root.style.display = 'none'

  const left = document.createElement('aside')
  left.className = 'mw-panel mw-left'
  left.innerHTML = `
    <div class="mw-head"><div class="mw-title">MODEL WORKSHOP</div><div class="mw-sub">Live scene hierarchy · gameplay paused</div></div>
    <div class="mw-search-row"><input class="mw-search" type="search" placeholder="Filter scene…" aria-label="Filter scene"><button type="button" data-command="refresh">↻</button></div>
    <div class="mw-tree" role="tree"></div>
    <div class="mw-help">Viewport: left drag orbit · right drag pan · wheel zoom<br>W move · E rotate · R scale · F focus · Esc deselect · F2 exit</div>`

  const right = document.createElement('aside')
  right.className = 'mw-panel mw-right'

  const rightHead = document.createElement('div')
  rightHead.className = 'mw-head'
  rightHead.innerHTML = '<div class="mw-title">INSPECTOR</div><div class="mw-sub">Local object properties</div>'

  const inspector = document.createElement('div')
  inspector.className = 'mw-inspector'

  const objectSection = document.createElement('section')
  objectSection.className = 'mw-section'
  const objectName = document.createElement('div')
  objectName.className = 'mw-object-name'
  objectName.textContent = 'Nothing selected'
  const objectMeta = document.createElement('div')
  objectMeta.className = 'mw-meta'
  objectMeta.textContent = 'Click an object in the viewport or hierarchy.'
  objectSection.append(objectName, objectMeta)

  const transformSection = document.createElement('section')
  transformSection.className = 'mw-section'
  transformSection.innerHTML = '<div class="mw-section-title">Transform</div>'
  const positionRow = makeAxisRow('Position', 'position')
  const rotationRow = makeAxisRow('Rotation°', 'rotation', '0.1')
  const scaleRow = makeAxisRow('Scale', 'scale')
  transformSection.append(positionRow.row, rotationRow.row, scaleRow.row)

  const objectProps = document.createElement('section')
  objectProps.className = 'mw-section'
  objectProps.innerHTML = '<div class="mw-section-title">Object</div>'
  const visibleLabel = document.createElement('label')
  visibleLabel.className = 'mw-check'
  visibleLabel.innerHTML = '<span>Visible</span>'
  const visibleInput = document.createElement('input')
  visibleInput.type = 'checkbox'
  visibleInput.dataset.command = 'visible'
  visibleLabel.appendChild(visibleInput)
  const dimensions = document.createElement('div')
  dimensions.className = 'mw-dimensions'
  dimensions.innerHTML = '<div class="mw-dim"><b>WIDTH X</b><span data-dim="x">—</span></div><div class="mw-dim"><b>HEIGHT Y</b><span data-dim="y">—</span></div><div class="mw-dim"><b>DEPTH Z</b><span data-dim="z">—</span></div>'
  objectProps.append(visibleLabel, dimensions)

  const lightSection = document.createElement('section')
  lightSection.className = 'mw-section'
  lightSection.style.display = 'none'
  lightSection.innerHTML = `<div class="mw-section-title">Light</div>
    <div class="mw-light-grid">
      <label>Colour</label><input type="color" data-light="color">
      <label>Intensity</label><input type="number" step="0.1" min="0" data-light="intensity">
      <label>Distance</label><input type="number" step="0.1" min="0" data-light="distance">
      <label>Decay</label><input type="number" step="0.1" min="0" data-light="decay">
      <label class="mw-light-angle-label">Angle°</label><input class="mw-light-angle" type="number" step="0.1" min="0" max="180" data-light="angle">
      <label class="mw-light-penumbra-label">Penumbra</label><input class="mw-light-penumbra" type="number" step="0.05" min="0" max="1" data-light="penumbra">
    </div>`

  const toolsSection = document.createElement('section')
  toolsSection.className = 'mw-section'
  toolsSection.innerHTML = '<div class="mw-section-title">Tools</div>'
  const tools = document.createElement('div')
  tools.className = 'mw-actions'
  tools.append(button('Focus', 'focus'), button('Reset Transform', 'reset'), button('Deselect', 'deselect'))
  toolsSection.appendChild(tools)

  inspector.append(objectSection, transformSection, objectProps, lightSection, toolsSection)
  right.append(rightHead, inspector)

  const toolbar = document.createElement('div')
  toolbar.className = 'mw-toolbar'
  toolbar.append(
    button('W  MOVE', 'mode:translate'),
    button('E  ROTATE', 'mode:rotate'),
    button('R  SCALE', 'mode:scale'),
    button('LOCAL', 'space'),
    button('F2  EXIT', 'close')
  )

  const bottom = document.createElement('div')
  bottom.className = 'mw-bottom'
  bottom.append(
    button('GRID', 'toggle:grid'),
    button('BOUNDS', 'toggle:bounds'),
    button('LIGHTS', 'toggle:lights'),
    button('COLLIDERS', 'toggle:collisions'),
    button('WIREFRAME', 'toggle:wireframe'),
    button('COPY CHANGES', 'copy'),
    button('EXPORT JSON', 'export')
  )

  const status = document.createElement('div')
  status.className = 'mw-status'
  status.textContent = 'No unsaved editor changes.'

  root.append(left, right, toolbar, bottom, status)
  document.body.appendChild(root)

  const tree = left.querySelector('.mw-tree')
  const search = left.querySelector('.mw-search')
  const modeButtons = new Map([
    ['translate', toolbar.querySelector('[data-command="mode:translate"]')],
    ['rotate', toolbar.querySelector('[data-command="mode:rotate"]')],
    ['scale', toolbar.querySelector('[data-command="mode:scale"]')]
  ])
  const spaceButton = toolbar.querySelector('[data-command="space"]')
  const toggleButtons = new Map([
    ['grid', bottom.querySelector('[data-command="toggle:grid"]')],
    ['bounds', bottom.querySelector('[data-command="toggle:bounds"]')],
    ['lights', bottom.querySelector('[data-command="toggle:lights"]')],
    ['collisions', bottom.querySelector('[data-command="toggle:collisions"]')],
    ['wireframe', bottom.querySelector('[data-command="toggle:wireframe"]')]
  ])

  const transformInputs = {
    position: positionRow.inputs,
    rotation: rotationRow.inputs,
    scale: scaleRow.inputs
  }
  const dimensionSpans = {
    x: dimensions.querySelector('[data-dim="x"]'),
    y: dimensions.querySelector('[data-dim="y"]'),
    z: dimensions.querySelector('[data-dim="z"]')
  }
  const lightInputs = Object.fromEntries(
    [...lightSection.querySelectorAll('[data-light]')].map((el) => [el.dataset.light, el])
  )
  const lightAngleLabel = lightSection.querySelector('.mw-light-angle-label')
  const lightPenumbraLabel = lightSection.querySelector('.mw-light-penumbra-label')

  let treeData = []
  let selectedId = null
  const expanded = new Set()

  function emit(command, detail = {}) {
    onCommand?.(command, detail)
  }

  root.addEventListener('click', (event) => {
    const target = event.target.closest('[data-command]')
    if (!target) return
    const command = target.dataset.command
    if (command === 'visible') return
    emit(command)
  })

  visibleInput.addEventListener('change', () => emit('visible', { value: visibleInput.checked }))

  for (const [group, axes] of Object.entries(transformInputs)) {
    for (const [axis, input] of Object.entries(axes)) {
      input.addEventListener('change', () => {
        const value = Number(input.value)
        if (Number.isFinite(value)) emit('transform', { group, axis, value })
      })
    }
  }

  for (const [property, input] of Object.entries(lightInputs)) {
    input.addEventListener('change', () => {
      const value = property === 'color' ? input.value : Number(input.value)
      if (property === 'color' || Number.isFinite(value)) emit('light', { property, value })
    })
  }

  search.addEventListener('input', () => renderTree())

  function nodeMatches(node, query) {
    if (!query) return true
    const own = `${node.label} ${node.type}`.toLowerCase().includes(query)
    return own || node.children.some((child) => nodeMatches(child, query))
  }

  function renderTree() {
    tree.replaceChildren()
    const query = search.value.trim().toLowerCase()

    function renderNode(node, depth) {
      if (!nodeMatches(node, query)) return
      const hasChildren = node.children.length > 0
      const isExpanded = query ? true : (depth === 0 || expanded.has(node.id))

      const row = document.createElement('div')
      row.className = `mw-tree-row${node.id === selectedId ? ' selected' : ''}`
      row.style.paddingLeft = `${depth * 13}px`
      row.dataset.objectId = node.id
      row.setAttribute('role', 'treeitem')

      const toggle = document.createElement('button')
      toggle.type = 'button'
      toggle.className = 'mw-tree-toggle'
      toggle.textContent = hasChildren ? (isExpanded ? '▾' : '▸') : '·'
      toggle.disabled = !hasChildren
      toggle.addEventListener('click', (event) => {
        event.stopPropagation()
        if (!hasChildren) return
        if (expanded.has(node.id)) expanded.delete(node.id)
        else expanded.add(node.id)
        renderTree()
      })

      const name = document.createElement('div')
      name.className = 'mw-tree-name'
      name.textContent = node.label
      name.title = node.label
      const type = document.createElement('span')
      type.className = 'mw-tree-type'
      type.textContent = node.type
      row.append(toggle, name, type)
      row.addEventListener('click', () => emit('select', { id: node.id }))
      tree.appendChild(row)

      if (hasChildren && isExpanded) node.children.forEach((child) => renderNode(child, depth + 1))
    }

    treeData.forEach((node) => renderNode(node, 0))
    if (!tree.childElementCount) {
      const empty = document.createElement('div')
      empty.className = 'mw-empty'
      empty.textContent = query ? 'No matching scene objects.' : 'Scene is empty.'
      tree.appendChild(empty)
    }
  }

  function setTree(data) {
    treeData = data
    renderTree()
  }

  function setSelectedId(id) {
    selectedId = id
    renderTree()
  }

  function setSelection(data) {
    const disabled = !data
    objectName.textContent = data?.name ?? 'Nothing selected'
    objectMeta.textContent = data ? `${data.type} · ${data.path}` : 'Click an object in the viewport or hierarchy.'

    for (const axes of Object.values(transformInputs)) {
      for (const input of Object.values(axes)) input.disabled = disabled
    }
    visibleInput.disabled = disabled
    tools.querySelector('[data-command="focus"]').disabled = disabled
    tools.querySelector('[data-command="reset"]').disabled = disabled
    tools.querySelector('[data-command="deselect"]').disabled = disabled

    if (!data) {
      for (const axes of Object.values(transformInputs)) for (const input of Object.values(axes)) input.value = ''
      Object.values(dimensionSpans).forEach((span) => { span.textContent = '—' })
      lightSection.style.display = 'none'
      return
    }

    for (const axis of ['x', 'y', 'z']) {
      transformInputs.position[axis].value = data.position[axis].toFixed(3)
      transformInputs.rotation[axis].value = data.rotation[axis].toFixed(2)
      transformInputs.scale[axis].value = data.scale[axis].toFixed(3)
      dimensionSpans[axis].textContent = Number.isFinite(data.dimensions[axis]) ? data.dimensions[axis].toFixed(3) : '—'
    }
    visibleInput.checked = data.visible

    lightSection.style.display = data.light ? 'block' : 'none'
    if (data.light) {
      lightInputs.color.value = data.light.color
      lightInputs.intensity.value = data.light.intensity ?? 0
      lightInputs.distance.value = data.light.distance ?? 0
      lightInputs.decay.value = data.light.decay ?? 0
      const isSpot = data.light.kind === 'SpotLight'
      lightInputs.angle.style.display = isSpot ? '' : 'none'
      lightInputs.penumbra.style.display = isSpot ? '' : 'none'
      lightAngleLabel.style.display = isSpot ? '' : 'none'
      lightPenumbraLabel.style.display = isSpot ? '' : 'none'
      if (isSpot) {
        lightInputs.angle.value = data.light.angle.toFixed(2)
        lightInputs.penumbra.value = data.light.penumbra.toFixed(2)
      }
    }
  }

  function setMode(mode) {
    modeButtons.forEach((btn, id) => btn.classList.toggle('active', id === mode))
  }

  function setSpace(space) {
    spaceButton.textContent = space.toUpperCase()
    spaceButton.classList.toggle('active', space === 'local')
  }

  function setToggle(name, value) {
    toggleButtons.get(name)?.classList.toggle('active', Boolean(value))
  }

  function setStatus(text) {
    status.textContent = text
  }

  function show() { root.style.display = 'block' }
  function hide() { root.style.display = 'none' }

  function dispose() {
    root.remove()
    style.remove()
  }

  setMode('translate')
  setSpace('local')
  setToggle('grid', true)
  setToggle('bounds', true)

  return {
    show,
    hide,
    dispose,
    setTree,
    setSelectedId,
    setSelection,
    setMode,
    setSpace,
    setToggle,
    setStatus,
    focusSearch: () => search.focus()
  }
}
