import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Global variables ---
let scene, camera, renderer, controls, raycaster, mouse;
let habitat, habitatFloor, selectedZone = null, zones = [], crewAvatars = [];
let showCrew = false;
let starField, nebula, ambientParticles = [];
let composer, bloomPass;
let currentEditingZone = null;
let uniformScaling = true;

const canvasContainer = document.getElementById('canvas-container');
const zoneColors = {
    sleeping: 0x4169E1, bathroom: 0x20B2AA, storage: 0x808080,
    exercise: 0xFF6347, workstation: 0xFFD700, kitchen: 0x32CD32,
    airlock: 0xFF4500, medical: 0xFF1493
};
const feedbackColors = {
    valid: 0x00ff00,
    invalid: 0xff0000
};

// --- Initialization ---
function init() {
    showLoadingOverlay();
    
    // Scene setup
    scene = new THREE.Scene();
    
    // Create space environment
    createSpaceEnvironment();
    
    // Create atmospheric particles
    ambientParticles = createAtmosphericParticles();
    
    // Enhanced fog for depth
    scene.fog = new THREE.FogExp2(0x0a0e1a, 0.002);

    // Camera setup
    camera = new THREE.PerspectiveCamera(75, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 1000);
    camera.position.set(15, 15, 15);

    // Enhanced renderer setup
    renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        alpha: true,
        powerPreference: "high-performance"
    });
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    canvasContainer.appendChild(renderer.domElement);
    
    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 5;
    controls.maxDistance = 100;
    controls.maxPolarAngle = Math.PI / 2.1; // Prevent going below ground

    // Enhanced lighting system
    setupLighting();
    
    // Enhanced grid with holographic effect
    createHolographicGrid();

    // Raycaster for mouse interaction
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Initial load from JSON data
    setTimeout(() => {
        loadLayout(initialLayoutData);
        hideLoadingOverlay();
    }, 2000);

    setupEventListeners();
    animate();
}

const initialLayoutData = {
  "habitat": { "shape": "dome", "radius": 10, "height": 15, "crew": 8 },
  "zones": [
    {"type": "sleeping", "position": {"x": "7.27", "y": "1.00", "z": "0.81"}},
    {"type": "bathroom", "position": {"x": "-5.92", "y": "1.00", "z": "-6.11"}},
    {"type": "storage", "position": {"x": "6.64", "y": "1.00", "z": "-7.05"}},
    {"type": "exercise", "position": {"x": "-0.54", "y": "1.00", "z": "-2.41"}},
    {"type": "workstation", "position": {"x": "6.97", "y": "1.00", "z": "-6.19"}},
    {"type": "kitchen", "position": {"x": "-3.43", "y": "1.00", "z": "-0.62"}},
    {"type": "airlock", "position": {"x": "3.80", "y": "1.00", "z": "-1.15"}},
    {"type": "medical", "position": {"x": "6.36", "y": "1.00", "z": "3.71"}}
  ]
};

// --- Space Environment Creation ---
function createSpaceEnvironment() {
    // Dynamic space background with stars
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 15000;
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    const starSizes = new Float32Array(starCount);

    for (let i = 0; i < starCount; i++) {
        // Random positions in a large sphere
        const radius = 800 + Math.random() * 400;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        
        starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        starPositions[i * 3 + 1] = radius * Math.cos(phi);
        starPositions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
        
        // Varied star colors (blue-white to warm white)
        const colorVariation = Math.random();
        if (colorVariation < 0.1) {
            // Blue giants
            starColors[i * 3] = 0.7 + Math.random() * 0.3;
            starColors[i * 3 + 1] = 0.8 + Math.random() * 0.2;
            starColors[i * 3 + 2] = 1.0;
        } else if (colorVariation < 0.3) {
            // Red giants  
            starColors[i * 3] = 1.0;
            starColors[i * 3 + 1] = 0.3 + Math.random() * 0.4;
            starColors[i * 3 + 2] = 0.2 + Math.random() * 0.3;
        } else {
            // Regular white stars
            const intensity = 0.8 + Math.random() * 0.2;
            starColors[i * 3] = intensity;
            starColors[i * 3 + 1] = intensity;
            starColors[i * 3 + 2] = intensity;
        }
        
        starSizes[i] = Math.random() * 3 + 1;
    }

    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    starGeometry.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));

    const starMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 }
        },
        vertexShader: `
            attribute float size;
            attribute vec3 color;
            varying vec3 vColor;
            uniform float time;
            
            void main() {
                vColor = color;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                float twinkle = sin(time * 2.0 + position.x * 0.01) * 0.5 + 0.5;
                gl_PointSize = size * (300.0 / -mvPosition.z) * (0.5 + twinkle * 0.5);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            
            void main() {
                float strength = distance(gl_PointCoord, vec2(0.5));
                strength = 1.0 - strength;
                strength = pow(strength, 3.0);
                
                vec3 finalColor = mix(vec3(0.0), vColor, strength);
                gl_FragColor = vec4(finalColor, strength);
            }
        `,
        transparent: true,
        vertexColors: true,
        blending: THREE.AdditiveBlending
    });

    starField = new THREE.Points(starGeometry, starMaterial);
    scene.add(starField);

    // Create nebula clouds
    createNebulaClouds();
}

function createNebulaClouds() {
    const nebulaGeometry = new THREE.BufferGeometry();
    const nebulaCount = 2000;
    const nebulaPositions = new Float32Array(nebulaCount * 3);
    const nebulaColors = new Float32Array(nebulaCount * 3);
    const nebulaSizes = new Float32Array(nebulaCount);

    for (let i = 0; i < nebulaCount; i++) {
        // Clustered nebula positions
        const angle = Math.random() * Math.PI * 2;
        const radius = 200 + Math.random() * 600;
        const height = (Math.random() - 0.5) * 400;
        
        nebulaPositions[i * 3] = Math.cos(angle) * radius;
        nebulaPositions[i * 3 + 1] = height;
        nebulaPositions[i * 3 + 2] = Math.sin(angle) * radius;
        
        // Nebula colors (purple, blue, cyan spectrum)
        const colorType = Math.random();
        if (colorType < 0.4) {
            // Purple nebula
            nebulaColors[i * 3] = 0.6 + Math.random() * 0.4;
            nebulaColors[i * 3 + 1] = 0.2 + Math.random() * 0.4;
            nebulaColors[i * 3 + 2] = 1.0;
        } else if (colorType < 0.7) {
            // Cyan nebula
            nebulaColors[i * 3] = 0.0;
            nebulaColors[i * 3 + 1] = 0.7 + Math.random() * 0.3;
            nebulaColors[i * 3 + 2] = 1.0;
        } else {
            // Pink nebula
            nebulaColors[i * 3] = 1.0;
            nebulaColors[i * 3 + 1] = 0.2 + Math.random() * 0.3;
            nebulaColors[i * 3 + 2] = 0.8 + Math.random() * 0.2;
        }
        
        nebulaSizes[i] = Math.random() * 20 + 5;
    }

    nebulaGeometry.setAttribute('position', new THREE.BufferAttribute(nebulaPositions, 3));
    nebulaGeometry.setAttribute('color', new THREE.BufferAttribute(nebulaColors, 3));
    nebulaGeometry.setAttribute('size', new THREE.BufferAttribute(nebulaSizes, 1));

    const nebulaMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 }
        },
        vertexShader: `
            attribute float size;
            attribute vec3 color;
            varying vec3 vColor;
            uniform float time;
            
            void main() {
                vColor = color;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                float wave = sin(time * 0.5 + position.y * 0.01) * 0.3 + 0.7;
                gl_PointSize = size * (300.0 / -mvPosition.z) * wave;
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            
            void main() {
                float strength = distance(gl_PointCoord, vec2(0.5));
                strength = 1.0 - strength;
                strength = pow(strength, 2.0);
                
                vec3 finalColor = vColor * strength;
                gl_FragColor = vec4(finalColor, strength * 0.3);
            }
        `,
        transparent: true,
        vertexColors: true,
        blending: THREE.AdditiveBlending
    });

    nebula = new THREE.Points(nebulaGeometry, nebulaMaterial);
    scene.add(nebula);
}

function setupLighting() {
    // Ambient space lighting
    const ambientLight = new THREE.AmbientLight(0x404080, 0.4);
    scene.add(ambientLight);

    // Main key light (simulating distant star)
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    keyLight.position.set(20, 30, 15);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 4096;
    keyLight.shadow.mapSize.height = 4096;
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = 200;
    keyLight.shadow.camera.left = -50;
    keyLight.shadow.camera.right = 50;
    keyLight.shadow.camera.top = 50;
    keyLight.shadow.camera.bottom = -50;
    keyLight.shadow.bias = -0.0001;
    scene.add(keyLight);

    // Fill light (blue space ambience)
    const fillLight = new THREE.DirectionalLight(0x4080ff, 0.6);
    fillLight.position.set(-15, 5, -10);
    scene.add(fillLight);

    // Rim light (atmospheric edge lighting)
    const rimLight = new THREE.DirectionalLight(0xff6040, 0.4);
    rimLight.position.set(5, -10, -20);
    scene.add(rimLight);

    // Point lights for interior illumination
    const interiorLight1 = new THREE.PointLight(0x00d4ff, 0.8, 30);
    interiorLight1.position.set(0, 8, 0);
    scene.add(interiorLight1);

    const interiorLight2 = new THREE.PointLight(0x7c3aed, 0.6, 25);
    interiorLight2.position.set(8, 3, 8);
    scene.add(interiorLight2);
}

function createHolographicGrid() {
    // Animated holographic grid
    const gridSize = 50;
    const divisions = 50;
    const material = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            color1: { value: new THREE.Color(0x00d4ff) },
            color2: { value: new THREE.Color(0x7c3aed) }
        },
        vertexShader: `
            uniform float time;
            varying vec3 vPosition;
            
            void main() {
                vPosition = position;
                vec3 pos = position;
                pos.y += sin(time * 2.0 + pos.x * 0.1) * 0.5;
                pos.y += cos(time * 1.5 + pos.z * 0.1) * 0.3;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            uniform vec3 color1;
            uniform vec3 color2;
            varying vec3 vPosition;
            
            void main() {
                float pattern = sin(vPosition.x * 2.0) * sin(vPosition.z * 2.0);
                float pulse = sin(time * 3.0) * 0.5 + 0.5;
                vec3 color = mix(color1, color2, pattern * pulse);
                float alpha = 0.3 + pattern * 0.2 + pulse * 0.1;
                gl_FragColor = vec4(color, alpha);
            }
        `,
        transparent: true,
        side: THREE.DoubleSide
    });

    const gridHelper = new THREE.GridHelper(gridSize, divisions, 0x00d4ff, 0x7c3aed);
    gridHelper.material = material;
    scene.add(gridHelper);
}

function showLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.classList.add('active');
    }
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}

// --- Habitat Creation ---
function createHabitat() {
    if (habitat) scene.remove(habitat);
    if (habitatFloor) scene.remove(habitatFloor);

    const shape = document.getElementById('shape').value;
    const radius = parseFloat(document.getElementById('radius').value);
    const height = parseFloat(document.getElementById('height').value);

    // Enhanced habitat shell with holographic appearance
    const material = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            opacity: { value: 0.15 },
            color: { value: new THREE.Color(0x00d4ff) }
        },
        vertexShader: `
            uniform float time;
            varying vec3 vPosition;
            varying vec3 vNormal;
            
            void main() {
                vPosition = position;
                vNormal = normal;
                vec3 pos = position;
                pos += normal * sin(time * 2.0 + position.y * 5.0) * 0.05;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            uniform float opacity;
            uniform vec3 color;
            varying vec3 vPosition;
            varying vec3 vNormal;
            
            void main() {
                float pulse = sin(time * 3.0 + vPosition.y * 10.0) * 0.5 + 0.5;
                float fresnel = pow(1.0 - dot(normalize(vNormal), vec3(0, 0, 1)), 2.0);
                vec3 finalColor = color + pulse * 0.3;
                float finalOpacity = opacity + fresnel * 0.3 + pulse * 0.1;
                gl_FragColor = vec4(finalColor, finalOpacity);
            }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
    });
    let geometry;
    if (shape === 'cylinder') geometry = new THREE.CylinderGeometry(radius, radius, height, 64, 1, true);
    else if (shape === 'dome') geometry = new THREE.SphereGeometry(radius, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
    else geometry = new THREE.CapsuleGeometry(radius, height - radius * 2, 32, 64);
    
    habitat = new THREE.Mesh(geometry, material);
    habitat.position.y = shape === 'dome' ? 0 : height / 2;
    scene.add(habitat);

    // Enhanced habitat floor with tech pattern
    const floorGeometry = new THREE.CircleGeometry(radius, 64);
    const floorMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            radius: { value: radius }
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vPosition;
            
            void main() {
                vUv = uv;
                vPosition = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            uniform float radius;
            varying vec2 vUv;
            varying vec3 vPosition;
            
            void main() {
                vec2 center = vec2(0.5, 0.5);
                float dist = distance(vUv, center);
                
                // Tech grid pattern
                float grid = abs(sin(vPosition.x * 10.0)) * abs(sin(vPosition.z * 10.0));
                grid = step(0.9, grid);
                
                // Pulsing circles
                float circles = sin(dist * 20.0 - time * 2.0) * 0.5 + 0.5;
                circles = step(0.8, circles);
                
                // Base color
                vec3 baseColor = vec3(0.1, 0.15, 0.3);
                vec3 gridColor = vec3(0.0, 0.8, 1.0);
                vec3 circleColor = vec3(0.5, 0.0, 1.0);
                
                vec3 finalColor = baseColor + grid * gridColor * 0.3 + circles * circleColor * 0.2;
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `
    });
    habitatFloor = new THREE.Mesh(floorGeometry, floorMaterial);
    habitatFloor.rotation.x = -Math.PI / 2;
    habitatFloor.receiveShadow = true;
    scene.add(habitatFloor);
}

// --- Zone Management ---
function addZone(type, position) {
    const zoneGeometry = new THREE.BoxGeometry(2, 2, 2);
    
    // Enhanced zone material with glow effect
    const zoneMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            color: { value: new THREE.Color(zoneColors[type]) },
            selected: { value: 0.0 }
        },
        vertexShader: `
            uniform float time;
            uniform float selected;
            varying vec3 vPosition;
            varying vec3 vNormal;
            
            void main() {
                vPosition = position;
                vNormal = normal;
                vec3 pos = position;
                pos += normal * sin(time * 4.0 + position.x * 10.0) * 0.02 * (1.0 + selected);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            uniform vec3 color;
            uniform float selected;
            varying vec3 vPosition;
            varying vec3 vNormal;
            
            void main() {
                float pulse = sin(time * 6.0) * 0.3 + 0.7;
                float fresnel = pow(1.0 - dot(normalize(vNormal), vec3(0, 0, 1)), 1.5);
                
                vec3 finalColor = color * pulse;
                finalColor += fresnel * color * 0.5;
                finalColor += selected * vec3(1.0, 1.0, 1.0) * 0.3;
                
                gl_FragColor = vec4(finalColor, 0.9 + selected * 0.1);
            }
        `,
        transparent: true
    });
    
    const zoneMesh = new THREE.Mesh(zoneGeometry, zoneMaterial);
    zoneMesh.castShadow = true;
    zoneMesh.receiveShadow = true;
    zoneMesh.userData = { type: type, id: THREE.MathUtils.generateUUID() };
    
    if (position) {
        zoneMesh.position.set(position.x, position.y, position.z);
    } else {
        const radius = parseFloat(document.getElementById('radius').value);
        zoneMesh.position.set((Math.random() - 0.5) * radius, 1, (Math.random() - 0.5) * radius);
    }
    
    // Enhanced holographic outline
    const edges = new THREE.EdgesGeometry(zoneGeometry);
    const outlineMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            color: { value: new THREE.Color(zoneColors[type]) },
            selected: { value: 0.0 }
        },
        vertexShader: `
            uniform float time;
            uniform float selected;
            
            void main() {
                vec3 pos = position;
                float wave = sin(time * 8.0 + pos.x * 20.0) * 0.1 * (1.0 + selected * 2.0);
                pos += normal * wave;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            uniform vec3 color;
            uniform float selected;
            
            void main() {
                float pulse = sin(time * 10.0) * 0.5 + 0.5;
                float intensity = 0.5 + pulse * 0.5 + selected * 1.0;
                gl_FragColor = vec4(color * intensity, intensity);
            }
        `,
        transparent: true,
        linewidth: 2
    });
    const outline = new THREE.LineSegments(edges, outlineMaterial);
    zoneMesh.add(outline);

    zones.push(zoneMesh);
    scene.add(zoneMesh);
    updateZonesList();
    updateInfo();
}

function removeZone(id) {
    const index = zones.findIndex(z => z.userData.id === id);
    if (index !== -1) {
        scene.remove(zones[index]);
        zones.splice(index, 1);
        updateZonesList();
        updateInfo();
    }
}

function updateZonesList() {
    const list = document.getElementById('zones-list');
    list.innerHTML = '';
    zones.forEach(zone => {
        const item = document.createElement('div');
        item.className = 'zone-item';
        item.dataset.zoneId = zone.userData.id;
        item.innerHTML = `
            <div class="zone-color" style="background: #${new THREE.Color(zoneColors[zone.userData.type] || 0x00a8ff).getHexString()}"></div>
            <div class="zone-name">${zone.userData.type}</div>
            <button class="edit-zone" data-id="${zone.userData.id}" title="Edit Zone">⚙️</button>
            <button class="remove-zone" data-id="${zone.userData.id}" title="Remove Zone">×</button>
        `;
        
        // Add click listener for zone selection
        item.addEventListener('click', (e) => {
            if (!e.target.classList.contains('edit-zone') && !e.target.classList.contains('remove-zone')) {
                selectZoneFromList(zone);
            }
        });
        
        list.appendChild(item);
    });
    
    // Add event listeners
    document.querySelectorAll('.edit-zone').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const zoneId = e.target.dataset.id;
            const zone = zones.find(z => z.userData.id === zoneId);
            if (zone) openZoneEditor(zone);
        });
    });
    
    document.querySelectorAll('.remove-zone').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeZone(e.target.dataset.id);
        });
    });
}

function selectZoneFromList(zone) {
    // Clear previous selections
    document.querySelectorAll('.zone-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    clearZoneSelections();
    
    // Select new zone
    selectedZone = zone;
    selectedZones = [zone];
    
    // Highlight in list
    const listItem = document.querySelector(`[data-zone-id="${zone.userData.id}"]`);
    if (listItem) {
        listItem.classList.add('selected');
    }
    
    // Highlight in 3D scene
    if (zone.material.uniforms) {
        zone.material.uniforms.selected.value = 1.0;
    }
    if (zone.children[0] && zone.children[0].material.uniforms) {
        zone.children[0].material.uniforms.selected.value = 1.0;
    }
    
    // Focus camera on zone
    focusCameraOnZone(zone);
}

function focusCameraOnZone(zone) {
    const targetPosition = zone.position.clone();
    targetPosition.y += 5;
    targetPosition.x += 8;
    targetPosition.z += 8;
    
    const startPosition = camera.position.clone();
    const startTarget = controls.target.clone();
    const endTarget = zone.position.clone();
    
    const duration = 1000;
    const startTime = performance.now();
    
    function animateCamera() {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        
        camera.position.lerpVectors(startPosition, targetPosition, easeProgress);
        controls.target.lerpVectors(startTarget, endTarget, easeProgress);
        controls.update();
        
        if (progress < 1) {
            requestAnimationFrame(animateCamera);
        }
    }
    
    animateCamera();
}

// --- Crew Management ---
function toggleCrewAvatars() {
    showCrew = !showCrew;
    if (showCrew) createCrewAvatars();
    else {
        crewAvatars.forEach(avatar => scene.remove(avatar));
        crewAvatars = [];
    }
}

function createCrewAvatars() {
    crewAvatars.forEach(avatar => {
        scene.remove(avatar);
        // Remove particle trails
        if (avatar.userData.particles) {
            scene.remove(avatar.userData.particles);
        }
    });
    crewAvatars = [];
    const crewSize = parseInt(document.getElementById('crew').value);
    const radius = parseFloat(document.getElementById('radius').value) * 0.7;

    for (let i = 0; i < crewSize; i++) {
        const group = new THREE.Group();
        
        // Enhanced astronaut with holographic appearance
        const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.3, 16, 16), 
            new THREE.MeshPhysicalMaterial({ 
                color: 0xffffff, 
                metalness: 0.1,
                roughness: 0.3,
                transparent: true,
                opacity: 0.9,
                emissive: 0x004080,
                emissiveIntensity: 0.1
            })
        );
        head.position.y = 1.5;
        
        const body = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.4, 1.2, 8), 
            new THREE.MeshPhysicalMaterial({ 
                color: 0x00d4ff,
                metalness: 0.8,
                roughness: 0.2,
                transparent: true,
                opacity: 0.8,
                emissive: 0x001a33,
                emissiveIntensity: 0.2
            })
        );
        body.position.y = 0.6;
        
        // Add particle trail system for each crew member
        const particleGeometry = new THREE.BufferGeometry();
        const particleCount = 50;
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const sizes = new Float32Array(particleCount);
        
        for (let j = 0; j < particleCount; j++) {
            positions[j * 3] = 0;
            positions[j * 3 + 1] = 0;
            positions[j * 3 + 2] = 0;
            colors[j * 3] = 0.0;
            colors[j * 3 + 1] = 0.8;
            colors[j * 3 + 2] = 1.0;
            sizes[j] = Math.random() * 2 + 1;
        }
        
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        const particleMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 }
            },
            vertexShader: `
                attribute float size;
                attribute vec3 color;
                varying vec3 vColor;
                uniform float time;
                
                void main() {
                    vColor = color;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    float life = sin(time * 5.0 + position.y * 10.0) * 0.5 + 0.5;
                    gl_PointSize = size * (50.0 / -mvPosition.z) * life;
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                
                void main() {
                    float strength = distance(gl_PointCoord, vec2(0.5));
                    strength = 1.0 - strength;
                    strength = pow(strength, 2.0);
                    gl_FragColor = vec4(vColor * strength, strength * 0.8);
                }
            `,
            transparent: true,
            vertexColors: true,
            blending: THREE.AdditiveBlending
        });
        
        const particles = new THREE.Points(particleGeometry, particleMaterial);
        
        group.add(head, body);
        group.userData.particles = particles;
        group.userData.particlePositions = [];
        
        const angle = (i / crewSize) * Math.PI * 2;
        group.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
        
        scene.add(group);
        scene.add(particles);
        crewAvatars.push(group);
    }
}

// Atmospheric particle system
function createAtmosphericParticles() {
    const particleGeometry = new THREE.BufferGeometry();
    const particleCount = 1000;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    const velocities = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
        // Random positions within habitat area
        const radius = Math.random() * 20;
        const theta = Math.random() * Math.PI * 2;
        const height = Math.random() * 15;
        
        positions[i * 3] = Math.cos(theta) * radius;
        positions[i * 3 + 1] = height;
        positions[i * 3 + 2] = Math.sin(theta) * radius;
        
        // Particle colors (space dust - subtle blues and purples)
        colors[i * 3] = 0.3 + Math.random() * 0.4;
        colors[i * 3 + 1] = 0.6 + Math.random() * 0.4;
        colors[i * 3 + 2] = 1.0;
        
        sizes[i] = Math.random() * 1.5 + 0.5;
        
        // Slow floating velocities
        velocities[i * 3] = (Math.random() - 0.5) * 0.02;
        velocities[i * 3 + 1] = Math.random() * 0.01;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
    }
    
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    particleGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    
    const atmosphericMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 }
        },
        vertexShader: `
            attribute float size;
            attribute vec3 color;
            attribute vec3 velocity;
            varying vec3 vColor;
            uniform float time;
            
            void main() {
                vColor = color;
                vec3 pos = position + velocity * time * 10.0;
                
                // Wrap particles within bounds
                pos.x = mod(pos.x + 20.0, 40.0) - 20.0;
                pos.z = mod(pos.z + 20.0, 40.0) - 20.0;
                pos.y = mod(pos.y, 15.0);
                
                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                float twinkle = sin(time * 3.0 + pos.x * 5.0) * 0.5 + 0.5;
                gl_PointSize = size * (100.0 / -mvPosition.z) * (0.3 + twinkle * 0.7);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            
            void main() {
                float strength = distance(gl_PointCoord, vec2(0.5));
                strength = 1.0 - strength;
                strength = pow(strength, 3.0);
                gl_FragColor = vec4(vColor * strength, strength * 0.4);
            }
        `,
        transparent: true,
        vertexColors: true,
        blending: THREE.AdditiveBlending
    });
    
    const atmosphericParticles = new THREE.Points(particleGeometry, atmosphericMaterial);
    scene.add(atmosphericParticles);
    
    return atmosphericParticles;
}

// --- UI & Info ---
function updateInfo() {
    const radius = parseFloat(document.getElementById('radius').value);
    const height = parseFloat(document.getElementById('height').value);
    const crew = parseInt(document.getElementById('crew').value);
    const shape = document.getElementById('shape').value;

    let volume = 0;
    if (shape === 'cylinder') volume = Math.PI * radius * radius * height;
    else if (shape === 'dome') volume = (2/3) * Math.PI * Math.pow(radius, 3);
    else volume = (Math.PI * radius * radius * (height - radius * 2)) + (4/3 * Math.PI * Math.pow(radius, 3));

    const floorArea = Math.PI * radius * radius;
    document.getElementById('volume').textContent = `${volume.toFixed(1)} m³`;
    document.getElementById('floor-area').textContent = `${floorArea.toFixed(1)} m²`;
    document.getElementById('per-astronaut').textContent = `${(volume / crew).toFixed(1)} m³`;
    document.getElementById('zones-count').textContent = zones.length;
}

function showFeedback(message, isValid) {
    const feedback = document.getElementById('placement-feedback');
    feedback.textContent = message;
    feedback.className = isValid ? 'feedback-valid' : 'feedback-invalid';
    feedback.style.display = 'block';
    setTimeout(() => { feedback.style.display = 'none'; }, 2000);
}

// --- Import / Export ---
function exportLayout() {
    const layout = {
        habitat: {
            shape: document.getElementById('shape').value,
            radius: parseFloat(document.getElementById('radius').value),
            height: parseFloat(document.getElementById('height').value),
            crew: parseInt(document.getElementById('crew').value)
        },
        zones: zones.map(z => ({
            type: z.userData.type,
            position: {
                x: z.position.x.toFixed(2),
                y: z.position.y.toFixed(2),
                z: z.position.z.toFixed(2)
            }
        }))
    };
    const dataStr = JSON.stringify(layout, null, 2);
    const link = document.createElement('a');
    link.href = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    link.download = 'habitat_layout.json';
    link.click();
    showFeedback('Layout exported!', true);
}

function loadLayout(layout) {
    resetHabitat();
    
    document.getElementById('shape').value = layout.habitat.shape;
    document.getElementById('radius').value = layout.habitat.radius;
    document.getElementById('height').value = layout.habitat.height;
    document.getElementById('crew').value = layout.habitat.crew;

    // Manually trigger UI updates from the new values
    document.getElementById('radius-value').textContent = `${layout.habitat.radius.toFixed(1)} m`;
    document.getElementById('height-value').textContent = `${layout.habitat.height.toFixed(1)} m`;
    document.getElementById('crew-value').textContent = `${layout.habitat.crew} astronauts`;

    createHabitat();
    layout.zones.forEach(zoneData => {
        const pos = {
            x: parseFloat(zoneData.position.x),
            y: parseFloat(zoneData.position.y),
            z: parseFloat(zoneData.position.z),
        };
        addZone(zoneData.type, pos);
    });
    updateInfo();
    showFeedback('Layout loaded!', true);
}

function resetHabitat() {
    zones.forEach(zone => scene.remove(zone));
    zones = [];
    if (showCrew) toggleCrewAvatars();
    updateZonesList();
    createHabitat();
    updateInfo();
}

// --- Event Listeners ---
function setupEventListeners() {
    // Controls Panel
    document.getElementById('shape').addEventListener('change', () => { createHabitat(); updateInfo(); });
    document.getElementById('radius').addEventListener('input', (e) => {
        document.getElementById('radius-value').textContent = `${parseFloat(e.target.value).toFixed(1)} m`;
        createHabitat(); updateInfo();
    });
    document.getElementById('height').addEventListener('input', (e) => {
        document.getElementById('height-value').textContent = `${parseFloat(e.target.value).toFixed(1)} m`;
        createHabitat(); updateInfo();
    });
    document.getElementById('crew').addEventListener('input', (e) => {
        document.getElementById('crew-value').textContent = `${e.target.value} astronauts`;
        if (showCrew) createCrewAvatars();
        updateInfo();
    });
    document.getElementById('add-zone-btn').addEventListener('click', () => addZone(document.getElementById('zone-type').value));
    document.getElementById('export-btn').addEventListener('click', exportLayout);
    document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-file').click());
    document.getElementById('toggle-crew-btn').addEventListener('click', toggleCrewAvatars);
    document.getElementById('reset-btn').addEventListener('click', resetHabitat);
    
    document.getElementById('import-file').addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try { loadLayout(JSON.parse(e.target.result)); }
            catch (error) { showFeedback('Invalid JSON file!', false); }
        };
        reader.readAsText(file);
        event.target.value = ''; // Reset file input
    });
    
    // Window Resize
    window.addEventListener('resize', () => {
        camera.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    });

    // Enhanced mouse events
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('contextmenu', onContextMenu);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', onKeyDown);
    
    // New UI controls
    document.getElementById('collapse-panel')?.addEventListener('click', toggleControlPanel);
    document.getElementById('fullscreen-btn')?.addEventListener('click', toggleFullscreen);
    document.getElementById('view-preset-1')?.addEventListener('click', () => setViewPreset('orbital'));
    document.getElementById('view-preset-2')?.addEventListener('click', () => setViewPreset('interior'));
    document.getElementById('view-preset-3')?.addEventListener('click', () => setViewPreset('construction'));
    document.getElementById('screenshot-btn')?.addEventListener('click', takeScreenshot);
    
    // Zone editor controls
    setupZoneEditorControls();
}

// --- Enhanced Drag-and-Drop Logic ---
let isDragging = false;
let dragStartPosition = new THREE.Vector3();
let snapToGrid = true;
let multiSelectMode = false;
let selectedZones = [];

function onPointerDown(event) {
    if (event.button !== 0) return; // Only handle left mouse button
    
    mouse.x = (event.clientX / renderer.domElement.clientWidth) * 2 - 1;
    mouse.y = -(event.clientY / renderer.domElement.clientHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(zones);
    if (intersects.length > 0) {
        selectedZone = intersects[0].object;
        dragStartPosition.copy(selectedZone.position);
        controls.enabled = false;
        isDragging = true;
        
        // Enhanced selection feedback
        if (selectedZone.material.uniforms) {
            selectedZone.material.uniforms.selected.value = 1.0;
        }
        if (selectedZone.children[0] && selectedZone.children[0].material.uniforms) {
            selectedZone.children[0].material.uniforms.selected.value = 1.0;
        }
        
        showFeedback('Zone selected - drag to reposition', true);
        
        // Add to multi-selection if Ctrl is held
        if (event.ctrlKey && !selectedZones.includes(selectedZone)) {
            selectedZones.push(selectedZone);
            multiSelectMode = true;
        } else if (!event.ctrlKey) {
            // Clear previous selections
            clearZoneSelections();
            selectedZones = [selectedZone];
        }
    } else {
        // Clear selections if clicking empty space
        clearZoneSelections();
        selectedZones = [];
        multiSelectMode = false;
    }
}

function clearZoneSelections() {
    zones.forEach(zone => {
        if (zone.material.uniforms) {
            zone.material.uniforms.selected.value = 0.0;
        }
        if (zone.children[0] && zone.children[0].material.uniforms) {
            zone.children[0].material.uniforms.selected.value = 0.0;
        }
    });
}

function onPointerMove(event) {
    if (selectedZone && isDragging) {
        mouse.x = (event.clientX / renderer.domElement.clientWidth) * 2 - 1;
        mouse.y = -(event.clientY / renderer.domElement.clientHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        const intersects = raycaster.intersectObject(habitatFloor);
        if (intersects.length > 0) {
            let point = intersects[0].point;
            const radius = parseFloat(document.getElementById('radius').value);
            
            // Snap to grid if enabled
            if (snapToGrid) {
                const gridSize = 1.0;
                point.x = Math.round(point.x / gridSize) * gridSize;
                point.z = Math.round(point.z / gridSize) * gridSize;
            }
            
            // Boundary check with buffer for zone size
            const distanceFromCenter = Math.sqrt(point.x * point.x + point.z * point.z);
            const maxDistance = radius - 1.5; // Account for zone size
            const isValidPlacement = distanceFromCenter < maxDistance;
            
            // Collision detection with other zones
            let hasCollision = false;
            for (let zone of zones) {
                if (zone !== selectedZone) {
                    const distance = selectedZone.position.distanceTo(zone.position);
                    if (distance < 2.5) { // Minimum distance between zones
                        hasCollision = true;
                        break;
                    }
                }
            }
            
            const finalValid = isValidPlacement && !hasCollision;
            
            // Visual feedback
            const feedbackColor = finalValid ? 0x00ff00 : 0xff0000;
            if (selectedZone.children[0] && selectedZone.children[0].material.uniforms) {
                selectedZone.children[0].material.uniforms.color.value.setHex(
                    finalValid ? zoneColors[selectedZone.userData.type] : feedbackColor
                );
            }
            
            // Update position
            selectedZone.position.set(point.x, 1, point.z);
            
            // Show placement feedback
            const feedbackText = finalValid ? 
                'Valid placement' : 
                (hasCollision ? 'Too close to another zone' : 'Outside habitat boundary');
            showFeedback(feedbackText, finalValid);
        }
    } else {
        // Hover effects for non-selected zones
        mouse.x = (event.clientX / renderer.domElement.clientWidth) * 2 - 1;
        mouse.y = -(event.clientY / renderer.domElement.clientHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        
        const intersects = raycaster.intersectObjects(zones);
        
        // Reset all hover states
        zones.forEach(zone => {
            if (!selectedZones.includes(zone) && zone.material.uniforms) {
                zone.material.uniforms.selected.value = 0.0;
            }
        });
        
        // Apply hover effect
        if (intersects.length > 0 && !isDragging) {
            const hoveredZone = intersects[0].object;
            if (!selectedZones.includes(hoveredZone) && hoveredZone.material.uniforms) {
                hoveredZone.material.uniforms.selected.value = 0.3;
            }
            document.body.style.cursor = 'pointer';
        } else {
            document.body.style.cursor = 'default';
        }
    }
}

function onPointerUp(event) {
    if (selectedZone && isDragging) {
        controls.enabled = true;
        isDragging = false;
        
        // Validate final position
        const radius = parseFloat(document.getElementById('radius').value);
        const distanceFromCenter = Math.sqrt(
            selectedZone.position.x * selectedZone.position.x + 
            selectedZone.position.z * selectedZone.position.z
        );
        
        // Check collision with other zones
        let hasCollision = false;
        for (let zone of zones) {
            if (zone !== selectedZone) {
                const distance = selectedZone.position.distanceTo(zone.position);
                if (distance < 2.5) {
                    hasCollision = true;
                    break;
                }
            }
        }
        
        const isValidPlacement = distanceFromCenter < (radius - 1.5) && !hasCollision;
        
        if (!isValidPlacement) {
            // Revert to original position with smooth animation
            animateZoneToPosition(selectedZone, dragStartPosition);
            showFeedback('Invalid placement - zone returned to original position', false);
        } else {
            showFeedback('Zone positioned successfully', true);
        }
        
        // Reset visual feedback
        if (selectedZone.children[0] && selectedZone.children[0].material.uniforms) {
            selectedZone.children[0].material.uniforms.color.value.setHex(zoneColors[selectedZone.userData.type]);
        }
        
        // Keep selection unless clicking empty space next
        if (!multiSelectMode && !event.ctrlKey) {
            setTimeout(() => {
                if (selectedZone && selectedZone.material.uniforms) {
                    selectedZone.material.uniforms.selected.value = 0.0;
                }
                if (selectedZone && selectedZone.children[0] && selectedZone.children[0].material.uniforms) {
                    selectedZone.children[0].material.uniforms.selected.value = 0.0;
                }
                selectedZone = null;
            }, 1000);
        }
    }
}

function animateZoneToPosition(zone, targetPosition) {
    const startPosition = zone.position.clone();
    const distance = startPosition.distanceTo(targetPosition);
    const duration = Math.min(distance * 200, 1000); // Max 1 second
    const startTime = performance.now();
    
    function animate() {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Smooth easing
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        
        zone.position.lerpVectors(startPosition, targetPosition, easeProgress);
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    }
    
    animate();
}

// Right-click context menu
function onContextMenu(event) {
    event.preventDefault();
    
    mouse.x = (event.clientX / renderer.domElement.clientWidth) * 2 - 1;
    mouse.y = -(event.clientY / renderer.domElement.clientHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(zones);
    if (intersects.length > 0) {
        const zone = intersects[0].object;
        showZoneContextMenu(event.clientX, event.clientY, zone);
    }
}

function showZoneContextMenu(x, y, zone) {
    // Remove existing context menu
    const existingMenu = document.querySelector('.context-menu');
    if (existingMenu) {
        existingMenu.remove();
    }
    
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.cssText = `
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        background: rgba(15, 23, 42, 0.95);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(0, 212, 255, 0.3);
        border-radius: 8px;
        padding: 10px;
        z-index: 10000;
        min-width: 150px;
    `;
    
    const menuItems = [
        { text: '🔄 Rotate Zone', action: () => rotateZone(zone) },
        { text: '📏 Scale Zone', action: () => scaleZone(zone) },
        { text: '📋 Duplicate Zone', action: () => duplicateZone(zone) },
        { text: '🗑️ Delete Zone', action: () => removeZone(zone.userData.id) }
    ];
    
    menuItems.forEach(item => {
        const menuItem = document.createElement('div');
        menuItem.textContent = item.text;
        menuItem.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            border-radius: 4px;
            font-size: 12px;
            color: white;
            transition: all 0.2s ease;
        `;
        menuItem.onmouseenter = () => {
            menuItem.style.background = 'rgba(0, 212, 255, 0.2)';
        };
        menuItem.onmouseleave = () => {
            menuItem.style.background = 'transparent';
        };
        menuItem.onclick = () => {
            item.action();
            menu.remove();
        };
        menu.appendChild(menuItem);
    });
    
    document.body.appendChild(menu);
    
    // Remove menu when clicking elsewhere
    setTimeout(() => {
        document.addEventListener('click', function removeMenu() {
            menu.remove();
            document.removeEventListener('click', removeMenu);
        });
    }, 100);
}

function rotateZone(zone) {
    const currentRotation = zone.rotation.y;
    const targetRotation = currentRotation + Math.PI / 2;
    const startTime = performance.now();
    const duration = 500;
    
    function animate() {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        
        zone.rotation.y = currentRotation + (targetRotation - currentRotation) * easeProgress;
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    }
    
    animate();
    showFeedback('Zone rotated 90 degrees', true);
}

function scaleZone(zone) {
    const currentScale = zone.scale.x;
    const targetScale = currentScale === 1 ? 1.2 : 1;
    const startTime = performance.now();
    const duration = 300;
    
    function animate() {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        
        const newScale = currentScale + (targetScale - currentScale) * easeProgress;
        zone.scale.setScalar(newScale);
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    }
    
    animate();
    showFeedback(`Zone ${targetScale > 1 ? 'enlarged' : 'restored'}`, true);
}

function duplicateZone(zone) {
    const offset = new THREE.Vector3(3, 0, 0);
    const newPosition = zone.position.clone().add(offset);
    addZone(zone.userData.type, newPosition);
    showFeedback('Zone duplicated', true);
}

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    
    const time = performance.now() * 0.001;
    
    // Update shader uniforms
    if (starField) {
        starField.material.uniforms.time.value = time;
    }
    if (nebula) {
        nebula.material.uniforms.time.value = time;
    }
    if (habitat && habitat.material.uniforms) {
        habitat.material.uniforms.time.value = time;
    }
    if (habitatFloor && habitatFloor.material.uniforms) {
        habitatFloor.material.uniforms.time.value = time;
    }
    
    // Update zone materials
    zones.forEach(zone => {
        if (zone.material.uniforms) {
            zone.material.uniforms.time.value = time;
            if (zone.children[0] && zone.children[0].material.uniforms) {
                zone.children[0].material.uniforms.time.value = time;
            }
        }
    });
    
    // Update atmospheric particles
    if (ambientParticles && ambientParticles.material.uniforms) {
        ambientParticles.material.uniforms.time.value = time;
    }
    
    // Update crew avatar particles
    crewAvatars.forEach((avatar, index) => {
        if (avatar.userData.particles) {
            avatar.userData.particles.material.uniforms.time.value = time;
            
            // Update particle trail positions
            const positions = avatar.userData.particles.geometry.attributes.position.array;
            
            // Add current position to trail
            if (!avatar.userData.particlePositions) {
                avatar.userData.particlePositions = [];
            }
            
            avatar.userData.particlePositions.push({
                x: avatar.position.x,
                y: avatar.position.y + 1,
                z: avatar.position.z,
                time: time
            });
            
            // Keep only recent positions
            avatar.userData.particlePositions = avatar.userData.particlePositions.filter(p => time - p.time < 5);
            
            // Update particle positions
            for (let i = 0; i < Math.min(50, avatar.userData.particlePositions.length); i++) {
                const pos = avatar.userData.particlePositions[avatar.userData.particlePositions.length - 1 - i];
                if (pos) {
                    positions[i * 3] = pos.x + (Math.random() - 0.5) * 0.5;
                    positions[i * 3 + 1] = pos.y + (Math.random() - 0.5) * 0.5;
                    positions[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.5;
                }
            }
            
            avatar.userData.particles.geometry.attributes.position.needsUpdate = true;
        }
        
        // Gentle floating animation for crew
        avatar.position.y = 0.2 + Math.sin(time * 2 + index) * 0.1;
        avatar.rotation.y += 0.005;
    });
    
    // Subtle rotation for space environment
    if (starField) {
        starField.rotation.y += 0.0002;
    }
    if (nebula) {
        nebula.rotation.y -= 0.0001;
        nebula.rotation.x += 0.00005;
    }
    
    controls.update();
    renderer.render(scene, camera);
}

// --- Enhanced UI Functions ---
function onKeyDown(event) {
    switch(event.code) {
        case 'KeyG':
            snapToGrid = !snapToGrid;
            showFeedback(`Grid snapping ${snapToGrid ? 'enabled' : 'disabled'}`, true);
            break;
        case 'Delete':
        case 'Backspace':
            if (selectedZones.length > 0) {
                selectedZones.forEach(zone => removeZone(zone.userData.id));
                selectedZones = [];
                showFeedback('Selected zones deleted', true);
            }
            break;
        case 'KeyR':
            if (selectedZone) {
                rotateZone(selectedZone);
            }
            break;
        case 'KeyS':
            if (selectedZone) {
                scaleZone(selectedZone);
            }
            break;
        case 'Escape':
            clearZoneSelections();
            selectedZones = [];
            selectedZone = null;
            break;
    }
}

function toggleControlPanel() {
    const panel = document.getElementById('controls');
    const button = document.getElementById('collapse-panel');
    panel.classList.toggle('collapsed');
    button.textContent = panel.classList.contains('collapsed') ? '›' : '‹';
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}

function setViewPreset(preset) {
    const duration = 1000;
    const startPosition = camera.position.clone();
    const startTarget = controls.target.clone();
    let endPosition, endTarget;
    
    switch(preset) {
        case 'orbital':
            endPosition = new THREE.Vector3(25, 20, 25);
            endTarget = new THREE.Vector3(0, 0, 0);
            break;
        case 'interior':
            endPosition = new THREE.Vector3(0, 5, 8);
            endTarget = new THREE.Vector3(0, 1, 0);
            break;
        case 'construction':
            endPosition = new THREE.Vector3(15, 8, 15);
            endTarget = new THREE.Vector3(0, 1, 0);
            break;
    }
    
    const startTime = performance.now();
    
    function animateCamera() {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        
        camera.position.lerpVectors(startPosition, endPosition, easeProgress);
        controls.target.lerpVectors(startTarget, endTarget, easeProgress);
        controls.update();
        
        if (progress < 1) {
            requestAnimationFrame(animateCamera);
        }
    }
    
    animateCamera();
    showFeedback(`Switched to ${preset} view`, true);
}

function takeScreenshot() {
    // Temporarily hide UI elements
    const ui = document.querySelector('.hud-overlay');
    const controls = document.querySelector('.control-panel');
    const floatingControls = document.querySelector('.floating-controls');
    
    ui.style.display = 'none';
    controls.style.display = 'none';
    floatingControls.style.display = 'none';
    
    // Render frame
    renderer.render(scene, camera);
    
    // Capture screenshot
    const canvas = renderer.domElement;
    const link = document.createElement('a');
    link.download = `nexus-habitat-${new Date().toISOString().slice(0,10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    
    // Restore UI
    ui.style.display = '';
    controls.style.display = '';
    floatingControls.style.display = '';
    
    showFeedback('Screenshot captured!', true);
}

// --- Zone Editor Functions ---
function setupZoneEditorControls() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchEditorTab(btn.dataset.tab));
    });
    
    // Close editor
    document.getElementById('close-editor')?.addEventListener('click', closeZoneEditor);
    
    // Position controls
    ['x', 'y', 'z'].forEach(axis => {
        const input = document.getElementById(`zone-pos-${axis}`);
        if (input) {
            input.addEventListener('input', () => updateZonePosition());
        }
    });
    
    // Rotation controls
    ['x', 'y', 'z'].forEach(axis => {
        const input = document.getElementById(`zone-rot-${axis}`);
        const display = document.getElementById(`rot-${axis}-value`);
        if (input && display) {
            input.addEventListener('input', (e) => {
                display.textContent = `${e.target.value}°`;
                updateZoneRotation();
            });
        }
    });
    
    // Scale controls
    const scaleInput = document.getElementById('zone-scale');
    const scaleDisplay = document.getElementById('scale-value');
    const lockBtn = document.getElementById('lock-scale');
    
    if (scaleInput && scaleDisplay) {
        scaleInput.addEventListener('input', (e) => {
            scaleDisplay.textContent = `${parseFloat(e.target.value).toFixed(1)}x`;
            if (uniformScaling) {
                updateZoneScale();
            }
        });
    }
    
    if (lockBtn) {
        lockBtn.addEventListener('click', () => {
            uniformScaling = !uniformScaling;
            lockBtn.textContent = uniformScaling ? '🔒' : '🔓';
            lockBtn.classList.toggle('unlocked', !uniformScaling);
            document.getElementById('individual-scale').style.display = uniformScaling ? 'none' : 'grid';
        });
    }
    
    // Individual scale controls
    ['x', 'y', 'z'].forEach(axis => {
        const input = document.getElementById(`zone-scale-${axis}`);
        const display = document.getElementById(`scale-${axis}-value`);
        if (input && display) {
            input.addEventListener('input', (e) => {
                display.textContent = parseFloat(e.target.value).toFixed(1);
                if (!uniformScaling) {
                    updateZoneScale();
                }
            });
        }
    });
    
    // Dimension controls
    ['width', 'height', 'depth'].forEach(dim => {
        const input = document.getElementById(`zone-${dim}`);
        if (input) {
            input.addEventListener('input', () => {
                updateZoneDimensions();
                calculateZoneValues();
            });
        }
    });
    
    // Zone type change
    const typeSelect = document.getElementById('zone-type-edit');
    if (typeSelect) {
        typeSelect.addEventListener('change', (e) => {
            if (currentEditingZone) {
                currentEditingZone.userData.type = e.target.value;
                updateZoneColor();
                updateZonesList();
            }
        });
    }
    
    // Zone shape change
    const shapeSelect = document.getElementById('zone-shape');
    if (shapeSelect) {
        shapeSelect.addEventListener('change', () => updateZoneShape());
    }
    
    // Color controls
    const colorInput = document.getElementById('zone-color');
    if (colorInput) {
        colorInput.addEventListener('input', (e) => {
            if (currentEditingZone) {
                const color = new THREE.Color(e.target.value);
                zoneColors[currentEditingZone.userData.type] = color.getHex();
                updateZoneColor();
            }
        });
    }
    
    // Preset color buttons
    document.querySelectorAll('.preset-color').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const color = e.target.dataset.color;
            document.getElementById('zone-color').value = color;
            if (currentEditingZone) {
                const colorObj = new THREE.Color(color);
                zoneColors[currentEditingZone.userData.type] = colorObj.getHex();
                updateZoneColor();
            }
        });
    });
    
    // Material controls
    const opacityInput = document.getElementById('zone-opacity');
    const opacityDisplay = document.getElementById('opacity-value');
    if (opacityInput && opacityDisplay) {
        opacityInput.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            opacityDisplay.textContent = `${Math.round(value * 100)}%`;
            updateZoneMaterial();
        });
    }
    
    const glowInput = document.getElementById('zone-glow');
    const glowDisplay = document.getElementById('glow-value');
    if (glowInput && glowDisplay) {
        glowInput.addEventListener('input', (e) => {
            glowDisplay.textContent = parseFloat(e.target.value).toFixed(1);
            updateZoneMaterial();
        });
    }
    
    // Action buttons
    document.getElementById('apply-changes')?.addEventListener('click', applyZoneChanges);
    document.getElementById('reset-zone')?.addEventListener('click', resetZoneToDefaults);
}

function openZoneEditor(zone) {
    currentEditingZone = zone;
    
    // Show editor panel
    const editor = document.getElementById('zone-editor');
    editor.style.display = 'block';
    
    // Update editor title
    document.getElementById('selected-zone-name').textContent = zone.userData.type.charAt(0).toUpperCase() + zone.userData.type.slice(1);
    
    // Populate form with current values
    populateZoneEditor(zone);
    
    // Scroll to editor
    editor.scrollIntoView({ behavior: 'smooth' });
    
    showFeedback('Zone editor opened', true);
}

function populateZoneEditor(zone) {
    // Position
    document.getElementById('zone-pos-x').value = zone.position.x.toFixed(1);
    document.getElementById('zone-pos-y').value = zone.position.y.toFixed(1);
    document.getElementById('zone-pos-z').value = zone.position.z.toFixed(1);
    
    // Rotation (convert from radians to degrees)
    document.getElementById('zone-rot-x').value = Math.round(zone.rotation.x * 180 / Math.PI);
    document.getElementById('zone-rot-y').value = Math.round(zone.rotation.y * 180 / Math.PI);
    document.getElementById('zone-rot-z').value = Math.round(zone.rotation.z * 180 / Math.PI);
    
    // Update rotation displays
    document.getElementById('rot-x-value').textContent = `${Math.round(zone.rotation.x * 180 / Math.PI)}°`;
    document.getElementById('rot-y-value').textContent = `${Math.round(zone.rotation.y * 180 / Math.PI)}°`;
    document.getElementById('rot-z-value').textContent = `${Math.round(zone.rotation.z * 180 / Math.PI)}°`;
    
    // Scale
    document.getElementById('zone-scale').value = zone.scale.x.toFixed(1);
    document.getElementById('scale-value').textContent = `${zone.scale.x.toFixed(1)}x`;
    
    if (!uniformScaling) {
        document.getElementById('zone-scale-x').value = zone.scale.x.toFixed(1);
        document.getElementById('zone-scale-y').value = zone.scale.y.toFixed(1);
        document.getElementById('zone-scale-z').value = zone.scale.z.toFixed(1);
        document.getElementById('scale-x-value').textContent = zone.scale.x.toFixed(1);
        document.getElementById('scale-y-value').textContent = zone.scale.y.toFixed(1);
        document.getElementById('scale-z-value').textContent = zone.scale.z.toFixed(1);
    }
    
    // Zone type
    document.getElementById('zone-type-edit').value = zone.userData.type;
    
    // Dimensions (assuming original geometry)
    const dims = zone.userData.originalDimensions || { width: 2, height: 2, depth: 2 };
    document.getElementById('zone-width').value = dims.width;
    document.getElementById('zone-height').value = dims.height;
    document.getElementById('zone-depth').value = dims.depth;
    
    // Zone color
    const currentColor = `#${new THREE.Color(zoneColors[zone.userData.type] || 0x00a8ff).getHexString()}`;
    document.getElementById('zone-color').value = currentColor;
    
    // Material properties
    document.getElementById('zone-opacity').value = zone.material.transparent ? (zone.material.opacity || 0.9) : 0.9;
    document.getElementById('opacity-value').textContent = `${Math.round((zone.material.opacity || 0.9) * 100)}%`;
    
    calculateZoneValues();
}

function switchEditorTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Show/hide tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = 'none';
    });
    document.getElementById(`${tabName}-tab`).style.display = 'block';
}

function updateZonePosition() {
    if (!currentEditingZone) return;
    
    const x = parseFloat(document.getElementById('zone-pos-x').value);
    const y = parseFloat(document.getElementById('zone-pos-y').value);
    const z = parseFloat(document.getElementById('zone-pos-z').value);
    
    currentEditingZone.position.set(x, y, z);
}

function updateZoneRotation() {
    if (!currentEditingZone) return;
    
    const x = parseFloat(document.getElementById('zone-rot-x').value) * Math.PI / 180;
    const y = parseFloat(document.getElementById('zone-rot-y').value) * Math.PI / 180;
    const z = parseFloat(document.getElementById('zone-rot-z').value) * Math.PI / 180;
    
    currentEditingZone.rotation.set(x, y, z);
}

function updateZoneScale() {
    if (!currentEditingZone) return;
    
    if (uniformScaling) {
        const scale = parseFloat(document.getElementById('zone-scale').value);
        currentEditingZone.scale.setScalar(scale);
    } else {
        const x = parseFloat(document.getElementById('zone-scale-x').value);
        const y = parseFloat(document.getElementById('zone-scale-y').value);
        const z = parseFloat(document.getElementById('zone-scale-z').value);
        currentEditingZone.scale.set(x, y, z);
    }
    
    calculateZoneValues();
}

function updateZoneDimensions() {
    if (!currentEditingZone) return;
    
    const width = parseFloat(document.getElementById('zone-width').value);
    const height = parseFloat(document.getElementById('zone-height').value);
    const depth = parseFloat(document.getElementById('zone-depth').value);
    
    // Store original dimensions
    currentEditingZone.userData.originalDimensions = { width, height, depth };
    
    // Update geometry
    const newGeometry = new THREE.BoxGeometry(width, height, depth);
    currentEditingZone.geometry.dispose();
    currentEditingZone.geometry = newGeometry;
    
    // Update outline
    if (currentEditingZone.children[0]) {
        const newEdges = new THREE.EdgesGeometry(newGeometry);
        currentEditingZone.children[0].geometry.dispose();
        currentEditingZone.children[0].geometry = newEdges;
    }
}

function updateZoneShape() {
    if (!currentEditingZone) return;
    
    const shape = document.getElementById('zone-shape').value;
    const width = parseFloat(document.getElementById('zone-width').value);
    const height = parseFloat(document.getElementById('zone-height').value);
    const depth = parseFloat(document.getElementById('zone-depth').value);
    
    let newGeometry;
    switch (shape) {
        case 'cylinder':
            newGeometry = new THREE.CylinderGeometry(width/2, width/2, height, 16);
            break;
        case 'sphere':
            newGeometry = new THREE.SphereGeometry(width/2, 16, 12);
            break;
        default: // box
            newGeometry = new THREE.BoxGeometry(width, height, depth);
    }
    
    // Update geometry
    currentEditingZone.geometry.dispose();
    currentEditingZone.geometry = newGeometry;
    
    // Update outline
    if (currentEditingZone.children[0]) {
        const newEdges = new THREE.EdgesGeometry(newGeometry);
        currentEditingZone.children[0].geometry.dispose();
        currentEditingZone.children[0].geometry = newEdges;
    }
    
    currentEditingZone.userData.shape = shape;
    calculateZoneValues();
}

function updateZoneColor() {
    if (!currentEditingZone) return;
    
    const color = zoneColors[currentEditingZone.userData.type];
    if (currentEditingZone.material.uniforms && currentEditingZone.material.uniforms.color) {
        currentEditingZone.material.uniforms.color.value.setHex(color);
    }
    if (currentEditingZone.children[0] && currentEditingZone.children[0].material.uniforms && currentEditingZone.children[0].material.uniforms.color) {
        currentEditingZone.children[0].material.uniforms.color.value.setHex(color);
    }
    
    updateZonesList();
}

function updateZoneMaterial() {
    if (!currentEditingZone) return;
    
    const opacity = parseFloat(document.getElementById('zone-opacity').value);
    const glow = parseFloat(document.getElementById('zone-glow').value);
    
    if (currentEditingZone.material) {
        currentEditingZone.material.transparent = opacity < 1;
        currentEditingZone.material.opacity = opacity;
    }
    
    // Update glow effect if shader material
    if (currentEditingZone.material.uniforms && currentEditingZone.material.uniforms.selected) {
        // Use glow value to enhance the selected effect
        currentEditingZone.material.uniforms.selected.value = glow * 0.5;
    }
}

function calculateZoneValues() {
    if (!currentEditingZone) return;
    
    const dims = currentEditingZone.userData.originalDimensions || { width: 2, height: 2, depth: 2 };
    const scale = currentEditingZone.scale;
    const shape = currentEditingZone.userData.shape || 'box';
    
    const actualWidth = dims.width * scale.x;
    const actualHeight = dims.height * scale.y;
    const actualDepth = dims.depth * scale.z;
    
    let volume, area, surface;
    
    switch (shape) {
        case 'cylinder':
            const radius = actualWidth / 2;
            volume = Math.PI * radius * radius * actualHeight;
            area = Math.PI * radius * radius;
            surface = 2 * Math.PI * radius * (radius + actualHeight);
            break;
        case 'sphere':
            const sphereRadius = actualWidth / 2;
            volume = (4/3) * Math.PI * Math.pow(sphereRadius, 3);
            area = Math.PI * sphereRadius * sphereRadius;
            surface = 4 * Math.PI * sphereRadius * sphereRadius;
            break;
        default: // box
            volume = actualWidth * actualHeight * actualDepth;
            area = actualWidth * actualDepth;
            surface = 2 * (actualWidth * actualHeight + actualWidth * actualDepth + actualHeight * actualDepth);
    }
    
    document.getElementById('zone-volume').textContent = `${volume.toFixed(2)} m³`;
    document.getElementById('zone-area').textContent = `${area.toFixed(2)} m²`;
    document.getElementById('zone-surface').textContent = `${surface.toFixed(2)} m²`;
}

function applyZoneChanges() {
    if (!currentEditingZone) return;
    
    updateZonePosition();
    updateZoneRotation();
    updateZoneScale();
    updateZoneDimensions();
    updateZoneColor();
    updateZoneMaterial();
    
    showFeedback('Zone changes applied successfully!', true);
}

function resetZoneToDefaults() {
    if (!currentEditingZone) return;
    
    currentEditingZone.position.set(0, 1, 0);
    currentEditingZone.rotation.set(0, 0, 0);
    currentEditingZone.scale.setScalar(1);
    
    populateZoneEditor(currentEditingZone);
    applyZoneChanges();
    
    showFeedback('Zone reset to defaults', true);
}

function closeZoneEditor() {
    document.getElementById('zone-editor').style.display = 'none';
    currentEditingZone = null;
    
    // Clear zone selection in list
    document.querySelectorAll('.zone-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    showFeedback('Zone editor closed', true);
}

// --- UI Enhancement Functions ---
function createRippleEffect(event) {
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    const ripple = document.createElement('span');
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;
    
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    ripple.classList.add('ripple');
    
    button.appendChild(ripple);
    
    setTimeout(() => {
        ripple.remove();
    }, 600);
}

// Add ripple effects to all buttons
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('button').forEach(button => {
        button.addEventListener('click', createRippleEffect);
    });
});

// Dynamic starfield generation for CSS
function generateStarfield() {
    const starfield = document.getElementById('starfield');
    if (!starfield) return;
    
    let css = '';
    const numStars = 100;
    
    for (let i = 0; i < numStars; i++) {
        const x = Math.random() * 100;
        const y = Math.random() * 100;
        const size = Math.random() * 2 + 1;
        const duration = Math.random() * 3 + 2;
        const delay = Math.random() * 5;
        
        css += `
            &::after {
                content: '';
                position: absolute;
                left: ${x}%;
                top: ${y}%;
                width: ${size}px;
                height: ${size}px;
                background: white;
                border-radius: 50%;
                animation: twinkle ${duration}s ease-in-out ${delay}s infinite alternate;
            }
        `;
    }
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes twinkle {
            from { opacity: 0.3; transform: scale(1); }
            to { opacity: 1; transform: scale(1.2); }
        }
    `;
    document.head.appendChild(style);
}

// Initialize enhanced UI
document.addEventListener('DOMContentLoaded', () => {
    generateStarfield();
    
    // Add smooth transitions to all interactive elements
    const interactiveElements = document.querySelectorAll('button, select, input, .zone-item');
    interactiveElements.forEach(element => {
        element.classList.add('gpu-accelerated');
    });
    
    // Add loading state management
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
        const originalText = button.textContent;
        button.addEventListener('click', () => {
            button.classList.add('loading');
            setTimeout(() => {
                button.classList.remove('loading');
            }, 1000);
        });
    });
});

// --- Start Application ---
init();