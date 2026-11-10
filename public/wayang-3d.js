import * as THREE from 'https://esm.sh/three@0.180.0';

export function mountWayang3D(button) {
  if (!button || button.dataset.wayang3dMounted === '1') return () => {};
  const source = button.querySelector('img');
  if (!source) return () => {};
  button.dataset.wayang3dMounted = '1';
  button.classList.add('wayang-3d-host');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0, 10.8);
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.domElement.className = 'wayang-3d-canvas';
  renderer.setAttribute?.('aria-label', 'Interactive three-dimensional Sentinel wayang');
  button.replaceChildren(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 1.7));
  const keyLight = new THREE.DirectionalLight(0xffe8ae, 3.2);
  keyLight.position.set(-3, 5, 7); scene.add(keyLight);
  const rimLight = new THREE.PointLight(0x64c9ef, 2.6, 16);
  rimLight.position.set(4, 1, -3); scene.add(rimLight);
  const fillLight = new THREE.PointLight(0xe8df78, 1.8, 12);
  fillLight.position.set(-4, -3, 4); scene.add(fillLight);

  const object = new THREE.Group();
  scene.add(object);
  const pivot = new THREE.Group();
  object.add(pivot);
  const materialGold = new THREE.MeshStandardMaterial({ color: 0xc4a85b, metalness: .82, roughness: .28 });
  const backing = new THREE.Mesh(new THREE.BoxGeometry(4.35, 4.35, .18, 1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x123b3d, metalness: .72, roughness: .34 }));
  backing.position.z = -.14;
  object.add(backing);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(4.42, 4.42, .12), materialGold);
  rim.position.z = -.24; object.add(rim);
  const face = new THREE.Mesh(new THREE.BoxGeometry(4.34, 4.34, .08), new THREE.MeshStandardMaterial({ color: 0x123b3d, metalness: .55, roughness: .4 }));
  face.position.z = -.04; object.add(face);

  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || 640; canvas.height = image.naturalHeight || 640;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const w = canvas.width, h = canvas.height;
    const pixels = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const r = pixels.data[i], g = pixels.data[i + 1], b = pixels.data[i + 2];
      if (g > r * 1.12 && g > b * 1.04 && g - r > 13 && g > 38 && r < 75) pixels.data[i + 3] = 0;
    }
    ctx.putImageData(pixels, 0, 0);
    // Remove the original wing from the artwork; it is rebuilt as a separate articulated 3D part.
    ctx.save(); ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    [[365,246],[405,218],[458,191],[508,151],[562,157],[596,177],[582,225],[560,282],[532,333],[490,378],[455,391],[421,361],[395,319]].forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
    ctx.closePath(); ctx.fill(); ctx.restore();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const portrait = new THREE.Mesh(new THREE.PlaneGeometry(4.55, 4.55), new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: .52, metalness: .12, side: THREE.DoubleSide, alphaTest: .025 }));
    portrait.position.z = .13; pivot.add(portrait);
    source.remove();

    // Sculpted, bevelled wing, hinged independently from the wayang body.
    const wingPivot = new THREE.Group();
    wingPivot.position.set(.56, .49, .2);
    pivot.add(wingPivot);
    const wingShape = new THREE.Shape();
    wingShape.moveTo(-.02, -.05);
    wingShape.bezierCurveTo(.30, .22, .76, .82, 1.28, .91);
    wingShape.bezierCurveTo(1.57, .95, 1.70, .78, 1.62, .49);
    wingShape.bezierCurveTo(1.53, .14, 1.36, -.32, 1.02, -.66);
    wingShape.bezierCurveTo(.72, -.96, .38, -.92, .08, -.55);
    wingShape.bezierCurveTo(-.10, -.34, -.15, -.17, -.02, -.05);
    const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: .075, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .035, bevelThickness: .035, curveSegments: 14 });
    const wing = new THREE.Mesh(wingGeo, new THREE.MeshPhysicalMaterial({ color: 0x73c7f4, metalness: .35, roughness: .24, clearcoat: .85, clearcoatRoughness: .2, side: THREE.DoubleSide }));
    wing.position.z = .08; wingPivot.add(wing);
    const outline = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-.02,-.05,.17),new THREE.Vector3(.35,.37,.17),new THREE.Vector3(.83,.78,.17),new THREE.Vector3(1.28,.91,.17),new THREE.Vector3(1.62,.49,.17),new THREE.Vector3(1.02,-.66,.17),new THREE.Vector3(.38,-.92,.17),new THREE.Vector3(-.02,-.05,.17)
    ]), new THREE.LineBasicMaterial({ color: 0x122d35, transparent: true, opacity: .9 }));
    wingPivot.add(outline);
    for (let n=0;n<4;n++) {
      const vein = new THREE.Mesh(new THREE.CylinderGeometry(.012,.018,.92-n*.09,7), new THREE.MeshStandardMaterial({ color: n===1?0xe8df78:0x2a5364, metalness:.5, roughness:.35 }));
      vein.position.set(.66+n*.13,.02-n*.12,.19); vein.rotation.z = -.68; wingPivot.add(vein);
    }
    wingPivot.userData.flap = true;
    object.userData.wingPivot = wingPivot;
  };
  image.src = source.currentSrc || source.src;

  let down = false, lastX = 0, lastY = 0, velocityX = 0, velocityY = 0, lastTime = 0, frame = 0, disposed = false;
  const onDown = (e) => { down = true; lastX=e.clientX; lastY=e.clientY; lastTime=performance.now(); velocityX=velocityY=0; renderer.domElement.setPointerCapture?.(e.pointerId); renderer.domElement.classList.add('is-grabbing'); };
  const onMove = (e) => { if(!down)return; const dx=e.clientX-lastX,dy=e.clientY-lastY,now=performance.now(),dt=Math.max(8,now-lastTime); object.rotation.y += dx*.009; object.rotation.x = THREE.MathUtils.clamp(object.rotation.x+dy*.009,-Math.PI*1.45,Math.PI*1.45); velocityX=dx/dt; velocityY=dy/dt; lastX=e.clientX;lastY=e.clientY;lastTime=now; };
  const onUp = () => { down=false; renderer.domElement.classList.remove('is-grabbing'); };
  renderer.domElement.addEventListener('pointerdown',onDown);
  renderer.domElement.addEventListener('pointermove',onMove);
  renderer.domElement.addEventListener('pointerup',onUp);
  renderer.domElement.addEventListener('pointercancel',onUp);
  renderer.domElement.addEventListener('lostpointercapture',onUp);
  renderer.domElement.addEventListener('wheel',(e)=>{e.preventDefault();camera.position.z=THREE.MathUtils.clamp(camera.position.z+e.deltaY*.006,7.2,14);},{passive:false});
  const resize = () => { const rect=button.getBoundingClientRect(); const size=Math.max(180,Math.min(rect.width||260,rect.height||260,340)); renderer.setSize(size,size,false); camera.aspect=1; camera.updateProjectionMatrix(); };
  const observer = new ResizeObserver(resize); observer.observe(button); resize();
  const animate = (now) => {
    if(disposed)return;
    frame=requestAnimationFrame(animate);
    const dt=Math.min(.04,(now-(animate.last||now))/1000); animate.last=now;
    if(!down){ object.rotation.y += .13*dt + velocityX*dt*18; object.rotation.x += velocityY*dt*18; velocityX*=.94; velocityY*=.94; }
    const wingPivot=object.userData.wingPivot;
    if(wingPivot) wingPivot.rotation.z = Math.sin(now*.0015)*.075 + Math.sin(now*.0008)*.025;
    renderer.render(scene,camera);
  };
  frame=requestAnimationFrame(animate);
  return () => { disposed=true; cancelAnimationFrame(frame); observer.disconnect(); renderer.dispose(); scene.traverse(o=>{o.geometry?.dispose?.(); if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose?.();}); button.dataset.wayang3dMounted='0'; };
}
