// Blender GLB loader helper
function loadGLB(url, onReady) {
  BABYLON.SceneLoader.ImportMesh('', '', url, '', (meshes, particleSystems, skeletons) => {
    if (onReady) onReady(meshes, particleSystems, skeletons)
  }, null, (scene, message) => {
    console.warn('GLB load issue:', message)
  })
}

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('gameCanvas')
  const engine = new BABYLON.Engine(canvas, true)
  const scene = new BABYLON.Scene(engine)
  scene.clearColor = new BABYLON.Color4(0.05, 0.02, 0.08, 1)

  scene.fogMode = BABYLON.Scene.FOGMODE_EXP
  scene.fogDensity = 0.0005
  scene.fogColor = new BABYLON.Color3(0.15, 0.05, 0.08)

  const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0.2), scene)
  hemi.diffuse = new BABYLON.Color3(0.6, 0.3, 0.15)
  hemi.groundColor = new BABYLON.Color3(0.2, 0.05, 0.02)
  hemi.intensity = 0.5

  const sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(0.3, -1.5, 0.5), scene)
  sun.diffuse = new BABYLON.Color3(1, 0.5, 0.15)
  sun.intensity = 1.0
  const fill = new BABYLON.DirectionalLight('fill', new BABYLON.Vector3(-0.2, -0.8, -0.3), scene)
  fill.diffuse = new BABYLON.Color3(0.4, 0.1, 0.05)
  fill.intensity = 0.3

  const shadowGen = new BABYLON.ShadowGenerator(1024, sun)
  shadowGen.useBlurExponentialShadowMap = true
  shadowGen.blurKernel = 8

  const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 1000, height: 1000 }, scene)
  const groundMat = new BABYLON.StandardMaterial('groundMat', scene)
  groundMat.diffuseColor = new BABYLON.Color3(0.08, 0.04, 0.03)
  groundMat.specularColor = BABYLON.Color3.Black()
  ground.material = groundMat
  ground.receiveShadows = true

  const skybox = BABYLON.MeshBuilder.CreateBox('skybox', { size: 1200 }, scene)
  const skyMat = new BABYLON.StandardMaterial('skyMat', scene)
  skyMat.diffuseColor = new BABYLON.Color3(0.08, 0.03, 0.05)
  skyMat.backFaceCulling = false
  skybox.material = skyMat

  // --- LINEAR WINDING TRACK (NO LOOPS) ---
  const segmentCount = 80, segmentLength = 10, sideWiggle = 6, heightVariation = 3
  const wp = [{ x: 0, y: 0.05, z: 0 }]
  let dirX = 0, dirY = 0, dirZ = 1
  for (let i = 0; i < segmentCount; i++) {
    dirX += (Math.random() - 0.5) * 0.6
    dirY += (Math.random() - 0.5) * 0.2
    dirZ += 1
    const len = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ)
    dirX /= len; dirY /= len; dirZ /= len
    const prev = wp[wp.length - 1]
    wp.push({
      x: prev.x + dirX * segmentLength + (Math.random() - 0.5) * sideWiggle * 2,
      y: prev.y + dirY * segmentLength + (Math.random() - 0.5) * heightVariation * 2,
      z: prev.z + dirZ * segmentLength,
    })
  }

  function catmullRom(pa, pb, pc, pd, t) {
    const t2 = t * t, t3 = t2 * t
    return 0.5 * ((2 * pb) + (-pa + pc) * t + (2 * pa - 5 * pb + 4 * pc - pd) * t2 + (-pa + 3 * pb - 3 * pc + pd) * t3)
  }

  const pathSegs = 500
  const trackPath = []
  for (let i = 0; i < pathSegs; i++) {
    const t = (i / pathSegs) * (wp.length - 1)
    const seg = Math.floor(t)
    const lt = t - seg
    const i0 = Math.max(0, seg - 1)
    const i1 = seg
    const i2 = Math.min(wp.length - 1, seg + 1)
    const i3 = Math.min(wp.length - 1, seg + 2)
    const cx = catmullRom(wp[i0].x, wp[i1].x, wp[i2].x, wp[i3].x, lt)
    const cy = catmullRom(wp[i0].y, wp[i1].y, wp[i2].y, wp[i3].y, lt)
    const cz = catmullRom(wp[i0].z, wp[i1].z, wp[i2].z, wp[i3].z, lt)
    trackPath.push(new BABYLON.Vector3(cx, cy, cz))
  }

  const pathLens = [0]
  for (let i = 1; i < trackPath.length; i++) {
    pathLens.push(pathLens[i - 1] + BABYLON.Vector3.Distance(trackPath[i - 1], trackPath[i]))
  }
  const totalLen = pathLens[pathLens.length - 1]
  const pathU = pathLens.map(l => l / totalLen)

  function getPathPoint(u) {
    u = Math.max(0, Math.min(1, u))
    for (let i = 1; i < trackPath.length; i++) {
      if (pathU[i] >= u) {
        const seg = (u - pathU[i - 1]) / (pathU[i] - pathU[i - 1])
        const px = trackPath[i - 1].x + (trackPath[i].x - trackPath[i - 1].x) * seg
        const py = trackPath[i - 1].y + (trackPath[i].y - trackPath[i - 1].y) * seg
        const pz = trackPath[i - 1].z + (trackPath[i].z - trackPath[i - 1].z) * seg
        const angle = Math.atan2(trackPath[i].z - trackPath[i - 1].z, trackPath[i].x - trackPath[i - 1].x)
        return { x: px, y: py, z: pz, angle: angle }
      }
    }
    const last = trackPath[trackPath.length - 1]
    const prev = trackPath[trackPath.length - 2]
    return { x: last.x, y: last.y, z: last.z, angle: Math.atan2(last.z - prev.z, last.x - prev.x) }
  }

  function nearestPathU(x, z) {
    let bestI = 0, bestD = Infinity
    for (let i = 0; i < trackPath.length; i += 3) {
      const dx = trackPath[i].x - x, dz = trackPath[i].z - z
      const d = dx * dx + dz * dz
      if (d < bestD) { bestD = d; bestI = i }
    }
    const lo = Math.max(0, bestI - 4), hi = Math.min(trackPath.length - 1, bestI + 4)
    for (let i = lo; i <= hi; i++) {
      const dx = trackPath[i].x - x, dz = trackPath[i].z - z
      const d = dx * dx + dz * dz
      if (d < bestD) { bestD = d; bestI = i }
    }
    return pathU[bestI]
  }

  const roadW = 10
  const roadShape = [
    new BABYLON.Vector3(-roadW / 2, 0, 0),
    new BABYLON.Vector3(roadW / 2, 0, 0),
    new BABYLON.Vector3(roadW / 2, 0.2, 0),
    new BABYLON.Vector3(-roadW / 2, 0.2, 0),
  ]
  const track = BABYLON.MeshBuilder.ExtrudeShape('track', {
    shape: roadShape, path: trackPath, cap: BABYLON.Mesh.CAP_END, scene,
  })
  const trackMat = new BABYLON.StandardMaterial('trackMat', scene)
  trackMat.diffuseColor = new BABYLON.Color3(0.2, 0.18, 0.16)
  trackMat.specularColor = new BABYLON.Color3(0.08, 0.05, 0.03)
  trackMat.specularPower = 8
  track.material = trackMat
  track.receiveShadows = true

  // Center line (orange glow)
  const centerLineMat = new BABYLON.StandardMaterial('centerLine', scene)
  centerLineMat.diffuseColor = new BABYLON.Color3(0.9, 0.5, 0.1)
  centerLineMat.emissiveColor = new BABYLON.Color3(0.3, 0.15, 0.05)
  centerLineMat.specularColor = BABYLON.Color3.Black()
  const dashCount = 120
  for (let i = 0; i < dashCount; i++) {
    const u = (i + 0.5) / dashCount
    const p = getPathPoint(u)
    const dash = BABYLON.MeshBuilder.CreateBox('dash' + i, {
      width: 0.3, height: 0.02, depth: 1.5,
    }, scene)
    dash.position = new BABYLON.Vector3(p.x, p.y + 0.18, p.z)
    dash.rotation.y = p.angle
    dash.material = centerLineMat
  }

  const arrowMat = new BABYLON.StandardMaterial('arrowMat', scene)
  arrowMat.diffuseColor = new BABYLON.Color3(1, 0.6, 0.1)
  arrowMat.emissiveColor = new BABYLON.Color3(0.3, 0.15, 0)
  arrowMat.specularColor = BABYLON.Color3.Black()
  for (let i = 0; i < 20; i++) {
    const u = (i + 0.5) / 20
    const p = getPathPoint(u)
    const arrow = BABYLON.MeshBuilder.CreateBox('arrow' + i, {
      width: 0.15, height: 0.02, depth: 2.8,
    }, scene)
    arrow.position = new BABYLON.Vector3(p.x - Math.sin(p.angle) * 0.2, p.y + 0.18, p.z + Math.cos(p.angle) * 0.2)
    arrow.rotation.y = p.angle
    const head = BABYLON.MeshBuilder.CreateBox('ah' + i, {
      width: 0.8, height: 0.02, depth: 0.8,
    }, scene)
    head.position = new BABYLON.Vector3(p.x + Math.sin(p.angle) * 1.8, p.y + 0.18, p.z - Math.cos(p.angle) * 1.8)
    head.rotation.y = p.angle
    arrow.material = arrowMat
    head.material = arrowMat
  }

  // Hot rock curbs
  const curbHot = new BABYLON.StandardMaterial('curbHot', scene)
  curbHot.diffuseColor = new BABYLON.Color3(0.9, 0.3, 0.05)
  curbHot.emissiveColor = new BABYLON.Color3(0.4, 0.15, 0.02)
  curbHot.specularColor = new BABYLON.Color3(0.2, 0.05, 0)
  const curbDark = new BABYLON.StandardMaterial('curbDark', scene)
  curbDark.diffuseColor = new BABYLON.Color3(0.12, 0.08, 0.06)
  curbDark.specularColor = new BABYLON.Color3(0.05, 0.03, 0.02)
  const curbCount = 140
  for (let i = 0; i < curbCount; i++) {
    const u = (i + 0.5) / curbCount
    const p = getPathPoint(u)
    const sideOff = roadW / 2 + 0.3
    for (const side of [-1, 1]) {
      const pos = new BABYLON.Vector3(
        p.x + Math.cos(p.angle + Math.PI / 2 * side) * sideOff,
        p.y + 0.2,
        p.z + Math.sin(p.angle + Math.PI / 2 * side) * sideOff
      )
      const curb = BABYLON.MeshBuilder.CreateBox(`curb${i}_${side > 0 ? 1 : 0}`, {
        width: 0.6, height: 0.4, depth: 1.0,
      }, scene)
      curb.position = pos
      curb.material = i % 2 === 0 ? curbHot : curbDark
    }
  }

  // Finish line at END of track
  const finishP = getPathPoint(1)
  const finishAngle = finishP.angle
  const dt = new BABYLON.DynamicTexture('dt', 256, scene)
  const c2d = dt.getContext()
  const cell = 32
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      c2d.fillStyle = (x + y) % 2 === 0 ? '#ff4400' : '#1a0a00'
      c2d.fillRect(x * cell, y * cell, cell, cell)
    }
  }
  dt.update()
  const finish = BABYLON.MeshBuilder.CreatePlane('finish', { width: roadW + 1, height: 7 }, scene)
  finish.position = new BABYLON.Vector3(finishP.x, finishP.y + 3.5, finishP.z)
  finish.rotation.y = finishAngle + Math.PI
  const finishMat = new BABYLON.StandardMaterial('fMat', scene)
  finishMat.diffuseTexture = dt
  finishMat.emissiveTexture = dt
  finishMat.emissiveColor = new BABYLON.Color3(0.3, 0.1, 0)
  finishMat.specularColor = BABYLON.Color3.Black()
  finish.material = finishMat

  const poleMat = new BABYLON.StandardMaterial('poleMat', scene)
  poleMat.diffuseColor = new BABYLON.Color3(0.08, 0.05, 0.04)
  poleMat.specularColor = new BABYLON.Color3(0.1, 0.05, 0.02)
  for (const side of [-1, 1]) {
    const pole = BABYLON.MeshBuilder.CreateCylinder('pole' + side, { height: 7, diameter: 0.3 }, scene)
    pole.position = new BABYLON.Vector3(
      finishP.x + Math.cos(finishAngle + Math.PI / 2 * side) * (roadW / 2 + 1),
      finishP.y + 3.5,
      finishP.z + Math.sin(finishAngle + Math.PI / 2 * side) * (roadW / 2 + 1)
    )
    pole.material = poleMat
  }

  // "LAVA CRATER" banner at finish
  const mcBanner = BABYLON.MeshBuilder.CreatePlane('mcBanner', { width: 14, height: 2.5 }, scene)
  mcBanner.position = new BABYLON.Vector3(
    finishP.x + Math.cos(finishAngle + Math.PI / 2) * (roadW / 2 + 5),
    finishP.y + 7.5,
    finishP.z + Math.sin(finishAngle + Math.PI / 2) * (roadW / 2 + 5)
  )
  mcBanner.rotation.y = finishAngle
  const mcDt = new BABYLON.DynamicTexture('mcDt', { width: 512, height: 64 }, scene)
  const mcCtx = mcDt.getContext()
  mcCtx.fillStyle = '#2a0a00'
  mcCtx.fillRect(0, 0, 512, 64)
  mcCtx.strokeStyle = '#ff6600'
  mcCtx.lineWidth = 3
  mcCtx.strokeRect(2, 2, 508, 60)
  mcCtx.fillStyle = '#ff6600'
  mcCtx.font = 'bold 36px Arial'
  mcCtx.textAlign = 'center'
  mcCtx.textBaseline = 'middle'
  mcCtx.fillText('LAVA CRATER', 256, 34)
  mcDt.update()
  const mcBannerMat = new BABYLON.StandardMaterial('mcBannerMat', scene)
  mcBannerMat.diffuseTexture = mcDt
  mcBannerMat.emissiveTexture = mcDt
  mcBannerMat.emissiveColor = new BABYLON.Color3(0.4, 0.15, 0)
  mcBanner.material = mcBannerMat

  // Caldera center glow
  const calderaMat = new BABYLON.StandardMaterial('calderaMat', scene)
  calderaMat.diffuseColor = new BABYLON.Color3(0.6, 0.1, 0.02)
  calderaMat.emissiveColor = new BABYLON.Color3(0.5, 0.12, 0.02)
  calderaMat.specularColor = new BABYLON.Color3(0.3, 0.05, 0)
  calderaMat.specularPower = 4
  const caldera = BABYLON.MeshBuilder.CreateGround('caldera', { width: 100, height: 65 }, scene)
  caldera.position = new BABYLON.Vector3(0, -0.5, 0)
  caldera.material = calderaMat

  // Inner lava pool
  const lavaMat = new BABYLON.StandardMaterial('lavaMat', scene)
  lavaMat.diffuseColor = new BABYLON.Color3(0.9, 0.3, 0.02)
  lavaMat.emissiveColor = new BABYLON.Color3(0.7, 0.2, 0.02)
  lavaMat.specularColor = new BABYLON.Color3(0.5, 0.15, 0)
  lavaMat.specularPower = 3
  const lavaPool = BABYLON.MeshBuilder.CreateGround('lavaPool', { width: 70, height: 45 }, scene)
  lavaPool.position = new BABYLON.Vector3(0, -0.3, 0)
  lavaPool.material = lavaMat

  // Caldera rim ring
  const rimMat = new BABYLON.StandardMaterial('rimMat', scene)
  rimMat.diffuseColor = new BABYLON.Color3(0.12, 0.06, 0.04)
  const rim = BABYLON.MeshBuilder.CreateTorus('rim', { diameter: 160, thickness: 4, tessellation: 48 }, scene)
  rim.position = new BABYLON.Vector3(0, -0.2, 0)
  rim.rotation.x = Math.PI / 2
  rim.material = rimMat

  // Smoke/ash clouds
  const smokeMat = new BABYLON.StandardMaterial('smokeMat', scene)
  smokeMat.diffuseColor = new BABYLON.Color3(0.15, 0.1, 0.08)
  smokeMat.alpha = 0.4
  smokeMat.backFaceCulling = false
  for (let i = 0; i < 20; i++) {
    const cx = (Math.random() - 0.5) * 500
    const cz = (Math.random() - 0.5) * 500
    const cy = 60 + Math.random() * 50
    for (let j = 0; j < 5; j++) {
      const puff = BABYLON.MeshBuilder.CreateSphere('smoke' + i + '_' + j, {
        diameter: 15 + Math.random() * 20,
      }, scene)
      puff.position = new BABYLON.Vector3(
        cx + (Math.random() - 0.5) * 20,
        cy + (Math.random() - 0.5) * 8,
        cz + (Math.random() - 0.5) * 20,
      )
      puff.material = smokeMat
    }
  }

  // Flame banners along path
  const bannerColors = [
    new BABYLON.Color3(0.95, 0.2, 0.05), new BABYLON.Color3(0.9, 0.5, 0),
    new BABYLON.Color3(0.8, 0.1, 0.1), new BABYLON.Color3(1, 0.6, 0),
    new BABYLON.Color3(0.7, 0.15, 0.05), new BABYLON.Color3(0.9, 0.4, 0.05),
    new BABYLON.Color3(0.85, 0.1, 0.05), new BABYLON.Color3(1, 0.7, 0),
  ]
  for (let i = 0; i < 30; i++) {
    const u = (i + 0.5) / 30
    const p = getPathPoint(u)
    const side = 1
    const off = roadW / 2 + 5
    const bx = p.x + Math.cos(p.angle + Math.PI / 2 * side) * off
    const bz = p.z + Math.sin(p.angle + Math.PI / 2 * side) * off
    const poleH = 5 + Math.sin(i * 2.3) * 1
    const post = BABYLON.MeshBuilder.CreateCylinder('bpost' + i, {
      height: poleH, diameter: 0.12,
    }, scene)
    post.position = new BABYLON.Vector3(bx, poleH / 2 + p.y, bz)
    const pm = new BABYLON.StandardMaterial('bpm' + i, scene)
    pm.diffuseColor = new BABYLON.Color3(0.15, 0.08, 0.05)
    post.material = pm
    const banner = BABYLON.MeshBuilder.CreatePlane('banner' + i, {
      width: 2.0, height: 1.3,
    }, scene)
    banner.position = new BABYLON.Vector3(bx, poleH + 0.1 + p.y, bz)
    banner.rotation.y = p.angle + Math.PI / 2 * side
    banner.rotation.z = Math.sin(i * 1.7) * 0.15
    const bm = new BABYLON.StandardMaterial('bm' + i, scene)
    const c = bannerColors[i % bannerColors.length]
    bm.diffuseColor = c
    bm.emissiveColor = c.scale(0.3)
    banner.material = bm
  }

  // Burnt volcanic trees along path
  for (let i = 0; i < 60; i++) {
    const u = 0.01 + Math.random() * 0.98
    const p = getPathPoint(u)
    const side = Math.random() < 0.5 ? -1 : 1
    const off = roadW / 2 + 2 + Math.random() * 10
    const tx = p.x + Math.cos(p.angle + Math.PI / 2 * side) * off
    const tz = p.z + Math.sin(p.angle + Math.PI / 2 * side) * off
    const trunk = BABYLON.MeshBuilder.CreateCylinder('trk' + i, {
      height: 0.8 + Math.random() * 1.5, diameter: 0.15 + Math.random() * 0.15,
    }, scene)
    trunk.position = new BABYLON.Vector3(tx, p.y + 0.4 + Math.random() * 0.4, tz)
    const trunkMat = new BABYLON.StandardMaterial('tm' + i, scene)
    trunkMat.diffuseColor = new BABYLON.Color3(0.08, 0.04, 0.02)
    trunk.material = trunkMat
    const crown = BABYLON.MeshBuilder.CreateSphere('cr' + i, {
      diameter: 0.8 + Math.random() * 0.8,
    }, scene)
    crown.position = new BABYLON.Vector3(tx, p.y + 1.5 + Math.random() * 1.2, tz)
    crown.scaling = new BABYLON.Vector3(1, 0.6, 0.8)
    const crownMat = new BABYLON.StandardMaterial('crm' + i, scene)
    crownMat.diffuseColor = new BABYLON.Color3(
      0.02 + Math.random() * 0.04, 0.01 + Math.random() * 0.02, 0,
    )
    crownMat.emissiveColor = new BABYLON.Color3(0.03 + Math.random() * 0.05, 0.01, 0)
    crown.material = crownMat
  }

  // Fire ? Blocks along path
  const qBlockMat = new BABYLON.StandardMaterial('qMat', scene)
  qBlockMat.diffuseColor = new BABYLON.Color3(0.95, 0.4, 0)
  qBlockMat.emissiveColor = new BABYLON.Color3(0.5, 0.2, 0)
  qBlockMat.specularColor = new BABYLON.Color3(0.3, 0.15, 0)

  const qBlocks = []
  for (let i = 0; i < 10; i++) {
    const u = (i + 0.5) / 10
    const p = getPathPoint(u)
    const box = BABYLON.MeshBuilder.CreateBox('qblock' + i, { size: 1.0 }, scene)
    box.position = new BABYLON.Vector3(p.x, p.y + 2.0, p.z)
    box.material = qBlockMat
    const qDt = new BABYLON.DynamicTexture('qdt' + i, 128, scene)
    const qCtx = qDt.getContext()
    qCtx.fillStyle = '#cc4400'
    qCtx.fillRect(0, 0, 128, 128)
    qCtx.strokeStyle = '#ff6600'
    qCtx.lineWidth = 3
    qCtx.strokeRect(4, 4, 120, 120)
    qCtx.fillStyle = '#ffcc00'
    qCtx.font = 'bold 80px Arial'
    qCtx.textAlign = 'center'
    qCtx.textBaseline = 'middle'
    qCtx.fillText('?', 64, 66)
    qDt.update()
    const qFaceMat = new BABYLON.StandardMaterial('qfm' + i, scene)
    qFaceMat.diffuseTexture = qDt
    qFaceMat.emissiveTexture = qDt
    qFaceMat.emissiveColor = new BABYLON.Color3(0.4, 0.2, 0)
    box.material = qFaceMat
    qBlocks.push(box)
    shadowGen.addShadowCaster(box)
  }

  // Lava ring coins along path
  const ringCoins = []
  const ringMat = new BABYLON.StandardMaterial('ringMat', scene)
  ringMat.diffuseColor = new BABYLON.Color3(1, 0.4, 0)
  ringMat.emissiveColor = new BABYLON.Color3(0.6, 0.2, 0)
  ringMat.alpha = 0.6
  const ringPos = [0.2, 0.4, 0.6, 0.8]
  ringPos.forEach((rp) => {
    const p = getPathPoint(rp)
    for (let j = 0; j < 8; j++) {
      const a2 = (j / 8) * Math.PI * 2
      const r = 1.5
      const rc = BABYLON.MeshBuilder.CreateCylinder('ringCoin' + rp + '_' + j, {
        height: 0.05, diameter: 0.2,
      }, scene)
      rc.rotation.x = Math.PI / 2
      rc.position = new BABYLON.Vector3(
        p.x + Math.cos(a2) * r,
        p.y + 2.5 + Math.sin(a2) * r,
        p.z
      )
      rc.material = ringMat
      ringCoins.push(rc)
    }
  })

  // Ember coins along path
  const coinMat = new BABYLON.StandardMaterial('coinMat', scene)
  coinMat.diffuseColor = new BABYLON.Color3(1, 0.6, 0.05)
  coinMat.emissiveColor = new BABYLON.Color3(0.5, 0.25, 0)
  coinMat.specularColor = new BABYLON.Color3(0.9, 0.5, 0)
  coinMat.specularPower = 6
  const coins = []
  for (let i = 0; i < 60; i++) {
    const u = Math.random() * 0.98 + 0.01
    const p = getPathPoint(u)
    const off = (Math.random() - 0.5) * 5
    const cx = p.x + Math.cos(p.angle + Math.PI / 2) * off
    const cz = p.z + Math.sin(p.angle + Math.PI / 2) * off
    const coin = BABYLON.MeshBuilder.CreateCylinder('coin' + i, {
      height: 0.06, diameter: 0.5,
    }, scene)
    coin.rotation.x = Math.PI / 2
    coin.position = new BABYLON.Vector3(cx, p.y + 1.2, cz)
    coin.material = coinMat
    coins.push({ mesh: coin, phase: Math.random() * Math.PI * 2, baseY: p.y + 1.2 })
  }

  // Fire boost pads along path
  const boostMat = new BABYLON.StandardMaterial('boostMat', scene)
  boostMat.diffuseColor = new BABYLON.Color3(1, 0.3, 0)
  boostMat.emissiveColor = new BABYLON.Color3(0.8, 0.2, 0)
  boostMat.specularColor = new BABYLON.Color3(0.5, 0.15, 0)
  const boostPadU = [0.06, 0.18, 0.31, 0.44, 0.56, 0.69, 0.81, 0.94]
  boostPadU.forEach((u, i) => {
    const p = getPathPoint(u)
    for (let s = -1; s <= 1; s += 2) {
      const off = s * (roadW / 2 - 1.5)
      const px = p.x + Math.cos(p.angle + Math.PI / 2) * off
      const pz = p.z + Math.sin(p.angle + Math.PI / 2) * off
      const pad = BABYLON.MeshBuilder.CreateBox('boost' + i + '_' + s, {
        width: 2.0, height: 0.06, depth: 2.0,
      }, scene)
      pad.position = new BABYLON.Vector3(px, p.y + 0.02, pz)
      pad.material = boostMat
    }
  })

  // Volcanic rock pillars along path
  const pillarMat = new BABYLON.StandardMaterial('pillarMat', scene)
  pillarMat.diffuseColor = new BABYLON.Color3(0.1, 0.06, 0.04)
  pillarMat.specularColor = new BABYLON.Color3(0.05, 0.02, 0.01)
  for (let i = 0; i < 12; i++) {
    const u = Math.random() * 0.98 + 0.01
    const p = getPathPoint(u)
    const side = Math.random() < 0.5 ? -1 : 1
    const off = roadW / 2 + 3 + Math.random() * 10
    const px = p.x + Math.cos(p.angle + Math.PI / 2 * side) * off
    const pz = p.z + Math.sin(p.angle + Math.PI / 2 * side) * off
    const pillar = BABYLON.MeshBuilder.CreateCylinder('pillar' + i, {
      height: 3 + Math.random() * 4, diameterTop: 0.5 + Math.random() * 1,
      diameterBottom: 1 + Math.random() * 1.5,
    }, scene)
    pillar.position = new BABYLON.Vector3(px, p.y + 1.5 + Math.random() * 2, pz)
    pillar.material = pillarMat
  }

  // Steam vent markers along path
  const ventMat = new BABYLON.StandardMaterial('ventMat', scene)
  ventMat.diffuseColor = new BABYLON.Color3(0.3, 0.1, 0.02)
  ventMat.emissiveColor = new BABYLON.Color3(0.15, 0.05, 0.01)
  for (let i = 0; i < 20; i++) {
    const u = Math.random() * 0.98 + 0.01
    const p = getPathPoint(u)
    const side = Math.random() < 0.5 ? -1 : 1
    const off = roadW / 2 + 2 + Math.random() * 8
    const vx = p.x + Math.cos(p.angle + Math.PI / 2 * side) * off
    const vz = p.z + Math.sin(p.angle + Math.PI / 2 * side) * off
    const vent = BABYLON.MeshBuilder.CreateCylinder('vent' + i, {
      height: 0.15, diameter: 0.8,
    }, scene)
    vent.position = new BABYLON.Vector3(vx, p.y + 0.05, vz)
    vent.material = ventMat
  }

  // Lava stalagmites along path
  const stalMat = new BABYLON.StandardMaterial('stalMat', scene)
  stalMat.diffuseColor = new BABYLON.Color3(0.15, 0.06, 0.04)
  stalMat.specularColor = new BABYLON.Color3(0.05, 0.02, 0.01)
  const stalTipMat = new BABYLON.StandardMaterial('stalTipMat', scene)
  stalTipMat.diffuseColor = new BABYLON.Color3(0.8, 0.2, 0.02)
  stalTipMat.emissiveColor = new BABYLON.Color3(0.3, 0.08, 0)
  for (let i = 0; i < 10; i++) {
    const u = Math.random() * 0.98 + 0.01
    const p = getPathPoint(u)
    const side = Math.random() < 0.5 ? -1 : 1
    const off = roadW / 2 + 3 + Math.random() * 12
    const sx = p.x + Math.cos(p.angle + Math.PI / 2 * side) * off
    const sz = p.z + Math.sin(p.angle + Math.PI / 2 * side) * off
    const stem = BABYLON.MeshBuilder.CreateCylinder('stalStem' + i, {
      height: 1.5 + Math.random(), diameterTop: 0.2, diameterBottom: 0.6,
    }, scene)
    stem.position = new BABYLON.Vector3(sx, p.y + 0.75 + Math.random() * 0.5, sz)
    stem.material = stalMat
    const tip = BABYLON.MeshBuilder.CreateSphere('stalTip' + i, { diameter: 0.3 }, scene)
    tip.position = new BABYLON.Vector3(sx, p.y + 1.5 + Math.random() * 0.8, sz)
    tip.material = stalTipMat
  }

  // Fire flowers along path
  const fireFlowerColors = [
    new BABYLON.Color3(1, 0.4, 0), new BABYLON.Color3(1, 0.6, 0),
    new BABYLON.Color3(0.9, 0.2, 0), new BABYLON.Color3(1, 0.5, 0.1),
    new BABYLON.Color3(0.95, 0.3, 0.05), new BABYLON.Color3(1, 0.7, 0),
  ]
  for (let i = 0; i < 50; i++) {
    const u = Math.random() * 0.98 + 0.01
    const p = getPathPoint(u)
    const side = Math.random() < 0.5 ? -1 : 1
    const off = roadW / 2 + 2 + Math.random() * 10
    const fx = p.x + Math.cos(p.angle + Math.PI / 2 * side) * off
    const fz = p.z + Math.sin(p.angle + Math.PI / 2 * side) * off
    const stem = BABYLON.MeshBuilder.CreateCylinder('ffStem' + i, {
      height: 0.3, diameter: 0.04,
    }, scene)
    stem.position = new BABYLON.Vector3(fx, p.y + 0.15, fz)
    const stemMat = new BABYLON.StandardMaterial('ffSm' + i, scene)
    stemMat.diffuseColor = new BABYLON.Color3(0.08, 0.04, 0.02)
    stem.material = stemMat
    const flower = BABYLON.MeshBuilder.CreateSphere('ff' + i, { diameter: 0.15 }, scene)
    flower.position = new BABYLON.Vector3(fx, p.y + 0.35, fz)
    const flMat = new BABYLON.StandardMaterial('ffm' + i, scene)
    const c = fireFlowerColors[Math.floor(Math.random() * fireFlowerColors.length)]
    flMat.diffuseColor = c
    flMat.emissiveColor = c.scale(0.4)
    flower.material = flMat
  }

  // Lava Bob-ombs along path
  const bobOmbMat = new BABYLON.StandardMaterial('bobOmbMat', scene)
  bobOmbMat.diffuseColor = new BABYLON.Color3(0.05, 0.03, 0.02)
  const fuseMat = new BABYLON.StandardMaterial('fuseMat', scene)
  fuseMat.diffuseColor = new BABYLON.Color3(1, 0.6, 0)
  fuseMat.emissiveColor = new BABYLON.Color3(0.6, 0.3, 0)
  for (let i = 0; i < 10; i++) {
    const u = Math.random() * 0.98 + 0.01
    const p = getPathPoint(u)
    const side = Math.random() < 0.5 ? -1 : 1
    const off = roadW / 2 + 2 + Math.random() * 8
    const bx = p.x + Math.cos(p.angle + Math.PI / 2 * side) * off
    const bz = p.z + Math.sin(p.angle + Math.PI / 2 * side) * off
    const body = BABYLON.MeshBuilder.CreateSphere('bobOmb' + i, { diameter: 0.5 }, scene)
    body.position = new BABYLON.Vector3(bx, p.y + 0.35, bz)
    body.scaling = new BABYLON.Vector3(1, 0.8, 0.9)
    body.material = bobOmbMat
    const fuse = BABYLON.MeshBuilder.CreateCylinder('fuse' + i, {
      height: 0.2, diameter: 0.04,
    }, scene)
    fuse.position = new BABYLON.Vector3(bx, p.y + 0.65, bz + 0.1)
    fuse.rotation.x = 0.3
    fuse.material = fuseMat
    const spark = BABYLON.MeshBuilder.CreateSphere('spark' + i, { diameter: 0.08 }, scene)
    spark.position = new BABYLON.Vector3(bx, p.y + 0.8, bz + 0.15)
    const sparkMat = new BABYLON.StandardMaterial('sparkM' + i, scene)
    sparkMat.diffuseColor = new BABYLON.Color3(1, 0.8, 0.3)
    sparkMat.emissiveColor = new BABYLON.Color3(1, 0.5, 0)
    spark.material = sparkMat
  }

  // --- KART ---
  const kart = new BABYLON.TransformNode('kart')
  const startP0 = wp[0]
  const startDx = wp[1].x - wp[0].x, startDz = wp[1].z - wp[0].z
  kart.position = new BABYLON.Vector3(startP0.x, startP0.y + 0.3, startP0.z)
  kart.rotation.y = Math.atan2(-startDx, -startDz)

  const bodyMat = new BABYLON.StandardMaterial('bodyMat', scene)
  bodyMat.diffuseColor = new BABYLON.Color3(0.7, 0.12, 0.05)
  bodyMat.specularColor = new BABYLON.Color3(0.3, 0.05, 0.02)
  bodyMat.specularPower = 20
  const body = BABYLON.MeshBuilder.CreateBox('body', {
    width: 1.8, height: 0.4, depth: 2.8,
  }, scene)
  body.parent = kart
  body.position = new BABYLON.Vector3(0, 0.45, 0.1)
  body.material = bodyMat
  shadowGen.addShadowCaster(body)

  // Flame racing stripe
  const stripe = BABYLON.MeshBuilder.CreateBox('stripe', {
    width: 0.3, height: 0.05, depth: 2.6,
  }, scene)
  stripe.parent = kart
  stripe.position = new BABYLON.Vector3(0, 0.48, 0.1)
  const stripeMat = new BABYLON.StandardMaterial('stripeMat', scene)
  stripeMat.diffuseColor = new BABYLON.Color3(1, 0.5, 0)
  stripeMat.emissiveColor = new BABYLON.Color3(0.3, 0.15, 0)
  stripe.material = stripeMat

  const hood = BABYLON.MeshBuilder.CreateBox('hood', {
    width: 1.4, height: 0.2, depth: 0.8,
  }, scene)
  hood.parent = kart
  hood.position = new BABYLON.Vector3(0, 0.65, -0.8)
  const hoodMat = new BABYLON.StandardMaterial('hoodMat', scene)
  hoodMat.diffuseColor = new BABYLON.Color3(0.75, 0.15, 0.08)
  hood.material = hoodMat

  const windshield = BABYLON.MeshBuilder.CreateBox('shield', {
    width: 1.5, height: 0.35, depth: 0.7,
  }, scene)
  windshield.parent = kart
  windshield.position = new BABYLON.Vector3(0, 0.8, -0.5)
  const shieldMat = new BABYLON.StandardMaterial('shieldMat', scene)
  shieldMat.diffuseColor = new BABYLON.Color3(0.15, 0.55, 0.95)
  shieldMat.alpha = 0.4
  shieldMat.specularColor = new BABYLON.Color3(0.2, 0.5, 0.9)
  windshield.material = shieldMat

  const spoiler = BABYLON.MeshBuilder.CreateBox('spoiler', {
    width: 1.8, height: 0.08, depth: 0.3,
  }, scene)
  spoiler.parent = kart
  spoiler.position = new BABYLON.Vector3(0, 0.7, 1.4)
  const spoilerMat = new BABYLON.StandardMaterial('spoilerMat', scene)
  spoilerMat.diffuseColor = new BABYLON.Color3(0.05, 0.03, 0.02)
  spoilerMat.specularColor = new BABYLON.Color3(0.1, 0.05, 0.02)
  spoiler.material = spoilerMat

  const wheelPos = [
    { x: -1.05, z: -1.0 }, { x: 1.05, z: -1.0 },
    { x: -1.05, z: 1.0 }, { x: 1.05, z: 1.0 },
  ]
  const wheels = []
  wheelPos.forEach((wp, i) => {
    const w = BABYLON.MeshBuilder.CreateCylinder('whl' + i, {
      height: 0.35, diameter: 0.55,
    }, scene)
    w.rotation.x = Math.PI / 2
    w.parent = kart
    w.position = new BABYLON.Vector3(wp.x, 0.2, wp.z)
    const wMat = new BABYLON.StandardMaterial('wMat' + i, scene)
    wMat.diffuseColor = new BABYLON.Color3(0.05, 0.03, 0.02)
    wMat.specularColor = new BABYLON.Color3(0.1, 0.05, 0.02)
    w.material = wMat
    wheels.push(w)
    shadowGen.addShadowCaster(w)
  })

  // --- CAMERA ---
  const camera = new BABYLON.UniversalCamera('cam', new BABYLON.Vector3(0, 8, -12), scene)
  camera.fov = 1.0
  camera.minZ = 0.1
  camera.maxZ = 800

  let mouseLookX = 0
  let mouseLookY = 0
  let pointerLocked = false
  let invertControls = true
  canvas.addEventListener('click', () => { if (!pointerLocked) canvas.requestPointerLock() })
  document.addEventListener('pointerlockchange', () => { pointerLocked = document.pointerLockElement === canvas })
  document.addEventListener('mousemove', (e) => {
    if (pointerLocked) {
      mouseLookX += e.movementX * 0.004
      mouseLookY += (invertControls ? -1 : 1) * e.movementY * 0.005
    }
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'i' || e.key === 'I') {
      invertControls = !invertControls
    }
  })

  // --- INPUT ---
  const keys = {}
  window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true })
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false })

  // --- GAME STATE ---
  let speed = 0
  const maxSpeed = 80
  const accel = 38
  const brake = 35
  const friction = 10
  const turnSpd = 3.0
  let boostTimer = 0
  let boostPadTimer = 0

  const Item = { NONE: 0, MUSHROOM: 1, GREEN_SHELL: 2, BANANA: 3, RED_SHELL: 4 }
  let heldItem = Item.NONE
  let useItemPressed = false
  let mushroomBoost = 0
  let projectiles = []
  let bananas = []
  let itemBoxTimers = []
  qBlocks.forEach(() => itemBoxTimers.push(0))
  let raceTime = 0
  let prevCheck = false

  let coinTotal = 0

  // Drift state
  let driftActive = false
  let driftCharge = 0
  let driftBoostTimer = 0
  let driftDir = 0

  // Rocket start
  const RaceState = { WAITING: 0, COUNTDOWN: 1, RACING: 2, FINISHED: 3 }
  let raceState = RaceState.WAITING
  let currentLap = 1
  const maxLaps = 3
  let countdownStep = 0
  let countdownTimer = 0
  let rocketStartReady = false
  let rocketStartSuccess = false
  let rocketBoostTimer = 0

  const countdownEl = document.getElementById('countdownText')
  const driftBarEl = document.getElementById('driftBar')
  const driftFillEl = document.getElementById('driftFill')
  const driftLabelEl = document.getElementById('driftLabel')
  const rocketHintEl = document.getElementById('rocketHint')
  const itemSlotEl = document.getElementById('itemSlot')
  const itemIconEl = document.getElementById('itemIcon')

  function beginCountdown() {
    raceState = RaceState.COUNTDOWN
    countdownStep = 0
    countdownTimer = 0
    rocketStartReady = false
    rocketStartSuccess = false
    showCountdown('3')
    rocketHintEl.style.display = 'block'
  }

  function getTrackElevation(x, z) {
    const u = nearestPathU(x, z)
    return getPathPoint(u).y
  }

  function getTrackDist(x, z) {
    const u = nearestPathU(x, z)
    const p = getPathPoint(u)
    return Math.sqrt((x - p.x) ** 2 + (z - p.z) ** 2)
  }

  const itemIcons = ['', '🍄', '🟢', '🍌', '🔴']

  function updateItemDisplay() {
    if (heldItem === Item.NONE) {
      itemSlotEl.style.display = 'none'
    } else {
      itemIconEl.textContent = itemIcons[heldItem] || ''
      itemSlotEl.style.display = 'flex'
    }
  }

  function showCountdown(text, isGo = false, isRocket = false) {
    countdownEl.textContent = text
    countdownEl.className = 'show'
    if (isGo) countdownEl.classList.add('go')
    if (isRocket) countdownEl.classList.add('rocket')
    setTimeout(() => {
      countdownEl.className = ''
    }, 150)
  }

  const cameraSmoothing = 0.08
  let cameraDriftTilt = 0

  // Boost particles (fire)
  const boostParticles = new BABYLON.ParticleSystem('boostPts', 120, scene)
  boostParticles.particleTexture = new BABYLON.Texture(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    scene
  )
  boostParticles.emitter = kart
  boostParticles.minEmitBox = new BABYLON.Vector3(-0.3, 0, -1.5)
  boostParticles.maxEmitBox = new BABYLON.Vector3(0.3, 0.3, -2)
  boostParticles.direction1 = new BABYLON.Vector3(-0.2, -0.5, 1)
  boostParticles.direction2 = new BABYLON.Vector3(0.2, 0, 1)
  boostParticles.minLifeTime = 0.3
  boostParticles.maxLifeTime = 0.8
  boostParticles.minSize = 0.05
  boostParticles.maxSize = 0.15
  boostParticles.color1 = new BABYLON.Color4(1, 0.4, 0, 1)
  boostParticles.color2 = new BABYLON.Color4(1, 0.7, 0, 1)
  boostParticles.emitRate = 0

  // Drift spark particles
  const driftParticles = new BABYLON.ParticleSystem('driftPts', 60, scene)
  driftParticles.particleTexture = new BABYLON.Texture(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    scene
  )
  driftParticles.emitter = kart
  driftParticles.minEmitBox = new BABYLON.Vector3(-0.8, 0, 1.0)
  driftParticles.maxEmitBox = new BABYLON.Vector3(0.8, 0.1, 1.3)
  driftParticles.direction1 = new BABYLON.Vector3(-0.5, -1, -0.5)
  driftParticles.direction2 = new BABYLON.Vector3(0.5, 0, 0.5)
  driftParticles.minLifeTime = 0.2
  driftParticles.maxLifeTime = 0.6
  driftParticles.minSize = 0.02
  driftParticles.maxSize = 0.08
  driftParticles.color1 = new BABYLON.Color4(1, 0.5, 0, 1)
  driftParticles.color2 = new BABYLON.Color4(1, 0.8, 0.2, 1)
  driftParticles.emitRate = 0

  // --- MAIN LOOP ---
  scene.registerBeforeRender(() => {
    const delta = Math.min(engine.getDeltaTime() / 1000, 0.05)

    const fwd = keys['arrowup'] || keys['w']
    const rev = keys['arrowdown'] || keys['s']
    const left = keys['arrowleft'] || keys['d']
    const right = keys['arrowright'] || keys['a']
    const boost = keys[' ']
    const drift = keys['shift']

    // === VISUALS (always run) ===
    wheels.forEach((w) => { w.rotation.z += speed * delta * 5 })
    qBlocks.forEach((box) => { box.rotation.y += delta * 1.5 })
    coins.forEach((c) => {
      c.mesh.position.y = c.baseY + Math.sin(raceTime * 2 + c.phase) * 0.4
      c.mesh.rotation.y += delta * 2
    })
    ringCoins.forEach((rc) => { rc.rotation.y += delta * 1.5 })
    // Lava pool animation
    lavaPool.position.y = -0.3 + Math.sin(raceTime * 0.5) * 0.05

    mouseLookX *= 0.92
    mouseLookY = Math.max(-4, Math.min(4, mouseLookY * 0.94))

    const camDist = 20
    const camHeight = 12 + mouseLookY
    const behind = BABYLON.Vector3.TransformNormal(
      new BABYLON.Vector3(mouseLookX * 1.5, 0, camDist), kart.getWorldMatrix()
    )
    const desiredPos = kart.position.add(behind).add(new BABYLON.Vector3(0, camHeight, 0))
    const lookTarget = kart.position.add(
      BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(mouseLookX * 0.8, 2, -12), kart.getWorldMatrix())
    )
    camera.position = BABYLON.Vector3.Lerp(camera.position, desiredPos, cameraSmoothing)
    camera.setTarget(lookTarget)
    if (Math.abs(cameraDriftTilt) > 0.01) {
      const rightVec = BABYLON.Vector3.TransformNormal(
        new BABYLON.Vector3(1, 0, 0), kart.getWorldMatrix()
      )
      camera.position.addInPlace(rightVec.scale(cameraDriftTilt * 1.5))
      camera.position.y -= Math.abs(cameraDriftTilt) * 0.5
    }

    // === COUNTDOWN PHASE ===
    if (raceState === RaceState.COUNTDOWN) {
      countdownTimer += delta
      const stepDuration = 0.8
      if (countdownTimer >= stepDuration) {
        countdownTimer -= stepDuration
        countdownStep++
        if (countdownStep === 1) showCountdown('2')
        else if (countdownStep === 2) showCountdown('1')
        else if (countdownStep === 3) {
          showCountdown('GO!', true)
          rocketStartReady = true
          rocketHintEl.style.display = 'none'
        } else if (countdownStep === 4) {
          raceState = RaceState.RACING
          countdownEl.className = ''
          if (rocketStartSuccess) {
            rocketBoostTimer = 2.0
            speed = maxSpeed * 0.7
            boostParticles.emitRate = 200
            showCountdown('ROCKET START!', false, true)
            setTimeout(() => { countdownEl.className = '' }, 400)
          }
        }
      }
      if (rocketStartReady && (fwd || rev)) {
        rocketStartSuccess = true
        rocketStartReady = false
      }
      return
    }

    if (raceState === RaceState.WAITING) {
      if (fwd || rev) beginCountdown()
      return
    }

    // === RACING / DRIVING PHYSICS ===
    if (raceState === RaceState.RACING) {
      raceTime += delta
    }

    if (rocketBoostTimer > 0) {
      rocketBoostTimer -= delta
      if (rocketBoostTimer <= 0) boostParticles.emitRate = 0
    }

    const canDrift = Math.abs(speed) > 15
    const isTurning = left || right

    if (drift && isTurning && canDrift && raceState === RaceState.RACING) {
      if (!driftActive) {
        driftActive = true
        driftCharge = 0
        driftDir = left ? 1 : -1
        driftParticles.emitRate = 80
      }
      driftCharge = Math.min(100, driftCharge + delta * 25)
      driftFillEl.style.width = driftCharge + '%'
      driftBarEl.style.display = 'block'
      driftLabelEl.style.display = 'block'
      const targetTilt = driftDir * (driftCharge / 100) * 0.15
      cameraDriftTilt += (targetTilt - cameraDriftTilt) * 0.1
    } else {
      if (driftActive) {
        if (driftCharge > 15) {
          const boostPower = 10 + driftCharge * 0.4
          speed += boostPower
          driftBoostTimer = 0.5
          boostParticles.emitRate = 150
          showCountdown(driftCharge > 60 ? '🔥 SUPER DRIFT!' : '💨 DRIFT BOOST!', false, true)
          setTimeout(() => { countdownEl.className = '' }, 300)
        }
        driftActive = false
        driftCharge = 0
        driftFillEl.style.width = '0%'
        driftParticles.emitRate = 0
        driftBarEl.style.display = 'none'
        driftLabelEl.style.display = 'none'
      }
      cameraDriftTilt *= 0.9
    }

    if (driftBoostTimer > 0) driftBoostTimer -= delta
    if (driftBoostTimer <= 0 && !driftActive) {
      boostParticles.emitRate = Math.max(0, boostParticles.emitRate - 5)
    }

    if (fwd) speed += accel * delta
    if (rev) speed -= brake * delta

    if (raceState === RaceState.RACING) {
      for (let ci = coins.length - 1; ci >= 0; ci--) {
        const c = coins[ci]
        const cDist = BABYLON.Vector3.Distance(kart.position, c.mesh.position)
        if (cDist < 2) {
          speed += 8
          coinTotal++
          c.mesh.dispose()
          coins.splice(ci, 1)
          boostParticles.emitRate = 100
          setTimeout(() => { if (!driftActive) boostParticles.emitRate = 0 }, 300)
        }
      }
    }

    if (raceState === RaceState.RACING) {
      const kx = kart.position.x, kz = kart.position.z
      const ku = nearestPathU(kx, kz)
      const cp = getPathPoint(ku)
      const dist = Math.sqrt((kx - cp.x) ** 2 + (kz - cp.z) ** 2)
      if (dist < roadW / 2 + 1) {
        boostPadTimer -= delta
        if (boostPadTimer <= 0) {
          const isNearBoost = boostPadU.some((bu) => {
            const diff = Math.abs(ku - bu)
            return diff < 0.015 || diff > 0.985
          })
          if (isNearBoost && Math.abs(speed) > 10) {
            speed += 20
            boostPadTimer = 0.3
            boostParticles.emitRate = 200
            setTimeout(() => { if (!driftActive) boostParticles.emitRate = 0 }, 200)
          }
        }
      } else {
        boostPadTimer = 0
      }
    }

    // Item box collision
    if (raceState === RaceState.RACING && heldItem === Item.NONE) {
      qBlocks.forEach((box, i) => {
        if (itemBoxTimers[i] > 0) return
        const bDist = BABYLON.Vector3.Distance(kart.position, box.position)
        if (bDist < 3) {
          const items = [Item.MUSHROOM, Item.GREEN_SHELL, Item.BANANA, Item.RED_SHELL, Item.MUSHROOM]
          heldItem = items[Math.floor(Math.random() * items.length)]
          itemBoxTimers[i] = 5
          box.setEnabled(false)
          updateItemDisplay()
          const qFace = scene.getMeshByName('qface' + i)
          if (qFace) qFace.setEnabled(false)
        }
      })
    }
    itemBoxTimers.forEach((t, i) => {
      if (t > 0) {
        itemBoxTimers[i] -= delta
        if (itemBoxTimers[i] <= 0) {
          qBlocks[i].setEnabled(true)
          const qFace = scene.getMeshByName('qface' + i)
          if (qFace) qFace.setEnabled(true)
        }
      }
    })

    // Item use
    const useItem = keys['e']
    if (useItem && !useItemPressed && heldItem !== Item.NONE && raceState === RaceState.RACING) {
      useItemPressed = true
      const item = heldItem
      heldItem = Item.NONE
      updateItemDisplay()
      if (item === Item.MUSHROOM) {
        mushroomBoost = 1.5
      } else if (item === Item.GREEN_SHELL) {
        const dir = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), kart.getWorldMatrix())
        const shell = {
          mesh: BABYLON.MeshBuilder.CreateSphere('shell' + projectiles.length, { diameter: 0.5 }, scene),
          pos: kart.position.clone(),
          dir: dir,
          speed: 50,
          life: 4,
        }
        shell.mesh.position = shell.pos.clone()
        shell.mesh.position.y = 0.5
        const sm = new BABYLON.StandardMaterial('sm' + projectiles.length, scene)
        sm.diffuseColor = new BABYLON.Color3(0, 0.9, 0.3)
        sm.emissiveColor = new BABYLON.Color3(0, 0.4, 0.1)
        shell.mesh.material = sm
        projectiles.push(shell)
      } else if (item === Item.BANANA) {
        const dir = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, -1), kart.getWorldMatrix())
        const banana = {
          mesh: BABYLON.MeshBuilder.CreateCylinder('ban' + bananas.length, {
            height: 0.3, diameterTop: 0.4, diameterBottom: 0.2,
          }, scene),
          pos: kart.position.clone(),
          active: true,
        }
        banana.mesh.position = banana.pos.clone()
        banana.mesh.position.y = 0.2
        banana.mesh.rotation.x = Math.PI / 2
        const bm = new BABYLON.StandardMaterial('bm' + bananas.length, scene)
        bm.diffuseColor = new BABYLON.Color3(1, 0.8, 0)
        banana.mesh.material = bm
        bananas.push(banana)
      } else if (item === Item.RED_SHELL) {
        const dir = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), kart.getWorldMatrix())
        const shell = {
          mesh: BABYLON.MeshBuilder.CreateSphere('rshell' + projectiles.length, { diameter: 0.5 }, scene),
          pos: kart.position.clone(),
          dir: dir,
          speed: 45,
          life: 5,
          homing: true,
        }
        shell.mesh.position = shell.pos.clone()
        shell.mesh.position.y = 0.5
        const sm = new BABYLON.StandardMaterial('rsm' + projectiles.length, scene)
        sm.diffuseColor = new BABYLON.Color3(0.9, 0.1, 0.1)
        sm.emissiveColor = new BABYLON.Color3(0.4, 0, 0)
        shell.mesh.material = sm
        projectiles.push(shell)
      }
    }
    if (!useItem) useItemPressed = false

    if (mushroomBoost > 0) {
      speed += 40 * delta
      mushroomBoost -= delta
      boostParticles.emitRate = 200
      if (mushroomBoost <= 0) boostParticles.emitRate = 0
    }

    for (let pi = projectiles.length - 1; pi >= 0; pi--) {
      const p = projectiles[pi]
      p.life -= delta
      if (p.life <= 0) {
        p.mesh.dispose()
        projectiles.splice(pi, 1)
        continue
      }
      p.pos.addInPlace(p.dir.scale(p.speed * delta))
      p.mesh.position = p.pos.clone()
      p.mesh.position.y = 0.5

      const shellDist = BABYLON.Vector3.Distance(p.pos, kart.position)
      if (p.homing && shellDist > 5) {
        const toKart = kart.position.subtract(p.pos).normalize()
        p.dir = BABYLON.Vector3.Lerp(p.dir, toKart, delta * 2).normalize()
        p.mesh.lookAt(kart.position)
      } else {
        p.mesh.rotation.x += delta * 5
      }

      if (shellDist < 2) {
        speed -= 15
        p.life = 0
      }
    }

    for (let bi = bananas.length - 1; bi >= 0; bi--) {
      const b = bananas[bi]
      if (!b.active) continue
      const bDist = BABYLON.Vector3.Distance(kart.position, b.pos)
      if (bDist < 1.5) {
        speed = Math.max(-10, speed - 25)
        b.active = false
        b.mesh.setEnabled(false)
        setTimeout(() => { b.mesh.dispose() }, 2000)
        bananas.splice(bi, 1)
      }
    }

    if (boost && speed > 5 && boostTimer <= 0 && raceState === RaceState.RACING) {
      speed = Math.min(speed * 1.8, maxSpeed * 1.6)
      boostTimer = 1.2
      boostParticles.emitRate = 200
    }
    if (boostTimer > 0) {
      boostTimer -= delta
      if (boostTimer <= 0 && !driftActive) boostParticles.emitRate = 0
    }

    if (!fwd && !rev) {
      if (speed > 0) speed = Math.max(0, speed - friction * delta)
      if (speed < 0) speed = Math.min(0, speed + friction * delta)
    }
    speed = Math.max(-maxSpeed / 2, Math.min(maxSpeed * 1.2, speed))

    if (Math.abs(speed) > 0.5) {
      const tf = 0.5 + 0.5 * (1 - Math.abs(speed) / maxSpeed)
      let steerAmount = turnSpd * delta * tf * Math.sign(speed || 0.001)
      if (driftActive) {
        steerAmount *= 1.3
        const slideVec = BABYLON.Vector3.TransformNormal(
          new BABYLON.Vector3(driftDir * Math.abs(speed) * 0.15 * delta, 0, 0),
          kart.getWorldMatrix()
        )
        kart.position.addInPlace(slideVec)
      }
      if (left) kart.rotation.y += steerAmount
      if (right) kart.rotation.y -= steerAmount
    }

    const fwdVec = new BABYLON.Vector3(
      -Math.sin(kart.rotation.y),
      0,
      -Math.cos(kart.rotation.y)
    )
    kart.position.addInPlace(fwdVec.scale(speed * delta))

    const kartU = nearestPathU(kart.position.x, kart.position.z)
    const kartPathP = getPathPoint(kartU)
    const kartTrackDist = Math.sqrt((kart.position.x - kartPathP.x) ** 2 + (kart.position.z - kartPathP.z) ** 2)
    const onTrack = kartTrackDist < roadW / 2 + 0.5
    kart.position.y = onTrack ? kartPathP.y + 0.3 : Math.max(0.1, kart.position.y - 1.0 * delta)

    if (kartTrackDist > roadW / 2 + 0.3) {
      const pushDir = new BABYLON.Vector3(kartPathP.x - kart.position.x, 0, kartPathP.z - kart.position.z).normalize()
      const overshoot = kartTrackDist - (roadW / 2 + 0.3)
      kart.position.addInPlace(pushDir.scale(overshoot))
      speed *= 0.97
    }

    if (!onTrack && raceState === RaceState.RACING && speed > 0) {
      speed -= 20 * delta
    }

    // === FINISH / LAP DETECTION ===
    const finishDist = BABYLON.Vector3.Distance(
      kart.position,
      new BABYLON.Vector3(finishP.x, 0, finishP.z)
    )
    const atFinish = finishDist < 10
    if (atFinish && !prevCheck && raceState === RaceState.RACING) {
      currentLap++
      if (currentLap > maxLaps) {
        const mins = Math.floor(raceTime / 60)
        const secs = Math.floor(raceTime % 60)
        alert(`Race Complete! Time: ${mins}:${secs.toString().padStart(2, '0')}`)
        raceTime = 0
        coinTotal = 0
        speed = 0
        currentLap = 1
        kart.position = new BABYLON.Vector3(startP0.x, startP0.y + 0.3, startP0.z)
        kart.rotation.y = Math.atan2(-startDx, -startDz)
        raceState = RaceState.WAITING
        driftActive = false
        driftParticles.emitRate = 0
        driftBarEl.style.display = 'none'
        driftLabelEl.style.display = 'none'
      } else {
        kart.position = new BABYLON.Vector3(startP0.x, startP0.y + 0.3, startP0.z)
        kart.rotation.y = Math.atan2(-startDx, -startDz)
      }
    }
    prevCheck = atFinish

    // === UI ===
    const displaySpeed = Math.round(Math.abs(speed) * 3.6)
    document.getElementById('speedValue').textContent = displaySpeed
    const pct = Math.min(100, (Math.abs(speed) / maxSpeed) * 100)
    document.getElementById('speedFill').style.width = pct + '%'
    const racePct = Math.round(kartU * 100)
    const lapText = raceState === RaceState.RACING ? `Lap ${currentLap}/${maxLaps}` : racePct + '%'
    document.getElementById('lapCount').textContent = lapText
    document.getElementById('coinCount').textContent = coinTotal
    const mins = Math.floor(raceTime / 60)
    const secs = Math.floor(raceTime % 60)
    document.getElementById('raceTime').textContent = `${mins}:${secs.toString().padStart(2, '0')}`
  })

  beginCountdown()

  // Auto-load GLB models from folder
  ;['kart.glb', 'mario_circuit.glb', 'track.glb'].forEach((filename) => {
    loadGLB(filename, (meshes) => {
      if (filename === 'kart.glb') {
        const root = meshes[0]
        root.position = new BABYLON.Vector3(startP0.x, startP0.y + 0.3, startP0.z)
        root.rotation.y = Math.atan2(-startDx, -startDz)
        root.parent = kart
        body.setEnabled(false)
        hood.setEnabled(false)
        windshield.setEnabled(false)
        spoiler.setEnabled(false)
        wheels.forEach((w) => w.setEnabled(false))
      }
      console.log('Loaded: ' + filename)
    })
  })

  engine.runRenderLoop(() => scene.render())
  window.addEventListener('resize', () => engine.resize())
})
