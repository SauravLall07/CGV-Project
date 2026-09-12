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

function propertyRow(label, control, className = '') {
  const row = document.createElement('label')
  row.className = `mw-property-row${className ? ` ${className}` : ''}`
  const text = document.createElement('span')
  text.textContent = label
  row.append(text, control)
  return row
}

export function createModelEditorUI({ onCommand }) {
  const style = document.createElement('style')
  style.textContent = `
    #model-workshop-ui { position: fixed; inset: 0; z-index: 80; pointer-events: none; color: #e8edf5; font: 13px/1.35 ${FONT}; user-select: none; }
    #model-workshop-ui * { box-sizing: border-box; }
    #model-workshop-ui .mw-panel { position: absolute; top: 12px; bottom: 12px; width: 306px; display: flex; flex-direction: column; pointer-events: auto; background: rgba(13,17,24,.96); border: 1px solid rgba(116,139,168,.36); border-radius: 10px; box-shadow: 0 12px 36px rgba(0,0,0,.38); backdrop-filter: blur(12px); overflow: hidden; }
    #model-workshop-ui .mw-left { left: 12px; }
    #model-workshop-ui .mw-right { right: 12px; }
    #model-workshop-ui .mw-head { padding: 12px 13px 10px; border-bottom: 1px solid rgba(116,139,168,.22); }
    #model-workshop-ui .mw-title { font-size: 15px; font-weight: 800; letter-spacing: .07em; color: #d9e7f7; }
    #model-workshop-ui .mw-sub { margin-top: 3px; color: #8291a5; font-size: 11px; }
    #model-workshop-ui .mw-search-row { display: flex; gap: 6px; padding: 9px; border-bottom: 1px solid rgba(116,139,168,.17); }
    #model-workshop-ui input, #model-workshop-ui select { width: 100%; min-width: 0; border: 1px solid rgba(128,151,181,.28); background: #0a0d13; color: #e8edf5; border-radius: 5px; padding: 5px 6px; outline: none; font: 12px ${FONT}; }
    #model-workshop-ui input:focus, #model-workshop-ui select:focus { border-color: #5ea5db; box-shadow: 0 0 0 1px rgba(94,165,219,.28); }
    #model-workshop-ui input[type=color] { height: 30px; padding: 2px; }
    #model-workshop-ui input[type=checkbox] { width: auto; }
    #model-workshop-ui button { border: 1px solid rgba(128,151,181,.28); background: #171e29; color: #dce5ef; border-radius: 5px; padding: 6px 8px; cursor: pointer; font: 700 11px ${FONT}; white-space: nowrap; }
    #model-workshop-ui button:hover { background: #202a38; border-color: rgba(150,178,212,.48); }
    #model-workshop-ui button.active { background: #294c66; border-color: #6ab2e5; color: #fff; }
    #model-workshop-ui button.primary { background: #24536d; border-color: #67b8e9; color: #fff; }
    #model-workshop-ui button.danger { color: #f1a6a6; }
    #model-workshop-ui button:disabled { opacity: .38; cursor: default; }
    #model-workshop-ui .mw-tree { flex: 1; overflow: auto; padding: 5px; min-height: 120px; }
    #model-workshop-ui .mw-tree-row { display: grid; grid-template-columns: 18px minmax(0,1fr) auto; align-items: center; min-height: 26px; border-radius: 4px; padding-right: 5px; color: #bac6d5; cursor: default; }
    #model-workshop-ui .mw-tree-row:hover { background: rgba(108,139,171,.12); }
    #model-workshop-ui .mw-tree-row.selected { background: rgba(65,145,196,.28); color: #fff; }
    #model-workshop-ui .mw-tree-row.changed .mw-tree-name::after { content: ' •'; color: #6ec6f2; }
    #model-workshop-ui .mw-tree-toggle { border: 0; background: transparent; padding: 0; width: 18px; height: 22px; color: #718198; }
    #model-workshop-ui .mw-tree-toggle:hover { background: transparent; }
    #model-workshop-ui .mw-tree-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 4px 2px; }
    #model-workshop-ui .mw-tree-type { font-size: 9px; color: #718198; text-transform: uppercase; letter-spacing: .04em; }
    #model-workshop-ui .mw-inspector { flex: 1; overflow: auto; padding: 10px; }
    #model-workshop-ui .mw-section { padding: 9px 0 11px; border-bottom: 1px solid rgba(116,139,168,.16); }
    #model-workshop-ui .mw-section:last-child { border-bottom: 0; }
    #model-workshop-ui .mw-section-title { margin-bottom: 8px; color: #7eb5da; font-size: 10px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
    #model-workshop-ui .mw-object-name { margin-bottom: 6px; }
    #model-workshop-ui .mw-meta { color: #7f8da0; font-size: 10px; margin-top: 3px; overflow-wrap: anywhere; }
    #model-workshop-ui .mw-key { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #66778e; font-size: 9px; margin-top: 5px; overflow-wrap: anywhere; }
    #model-workshop-ui .mw-axis-row { display: grid; grid-template-columns: 48px repeat(3,minmax(0,1fr)); gap: 5px; align-items: center; margin: 5px 0; }
    #model-workshop-ui .mw-axis-label { color: #9aa8b9; font-size: 11px; }
    #model-workshop-ui .mw-axis { display: flex; align-items: center; gap: 3px; min-width: 0; }
    #model-workshop-ui .mw-axis > span { width: 10px; font-size: 9px; font-weight: 800; }
    #model-workshop-ui .mw-axis-x > span { color: #ef6a6a; } #model-workshop-ui .mw-axis-y > span { color: #73d391; } #model-workshop-ui .mw-axis-z > span { color: #6ea8ee; }
    #model-workshop-ui .mw-check { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: #b5c1cf; margin: 7px 0; }
    #model-workshop-ui .mw-dimensions { display: grid; grid-template-columns: repeat(3,1fr); gap: 6px; margin-top: 8px; }
    #model-workshop-ui .mw-dim { padding: 6px; border-radius: 5px; background: #0a0d13; border: 1px solid rgba(128,151,181,.18); }
    #model-workshop-ui .mw-dim b { display: block; color: #738399; font-size: 9px; } #model-workshop-ui .mw-dim span { color: #dce5ef; font-variant-numeric: tabular-nums; }
    #model-workshop-ui .mw-actions { display: flex; flex-wrap: wrap; gap: 6px; }
    #model-workshop-ui .mw-property-grid { display: grid; gap: 6px; }
    #model-workshop-ui .mw-property-row { display: grid; grid-template-columns: 92px 1fr; gap: 7px; align-items: center; color: #9aa8b9; font-size: 11px; }
    #model-workshop-ui .mw-property-row.hidden { display: none; }
    #model-workshop-ui .mw-property-row .mw-checkbox-wrap { display: flex; justify-content: flex-start; }
    #model-workshop-ui .mw-views { padding: 9px; border-top: 1px solid rgba(116,139,168,.17); background: rgba(7,10,15,.42); }
    #model-workshop-ui .mw-views-title { color: #7eb5da; font-size: 10px; font-weight: 800; letter-spacing: .1em; margin-bottom: 7px; }
    #model-workshop-ui .mw-view-row { display: flex; gap: 5px; margin-top: 5px; }
    #model-workshop-ui .mw-view-row input, #model-workshop-ui .mw-view-row select { flex: 1; }
    #model-workshop-ui .mw-toolbar { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); display: flex; gap: 5px; padding: 7px; pointer-events: auto; background: rgba(13,17,24,.94); border: 1px solid rgba(116,139,168,.36); border-radius: 8px; backdrop-filter: blur(10px); }
    #model-workshop-ui .mw-bottom { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); max-width: calc(100vw - 660px); display: flex; flex-wrap: wrap; justify-content: center; gap: 5px; padding: 7px; pointer-events: auto; background: rgba(13,17,24,.94); border: 1px solid rgba(116,139,168,.36); border-radius: 8px; backdrop-filter: blur(10px); }
    #model-workshop-ui .mw-status { position: absolute; left: 329px; bottom: 16px; max-width: 480px; padding: 6px 9px; background: rgba(10,13,19,.88); border-radius: 5px; color: #8fa0b5; font-size: 10px; pointer-events: none; }
    #model-workshop-ui .mw-help { padding: 8px 10px; border-top: 1px solid rgba(116,139,168,.17); color: #74859a; font-size: 10px; }
    #model-workshop-ui .mw-empty { padding: 16px 8px; color: #74859a; text-align: center; }
    @media (max-width: 1040px) { #model-workshop-ui .mw-panel { width: 252px; } #model-workshop-ui .mw-status { left: 265px; } #model-workshop-ui .mw-bottom { max-width: calc(100vw - 535px); } }
  `
  document.head.appendChild(style)

  const root = document.createElement('div')
  root.id = 'model-workshop-ui'
  root.style.display = 'none'

  const left = document.createElement('aside')
  left.className = 'mw-panel mw-left'
  left.innerHTML = `
    <div class="mw-head"><div class="mw-title">MODEL WORKSHOP</div><div class="mw-sub">Phase 2 · persistent dev workspace</div></div>
    <div class="mw-search-row"><input class="mw-search" type="search" placeholder="Filter scene…" aria-label="Filter scene"><button type="button" data-command="refresh" title="Refresh hierarchy">↻</button></div>
    <div class="mw-tree" role="tree"></div>`

  const views = document.createElement('div')
  views.className = 'mw-views'
  views.innerHTML = '<div class="mw-views-title">CAMERA BOOKMARKS</div>'
  const viewName = document.createElement('input')
  viewName.type = 'text'
  viewName.maxLength = 48
  viewName.placeholder = 'e.g. Passage 3 relay'
  const saveView = button('SAVE VIEW', 'view:save')
  const viewInputRow = document.createElement('div')
  viewInputRow.className = 'mw-view-row'
  viewInputRow.append(viewName, saveView)
  const viewSelect = document.createElement('select')
  viewSelect.setAttribute('aria-label', 'Saved camera view')
  const goView = button('GO', 'view:go')
  const deleteView = button('DELETE', 'view:delete')
  deleteView.classList.add('danger')
  const viewSelectRow = document.createElement('div')
  viewSelectRow.className = 'mw-view-row'
  viewSelectRow.append(viewSelect, goView, deleteView)
  views.append(viewInputRow, viewSelectRow)

  const help = document.createElement('div')
  help.className = 'mw-help'
  help.innerHTML = 'Viewport: left drag orbit · right drag pan · wheel zoom<br>W move · E rotate · R scale · F focus · Esc deselect · F2 exit'
  left.append(views, help)

  const right = document.createElement('aside')
  right.className = 'mw-panel mw-right'

  const rightHead = document.createElement('div')
  rightHead.className = 'mw-head'
  rightHead.innerHTML = '<div class="mw-title">INSPECTOR</div><div class="mw-sub">Live object + material properties</div>'

  const inspector = document.createElement('div')
  inspector.className = 'mw-inspector'

  const objectSection = document.createElement('section')
  objectSection.className = 'mw-section'
  const objectName = document.createElement('input')
  objectName.className = 'mw-object-name'
  objectName.type = 'text'
  objectName.maxLength = 80
  objectName.placeholder = 'Object name'
  objectName.disabled = true
  const objectMeta = document.createElement('div')
  objectMeta.className = 'mw-meta'
  objectMeta.textContent = 'Click an object in the viewport or hierarchy.'
  const objectKey = document.createElement('div')
  objectKey.className = 'mw-key'
  objectSection.append(objectName, objectMeta, objectKey)

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
  visibleLabel.appendChild(visibleInput)
  const dimensions = document.createElement('div')
  dimensions.className = 'mw-dimensions'
  dimensions.innerHTML = '<div class="mw-dim"><b>WIDTH X</b><span data-dim="x">—</span></div><div class="mw-dim"><b>HEIGHT Y</b><span data-dim="y">—</span></div><div class="mw-dim"><b>DEPTH Z</b><span data-dim="z">—</span></div>'
  objectProps.append(visibleLabel, dimensions)

  const materialSection = document.createElement('section')
  materialSection.className = 'mw-section'
  materialSection.style.display = 'none'
  materialSection.innerHTML = '<div class="mw-section-title">Material <span class="mw-material-kind"></span></div>'
  const materialGrid = document.createElement('div')
  materialGrid.className = 'mw-property-grid'
  const materialSlot = document.createElement('select')
  const matColor = document.createElement('input'); matColor.type = 'color'; matColor.dataset.material = 'color'
  const matEmissive = document.createElement('input'); matEmissive.type = 'color'; matEmissive.dataset.material = 'emissive'
  const matEmissiveIntensity = document.createElement('input'); matEmissiveIntensity.type = 'number'; matEmissiveIntensity.step = '0.1'; matEmissiveIntensity.min = '0'; matEmissiveIntensity.dataset.material = 'emissiveIntensity'
  const matRoughness = document.createElement('input'); matRoughness.type = 'number'; matRoughness.step = '0.05'; matRoughness.min = '0'; matRoughness.max = '1'; matRoughness.dataset.material = 'roughness'
  const matMetalness = document.createElement('input'); matMetalness.type = 'number'; matMetalness.step = '0.05'; matMetalness.min = '0'; matMetalness.max = '1'; matMetalness.dataset.material = 'metalness'
  const matOpacity = document.createElement('input'); matOpacity.type = 'number'; matOpacity.step = '0.05'; matOpacity.min = '0'; matOpacity.max = '1'; matOpacity.dataset.material = 'opacity'
  const matTransparent = document.createElement('input'); matTransparent.type = 'checkbox'; matTransparent.dataset.material = 'transparent'
  const transparentWrap = document.createElement('span'); transparentWrap.className = 'mw-checkbox-wrap'; transparentWrap.appendChild(matTransparent)
  const matSide = document.createElement('select'); matSide.dataset.material = 'side'; matSide.innerHTML = '<option value="0">Front</option><option value="1">Back</option><option value="2">Double</option>'
  const materialRows = {
    slot: propertyRow('Slot', materialSlot),
    color: propertyRow('Colour', matColor),
    emissive: propertyRow('Emissive', matEmissive),
    emissiveIntensity: propertyRow('Emissive power', matEmissiveIntensity),
    roughness: propertyRow('Roughness', matRoughness),
    metalness: propertyRow('Metalness', matMetalness),
    opacity: propertyRow('Opacity', matOpacity),
    transparent: propertyRow('Transparent', transparentWrap),
    side: propertyRow('Render side', matSide)
  }
  Object.values(materialRows).forEach((row) => materialGrid.appendChild(row))
  const materialNote = document.createElement('div')
  materialNote.className = 'mw-meta'
  materialNote.textContent = 'Material edits are made unique to this mesh so shared materials elsewhere are not changed.'
  materialSection.append(materialGrid, materialNote)

  const lightSection = document.createElement('section')
  lightSection.className = 'mw-section'
  lightSection.style.display = 'none'
  lightSection.innerHTML = '<div class="mw-section-title">Light</div>'
  const lightGrid = document.createElement('div')
  lightGrid.className = 'mw-property-grid'
  const lightControls = {}
  const makeLight = (property, type = 'number', attrs = {}) => {
    const input = document.createElement('input')
    input.type = type
    input.dataset.light = property
    Object.entries(attrs).forEach(([key, value]) => { input[key] = value })
    lightControls[property] = input
    return input
  }
  const lightRows = {
    color: propertyRow('Colour', makeLight('color', 'color')),
    intensity: propertyRow('Intensity', makeLight('intensity', 'number', { step: '0.1', min: '0' })),
    distance: propertyRow('Distance', makeLight('distance', 'number', { step: '0.1', min: '0' })),
    decay: propertyRow('Decay', makeLight('decay', 'number', { step: '0.1', min: '0' })),
    angle: propertyRow('Angle°', makeLight('angle', 'number', { step: '0.1', min: '0', max: '180' })),
    penumbra: propertyRow('Penumbra', makeLight('penumbra', 'number', { step: '0.05', min: '0', max: '1' }))
  }
  Object.values(lightRows).forEach((row) => lightGrid.appendChild(row))
  lightSection.appendChild(lightGrid)

  const toolsSection = document.createElement('section')
  toolsSection.className = 'mw-section'
  toolsSection.innerHTML = '<div class="mw-section-title">Tools</div>'
  const tools = document.createElement('div')
  tools.className = 'mw-actions'
  const focusButton = button('Focus', 'focus')
  const parentButton = button('Select Parent', 'parent')
  const isolateButton = button('Isolate', 'isolate')
  const revertButton = button('Revert Unsaved', 'revert')
  const resetButton = button('Reset to Source', 'reset')
  const deselectButton = button('Deselect', 'deselect')
  tools.append(focusButton, parentButton, isolateButton, revertButton, resetButton, deselectButton)
  toolsSection.appendChild(tools)

  inspector.append(objectSection, transformSection, objectProps, materialSection, lightSection, toolsSection)
  right.append(rightHead, inspector)

  const toolbar = document.createElement('div')
  toolbar.className = 'mw-toolbar'
  const snapButton = button('SNAP OFF', 'snap', 'Toggle 0.25m / 15° / 0.1 scale snapping')
  toolbar.append(
    button('W  MOVE', 'mode:translate'),
    button('E  ROTATE', 'mode:rotate'),
    button('R  SCALE', 'mode:scale'),
    button('LOCAL', 'space'),
    snapButton,
    button('F2  EXIT', 'close')
  )

  const bottom = document.createElement('div')
  bottom.className = 'mw-bottom'
  const saveWorkspaceButton = button('SAVE WORKSPACE', 'workspace:save', 'Write .model-workshop/layout.json through the Vite development server')
  saveWorkspaceButton.classList.add('primary')
  bottom.append(
    button('GRID', 'toggle:grid'),
    button('BOUNDS', 'toggle:bounds'),
    button('LIGHTS', 'toggle:lights'),
    button('COLLIDERS', 'toggle:collisions'),
    button('WIREFRAME', 'toggle:wireframe'),
    saveWorkspaceButton,
    button('RELOAD SAVED', 'workspace:reload'),
    button('COPY CHANGES', 'copy'),
    button('EXPORT JSON', 'export')
  )

  const status = document.createElement('div')
  status.className = 'mw-status'
  status.textContent = 'Loading Model Workshop workspace…'

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
  const materialInputs = { color: matColor, emissive: matEmissive, emissiveIntensity: matEmissiveIntensity, roughness: matRoughness, metalness: matMetalness, opacity: matOpacity, transparent: matTransparent, side: matSide }

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
    if (command.startsWith('view:')) return // view controls attach details below
    emit(command)
  })

  objectName.addEventListener('change', () => emit('name', { value: objectName.value.trim() }))
  visibleInput.addEventListener('change', () => emit('visible', { value: visibleInput.checked }))

  for (const [group, axes] of Object.entries(transformInputs)) {
    for (const [axis, input] of Object.entries(axes)) {
      input.addEventListener('change', () => {
        const value = Number(input.value)
        if (Number.isFinite(value)) emit('transform', { group, axis, value })
      })
    }
  }

  for (const [property, input] of Object.entries(lightControls)) {
    input.addEventListener('change', () => {
      const value = property === 'color' ? input.value : Number(input.value)
      if (property === 'color' || Number.isFinite(value)) emit('light', { property, value })
    })
  }

  materialSlot.addEventListener('change', () => emit('material-slot', { slot: Number(materialSlot.value) || 0 }))
  for (const [property, input] of Object.entries(materialInputs)) {
    input.addEventListener('change', () => {
      let value
      if (input.type === 'checkbox') value = input.checked
      else if (input.type === 'color' || input.tagName === 'SELECT') value = input.value
      else value = Number(input.value)
      if (typeof value === 'boolean' || typeof value === 'string' || Number.isFinite(value)) emit('material', { property, value })
    })
  }

  saveView.addEventListener('click', () => {
    emit('view:save', { name: viewName.value.trim() })
    viewName.value = ''
  })
  goView.addEventListener('click', () => emit('view:go', { id: viewSelect.value }))
  deleteView.addEventListener('click', () => emit('view:delete', { id: viewSelect.value }))
  search.addEventListener('input', () => renderTree())

  function nodeMatches(node, query) {
    if (!query) return true
    const own = `${node.label} ${node.type} ${node.key ?? ''}`.toLowerCase().includes(query)
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
      row.className = `mw-tree-row${node.id === selectedId ? ' selected' : ''}${node.changed ? ' changed' : ''}`
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
    objectName.disabled = disabled
    objectName.value = data?.rawName ?? ''
    objectMeta.textContent = data ? `${data.type} · ${data.path}` : 'Click an object in the viewport or hierarchy.'
    objectKey.textContent = data?.key ? `key: ${data.key}` : ''

    for (const axes of Object.values(transformInputs)) {
      for (const input of Object.values(axes)) input.disabled = disabled
    }
    visibleInput.disabled = disabled
    ;[focusButton, parentButton, isolateButton, revertButton, resetButton, deselectButton].forEach((btn) => { btn.disabled = disabled })
    parentButton.disabled = disabled || !data?.hasEditableParent

    if (!data) {
      for (const axes of Object.values(transformInputs)) for (const input of Object.values(axes)) input.value = ''
      Object.values(dimensionSpans).forEach((span) => { span.textContent = '—' })
      materialSection.style.display = 'none'
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

    materialSection.style.display = data.material ? 'block' : 'none'
    if (data.material) {
      materialSlot.replaceChildren()
      for (let i = 0; i < data.material.count; i += 1) {
        const option = document.createElement('option')
        option.value = String(i)
        option.textContent = data.material.count === 1 ? 'Material 1' : `Material ${i + 1}`
        materialSlot.appendChild(option)
      }
      materialSlot.value = String(data.material.slot)
      materialRows.slot.classList.toggle('hidden', data.material.count <= 1)
      materialSection.querySelector('.mw-material-kind').textContent = `· ${data.material.type}`
      for (const [property, input] of Object.entries(materialInputs)) {
        const value = data.material[property]
        const row = materialRows[property]
        const supported = value !== undefined && value !== null
        row.classList.toggle('hidden', !supported)
        input.disabled = !supported
        if (!supported) continue
        if (input.type === 'checkbox') input.checked = Boolean(value)
        else input.value = String(value)
      }
    }

    lightSection.style.display = data.light ? 'block' : 'none'
    if (data.light) {
      for (const [property, input] of Object.entries(lightControls)) {
        const value = data.light[property]
        const row = lightRows[property]
        const supported = value !== undefined && value !== null
        row.classList.toggle('hidden', !supported)
        input.disabled = !supported
        if (supported) input.value = property === 'angle' ? Number(value).toFixed(2) : String(value)
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

  function setSnap(enabled) {
    snapButton.textContent = enabled ? 'SNAP ON' : 'SNAP OFF'
    snapButton.classList.toggle('active', Boolean(enabled))
  }

  function setIsolation(enabled) {
    isolateButton.textContent = enabled ? 'Exit Isolate' : 'Isolate'
    isolateButton.classList.toggle('active', Boolean(enabled))
  }

  function setToggle(name, value) {
    toggleButtons.get(name)?.classList.toggle('active', Boolean(value))
  }

  function setViews(items = []) {
    const previous = viewSelect.value
    viewSelect.replaceChildren()
    for (const item of items) {
      const option = document.createElement('option')
      option.value = item.id
      option.textContent = item.name
      viewSelect.appendChild(option)
    }
    if (items.some((item) => item.id === previous)) viewSelect.value = previous
    const empty = items.length === 0
    goView.disabled = empty
    deleteView.disabled = empty
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
  setSnap(false)
  setIsolation(false)
  setToggle('grid', true)
  setToggle('bounds', true)
  setViews([])

  return {
    show,
    hide,
    dispose,
    setTree,
    setSelectedId,
    setSelection,
    setMode,
    setSpace,
    setSnap,
    setIsolation,
    setToggle,
    setViews,
    setStatus,
    focusSearch: () => search.focus()
  }
}
