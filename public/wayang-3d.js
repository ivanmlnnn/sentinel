import * as THREE from 'https://esm.sh/three@0.180.0';

export function mountWayang3D(host) {
  if (!host || host.dataset.wayang3dMounted === '1') return () => {};
  host.dataset.wayang3dMounted = '1';
  host.classList.add('wayang-3d-host');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 100);
  camera.position.set(0, 0, 10.4);
  const renderer = new THREE.WebGLRenderer({ alpha:true, antialias:true, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.domElement.className = 'wayang-3d-canvas';
  renderer.domElement.setAttribute('aria-label','Drag to rotate the three-dimensional wayang character');
  host.replaceChildren(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff,1.25));
  const key = new THREE.DirectionalLight(0xffe6ad,3.1); key.position.set(-3,5,7); scene.add(key);
  const rim = new THREE.PointLight(0x63c9ef,2.8,18); rim.position.set(4,1,-4); scene.add(rim);
  const fill = new THREE.PointLight(0xe8df78,1.9,15); fill.position.set(-4,-3,5); scene.add(fill);

  const puppet = new THREE.Group(); scene.add(puppet);
  const gold = new THREE.MeshPhysicalMaterial({color:0xd9a83e,metalness:.82,roughness:.24,clearcoat:1});
  const paleGold = new THREE.MeshStandardMaterial({color:0xf2d65d,metalness:.62,roughness:.34});
  const teal = new THREE.MeshStandardMaterial({color:0x101b20,metalness:.58,roughness:.3});
  const dark = new THREE.MeshStandardMaterial({color:0x080f14,metalness:.62,roughness:.28});
  const skin = new THREE.MeshPhysicalMaterial({color:0xe6a96d,metalness:.12,roughness:.42,clearcoat:.25});
  const cyan = new THREE.MeshPhysicalMaterial({color:0x83d4ff,metalness:.22,roughness:.2,clearcoat:1});

  function shapeMesh(points, material, depth=.16, bevel=.045) {
    const s = new THREE.Shape();
    s.moveTo(points[0][0],points[0][1]);
    for(let i=1;i<points.length;i++) s.lineTo(points[i][0],points[i][1]);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:bevel,bevelThickness:bevel,curveSegments:12});
    const mesh = new THREE.Mesh(geo,material); return mesh;
  }
  function sphere(x,y,z,sx,sy,sz,material,parent=puppet) {
    const m=new THREE.Mesh(new THREE.SphereGeometry(1,32,24),material);
    m.position.set(x,y,z);m.scale.set(sx,sy,sz);parent.add(m);return m;
  }
  function tube(points,r,material,parent=puppet) {
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    const m=new THREE.Mesh(new THREE.TubeGeometry(curve,36,r,8,false),material);parent.add(m);return m;
  }

  // No circular badge: preserve the tall, narrow silhouette of the reference character.

  // One oversized, swept sky-blue wing, outlined in dark ink like the GitHub logo.
  const wingPivot=new THREE.Group();wingPivot.position.set(.42,.28,.05);puppet.add(wingPivot);
  const wingPoints=[[0,-.05],[.28,.42],[.62,.91],[1.02,1.36],[1.52,1.67],[1.98,1.68],[2.12,1.43],[1.98,1.08],[1.78,.62],[1.55,.12],[1.25,-.28],[.88,-.48],[.46,-.34]];
  const wingOutline=shapeMesh(wingPoints,dark,.27,.075);wingOutline.position.z=-.035;wingPivot.add(wingOutline);
  const wing=shapeMesh(wingPoints,cyan,.22,.055);wing.position.z=.04;wingPivot.add(wing);
  tube([[.43,.28,.34],[.78,.64,.35],[1.12,1.05,.35],[1.47,1.4,.34]],.045,dark,wingPivot);
  tube([[.75,.16,.36],[1.04,.43,.36],[1.31,.76,.36],[1.48,1.02,.36]],.025,dark,wingPivot);
  const wingMark=shapeMesh([[.55,.48],[.78,.59],[.98,.52],[.82,.39],[.64,.37]],paleGold,.07,.018);wingMark.position.z=.38;wingPivot.add(wingMark);

  // Body and shoulder armor.
  const torso=shapeMesh([[-.48,-2.02],[-.62,-1.48],[-.43,-.92],[-.28,-.48],[.27,-.48],[.48,-.92],[.62,-1.48],[.43,-2.02],[.16,-2.16],[-.16,-2.16]],teal,.32,.055);
  torso.position.z=.12;puppet.add(torso);
  const chest=shapeMesh([[-.25,-.58],[-.34,-1.16],[0,-1.42],[.34,-1.16],[.25,-.58],[0,-.42]],dark,.15,.025);chest.position.z=.48;puppet.add(chest);
  // Dense gold filigree, central pendant and repeated costume motifs echo the source illustration.
  tube([[-.28,-.55,.72],[0,-.72,.76],[.28,-.55,.72]],.035,gold);
  tube([[-.25,-.82,.72],[0,-1.05,.76],[.25,-.82,.72]],.027,paleGold);
  tube([[0,-.52,.78],[0,-1.58,.79]],.025,gold);
  for(let row=0;row<5;row++) for(let col=0;col<3;col++){
    const x=(col-1)*.16, y=-.78-row*.22;
    const motif=shapeMesh([[x,y+.07],[x+.055,y],[x,y-.08],[x-.055,y]],row%2?gold:paleGold,.035,.008);
    motif.position.z=.83;puppet.add(motif);
  }
  const pendant=sphere(0,-.64,.91,.12,.17,.07,gold); pendant.rotation.z=.2;
  sphere(-.45,-.56,.5,.34,.24,.2,gold);
  sphere(.45,-.56,.5,.34,.24,.2,gold);

  // Mechanical wayang head in a right-facing profile, with a long muzzle and open red mouth.
  const silver=new THREE.MeshPhysicalMaterial({color:0xb9c9cf,metalness:.82,roughness:.24,clearcoat:.9});
  const steel=new THREE.MeshStandardMaterial({color:0x536b76,metalness:.8,roughness:.28});
  const red=new THREE.MeshStandardMaterial({color:0x9d2634,metalness:.28,roughness:.32});
  sphere(-.08,.35,.42,.54,.62,.42,steel);
  const faceProfile=shapeMesh([[-.43,.63],[-.22,.79],[.12,.68],[.43,.52],[.82,.42],[.99,.28],[.77,.18],[.52,.2],[.42,-.02],[.12,-.22],[-.3,-.16],[-.48,.15]],silver,.2,.04);
  faceProfile.position.z=.48;puppet.add(faceProfile);
  // Jaw, red mouth opening and small metallic teeth.
  const jaw=shapeMesh([[.37,.12],[.91,.22],[.8,.02],[.48,-.08]],steel,.15,.025);jaw.position.z=.72;puppet.add(jaw);
  const mouth=shapeMesh([[.55,.19],[.88,.25],[.76,.16],[.57,.12]],red,.06,.012);mouth.position.z=.9;puppet.add(mouth);
  for(let i=0;i<3;i++) sphere(.61+i*.075,.235,.98,.025,.035,.018,paleGold);
  sphere(.47,.49,.91,.085,.045,.035,dark);
  tube([[.34,.34,.91],[.58,.31,.94],[.79,.34,.93]],.018,dark);
  // Circular temple hardware and layered ear mechanisms.
  const temple=sphere(-.23,.43,.78,.24,.23,.12,gold);
  const templeCore=sphere(-.23,.43,.91,.12,.12,.06,steel);
  sphere(-.23,.43,.97,.045,.045,.025,cyan);
  tube([[-.48,.52,.82],[-.25,.7,.86],[.05,.72,.84],[.29,.61,.84]],.035,gold);
  // Oversized yellow chef toque, tilted back-left exactly like the reference silhouette.
  const hatGroup=new THREE.Group();hatGroup.position.set(-.56,1.13,.73);hatGroup.rotation.z=.28;puppet.add(hatGroup);
  const hatBand=new THREE.Mesh(new THREE.CylinderGeometry(.39,.47,.22,48,1,false),gold);
  hatBand.scale.set(1.25,1,.72);hatBand.rotation.z=-.08;hatGroup.add(hatBand);
  const hatPuffs=[[-.43,.16,0,.43,.37,.29],[-.25,.39,0,.43,.48,.31],[.06,.49,0,.43,.53,.32],[.38,.38,0,.4,.47,.31],[.53,.14,0,.31,.34,.27]];
  for(const [x,y,z,sx,sy,sz] of hatPuffs) sphere(x,y,z,sx,sy,sz,paleGold,hatGroup);
  // Curved dark-gold stitched seams and pleats on the chef fabric.
  for(let i=0;i<6;i++){
    const x=-.55+i*.2;
    tube([[x,-.02,.23],[x-.08,.2,.27],[x-.03,.43,.24],[x+.05,.66,.16]],.014,gold,hatGroup);
  }
  tube([[-.55,.13,.24],[-.24,.06,.3],[.08,.07,.3],[.42,.13,.24]],.025,gold,hatGroup);
  // Small ornamental forehead plate keeps the Javanese wayang identity.
  const brow=shapeMesh([[-.34,.73],[-.23,.92],[-.08,.78],[.08,.88],[.22,.69],[0,.63]],gold,.12,.025);brow.position.z=.94;puppet.add(brow);
  sphere(.32,.29,.82,.11,.07,.07,gold);
  // Neck ornaments and articulated arm/hand shapes.
  tube([[-.28,-.38,.56],[-.08,-.5,.7],[.2,-.42,.56]],.045,paleGold);
  tube([[-.55,-.78,.54],[-.88,-1.03,.4],[-1.02,-1.34,.35]],.105,gold);
  sphere(-1.02,-1.36,.36,.14,.18,.13,skin);
  tube([[.53,-.8,.52],[.85,-1.04,.38],[.95,-1.33,.34]],.105,gold);
  sphere(.95,-1.35,.36,.14,.18,.13,skin);

  // Shoulder tassels and layered costume details.
  for(let i=0;i<5;i++){
    tube([[-.58+i*.18,-1.05,.62],[-.56+i*.18,-1.42,.68],[-.48+i*.18,-1.7,.62]],.022,i%2?gold:paleGold);
  }
  const jewel=sphere(-.02,.02,.99,.12,.16,.07,cyan);jewel.rotation.z=.4;
  for(let i=0;i<3;i++){
    const bead=sphere(-.22+i*.22,-.84,.76,.045,.045,.045,paleGold);
  }

  // Side ornaments and rear silhouette add depth visible during a full turn.
  const back=shapeMesh([[-.55,.48],[-.72,.2],[-.54,-.18],[-.35,-.38],[.24,-.3],[.5,.12],[.32,.46]],dark,.22,.05);
  back.position.z=-.26;puppet.add(back);
  for(let i=0;i<5;i++) sphere(-.55+i*.25,-1.7,.2,.07,.12,.08,gold);

  let down=false,lastX=0,lastY=0,lastAt=0,vx=0,vy=0,frame=0,disposed=false;
  const canvas=renderer.domElement;
  const onDown=e=>{down=true;lastX=e.clientX;lastY=e.clientY;lastAt=performance.now();vx=vy=0;canvas.setPointerCapture?.(e.pointerId);canvas.classList.add('is-grabbing');};
  const onMove=e=>{if(!down)return;const dx=e.clientX-lastX,dy=e.clientY-lastY,dt=Math.max(8,performance.now()-lastAt);puppet.rotation.y+=dx*.009;puppet.rotation.x=THREE.MathUtils.clamp(puppet.rotation.x+dy*.008,-Math.PI*.48,Math.PI*.48);vx=dx/dt;vy=dy/dt;lastX=e.clientX;lastY=e.clientY;lastAt=performance.now();};
  const onUp=()=>{down=false;canvas.classList.remove('is-grabbing');};
  canvas.addEventListener('pointerdown',onDown);canvas.addEventListener('pointermove',onMove);
  canvas.addEventListener('pointerup',onUp);canvas.addEventListener('pointercancel',onUp);canvas.addEventListener('lostpointercapture',onUp);
  const resize=()=>{const r=host.getBoundingClientRect(),size=Math.max(180,Math.min(r.width||220,r.height||220,340));renderer.setSize(size,size,false);camera.aspect=1;camera.updateProjectionMatrix();};
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  const animate=now=>{
    if(disposed)return;frame=requestAnimationFrame(animate);
    const dt=Math.min(.04,(now-(animate.last||now))/1000);animate.last=now;
    if(!down){puppet.rotation.y+=.17*dt+vx*dt*18;puppet.rotation.x=THREE.MathUtils.clamp(puppet.rotation.x+vy*dt*18,-Math.PI*.48,Math.PI*.48);vx*=.94;vy*=.94;}
    wingPivot.rotation.z=Math.sin(now*.00125)*.055;
    renderer.render(scene,camera);
  };
  frame=requestAnimationFrame(animate);
  return ()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();canvas.removeEventListener('pointerdown',onDown);canvas.removeEventListener('pointermove',onMove);canvas.removeEventListener('pointerup',onUp);canvas.removeEventListener('pointercancel',onUp);canvas.removeEventListener('lostpointercapture',onUp);renderer.dispose();scene.traverse(o=>{o.geometry?.dispose?.();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose?.();});host.dataset.wayang3dMounted='0';};
}
