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
  const wingShape=new THREE.Shape();
  wingShape.moveTo(-.02,-.08);
  wingShape.bezierCurveTo(.28,.52,.67,1.2,1.23,1.58);
  wingShape.bezierCurveTo(1.62,1.88,2.08,1.86,2.22,1.56);
  wingShape.bezierCurveTo(2.34,1.28,2.12,.94,1.98,.62);
  wingShape.bezierCurveTo(1.78,.16,1.53,-.32,1.18,-.55);
  wingShape.bezierCurveTo(.77,-.72,.27,-.44,-.02,-.08);
  const wingGeometry=new THREE.ExtrudeGeometry(wingShape,{depth:.24,bevelEnabled:true,bevelSegments:5,steps:1,bevelSize:.065,bevelThickness:.065,curveSegments:28});
  const wingOutline=new THREE.Mesh(wingGeometry,dark);wingOutline.position.z=-.035;wingPivot.add(wingOutline);
  const innerWingGeo=new THREE.ExtrudeGeometry(wingShape,{depth:.19,bevelEnabled:true,bevelSegments:4,steps:1,bevelSize:.035,bevelThickness:.035,curveSegments:28});
  const wing=new THREE.Mesh(innerWingGeo,cyan);wing.position.set(0,0,.07);wingPivot.add(wing);
  tube([[.05,-.02,.34],[.48,.42,.36],[.94,.98,.37],[1.42,1.42,.36],[1.88,1.63,.34]],.052,dark,wingPivot);
  tube([[.58,.2,.37],[.96,.45,.38],[1.35,.77,.38],[1.72,1.15,.37]],.025,dark,wingPivot);
  const wingMark=shapeMesh([[.9,.5],[1.13,.62],[1.42,.56],[1.2,.4],[.99,.39]],paleGold,.07,.018);wingMark.position.z=.4;wingPivot.add(wingMark);

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
  // Long tapered batik/wayang lower costume, with layered gold lattice down to the hem.
  const skirt=shapeMesh([[-.36,-1.28],[.36,-1.28],[.53,-2.42],[.28,-2.58],[0,-2.48],[-.28,-2.58],[-.53,-2.42]],dark,.3,.045);
  skirt.position.z=.28;puppet.add(skirt);
  const skirtEdge=shapeMesh([[-.53,-2.36],[-.28,-2.48],[0,-2.4],[.28,-2.48],[.53,-2.36],[.48,-2.53],[.25,-2.65],[0,-2.57],[-.25,-2.65],[-.48,-2.53]],gold,.09,.018);
  skirtEdge.position.z=.62;puppet.add(skirtEdge);
  for(let row=0;row<7;row++){
    const y=-1.42-row*.15, width=.23+row*.035;
    tube([[-width,y,.65],[0,y-.09,.68],[width,y,.65]],.018,row%2?gold:paleGold);
    for(let col=-1;col<=1;col++){
      const x=col*width*.48;
      const diamond=shapeMesh([[x,y+.055],[x+.045,y],[x,y-.055],[x-.045,y]],row%2?paleGold:gold,.025,.004);
      diamond.position.z=.69;puppet.add(diamond);
    }
  }

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
  // Layered circular mechanical head cage and riveted temple plates from the reference helmet.
  const helmetArc=new THREE.Mesh(new THREE.TorusGeometry(.58,.055,12,64,Math.PI*1.22),steel);
  helmetArc.position.set(-.08,.45,.39);helmetArc.rotation.z=.22;puppet.add(helmetArc);
  const helmetArc2=new THREE.Mesh(new THREE.TorusGeometry(.49,.025,10,64,Math.PI*1.18),gold);
  helmetArc2.position.set(-.08,.46,.47);helmetArc2.rotation.z=.22;puppet.add(helmetArc2);
  for(let i=0;i<8;i++){
    const ang=Math.PI*.12+i*Math.PI*.105;
    sphere(-.08+Math.cos(ang)*.57,.45+Math.sin(ang)*.57,.51,.035,.035,.03,jointMat);
  }
  const cheekPlate=shapeMesh([[-.4,.2],[-.28,.02],[.04,-.04],[.22,.12],[.12,.28],[-.2,.34]],gold,.09,.018);
  cheekPlate.position.z=.86;puppet.add(cheekPlate);
  for(let i=0;i<4;i++) sphere(-.28+i*.12,.16,.98,.025,.025,.02,paleGold);
  // Flat folded chef cap silhouette from the reference: angular cloth, not a puffed/bubble dome.
  const hatGroup=new THREE.Group();hatGroup.position.set(-.59,1.16,.73);hatGroup.rotation.z=.22;puppet.add(hatGroup);
  const hatCloth=new THREE.MeshStandardMaterial({color:0xe6cf57,metalness:.04,roughness:.88,side:THREE.DoubleSide});
  const hatLight=new THREE.MeshStandardMaterial({color:0xf2df79,metalness:.02,roughness:.9});
  const hatFold=new THREE.MeshStandardMaterial({color:0xb99c3e,metalness:.08,roughness:.85});
  // A single shallow extruded cloth panel with the slanted, folded outline of the actual toque.
  const cap=new THREE.Shape();
  cap.moveTo(-.62,-.03);
  cap.lineTo(-.72,.17);cap.lineTo(-.55,.28);cap.lineTo(-.48,.53);
  cap.lineTo(-.22,.72);cap.lineTo(-.02,.62);cap.lineTo(.12,.76);
  cap.lineTo(.38,.61);cap.lineTo(.49,.37);cap.lineTo(.42,.15);
  cap.lineTo(.53,-.04);cap.lineTo(-.62,-.03);
  const capGeo=new THREE.ExtrudeGeometry(cap,{depth:.055,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.012,bevelThickness:.012,curveSegments:2});
  const capMesh=new THREE.Mesh(capGeo,hatCloth);capMesh.scale.set(1.08,1.0,.8);hatGroup.add(capMesh);
  // Folded cloth panels are narrow raised planes, with crisp seams instead of inflated volume.
  const panel1=shapeMesh([[-.53,.12],[-.43,.43],[-.2,.63],[-.08,.58],[-.28,.36],[-.35,.12]],hatLight,.012,.003);
  panel1.position.z=.075;hatGroup.add(panel1);
  const panel2=shapeMesh([[-.12,.08],[.02,.57],[.12,.67],[.23,.55],[.13,.32],[.12,.08]],hatLight,.012,.003);
  panel2.position.z=.078;hatGroup.add(panel2);
  const panel3=shapeMesh([[.18,.08],[.35,.5],[.43,.37],[.35,.13]],hatFold,.01,.002);
  panel3.position.z=.08;hatGroup.add(panel3);
  // Gathered narrow lower cuff; a clearly defined band, not a round brim.
  const cuff=shapeMesh([[-.62,-.08],[-.56,.06],[-.3,.02],[-.02,.04],[.27,.02],[.51,.06],[.57,-.09],[.35,-.17],[-.35,-.17]],gold,.075,.012);
  cuff.position.z=.09;hatGroup.add(cuff);
  tube([[-.53,-.12,.18],[-.25,-.14,.19],[.05,-.14,.19],[.4,-.12,.18]],.009,hatFold,hatGroup);
  // Small ornamental forehead plate keeps the Javanese wayang identity.
  const brow=shapeMesh([[-.34,.73],[-.23,.92],[-.08,.78],[.08,.88],[.22,.69],[0,.63]],gold,.12,.025);brow.position.z=.94;puppet.add(brow);
  sphere(.32,.29,.82,.11,.07,.07,gold);
  // Neck ornaments and articulated arm/hand shapes.
  tube([[-.28,-.38,.56],[-.08,-.5,.7],[.2,-.42,.56]],.045,paleGold);
  // Segmented mechanical arms: black carbon links, circular silver pivots and plated forearms.
  const jointMat=new THREE.MeshPhysicalMaterial({color:0x899ba3,metalness:.9,roughness:.2});
  const armPlate=new THREE.MeshStandardMaterial({color:0x202a30,metalness:.72,roughness:.3});
  function linkBetween(a,b,r1,r2,material,parent=puppet){
    const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),d=new THREE.Vector3().subVectors(vb,va);
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r2,r1,d.length(),20,1),material);
    mesh.position.copy(va).add(vb).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());parent.add(mesh);return mesh;
  }
  function robotArm(side){
    const shoulder=[side*.53,-.82,.48],elbow=[side*.88,-1.12,.43],wrist=[side*1.02,-1.56,.4],hand=[side*1.04,-1.78,.42];
    linkBetween(shoulder,elbow,.105,.075,armPlate);
    sphere(elbow[0],elbow[1],elbow[2],.13,.13,.12,jointMat);
    sphere(elbow[0],elbow[1],elbow[2]+.105,.055,.055,.035,gold);
    linkBetween(elbow,wrist,.075,.055,silver);
    const cuff=sphere(wrist[0],wrist[1],wrist[2],.09,.11,.09,armPlate);
    linkBetween(wrist,hand,.055,.045,gold);
    sphere(hand[0],hand[1],hand[2],.075,.105,.065,silver);
    for(let f=0;f<3;f++){
      const fx=hand[0]+(f-1)*.055;
      linkBetween([fx,hand[1]-.04,hand[2]+.02],[fx+(f-1)*.018,hand[1]-.16,hand[2]+.02],.018,.012,jointMat);
    }
    // Decorative forearm inlay.
    tube([[side*.93,-1.2,.51],[side*.99,-1.36,.51],[side*1.02,-1.51,.49]],.014,gold);
  }
  robotArm(-1);robotArm(1);

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
