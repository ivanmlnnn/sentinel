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
  const gold = new THREE.MeshPhysicalMaterial({color:0xe3bd63,metalness:.78,roughness:.27,clearcoat:.8});
  const paleGold = new THREE.MeshStandardMaterial({color:0xffe6a0,metalness:.72,roughness:.3});
  const teal = new THREE.MeshStandardMaterial({color:0x17616a,metalness:.5,roughness:.32});
  const dark = new THREE.MeshStandardMaterial({color:0x092b32,metalness:.35,roughness:.36});
  const skin = new THREE.MeshPhysicalMaterial({color:0xe6a96d,metalness:.12,roughness:.42,clearcoat:.25});
  const cyan = new THREE.MeshPhysicalMaterial({color:0x65c9ef,metalness:.42,roughness:.24,clearcoat:.9});

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

  // Circular presentation medallion remains behind the character; the puppet itself is fully volumetric.
  const medallion=new THREE.Mesh(new THREE.CylinderGeometry(2.32,2.32,.16,96),dark);
  medallion.rotation.x=Math.PI/2;medallion.position.z=-.55;puppet.add(medallion);
  const rimRing=new THREE.Mesh(new THREE.TorusGeometry(2.28,.035,12,100),gold);rimRing.position.z=-.43;puppet.add(rimRing);

  // Swept wing: a thick, bevelled silhouette with individual feather blades and gold quills.
  const wingPivot=new THREE.Group();wingPivot.position.set(.42,.28,.05);puppet.add(wingPivot);
  const wing=shapeMesh([[0,0],[.25,.55],[.58,1.12],[1.03,1.53],[1.55,1.65],[1.82,1.39],[1.67,.95],[1.43,.48],[1.14,.05],[.76,-.28],[.36,-.2]],cyan,.22,.055);
  wingPivot.add(wing);
  for(let i=0;i<7;i++){
    const x=.28+i*.19, y=.18+i*.18;
    const feather=shapeMesh([[x,y],[x+.17,y+.34],[x+.38,y+.67],[x+.31,y+.25],[x+.12,y-.04]],i%2?teal:gold,.12,.025);
    feather.position.z=.25;wingPivot.add(feather);
    tube([[x+.12,y,.4],[x+.25,y+.25,.4],[x+.34,y+.52,.4]],.018,paleGold,wingPivot);
  }

  // Body and shoulder armor.
  const torso=shapeMesh([[-.68,-1.65],[-.82,-.95],[-.58,-.52],[-.2,-.34],[.32,-.43],[.62,-.86],[.55,-1.65]],teal,.32,.08);
  torso.position.z=.12;puppet.add(torso);
  const chest=shapeMesh([[-.35,-.65],[-.42,-1.35],[0,-1.56],[.38,-1.3],[.3,-.65],[0,-.48]],gold,.15,.035);chest.position.z=.48;puppet.add(chest);
  sphere(-.45,-.56,.5,.34,.24,.2,gold);
  sphere(.45,-.56,.5,.34,.24,.2,gold);

  // Head in three dimensions, with a distinct side-profile nose and jaw.
  const head=sphere(-.05,.34,.42,.56,.69,.43,skin);
  const faceProfile=shapeMesh([[-.42,.64],[-.12,.47],[.22,.37],[.62,.30],[.34,.18],[.31,-.02],[.12,-.24],[-.28,-.18],[-.48,.12],[-.43,.58],[-.12,.9]],skin,.18,.035);
  faceProfile.position.z=.48;puppet.add(faceProfile);
  sphere(.30,.48,.69,.10,.055,.035,dark);
  tube([[.02,.25,.72],[.22,.19,.73],[.39,.24,.72]],.018,dark);
  sphere(.25,-.02,.69,.055,.04,.035,gold);

  // Tall, layered Javanese crown with pointed ornaments.
  const crown=shapeMesh([[-.57,.75],[-.7,1.15],[-.42,1.03],[-.34,1.52],[-.08,1.18],[.18,1.62],[.32,1.16],[.62,1.32],[.48,.78],[.2,.68],[-.24,.68]],gold,.24,.045);
  crown.position.z=.62;puppet.add(crown);
  for(const [x,y,r] of [[-.36,1.05,.12],[-.08,1.26,.14],[.22,1.18,.12],[.39,.94,.1]]){
    sphere(x,y,.93,r,r, .07,paleGold);
  }
  tube([[-.44,.82,.91],[-.18,.91,.98],[.12,.9,.98],[.39,.82,.9]],.025,paleGold);
  // Large swept golden feather crest, matching the logo silhouette.
  const crest=shapeMesh([[-.62,1.24],[-.94,1.55],[-.78,1.94],[-.48,2.12],[-.12,2.02],[.04,1.78],[-.18,1.55],[-.43,1.42]],paleGold,.18,.045);
  crest.position.set(-.05,0,.72);puppet.add(crest);
  for(let i=0;i<4;i++) tube([[-.72+i*.12,1.55+i*.035,.94],[-.48+i*.09,1.77+i*.045,.96],[-.22+i*.07,1.92-i*.025,.94]],.014,gold);

  const ear=sphere(.45,.34,.62,.16,.2,.12,gold);
  sphere(.46,.34,.76,.055,.08,.04,teal);

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
