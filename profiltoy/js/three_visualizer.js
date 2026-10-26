/**
 * Profiltøy AS · Three.js 3D Clothing Model & Interactive Canvas Engine
 * Renders procedural 3D workwear (pro hoodie, safety shell jacket, tactical vest, titanium bottle)
 * with dynamic studio lighting, orbital controls, rotation, material shaders, and real-time logo placement!
 */

(function () {
  'use strict';

  // Global references
  let heroScene, heroCamera, heroRenderer, heroMeshGroup;
  let studioScene, studioCamera, studioRenderer, studioMeshGroup;
  let activeModelType = 'jacket';
  let activeModelColor = 0x0f172a; // default navy/slate
  let activeTextureCanvas, activeTextureContext;
  let isDraggingHero = false, isDraggingStudio = false;
  let previousMousePos = { x: 0, y: 0 };

  // Current customization state
  const customizerState = {
    model: 'jacket',
    colorHex: '#0f172a',
    logoText: 'PROFILTØY AS',
    customLogoImage: null,
    logoPlacement: 'chest-left',
    method: 'embroidery', // 'embroidery', 'transfer', 'reflective'
    reflectiveStrips: true,
    wireframe: false,
    autoRotate: true
  };

  /**
   * Initialize procedural 2D Canvas for logo dynamic decal texture
   */
  function createDecalTexture(text, placement, method, customImg) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    // Background is transparent
    ctx.clearRect(0, 0, 1024, 1024);

    // Optional texture weave / background grid for realism
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 1024; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0); ctx.lineTo(i, 1024);
      ctx.moveTo(0, i); ctx.lineTo(1024, i);
      ctx.stroke();
    }

    // Determine target location on the 1024x1024 UV map
    let posX = 420, posY = 400; // Chest left (mirror-wise)
    let fontSize = 34;

    if (placement === 'chest-center') {
      posX = 512;
      posY = 390;
      fontSize = 42;
    } else if (placement === 'back-large') {
      posX = 512;
      posY = 720;
      fontSize = 58;
    } else if (placement === 'sleeve-right') {
      posX = 780;
      posY = 420;
      fontSize = 28;
    }

    // If a custom image was uploaded, draw it onto the decal canvas
    if (customImg && customImg.complete && customImg.naturalWidth > 0) {
      const imgTargetW = placement === 'back-large' ? 240 : 160;
      const aspect = customImg.naturalHeight / customImg.naturalWidth;
      const imgTargetH = imgTargetW * aspect;

      ctx.save();
      if (method === 'embroidery') {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 3;
        ctx.shadowOffsetY = 3;
      } else if (method === 'reflective') {
        ctx.shadowColor = 'rgba(255, 255, 255, 0.85)';
        ctx.shadowBlur = 14;
      }
      ctx.drawImage(customImg, posX - (imgTargetW / 2), posY - (imgTargetH / 2), imgTargetW, imgTargetH);
      ctx.restore();

      // If text is also present, draw it below the image
      if (text) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = method === 'embroidery' ? '#facc15' : (method === 'reflective' ? '#e2e8f0' : '#ffffff');
        ctx.font = `bold ${Math.round(fontSize * 0.7)}px "Inter", sans-serif`;
        ctx.fillText(text, posX, posY + (imgTargetH / 2) + 6);
      }

      return new THREE.CanvasTexture(canvas);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Styling based on method
    if (method === 'embroidery') {
      // Textured dense stitch effect
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = '#facc15';
      ctx.font = `bold ${fontSize}px "Inter", "Arial Black", sans-serif`;
      ctx.fillText(text, posX, posY);

      // Inner stitch highlight
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#fef08a';
      ctx.font = `bold ${fontSize - 4}px "Inter", "Arial Black", sans-serif`;
      ctx.fillText(text, posX, posY);

      // Embroidery border badge outline
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 4;
      ctx.strokeRect(posX - 130, posY - 28, 260, 56);
    } else if (method === 'reflective') {
      // 3M Scotchlite high-vis silver glow
      ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#e2e8f0';
      ctx.font = `900 ${fontSize}px "Inter", sans-serif`;
      ctx.fillText(text, posX, posY);

      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 6;
      ctx.strokeRect(posX - 140, posY - 32, 280, 64);
    } else {
      // Clean transfer print
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${fontSize}px "Inter", sans-serif`;
      ctx.fillText(text, posX, posY);
    }

    return new THREE.CanvasTexture(canvas);
  }

  /**
   * Procedural 3D Garment Geometry Builder
   * Builds realistic stylized garments: Technical Jacket, Hoodie, Tactical Vest, Titanium Bottle
   */
  function buildGarmentMesh(type, colorHex, decalTexture) {
    const group = new THREE.Group();

    const mainMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex),
      roughness: 0.72,
      metalness: 0.12,
      map: decalTexture,
      wireframe: customizerState.wireframe
    });

    const accentMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x1e293b),
      roughness: 0.5,
      metalness: 0.2
    });

    const reflectiveMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xe2e8f0),
      roughness: 0.2,
      metalness: 0.85,
      emissive: new THREE.Color(0x334155),
      emissiveIntensity: 0.3
    });

    const goldMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xfbbf24),
      roughness: 0.3,
      metalness: 0.6
    });

    if (type === 'jacket' || type === 'hoodie') {
      // Torso / Body
      const torsoGeo = new THREE.CylinderGeometry(1.05, 1.15, 2.4, 32, 16);
      torsoGeo.scale(1.15, 1, 0.75); // Flatter chest
      const torso = new THREE.Mesh(torsoGeo, mainMaterial);
      torso.castShadow = true;
      torso.receiveShadow = true;
      group.add(torso);

      // Collar
      const collarGeo = new THREE.CylinderGeometry(0.55, 0.65, 0.45, 24);
      const collar = new THREE.Mesh(collarGeo, accentMaterial);
      collar.position.y = 1.35;
      group.add(collar);

      if (type === 'hoodie') {
        // Hood
        const hoodGeo = new THREE.SphereGeometry(0.72, 24, 24, 0, Math.PI * 2, 0, Math.PI * 0.7);
        const hood = new THREE.Mesh(hoodGeo, mainMaterial);
        hood.position.set(0, 1.4, -0.3);
        hood.rotation.x = -0.3;
        group.add(hood);

        // Kangaroo Pocket
        const pocketGeo = new THREE.BoxGeometry(1.2, 0.6, 0.25);
        const pocket = new THREE.Mesh(pocketGeo, accentMaterial);
        pocket.position.set(0, -0.4, 0.75);
        group.add(pocket);
      }

      // Sleeves Left & Right
      const sleeveGeo = new THREE.CylinderGeometry(0.38, 0.3, 2.1, 24);

      // Left Arm
      const leftArm = new THREE.Mesh(sleeveGeo, mainMaterial);
      leftArm.position.set(-1.45, 0.1, 0);
      leftArm.rotation.z = 0.28;
      group.add(leftArm);

      // Right Arm
      const rightArm = new THREE.Mesh(sleeveGeo, mainMaterial);
      rightArm.position.set(1.45, 0.1, 0);
      rightArm.rotation.z = -0.28;
      group.add(rightArm);

      // Hi-Vis Reflective Strips if enabled
      if (customizerState.reflectiveStrips) {
        // Torso lower stripe
        const strip1Geo = new THREE.CylinderGeometry(1.12, 1.14, 0.12, 32);
        strip1Geo.scale(1.16, 1, 0.77);
        const strip1 = new THREE.Mesh(strip1Geo, reflectiveMaterial);
        strip1.position.y = -0.7;
        group.add(strip1);

        // Torso upper stripe
        const strip2 = new THREE.Mesh(strip1Geo, reflectiveMaterial);
        strip2.position.y = 0.3;
        group.add(strip2);

        // Arm stripes
        const armStripGeo = new THREE.CylinderGeometry(0.37, 0.36, 0.1, 24);
        const armStripL = new THREE.Mesh(armStripGeo, reflectiveMaterial);
        armStripL.position.set(-1.45, -0.2, 0);
        armStripL.rotation.z = 0.28;
        group.add(armStripL);

        const armStripR = new THREE.Mesh(armStripGeo, reflectiveMaterial);
        armStripR.position.set(1.45, -0.2, 0);
        armStripR.rotation.z = -0.28;
        group.add(armStripR);
      }

      // Center Heavy-Duty YKK Zipper line
      const zipGeo = new THREE.BoxGeometry(0.06, 2.38, 0.82);
      const zip = new THREE.Mesh(zipGeo, accentMaterial);
      zip.position.set(0, 0, 0.42);
      group.add(zip);

    } else if (type === 'vest') {
      // Tactical POC Radio Vest
      const vestGeo = new THREE.CylinderGeometry(1.08, 1.12, 2.1, 32);
      vestGeo.scale(1.15, 1, 0.8);
      const vest = new THREE.Mesh(vestGeo, mainMaterial);
      group.add(vest);

      // Tactical radio holster / POC pocket
      const radioBoxGeo = new THREE.BoxGeometry(0.45, 0.75, 0.35);
      const radioBox = new THREE.Mesh(radioBoxGeo, accentMaterial);
      radioBox.position.set(-0.6, 0.4, 0.75);
      group.add(radioBox);

      // Antenna
      const antGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.6, 8);
      const ant = new THREE.Mesh(antGeo, accentMaterial);
      ant.position.set(-0.6, 0.95, 0.75);
      group.add(ant);

      // Mic Loop & Jerv Badge
      const jervBadgeGeo = new THREE.BoxGeometry(0.4, 0.3, 0.05);
      const jervBadge = new THREE.Mesh(jervBadgeGeo, goldMaterial);
      jervBadge.position.set(0.6, 0.5, 0.85);
      group.add(jervBadge);

      // Reflective harness cross-straps
      const strapGeo = new THREE.BoxGeometry(0.18, 2.15, 0.85);
      const strapL = new THREE.Mesh(strapGeo, reflectiveMaterial);
      strapL.position.set(-0.45, 0, 0.4);
      group.add(strapL);

      const strapR = new THREE.Mesh(strapGeo, reflectiveMaterial);
      strapR.position.set(0.45, 0, 0.4);
      group.add(strapR);

    } else if (type === 'bottle') {
      // AeroTitanium 750ml Flask
      const bottleMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0xd1d5db),
        roughness: 0.25,
        metalness: 0.95,
        map: decalTexture
      });

      const bodyGeo = new THREE.CylinderGeometry(0.65, 0.65, 2.4, 36);
      const body = new THREE.Mesh(bodyGeo, bottleMat);
      group.add(body);

      // Neck & Lid
      const neckGeo = new THREE.CylinderGeometry(0.35, 0.65, 0.4, 36);
      const neck = new THREE.Mesh(neckGeo, bottleMat);
      neck.position.y = 1.35;
      group.add(neck);

      const capGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.35, 36);
      const cap = new THREE.Mesh(capGeo, accentMaterial);
      cap.position.y = 1.65;
      group.add(cap);

      // Paracord ring
      const ringGeo = new THREE.TorusGeometry(0.2, 0.04, 16, 32);
      const ring = new THREE.Mesh(ringGeo, goldMaterial);
      ring.position.set(0, 1.8, 0);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
    }

    return group;
  }

  /**
   * Set up Hero 3D Scene (Automated subtle ambient rotation)
   */
  function initHeroCanvas() {
    const container = document.getElementById('heroThreeContainer');
    if (!container) return;

    heroScene = new THREE.Scene();
    const width = container.clientWidth || 400;
    const height = container.clientHeight || 380;

    heroCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    heroCamera.position.set(0, 0.2, 5.2);

    heroRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    heroRenderer.setSize(width, height);
    heroRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    heroRenderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(heroRenderer.domElement);

    // Studio Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    heroScene.add(ambient);

    const dirLight1 = new THREE.DirectionalLight(0xfacc15, 1.2);
    dirLight1.position.set(4, 5, 4);
    heroScene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x06b6d4, 0.9);
    dirLight2.position.set(-4, -2, -3);
    heroScene.add(dirLight2);

    // Initial Decal
    const decal = createDecalTexture('FK JERV · PROFILTØY', 'chest-left', 'embroidery');
    heroMeshGroup = buildGarmentMesh('jacket', 0x111827, decal);
    heroScene.add(heroMeshGroup);

    // Mouse Interaction for 360 inspection
    heroRenderer.domElement.addEventListener('mousedown', (e) => {
      isDraggingHero = true;
      previousMousePos = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => { isDraggingHero = false; });
    window.addEventListener('mousemove', (e) => {
      if (!isDraggingHero || !heroMeshGroup) return;
      const deltaX = e.clientX - previousMousePos.x;
      const deltaY = e.clientY - previousMousePos.y;
      heroMeshGroup.rotation.y += deltaX * 0.01;
      heroMeshGroup.rotation.x += deltaY * 0.005;
      previousMousePos = { x: e.clientX, y: e.clientY };
    });

    // Animate Hero loop
    function animateHero() {
      requestAnimationFrame(animateHero);
      if (!isDraggingHero && heroMeshGroup) {
        heroMeshGroup.rotation.y += 0.006;
      }
      heroRenderer.render(heroScene, heroCamera);
    }
    animateHero();

    // Window Resize listener
    window.addEventListener('resize', () => {
      if (!container || !heroRenderer || !heroCamera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      heroCamera.aspect = w / h;
      heroCamera.updateProjectionMatrix();
      heroRenderer.setSize(w, h);
    });
  }

  /**
   * Set up Main 3D Studio Canvas (Full customization view)
   */
  function initStudioCanvas() {
    const container = document.getElementById('studioThreeCanvas');
    if (!container) return;

    studioScene = new THREE.Scene();
    const width = container.clientWidth || 600;
    const height = container.clientHeight || 520;

    studioCamera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    studioCamera.position.set(0, 0.3, 5.5);

    studioRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    studioRenderer.setSize(width, height);
    studioRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    studioRenderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(studioRenderer.domElement);

    // Multi-point Studio Key, Fill & Rim lighting
    const amb = new THREE.AmbientLight(0xffffff, 0.75);
    studioScene.add(amb);

    const keyLight = new THREE.SpotLight(0xffffff, 1.4);
    keyLight.position.set(3, 6, 5);
    keyLight.castShadow = true;
    studioScene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x06b6d4, 0.7);
    fillLight.position.set(-5, 2, 2);
    studioScene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xfacc15, 1.1);
    rimLight.position.set(0, 4, -5);
    studioScene.add(rimLight);

    // Render Initial Studio Model
    updateStudioModel();

    // Orbit Drag
    studioRenderer.domElement.addEventListener('mousedown', (e) => {
      isDraggingStudio = true;
      previousMousePos = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => { isDraggingStudio = false; });
    window.addEventListener('mousemove', (e) => {
      if (!isDraggingStudio || !studioMeshGroup) return;
      const deltaX = e.clientX - previousMousePos.x;
      const deltaY = e.clientY - previousMousePos.y;
      studioMeshGroup.rotation.y += deltaX * 0.01;
      studioMeshGroup.rotation.x += deltaY * 0.005;
      // clamp pitch
      studioMeshGroup.rotation.x = Math.max(-0.6, Math.min(0.6, studioMeshGroup.rotation.x));
      previousMousePos = { x: e.clientX, y: e.clientY };
    });

    // Touch support for mobile devices
    studioRenderer.domElement.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        isDraggingStudio = true;
        previousMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }, { passive: true });

    window.addEventListener('touchend', () => { isDraggingStudio = false; });
    window.addEventListener('touchmove', (e) => {
      if (!isDraggingStudio || !studioMeshGroup || e.touches.length !== 1) return;
      const deltaX = e.touches[0].clientX - previousMousePos.x;
      const deltaY = e.touches[0].clientY - previousMousePos.y;
      studioMeshGroup.rotation.y += deltaX * 0.012;
      previousMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });

    function animateStudio() {
      requestAnimationFrame(animateStudio);
      if (!isDraggingStudio && studioMeshGroup && customizerState.autoRotate) {
        studioMeshGroup.rotation.y += 0.004;
      }
      studioRenderer.render(studioScene, studioCamera);
    }
    animateStudio();

    window.addEventListener('resize', () => {
      if (!container || !studioRenderer || !studioCamera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      studioCamera.aspect = w / h;
      studioCamera.updateProjectionMatrix();
      studioRenderer.setSize(w, h);
    });
  }

  /**
   * Rebuild or update the Studio 3D mesh based on state changes
   */
  function updateStudioModel() {
    if (!studioScene) return;

    // Remove existing
    if (studioMeshGroup) {
      studioScene.remove(studioMeshGroup);
    }

    const decal = createDecalTexture(
      customizerState.logoText || 'PROFILTØY AS',
      customizerState.logoPlacement,
      customizerState.method,
      customizerState.customLogoImage
    );

    studioMeshGroup = buildGarmentMesh(
      customizerState.model,
      customizerState.colorHex,
      decal
    );

    studioScene.add(studioMeshGroup);
  }

  // Expose studio controller API to window
  window.Profiltoy3D = {
    init: function () {
      initHeroCanvas();
      initStudioCanvas();
    },
    setModel: function (type) {
      customizerState.model = type;
      updateStudioModel();
    },
    setColor: function (hex) {
      customizerState.colorHex = hex;
      updateStudioModel();
    },
    setLogoText: function (text) {
      customizerState.logoText = text;
      updateStudioModel();
    },
    setLogoImage: function (imgElement) {
      customizerState.customLogoImage = imgElement;
      updateStudioModel();
    },
    setPlacement: function (pos) {
      customizerState.logoPlacement = pos;
      updateStudioModel();
    },
    setMethod: function (m) {
      customizerState.method = m;
      updateStudioModel();
    },
    toggleReflective: function (enabled) {
      customizerState.reflectiveStrips = enabled;
      updateStudioModel();
    },
    toggleWireframe: function () {
      customizerState.wireframe = !customizerState.wireframe;
      updateStudioModel();
    },
    resetRotation: function () {
      if (studioMeshGroup) {
        studioMeshGroup.rotation.set(0, 0, 0);
      }
    },
    toggleAutoRotate: function () {
      customizerState.autoRotate = !customizerState.autoRotate;
    },
    getState: function () {
      return Object.assign({}, customizerState);
    }
  };

  // Auto-init on load if Three.js is present
  document.addEventListener('DOMContentLoaded', function () {
    if (typeof THREE !== 'undefined') {
      window.Profiltoy3D.init();
    }
  });

})();
