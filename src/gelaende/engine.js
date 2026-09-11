// ─────────────────────────────────────────────────────────────────────────────
// Gelaende-Engine (Muster: "Daten als begehbare Plattform", Schichten 1-5)
//
//   Raum     Hex-Raster, Quartiere je Gesellschaft            (layout.js)
//   Objekt   ein Koerper je Projekt, Farbe = Zugehoerigkeit
//   Zustand  Form = Bauzustand, Bake = Statusfarbe
//   Leben    Figuren mit Identitaet (Mitarbeitende) + Agenten
//   Handlung ein Klick, eine Aktion (Callback nach aussen)
//
// Three.js kommt aus node_modules (lokal gebuendelt, kein CDN).
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three'
import { HR, hexW, key, DIRS, path as hexPath } from './hex'
import { pseudo } from './layout'

// three r149 rechnet ohne dies in linearen Farben weiter -> alles wirkt ausgewaschen
THREE.ColorManagement.enabled = true

const CI = { night: 0x000040, cream: 0xFBFFE6, sky: 0x8FBEFF }
// Statusfarben - die einzige Stelle, an der Farbe Zustand bedeutet (Muster 4)
const BAKE_COLOR = { ok: 0x3FBF85, proto: 0xF0B052, plan: 0x6FA0FF, idea: 0xB49FD8, ext: 0xCBAE72 }
const STATE_BAKE = {
  rohbau: 'proto', fundament: 'plan', idee: 'idea', fertig: 'ok',
  labor: 'ext', buero: 'ok', urlaub: 'plan', krank: 'plan',
}
const DECO_COLOR = {
  wiese: 0x24583a, baum: 0x1f4e33, busch: 0x2a6642, stein: 0x454e5c,
  wasser: 0x123c60, teich: 0x175878, platz: 0x51553f,
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const fmtTage = (n) => String(Math.round((n || 0) * 100) / 100).replace('.', ',')

// ── Beschriftung: Canvas -> CanvasTexture -> Sprite ──────────────────────────
function labelSprite(text, { size = 34, color = '#FBFFE6', bg = 'rgba(0,0,64,0.82)', brand = false, pad = 14 } = {}) {
  const font = `${brand ? '900' : 'bold'} ${size}px ${brand ? "'Yellix', Arial, sans-serif" : 'Arial, sans-serif'}`
  const meas = document.createElement('canvas').getContext('2d')
  meas.font = font
  const w = Math.ceil(meas.measureText(text).width) + pad * 2
  const h = size + pad * 1.4
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const ctx = cv.getContext('2d')
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h) }
  ctx.font = font
  ctx.fillStyle = color
  ctx.textBaseline = 'middle'
  ctx.fillText(text, pad, h / 2 + 1)
  const tex = new THREE.CanvasTexture(cv)
  tex.anisotropy = 4
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }))
  sprite.scale.set(w / 90, h / 90, 1)
  sprite.renderOrder = 10
  sprite.userData.dispose = () => { tex.dispose(); sprite.material.dispose() }
  return sprite
}

// Senkrechter Verlauf als Nachthimmel
function skyTexture() {
  const cv = document.createElement('canvas')
  cv.width = 8; cv.height = 256
  const ctx = cv.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0, '#000008'); g.addColorStop(0.5, '#03061a'); g.addColorStop(1, '#070c28')
  ctx.fillStyle = g; ctx.fillRect(0, 0, 8, 256)
  return new THREE.CanvasTexture(cv)
}

// Weicher Radialverlauf als Glühen unter der Plattform
function radialTexture(inner, outer) {
  const cv = document.createElement('canvas')
  cv.width = cv.height = 256
  const ctx = cv.getContext('2d')
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
  g.addColorStop(0, inner); g.addColorStop(1, outer)
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256)
  return new THREE.CanvasTexture(cv)
}

export function createGelaende(container, opts = {}) {
  const onPickRegion = opts.onPickRegion || (() => {})
  const onPickPerson = opts.onPickPerson || (() => {})

  // ── Renderer / Szene / Kamera ─────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputEncoding = THREE.sRGBEncoding
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.82
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  renderer.domElement.style.touchAction = 'none'
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x00001f)
  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 400)

  // Himmel (Radialverlauf) + Sternenfeld
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(160, 32, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, depthWrite: false }),
  )
  scene.add(sky)
  const starGeo = new THREE.BufferGeometry()
  const starPos = new Float32Array(700 * 3)
  for (let i = 0; i < 700; i++) {
    const v = new THREE.Vector3().setFromSphericalCoords(120 + Math.random() * 30,
      Math.acos(1 - Math.random() * 1.3), Math.random() * Math.PI * 2)
    starPos.set([v.x, v.y, v.z], i * 3)
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x8FBEFF, size: 0.45, sizeAttenuation: true, transparent: true, opacity: 0.75 })))

  // Licht: Hemisphere + Sonne (Schatten) + Rim + warmes Punktlicht
  scene.add(new THREE.HemisphereLight(0x6f93d8, 0x0b1020, 0.22))
  const sun = new THREE.DirectionalLight(0xfff2d5, 0.9)
  sun.position.set(14, 22, 10)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 90
  sun.shadow.camera.left = -34; sun.shadow.camera.right = 34
  sun.shadow.camera.top = 34; sun.shadow.camera.bottom = -34
  scene.add(sun)
  const rim = new THREE.DirectionalLight(0x8FBEFF, 0.4)
  rim.position.set(-16, 9, -14)
  scene.add(rim)
  const warm = new THREE.PointLight(0xffcf8a, 0.55, 46, 2)
  warm.position.set(0, 7, 0)
  scene.add(warm)

  // Plattform: schwebt sanft auf und ab
  const platform = new THREE.Group()
  scene.add(platform)
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 90),
    new THREE.MeshBasicMaterial({
      map: radialTexture('rgba(143,190,255,0.55)', 'rgba(143,190,255,0)'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  )
  glow.rotation.x = -Math.PI / 2
  glow.position.y = -5.5
  platform.add(glow)

  // ── Zustand der Engine ────────────────────────────────────────────────────
  let layout = null
  let terrainSig = ''
  const pickables = []
  const regionNodes = new Map()   // regionId -> { group, building, bake, crane, glowRed, hexes }
  const peopleNodes = new Map()   // personId -> { group, label, ring, walk }
  const agentNodes = new Map()    // regionId -> { node, region }
  const disposables = []
  let terrain = null
  const ponds = []
  const bubbles = []
  let bubbleTimer = 0
  const occupied = new Set()      // begehbare Waben (Daten + Deko)
  let paused = false
  let userTouched = false
  let raf = 0
  const clock = new THREE.Clock()

  // ── Overlays: Tooltip + Sprechblasen (DOM, wie im Muster) ─────────────────
  const layer = document.createElement('div')
  layer.className = 'kd-map-layer'
  Object.assign(layer.style, { position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden' })
  container.appendChild(layer)
  const tip = document.createElement('div')
  tip.className = 'kd-map-tip'
  Object.assign(tip.style, {
    position: 'absolute', display: 'none', background: '#000040', color: '#FBFFE6',
    font: '12px/1.35 Arial, sans-serif', padding: '7px 10px', maxWidth: '260px',
    border: '1px solid #8FBEFF', pointerEvents: 'none', whiteSpace: 'pre-line', zIndex: '3',
  })
  layer.appendChild(tip)

  // ── Bausteine ─────────────────────────────────────────────────────────────
  const track = (obj) => { disposables.push(obj); return obj }
  const mat = (o) => track(new THREE.MeshStandardMaterial(o))
  const geo = (g) => track(g)

  function hexPrisms(hexes, colorFor, depthFor) {
    const plateGeo = geo(new THREE.CylinderGeometry(HR * 0.985, HR * 0.985, 0.36, 6))
    const bodyGeo  = geo(new THREE.CylinderGeometry(HR * 0.985, HR * 0.5, 1, 6))
    const plate = new THREE.InstancedMesh(plateGeo, mat({ roughness: 0.92, metalness: 0.02 }), hexes.length)
    const body  = new THREE.InstancedMesh(bodyGeo,  mat({ roughness: 1, metalness: 0, color: 0x20283c }), hexes.length)
    plate.receiveShadow = true; plate.castShadow = false
    body.receiveShadow = false
    const m = new THREE.Matrix4(), q = new THREE.Quaternion()
    const pos = new THREE.Vector3(), scl = new THREE.Vector3()
    hexes.forEach((h, i) => {
      const [x, z] = hexW(h.q, h.r)
      m.compose(pos.set(x, 0, z), q, scl.set(1, 1, 1))
      plate.setMatrixAt(i, m)
      plate.setColorAt(i, new THREE.Color(colorFor(h, i)))
      const d = depthFor(h)
      m.compose(pos.set(x, -0.18 - d / 2, z), q, scl.set(1, d, 1))
      body.setMatrixAt(i, m)
      body.setColorAt(i, new THREE.Color(0x161d2e).lerp(new THREE.Color(0x2e3b58), pseudo(h.q, h.r) * 0.6))
    })
    plate.instanceMatrix.needsUpdate = true
    body.instanceMatrix.needsUpdate = true
    if (plate.instanceColor) plate.instanceColor.needsUpdate = true
    if (body.instanceColor)  body.instanceColor.needsUpdate = true
    return [plate, body]
  }

  // Zustand -> Form (Muster 2.3/5.1). Farbe kommt aus der Region, nicht aus dem Zustand.
  function buildBody(region) {
    const g = new THREE.Group()
    const col = new THREE.Color(region.color)
    const size = region.kind === 'project'
      ? clamp(1.4 + (region.sollDays || region.personDays || 0) * 0.16, 1.4, 5.2)
      : 1.6
    const windowMat = mat({
      color: 0xffd9a0, emissive: new THREE.Color(0xffc270),
      emissiveIntensity: region.saturation === 'unter' || region.state === 'fundament' ? 0.05 : 1.1,
      roughness: 0.5,
    })
    const wallMat = mat({ color: col, roughness: 0.78, metalness: 0.05 })

    const addWindows = (w, h, d) => {
      const wg = geo(new THREE.BoxGeometry(0.17, 0.24, 0.06))
      const rows = Math.max(1, Math.floor(h / 0.55))
      for (let r = 0; r < rows; r++) {
        for (let c = -1; c <= 1; c++) {
          const win = new THREE.Mesh(wg, windowMat)
          win.position.set(c * (w / 3.2), 0.36 + r * 0.55, d / 2 + 0.01)
          g.add(win)
          const back = win.clone(); back.position.z = -d / 2 - 0.01; g.add(back)
        }
      }
    }

    if (region.state === 'fundament') {
      const slab = new THREE.Mesh(geo(new THREE.BoxGeometry(1.8, 0.18, 1.8)), mat({ color: 0x9aa3b2, roughness: 1 }))
      slab.position.y = 0.26; slab.receiveShadow = true; g.add(slab)
      for (const s of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
        const pin = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 6)), mat({ color: 0xb9c0cb }))
        pin.position.set(s[0], 0.55, s[1]); g.add(pin)
      }
    } else if (region.state === 'rohbau') {
      const shell = new THREE.Mesh(geo(new THREE.BoxGeometry(1.55, size, 1.55)), mat({
        color: col, roughness: 0.6, transparent: true, opacity: 0.5,
      }))
      shell.position.y = 0.2 + size / 2; g.add(shell)
      const slab = new THREE.Mesh(geo(new THREE.BoxGeometry(1.75, 0.18, 1.75)), mat({ color: 0x8e97a6, roughness: 1 }))
      slab.position.y = 0.27; slab.receiveShadow = true; g.add(slab)
      // Geruest
      const rodGeo = geo(new THREE.BoxGeometry(0.05, size + 0.2, 0.05))
      for (const s of [[-0.72, -0.72], [0.72, -0.72], [-0.72, 0.72], [0.72, 0.72]]) {
        const rod = new THREE.Mesh(rodGeo, mat({ color: 0xc9a227, roughness: 0.6 }))
        rod.position.set(s[0], 0.2 + size / 2, s[1]); g.add(rod)
      }
      for (let f = 1; f * 0.7 < size; f++) {
        const deck = new THREE.Mesh(geo(new THREE.BoxGeometry(1.6, 0.04, 1.6)), mat({ color: 0xc9a227, transparent: true, opacity: 0.5 }))
        deck.position.y = 0.2 + f * 0.7; g.add(deck)
      }
      // Kran: dreht, solange gearbeitet wird
      const crane = new THREE.Group()
      const mast = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.05, 0.05, size + 1.4, 6)), mat({ color: 0xF0B052 }))
      mast.position.y = (size + 1.4) / 2; crane.add(mast)
      const jib = new THREE.Mesh(geo(new THREE.BoxGeometry(2.2, 0.07, 0.07)), mat({ color: 0xF0B052 }))
      jib.position.set(0.55, size + 1.4, 0); crane.add(jib)
      const hook = new THREE.Mesh(geo(new THREE.BoxGeometry(0.06, 0.34, 0.06)), mat({ color: 0xcccccc }))
      hook.position.set(1.45, size + 1.18, 0); crane.add(hook)
      crane.position.set(-0.95, 0.2, -0.95)
      g.add(crane)
      g.userData.crane = crane
      addWindows(1.55, size, 1.55)
    } else if (region.state === 'idee') {
      const base = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.62, 0.72, 0.3, 6)), mat({ color: 0x2b2f52, roughness: 0.8 }))
      base.position.y = 0.34; g.add(base)
      const holo = new THREE.Mesh(geo(new THREE.IcosahedronGeometry(0.55, 0)), mat({
        color: 0xB49FD8, emissive: new THREE.Color(0xB49FD8), emissiveIntensity: 0.9,
        transparent: true, opacity: 0.5, wireframe: true,
      }))
      holo.position.y = 1.15; g.add(holo)
      g.userData.holo = holo
    } else if (region.state === 'labor') {
      const base = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.8, 0.86, 0.5, 12)), mat({ color: col, roughness: 0.7 }))
      base.position.y = 0.44; base.castShadow = true; g.add(base)
      const dome = new THREE.Mesh(geo(new THREE.SphereGeometry(0.8, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)), mat({
        color: 0x8FBEFF, transparent: true, opacity: 0.35, roughness: 0.15, metalness: 0.2,
      }))
      dome.position.y = 0.68; g.add(dome)
    } else if (region.state === 'urlaub') {
      const trunk = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.07, 0.1, 1.5, 6)), mat({ color: 0x7a5b32 }))
      trunk.position.y = 0.95; trunk.rotation.z = 0.12; g.add(trunk)
      for (let i = 0; i < 5; i++) {
        const leaf = new THREE.Mesh(geo(new THREE.ConeGeometry(0.2, 0.95, 5)), mat({ color: 0x3f9d5d, roughness: 0.85 }))
        leaf.position.set(Math.cos(i / 5 * Math.PI * 2) * 0.36, 1.62, Math.sin(i / 5 * Math.PI * 2) * 0.36)
        leaf.rotation.set(Math.PI / 2.4, 0, i / 5 * Math.PI * 2)
        g.add(leaf)
      }
      const shade = new THREE.Mesh(geo(new THREE.ConeGeometry(0.5, 0.3, 10)), mat({ color: 0xF0B052 }))
      shade.position.set(0.75, 0.95, 0.3); g.add(shade)
    } else if (region.state === 'krank') {
      const house = new THREE.Mesh(geo(new THREE.BoxGeometry(1, 0.8, 1)), mat({ color: 0x5d6472, roughness: 0.95, transparent: true, opacity: 0.62 }))
      house.position.y = 0.6; g.add(house)
      const roof = new THREE.Mesh(geo(new THREE.ConeGeometry(0.85, 0.5, 4)), mat({ color: 0x434b59, transparent: true, opacity: 0.62 }))
      roof.position.y = 1.24; roof.rotation.y = Math.PI / 4; g.add(roof)
    } else {   // 'fertig' und 'buero' - fertiges Gebaeude mit warmen Fenstern
      const h = region.state === 'buero' ? 2.2 : size
      const body = new THREE.Mesh(geo(new THREE.BoxGeometry(1.55, h, 1.55)), wallMat)
      body.position.y = 0.2 + h / 2
      body.castShadow = true; body.receiveShadow = true
      g.add(body)
      const roof = new THREE.Mesh(geo(new THREE.ConeGeometry(1.3, 0.6, 4)), mat({ color: col.clone().offsetHSL(0, 0, -0.16), roughness: 0.8 }))
      roof.position.y = 0.2 + h + 0.26; roof.rotation.y = Math.PI / 4; roof.castShadow = true
      g.add(roof)
      addWindows(1.55, h, 1.55)
    }

    // Bake: leuchtende Kugel in Statusfarbe (pulsiert bei aktiven Objekten)
    const bakeKey = STATE_BAKE[region.state] || 'plan'
    const bakeCol = region.saturation === 'unter' ? BAKE_COLOR.proto : BAKE_COLOR[bakeKey]
    const bake = new THREE.Mesh(geo(new THREE.SphereGeometry(0.14, 12, 10)), mat({
      color: bakeCol, emissive: new THREE.Color(bakeCol), emissiveIntensity: 1.4,
    }))
    bake.position.y = (region.state === 'rohbau' ? size + 1.9 : size + 1.1)
    g.add(bake)
    g.userData.bake = bake
    g.userData.blink = region.saturation === 'unter'

    // Ueberbesetzung: die Parzelle glueht rot von unten
    if (region.saturation === 'ueber') {
      const red = new THREE.Sprite(new THREE.SpriteMaterial({
        map: radialTexture('rgba(255,74,74,0.85)', 'rgba(255,74,74,0)'),
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }))
      red.position.y = 0.22; red.scale.set(4.2, 4.2, 1)
      g.add(red)
    }
    return g
  }

  function decoBody(d) {
    const g = new THREE.Group()
    const rnd = pseudo(d.q * 3, d.r * 7)
    if (d.type === 'baum') {
      const trunk = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.08, 0.11, 0.7, 5)), mat({ color: 0x6b4a2b }))
      trunk.position.y = 0.55; g.add(trunk)
      const crown = new THREE.Mesh(geo(new THREE.ConeGeometry(0.5, 1.2, 7)), mat({ color: 0x2f7d4f, roughness: 0.9 }))
      crown.position.y = 1.4; crown.castShadow = true; g.add(crown)
    } else if (d.type === 'busch') {
      const b = new THREE.Mesh(geo(new THREE.SphereGeometry(0.34, 8, 6)), mat({ color: 0x39864f, roughness: 0.95 }))
      b.position.set((rnd - 0.5) * 0.7, 0.42, (pseudo(d.r, d.q) - 0.5) * 0.7); g.add(b)
    } else if (d.type === 'stein') {
      const s = new THREE.Mesh(geo(new THREE.DodecahedronGeometry(0.3, 0)), mat({ color: 0x6a727f, roughness: 1 }))
      s.position.set((rnd - 0.5) * 0.6, 0.35, 0); s.rotation.set(rnd, rnd * 2, rnd * 3); g.add(s)
    } else if (d.type === 'teich' || d.type === 'wasser') {
      const w = new THREE.Mesh(geo(new THREE.CylinderGeometry(HR * 0.94, HR * 0.94, 0.06, 6)), mat({
        color: 0x2a7fb8, emissive: new THREE.Color(0x11405e), emissiveIntensity: 0.5,
        roughness: 0.12, metalness: 0.55, transparent: true, opacity: 0.9,
      }))
      w.position.y = 0.17; g.add(w)
      g.userData.pond = w
    } else if (rnd > 0.72) {
      const f = new THREE.Mesh(geo(new THREE.SphereGeometry(0.08, 6, 5)), mat({
        color: 0xFBFFE6, emissive: new THREE.Color(0xFBFFE6), emissiveIntensity: 0.7,
      }))
      f.position.set((rnd - 0.5), 0.3, (pseudo(d.q, d.r * 5) - 0.5)); g.add(f)
    }
    return g
  }

  // Figur mit Identitaet: Mitarbeitende
  function personBody(person) {
    const g = new THREE.Group()
    const shape = new THREE.Group()          // nur der Koerper wird skaliert,
    g.add(shape)                             // das Namensschild bleibt lesbar
    const col = new THREE.Color(person.targets[0]?.color || 0x8FBEFF)
    const dim = person.absence === 'krank'
    const body = new THREE.Mesh(geo(new THREE.CapsuleGeometry(0.13, 0.26, 4, 8)), mat({
      color: col, roughness: 0.7, transparent: dim, opacity: dim ? 0.45 : 1,
    }))
    body.position.y = 0.52; body.castShadow = true; shape.add(body)
    const head = new THREE.Mesh(geo(new THREE.SphereGeometry(0.12, 10, 8)), mat({
      color: 0xe8c9a6, roughness: 0.8, transparent: dim, opacity: dim ? 0.45 : 1,
    }))
    head.position.y = 0.82; shape.add(head)
    const helm = new THREE.Mesh(geo(new THREE.SphereGeometry(0.135, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), mat({
      color: person.absence === 'urlaub' ? 0xF0B052 : 0xFBFFE6, roughness: 0.5,
    }))
    helm.position.y = 0.86; shape.add(helm)
    // Auslastung: Bodenring, ab 100 % rot
    const ring = new THREE.Mesh(geo(new THREE.RingGeometry(0.2, 0.28, 18)), mat({
      color: person.loadPct >= 100 ? 0xff4a4a : 0x8FBEFF,
      emissive: new THREE.Color(person.loadPct >= 100 ? 0xff4a4a : 0x8FBEFF),
      emissiveIntensity: 0.6, transparent: true, opacity: 0.75, side: THREE.DoubleSide,
    }))
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.21; shape.add(ring)
    // Auslastung skaliert die Figur leicht (0,9 bei 50 %, 1,1 bei 110 %)
    const s = clamp(0.9 + (person.loadPct - 50) / 60 * 0.2, 0.82, 1.18)
    shape.scale.setScalar(s * 1.5)
    const label = labelSprite(person.name, { size: 22, bg: 'rgba(0,0,64,0.62)' })
    label.position.y = 1.85
    label.scale.multiplyScalar(0.8)
    g.add(label)
    g.userData.label = label
    return g
  }

  // Agent: schwebender Sky-Kristall ueber der Wabe seines Objekts
  function agentBody(region) {
    const g = new THREE.Group()
    const crystal = new THREE.Mesh(geo(new THREE.OctahedronGeometry(0.24, 0)), mat({
      color: CI.sky, emissive: new THREE.Color(CI.sky), emissiveIntensity: 1.1, roughness: 0.25,
    }))
    crystal.position.y = 2.6; g.add(crystal)
    const halo = new THREE.Mesh(geo(new THREE.TorusGeometry(0.42, 0.025, 6, 22)), mat({
      color: CI.cream, emissive: new THREE.Color(CI.cream), emissiveIntensity: 0.8,
    }))
    halo.position.y = 2.6; halo.rotation.x = Math.PI / 2.2; g.add(halo)
    const cone = new THREE.Mesh(geo(new THREE.ConeGeometry(0.7, 2.4, 14, 1, true)), mat({
      color: CI.sky, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false,
    }))
    cone.position.y = 1.4; g.add(cone)
    const ground = new THREE.Mesh(geo(new THREE.RingGeometry(0.55, 0.66, 22)), mat({
      color: CI.sky, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
    }))
    ground.rotation.x = -Math.PI / 2; ground.position.y = 0.21; g.add(ground)
    g.userData.crystal = crystal
    g.userData.halo = halo
    return g
  }

  // ── Aufbau / Aktualisierung ───────────────────────────────────────────────
  function clearGroup(group) {
    group.traverse(o => { if (o.userData.dispose) o.userData.dispose() })
    group.parent?.remove(group)
  }

  function setData(next) {
    const firstRun = !layout
    layout = next
    fitCamera(layout.radius || 6)

    // Terrain nur neu bauen, wenn sich die Wabenmenge geaendert hat
    const sig = JSON.stringify([
      layout.regions.map(r => [r.id, r.hexes.map(h => key(h.q, h.r))]),
      layout.deco.map(d => [d.q, d.r, d.type]),
    ])
    if (sig !== terrainSig) {
      terrainSig = sig
      if (terrain) clearGroup(terrain)
      ponds.length = 0
      terrain = new THREE.Group()
      platform.add(terrain)
      occupied.clear()

      const all = []
      const colorOf = new Map()
      for (const r of layout.regions) for (const h of r.hexes) {
        all.push(h); colorOf.set(key(h.q, h.r), new THREE.Color(r.color).lerp(new THREE.Color(0x0b1020), 0.3))
        occupied.add(key(h.q, h.r))
      }
      for (const d of layout.deco) {
        all.push(d); colorOf.set(key(d.q, d.r), new THREE.Color(DECO_COLOR[d.type] || DECO_COLOR.wiese))
        occupied.add(key(d.q, d.r))
      }
      const b = layout.brunnen
      all.push(b); colorOf.set(key(b.q, b.r), new THREE.Color(0x6b7180))
      occupied.add(key(b.q, b.r))

      const [plate, body] = hexPrisms(all,
        (h) => colorOf.get(key(h.q, h.r)) || 0x2f6b46,
        (h) => Math.max(0.8, 4.6 - Math.hypot(...hexW(h.q, h.r)) * 0.34 + pseudo(h.q, h.r) * 0.8))
      terrain.add(plate, body)

      for (const d of layout.deco) {
        const node = decoBody(d)
        const [x, z] = hexW(d.q, d.r)
        node.position.set(x, 0.18, z)
        terrain.add(node)
        if (node.userData.pond) ponds.push(node.userData.pond)
      }
      // Brunnen: Orientierungspunkt und Treffpunkt der Unverplanten
      const bg = new THREE.Group()
      const basin = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.85, 0.9, 0.3, 14)), mat({ color: 0x707788, roughness: 0.9 }))
      basin.position.y = 0.34; bg.add(basin)
      const water = new THREE.Mesh(geo(new THREE.CircleGeometry(0.74, 16)), mat({
        color: 0x3aa0d8, emissive: new THREE.Color(0x1b5f86), emissiveIntensity: 0.6, roughness: 0.1, metalness: 0.5,
      }))
      water.rotation.x = -Math.PI / 2; water.position.y = 0.5; bg.add(water)
      const jet = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6)), mat({
        color: 0x8FBEFF, transparent: true, opacity: 0.55,
      }))
      jet.position.y = 0.95; bg.add(jet)
      const [bx, bz] = hexW(b.q, b.r)
      bg.position.set(bx, 0.18, bz)
      terrain.add(bg)
      ponds.push(water)
    }

    // ── Objekte je Region ───────────────────────────────────────────────────
    const seen = new Set()
    for (const r of layout.regions) {
      seen.add(r.id)
      const prev = regionNodes.get(r.id)
      const sigR = `${r.state}|${r.saturation}|${r.sollDays}|${r.center.q},${r.center.r}`
      if (prev && prev.sig === sigR) { prev.data = r; continue }
      if (prev) { clearGroup(prev.group); pickIdx(prev.group) }

      const group = new THREE.Group()
      const [x, z] = hexW(r.center.q, r.center.r)
      group.position.set(x, 0.18, z)
      const bodyNode = buildBody(r)
      group.add(bodyNode)
      const sign = labelSprite(r.short || r.name, { size: 30, brand: true })
      sign.position.y = (r.state === 'rohbau' ? 4.4 : 3.2)
      group.add(sign)
      group.userData.region = r
      platform.add(group)
      pickables.push(group)
      regionNodes.set(r.id, { group, sig: sigR, data: r, body: bodyNode })

      // Agent je Objekt mit Meldungen
      const oldAgent = agentNodes.get(r.id)
      if (oldAgent) { clearGroup(oldAgent.node); agentNodes.delete(r.id) }
      if ((r.agentSays || []).length > 0) {
        const ag = agentBody(r)
        ag.position.set(x, 0.18, z)
        platform.add(ag)
        agentNodes.set(r.id, { node: ag, region: r })
      }
    }
    for (const [id, node] of regionNodes) {
      if (seen.has(id)) continue
      clearGroup(node.group)
      pickIdx(node.group)
      regionNodes.delete(id)
    }
    for (const [id, a] of agentNodes) {
      if (seen.has(id)) { a.region = layout.regions.find(r => r.id === id) || a.region; continue }
      clearGroup(a.node)
      agentNodes.delete(id)
    }

    // ── Figuren ─────────────────────────────────────────────────────────────
    const seenP = new Set()
    for (const p of layout.people) {
      seenP.add(p.id)
      const prev = peopleNodes.get(p.id)
      if (prev) {
        prev.person = p
        retarget(prev, p, !firstRun)     // Wochenwechsel: Figuren wandern hin
        continue
      }
      const node = personBody(p)
      const start = p.home
      const [x, z] = hexW(start.q, start.r)
      node.position.set(x, 0.18, z)
      platform.add(node)
      pickables.push(node)
      const entry = { group: node, person: p, hex: start, walk: null, wait: pseudo(x, z) * 3 }
      node.userData.person = p
      peopleNodes.set(p.id, entry)
      retarget(entry, p, false)
    }
    for (const [id, node] of peopleNodes) {
      if (seenP.has(id)) continue
      clearGroup(node.group)
      pickIdx(node.group)
      peopleNodes.delete(id)
    }
  }

  // Figur bekommt ein neues Ziel: sie laeuft ueber Nachbarwaben dorthin
  function retarget(entry, person, animate = true) {
    const targets = person.targets.length > 0
      ? person.targets.map(t => t.hex)
      : [layout.brunnen, ...DIRS.map(([dq, dr]) => ({ q: layout.brunnen.q + dq, r: layout.brunnen.r + dr }))]
        .filter(h => occupied.has(key(h.q, h.r)))
    const goal = targets[Math.floor(pseudo(entry.hex.q + person.name.length, entry.hex.r) * targets.length)] || entry.hex
    entry.goals = targets
    if (!animate) {
      entry.hex = goal
      const [x, z] = hexW(goal.q, goal.r)
      entry.group.position.set(x + (pseudo(goal.q, goal.r) - 0.5) * 0.8, 0.18, z + (pseudo(goal.r, goal.q) - 0.5) * 0.8)
      entry.walk = null
      return
    }
    const route = hexPath(entry.hex, goal, (h) => occupied.has(key(h.q, h.r)))
    entry.walk = { route, i: 0, t: 0 }
    entry.hex = goal
  }

  function pickIdx(obj) {
    const i = pickables.indexOf(obj)
    if (i >= 0) pickables.splice(i, 1)
  }

  // ── Kamera (eigener Orbit) ────────────────────────────────────────────────
  const cam = { az: 0.75, pol: 0.62, radius: 34, target: new THREE.Vector3(0, 0.8, 0) }
  // Kamera an die Groesse der Plattform anpassen, solange niemand selbst gedreht hat
  function fitCamera(radiusHexes) {
    if (userTouched) return
    cam.radius = clamp(radiusHexes * 2.7 + 7, 14, 78)
    applyCamera()
  }
  function applyCamera() {
    const s = new THREE.Spherical(cam.radius, cam.pol, cam.az)
    camera.position.setFromSpherical(s).add(cam.target)
    camera.lookAt(cam.target)
  }
  let drag = null
  const stopDrag = () => { drag = null }
  renderer.domElement.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId }
    renderer.domElement.setPointerCapture?.(e.pointerId)
  })
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y
      drag.moved += Math.abs(dx) + Math.abs(dy)
      cam.az -= dx * 0.006
      cam.pol = clamp(cam.pol - dy * 0.005, 0.22, 1.42)
      drag.x = e.clientX; drag.y = e.clientY
      userTouched = true
      applyCamera()
    }
    hover(e)
  })
  renderer.domElement.addEventListener('pointerup', (e) => {
    const wasClick = drag && drag.moved < 6
    stopDrag()
    if (wasClick) click(e)
  })
  for (const ev of ['pointercancel', 'lostpointercapture', 'blur']) {
    renderer.domElement.addEventListener(ev, stopDrag)
  }
  // Verlaesst der Zeiger die Buehne, verschwindet der Tooltip mit ihm
  for (const ev of ['pointerleave', 'pointerout']) {
    renderer.domElement.addEventListener(ev, () => { tip.style.display = 'none' })
  }
  window.addEventListener('blur', stopDrag)
  renderer.domElement.addEventListener('wheel', (e) => {
    e.preventDefault()
    cam.radius = clamp(cam.radius + Math.sign(e.deltaY) * 2, 10, 70)
    userTouched = true
    applyCamera()
  }, { passive: false })

  // ── Hover / Klick ─────────────────────────────────────────────────────────
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  function hit(e) {
    const rect = renderer.domElement.getBoundingClientRect()
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const list = ray.intersectObjects(pickables, true)
    for (const h of list) {
      let o = h.object
      while (o && !o.userData.region && !o.userData.person) o = o.parent
      if (o) return { node: o, point: h.point }
    }
    return null
  }
  function tipText(node) {
    const r = node.userData.region
    if (r) {
      const lines = [r.name]
      if (r.kind === 'project') lines.push(`${r.lphLabel || ''}${r.gesellschaft ? ` · ${r.gesellschaft}` : ''}`.trim())
      lines.push(`${fmtTage(r.personDays)} Personentage · ${r.headcount} ${r.headcount === 1 ? 'Kopf' : 'Köpfe'}`)
      if (r.sollDays > 0) lines.push(`Soll ${fmtTage(r.sollDays)} Tage`)
      lines.push('Klick: Besetzung dieser Woche')
      return lines.filter(Boolean).join('\n')
    }
    const p = node.userData.person
    const where = p.targets.map(t => `${t.name} ${fmtTage(t.days)}`).join(', ') || 'nicht eingeplant'
    return [`${p.name}${p.funktion ? ` · ${p.funktion}` : ''}`,
      `${fmtTage(p.plannedDays)} / ${fmtTage(p.capacityDays)} Tage · ${p.loadPct} %`,
      where, 'Klick: Einsatzübersicht'].join('\n')
  }
  function hover(e) {
    const h = hit(e)
    if (!h) { tip.style.display = 'none'; renderer.domElement.style.cursor = 'grab'; return }
    const rect = renderer.domElement.getBoundingClientRect()
    tip.textContent = tipText(h.node)
    tip.style.display = 'block'
    tip.style.left = `${clamp(e.clientX - rect.left + 14, 0, rect.width - 270)}px`
    tip.style.top  = `${clamp(e.clientY - rect.top + 14, 0, rect.height - 90)}px`
    renderer.domElement.style.cursor = 'pointer'
  }
  function click(e) {
    userTouched = true
    const h = hit(e)
    if (!h) return
    if (h.node.userData.region) onPickRegion(h.node.userData.region)
    else if (h.node.userData.person) onPickPerson(h.node.userData.person)
  }

  // ── Schleife ──────────────────────────────────────────────────────────────
  function frame() {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(clock.getDelta(), 0.05)
    const t = clock.elapsedTime
    if (!paused) {
      platform.position.y = Math.sin(t * 0.5) * 0.18
      glow.material.opacity = 0.55 + Math.sin(t * 0.9) * 0.1
      for (const p of ponds) p.material.emissiveIntensity = 0.4 + Math.sin(t * 1.6 + p.id) * 0.2

      for (const [, n] of regionNodes) {
        const body = n.body
        if (body.userData.crane) body.userData.crane.rotation.y += dt * 0.35
        if (body.userData.holo) { body.userData.holo.rotation.y += dt * 0.7; body.userData.holo.position.y = 1.15 + Math.sin(t * 1.4) * 0.08 }
        const bake = body.userData.bake
        if (bake) {
          const pulse = body.userData.blink ? (Math.sin(t * 5) > 0 ? 1.9 : 0.15) : 1.2 + Math.sin(t * 2) * 0.4
          bake.material.emissiveIntensity = pulse
        }
      }
      for (const [, a] of agentNodes) {
        a.node.userData.crystal.rotation.y += dt * 1.1
        a.node.userData.crystal.position.y = 2.6 + Math.sin(t * 1.3 + a.region.hue) * 0.18
        a.node.userData.halo.rotation.z += dt * 0.6
      }
      // Figuren laufen ihren Weg ab, kurze Pause, kleiner Huepfer
      for (const [, e] of peopleNodes) walkStep(e, dt, t)
      bubbleTimer -= dt
      if (bubbleTimer <= 0) { rotateBubbles(); bubbleTimer = 5.5 }
      if (!userTouched && !reduceMotion) { cam.az += dt * 0.05; applyCamera() }
    }
    positionBubbles()
    renderer.render(scene, camera)
  }

  function walkStep(entry, dt, t) {
    const w = entry.walk
    if (!w) {
      entry.wait -= dt
      if (entry.wait <= 0 && entry.goals && entry.goals.length > 0) {
        // freies Streifen im eigenen Revier
        const goal = entry.goals[Math.floor(Math.random() * entry.goals.length)]
        const near = DIRS.map(([dq, dr]) => ({ q: goal.q + dq, r: goal.r + dr }))
          .filter(h => occupied.has(key(h.q, h.r)))
        const dest = Math.random() > 0.5 && near.length > 0 ? near[Math.floor(Math.random() * near.length)] : goal
        entry.walk = { route: hexPath(entry.hex, dest, (h) => occupied.has(key(h.q, h.r))), i: 0, t: 0 }
        entry.hex = dest
        entry.wait = 2 + Math.random() * 4
      }
      entry.group.position.y = 0.18
      return
    }
    w.t += dt * 0.9
    if (w.t >= 1) { w.t = 0; w.i++ }
    if (w.i >= w.route.length - 1) { entry.walk = null; return }
    const a = w.route[w.i], b = w.route[w.i + 1]
    const [ax, az] = hexW(a.q, a.r), [bx, bz] = hexW(b.q, b.r)
    entry.group.position.x = ax + (bx - ax) * w.t
    entry.group.position.z = az + (bz - az) * w.t
    entry.group.position.y = 0.18 + Math.abs(Math.sin(w.t * Math.PI * 3)) * 0.07
    entry.group.rotation.y = Math.atan2(bx - ax, bz - az)
  }

  // ── Sprechblasen: drei Agenten gleichzeitig, reihum ───────────────────────
  function rotateBubbles() {
    for (const b of bubbles) b.el.remove()
    bubbles.length = 0
    const talkers = [...agentNodes.values()].filter(a => (a.region.agentSays || []).length > 0)
    if (talkers.length === 0) return
    const start = Math.floor(clock.elapsedTime / 5.5) % talkers.length
    for (let i = 0; i < Math.min(3, talkers.length); i++) {
      const a = talkers[(start + i) % talkers.length]
      const says = a.region.agentSays
      const text = says[Math.floor(clock.elapsedTime / 5.5) % says.length]
      const el = document.createElement('div')
      el.className = 'kd-map-bubble'
      Object.assign(el.style, {
        position: 'absolute', background: '#FBFFE6', color: '#000040',
        font: '11px/1.3 Arial, sans-serif', padding: '6px 9px', maxWidth: '190px',
        border: '1px solid #000040', pointerEvents: 'none', transform: 'translate(-50%, -100%)',
        boxShadow: '0 0 0 1px rgba(143,190,255,0.5)',
      })
      el.innerHTML = `<strong style="display:block;font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:#3a4a8a;">${escapeHtml(a.region.short || a.region.name)}</strong>${escapeHtml(text)}`
      layer.appendChild(el)
      bubbles.push({ el, node: a.node })
    }
  }
  function positionBubbles() {
    const rect = renderer.domElement.getBoundingClientRect()
    for (const b of bubbles) {
      const v = new THREE.Vector3(0, 3.3, 0).applyMatrix4(b.node.matrixWorld).project(camera)
      const x = (v.x * 0.5 + 0.5) * rect.width
      const y = (-v.y * 0.5 + 0.5) * rect.height
      b.el.style.display = (v.z > 1 || x < 0 || x > rect.width) ? 'none' : 'block'
      b.el.style.left = `${x}px`
      b.el.style.top = `${y}px`
    }
  }
  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

  // Bewegung laeuft immer; "Bewegung reduzieren" stoppt nur die Kamerafahrt
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false

  function resize() {
    const w = container.clientWidth || 800
    const h = container.clientHeight || 600
    renderer.setSize(w, h)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  const ro = new ResizeObserver(resize)
  ro.observe(container)
  resize()
  applyCamera()
  frame()

  return {
    setData,
    setPaused: (v) => { paused = !!v },
    isPaused: () => paused,
    focusRegion(id) {
      const n = regionNodes.get(id)
      if (!n) return
      cam.target.set(n.group.position.x, 1.2, n.group.position.z)
      userTouched = true
      applyCamera()
    },
    highlight(id) {
      for (const [rid, n] of regionNodes) n.group.position.y = rid === id ? 0.55 : 0.18
    },
    dispose() {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('blur', stopDrag)
      for (const b of bubbles) b.el.remove()
      scene.traverse(o => {
        if (o.userData.dispose) o.userData.dispose()
        if (o.geometry) o.geometry.dispose?.()
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose?.())
      })
      renderer.dispose()
      layer.remove()
      renderer.domElement.remove()
    },
  }
}

/** Marken-Schrift vor dem ersten Schild laden, sonst faellt der Canvas auf Arial zurueck. */
export async function waitForBrandFont() {
  try { await document.fonts?.load?.('900 30px Yellix') } catch { /* Arial genuegt */ }
}
