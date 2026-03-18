import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Download, Settings2, Image as ImageIcon, Box, Layers, SlidersHorizontal, Info } from 'lucide-react';

const workerCode = `
self.onmessage = function(e) {
    const { imgData, width, height, settings } = e.data;
    const data = imgData;
    const len = data.length;

    const outHeight = new Uint8ClampedArray(len);
    const outNormal = new Uint8ClampedArray(len);
    const outAO = new Uint8ClampedArray(len);
    const outRoughness = new Uint8ClampedArray(len);
    const outSmoothness = new Uint8ClampedArray(len);

    const heightMap = new Float32Array(width * height);

    for (let i = 0; i < len; i += 4) {
        let r = data[i], g = data[i+1], b = data[i+2];
        let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (settings.invertHeight) lum = 255 - lum;

        let contrast = settings.heightContrast;
        let val = ((lum / 255 - 0.5) * contrast + 0.5) * 255;
        val = Math.max(0, Math.min(255, val));

        heightMap[i/4] = val;

        outHeight[i] = val;
        outHeight[i+1] = val;
        outHeight[i+2] = val;
        outHeight[i+3] = 255;
    }

    const getH = (x, y) => {
        x = Math.max(0, Math.min(width - 1, x));
        y = Math.max(0, Math.min(height - 1, y));
        return heightMap[y * width + x];
    };

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let idx = (y * width + x) * 4;
            let cc = heightMap[y * width + x];

            let tl = getH(x-1, y-1), tc = getH(x, y-1), tr = getH(x+1, y-1);
            let cl = getH(x-1, y),                      cr = getH(x+1, y);
            let bl = getH(x-1, y+1), bc = getH(x, y+1), br = getH(x+1, y+1);

            let dX = (tl + 2.0*cl + bl) - (tr + 2.0*cr + br);
            let dY;
            
            if (settings.directX) {
                dY = (tl + 2.0*tc + tr) - (bl + 2.0*bc + br);
            } else {
                dY = (bl + 2.0*bc + br) - (tl + 2.0*tc + tr);
            }

            dX /= 255.0;
            dY /= 255.0;
            let dZ = 1.0 / Math.max(0.01, settings.normalStrength);

            let lenSq = dX*dX + dY*dY + dZ*dZ;
            let vecLen = Math.sqrt(lenSq);

            outNormal[idx] = ((dX/vecLen) * 0.5 + 0.5) * 255;
            outNormal[idx+1] = ((dY/vecLen) * 0.5 + 0.5) * 255;
            outNormal[idx+2] = ((dZ/vecLen) * 0.5 + 0.5) * 255;
            outNormal[idx+3] = 255;

            let aoVal = 255 - ((255 - cc) * settings.aoStrength);
            aoVal = Math.max(0, Math.min(255, aoVal));
            outAO[idx] = aoVal;
            outAO[idx+1] = aoVal;
            outAO[idx+2] = aoVal;
            outAO[idx+3] = 255;

            let rough = settings.invertRoughness ? 255 - cc : cc;
            let rVal = ((rough / 255 - 0.5) * settings.roughnessContrast + 0.5) * 255;
            rVal = Math.max(0, Math.min(255, rVal));
            outRoughness[idx] = rVal;
            outRoughness[idx+1] = rVal;
            outRoughness[idx+2] = rVal;
            outRoughness[idx+3] = 255;

            let sVal = 255 - rVal;
            outSmoothness[idx] = sVal;
            outSmoothness[idx+1] = sVal;
            outSmoothness[idx+2] = sVal;
            outSmoothness[idx+3] = 255;
        }
    }

    self.postMessage({ outHeight, outNormal, outAO, outRoughness, outSmoothness });
}
`;

const TARGET_CONFIGS = {
  'Universal': [
    { id: 'base', name: 'Albedo / Diffuse' },
    { id: 'normal', name: 'Normal Map' },
    { id: 'height', name: 'Height Map' },
    { id: 'displacement', name: 'Displacement' },
    { id: 'ao', name: 'Ambient Occlusion' },
    { id: 'roughness', name: 'Roughness Map' },
  ],
  'Unity': [
    { id: 'base', name: 'Albedo' },
    { id: 'normal', name: 'Normal Map' },
    { id: 'height', name: 'Height Map' },
    { id: 'ao', name: 'Occlusion' },
    { id: 'smoothness', name: 'Smoothness' },
  ],
  'Unreal': [
    { id: 'base', name: 'Base Color' },
    { id: 'normal', name: 'Normal Map' },
    { id: 'displacement', name: 'Displacement (WPO)' },
    { id: 'ao', name: 'Ambient Occlusion' },
    { id: 'roughness', name: 'Roughness' },
  ],
  'Blender': [
    { id: 'base', name: 'Base Color' },
    { id: 'normal', name: 'Normal' },
    { id: 'displacement', name: 'Displacement' },
    { id: 'ao', name: 'Ambient Occlusion' },
    { id: 'roughness', name: 'Roughness' },
  ]
};

const ALL_MAP_TYPES = [
  { id: 'base', refKey: 'base', defaultName: 'Albedo / Diffuse' },
  { id: 'normal', refKey: 'normal', defaultName: 'Normal Map' },
  { id: 'height', refKey: 'height', defaultName: 'Height Map' },
  { id: 'displacement', refKey: 'displacement', defaultName: 'Displacement' },
  { id: 'ao', refKey: 'ao', defaultName: 'Ambient Occlusion' },
  { id: 'roughness', refKey: 'roughness', defaultName: 'Roughness Map' },
  { id: 'smoothness', refKey: 'smoothness', defaultName: 'Smoothness' }
];

export default function App() {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [updateTick, setUpdateTick] = useState(0);
  const [resolution, setResolution] = useState({ w: 512, h: 512 });
  const [target, setTarget] = useState('Universal');
  const workerRef = useRef(null);
  const sourceCanvasRef = useRef(null);

  const canvasRefs = {
    height: useRef(null),
    displacement: useRef(null),
    normal: useRef(null),
    ao: useRef(null),
    roughness: useRef(null),
    smoothness: useRef(null)
  };

  const [settings, setSettings] = useState({
    normalStrength: 2.5,
    directX: true,
    heightContrast: 1.2,
    displacementScale: 0.1,
    invertHeight: false,
    aoStrength: 1.5,
    roughnessContrast: 1.0,
    invertRoughness: true
  });

  useEffect(() => {
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    workerRef.current = new Worker(workerUrl);

    workerRef.current.onmessage = (e) => {
      const { outHeight, outNormal, outAO, outRoughness, outSmoothness } = e.data;
      const { w, h } = resolution;

      const updateCanvas = (ref, dataArray) => {
        if (!ref.current) return;
        const ctx = ref.current.getContext('2d');
        const imgData = new ImageData(dataArray, w, h);
        ctx.putImageData(imgData, 0, 0);
      };

      updateCanvas(canvasRefs.height, outHeight);
      updateCanvas(canvasRefs.displacement, outHeight);
      updateCanvas(canvasRefs.normal, outNormal);
      updateCanvas(canvasRefs.ao, outAO);
      updateCanvas(canvasRefs.roughness, outRoughness);
      updateCanvas(canvasRefs.smoothness, outSmoothness);

      setIsProcessing(false);
      setUpdateTick(tick => tick + 1);
    };

    return () => {
      workerRef.current.terminate();
      URL.revokeObjectURL(workerUrl);
    };
  }, [resolution]);

  const processMaps = useCallback(() => {
    if (!imageLoaded || !workerRef.current || !sourceCanvasRef.current) return;

    setIsProcessing(true);
    const { w, h } = resolution;
    const ctx = sourceCanvasRef.current.getContext('2d');
    const imgData = ctx.getImageData(0, 0, w, h).data;

    workerRef.current.postMessage({
      imgData,
      width: w,
      height: h,
      settings
    });
  }, [imageLoaded, resolution, settings]);

  useEffect(() => {
    processMaps();
  }, [settings, processMaps]);

  useEffect(() => {
    const canvas = sourceCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const w = 512;
    const h = 512;
    canvas.width = w;
    canvas.height = h;
    setResolution({ w, h });

    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#8f8f8f';
    const rows = 12;
    const cols = 6;
    const rowH = h / rows;
    const colW = w / cols;
    const gap = 8;

    for (let r = 0; r < rows; r++) {
      let offset = (r % 2 === 0) ? 0 : colW / 2;
      for (let c = -1; c <= cols; c++) {
        let x = c * colW + offset;
        let y = r * rowH;
        let blockShade = 100 + Math.random() * 50;
        ctx.fillStyle = `rgb(${blockShade}, ${blockShade}, ${blockShade})`;
        ctx.fillRect(x + gap / 2, y + gap / 2, colW - gap, rowH - gap);
      }
    }

    const imgData = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < imgData.data.length; i += 4) {
      let noise = (Math.random() - 0.5) * 40;
      imgData.data[i] = Math.max(0, Math.min(255, imgData.data[i] + noise));
      imgData.data[i + 1] = Math.max(0, Math.min(255, imgData.data[i + 1] + noise));
      imgData.data[i + 2] = Math.max(0, Math.min(255, imgData.data[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    setImageLoaded(true);
  }, []);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1024;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }

        setResolution({ w, h });

        const canvas = sourceCanvasRef.current;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        setImageLoaded(true);
        processMaps();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSettingChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const downloadCanvas = (canvasRef, filename) => {
    if (!canvasRef.current) return;
    const link = document.createElement('action');
    const a = document.createElement('a');
    a.download = `${filename}.png`;
    a.href = canvasRef.current.toDataURL('image/png');
    a.click();
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 font-sans selection:bg-indigo-500/30">
      {/* Changed z-10 to z-50 here to prevent clipping */}
      <header className="border-b border-neutral-800 bg-neutral-900/50 p-4 sticky top-0 z-50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Layers className="w-6 h-6 text-indigo-400" />
            <h1 className="text-xl font-bold tracking-tight text-white">TexGen<span className="text-indigo-400">Pro</span></h1>
            <span className="text-xs font-medium bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded-full ml-2">Client-side</span>
          </div>

          <div className="flex items-center space-x-4">
            <div className="hidden md:flex bg-neutral-950 border border-neutral-800 rounded-lg p-1">
              {['Universal', 'Unity', 'Unreal', 'Blender'].map(t => (
                <button
                  key={t}
                  onClick={() => {
                    setTarget(t);
                    if (t === 'Unity' || t === 'Blender') handleSettingChange('directX', false);
                    if (t === 'Unreal') handleSettingChange('directX', true);
                  }}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${target === t ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
                >
                  {t}
                </button>
              ))}
            </div>

            <label className="cursor-pointer bg-indigo-600 hover:bg-indigo-500 transition-colors text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center space-x-2 shadow-lg shadow-indigo-900/20">
              <Upload className="w-4 h-4" />
              <span>Upload Base Texture</span>
              <input type="file" className="hidden" accept="image/png, image/jpeg, image/webp" onChange={handleImageUpload} />
            </label>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">

        <div className="lg:col-span-3 space-y-6">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-xl">
            <div className="flex items-center space-x-2 mb-4 pb-4 border-b border-neutral-800">
              <SlidersHorizontal className="w-5 h-5 text-indigo-400" />
              <h2 className="font-semibold text-white">Generation Settings</h2>
            </div>

            <div className="space-y-4 mb-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Normal Map</h3>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <label>Intensity</label>
                  <span className="text-indigo-400 font-mono">{settings.normalStrength.toFixed(1)}</span>
                </div>
                <input type="range" min="0.1" max="10" step="0.1"
                  className="w-full accent-indigo-500 cursor-pointer"
                  value={settings.normalStrength}
                  onChange={(e) => handleSettingChange('normalStrength', parseFloat(e.target.value))} />
              </div>
              <div className="flex items-center justify-between bg-neutral-950 p-2 rounded-lg border border-neutral-800">
                <span className="text-sm">Format</span>
                <div className="flex space-x-1">
                  <button onClick={() => handleSettingChange('directX', true)}
                    className={`px-3 py-1 text-xs font-medium rounded ${settings.directX ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}>DirectX</button>
                  <button onClick={() => handleSettingChange('directX', false)}
                    className={`px-3 py-1 text-xs font-medium rounded ${!settings.directX ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}>OpenGL</button>
                </div>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Height / Displacement</h3>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <label>Map Contrast</label>
                  <span className="text-indigo-400 font-mono">{settings.heightContrast.toFixed(1)}</span>
                </div>
                <input type="range" min="0.1" max="3" step="0.1"
                  className="w-full accent-indigo-500 cursor-pointer"
                  value={settings.heightContrast}
                  onChange={(e) => handleSettingChange('heightContrast', parseFloat(e.target.value))} />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <label>3D Preview Scale</label>
                  <span className="text-indigo-400 font-mono">{settings.displacementScale.toFixed(2)}</span>
                </div>
                <input type="range" min="0" max="0.5" step="0.01"
                  className="w-full accent-indigo-500 cursor-pointer"
                  value={settings.displacementScale}
                  onChange={(e) => handleSettingChange('displacementScale', parseFloat(e.target.value))} />
              </div>
              <label className="flex items-center space-x-2 cursor-pointer text-sm">
                <input type="checkbox" className="accent-indigo-500 w-4 h-4 rounded"
                  checked={settings.invertHeight}
                  onChange={(e) => handleSettingChange('invertHeight', e.target.checked)} />
                <span>Invert Height (Affects all maps)</span>
              </label>
            </div>

            <div className="space-y-4 mb-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Ambient Occlusion</h3>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <label>Strength</label>
                  <span className="text-indigo-400 font-mono">{settings.aoStrength.toFixed(1)}</span>
                </div>
                <input type="range" min="0" max="5" step="0.1"
                  className="w-full accent-indigo-500 cursor-pointer"
                  value={settings.aoStrength}
                  onChange={(e) => handleSettingChange('aoStrength', parseFloat(e.target.value))} />
              </div>
            </div>

            <div className="space-y-4 mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Roughness Map</h3>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <label>Contrast</label>
                  <span className="text-indigo-400 font-mono">{settings.roughnessContrast.toFixed(1)}</span>
                </div>
                <input type="range" min="0.1" max="3" step="0.1"
                  className="w-full accent-indigo-500 cursor-pointer"
                  value={settings.roughnessContrast}
                  onChange={(e) => handleSettingChange('roughnessContrast', parseFloat(e.target.value))} />
              </div>
              <label className="flex items-center space-x-2 cursor-pointer text-sm">
                <input type="checkbox" className="accent-indigo-500 w-4 h-4 rounded"
                  checked={settings.invertRoughness}
                  onChange={(e) => handleSettingChange('invertRoughness', e.target.checked)} />
                <span>Invert Roughness</span>
              </label>
            </div>
          </div>

          <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-xl p-4 flex items-start space-x-3">
            <Info className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-indigo-200/70 leading-relaxed">
              All processing happens locally in your browser via Web Workers. Images are temporarily downscaled to 1024x1024 if they exceed limits to preserve memory.
            </p>
          </div>
        </div>

        <div className="lg:col-span-9">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

            {ALL_MAP_TYPES.map(mapType => {
              const activeDef = TARGET_CONFIGS[target].find(t => t.id === mapType.id);
              const isVisible = !!activeDef;
              const title = activeDef ? activeDef.name : mapType.defaultName;
              const ref = mapType.refKey === 'base' ? sourceCanvasRef : canvasRefs[mapType.refKey];

              return (
                <div key={mapType.id} className={isVisible ? "block" : "hidden"}>
                  <MapCard title={title} id={mapType.id} isProcessing={isProcessing}>
                    <canvas ref={ref} width={resolution.w} height={resolution.h} className="w-full h-full object-contain bg-neutral-950" />
                    <DownloadButton onClick={() => downloadCanvas(ref, title.toLowerCase().replace(/ /g, '_'))} />
                  </MapCard>
                </div>
              );
            })}

            <ThreePreview
              sourceCanvasRef={sourceCanvasRef}
              canvasRefs={canvasRefs}
              updateTick={updateTick}
              settings={settings}
            />

          </div>
        </div>
      </main>
    </div>
  );
}

function MapCard({ title, children, isProcessing }) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden flex flex-col aspect-square relative group shadow-lg">
      <div className="p-3 bg-neutral-800/80 border-b border-neutral-800 flex justify-between items-center z-10 backdrop-blur-sm absolute top-0 left-0 right-0">
        <span className="font-medium text-sm text-neutral-200 flex items-center">
          <ImageIcon className="w-4 h-4 mr-2 text-neutral-400" />
          {title}
        </span>
        {isProcessing && <div className="w-2 h-2 rounded-full bg-indigo-500 animate-ping"></div>}
      </div>

      <div className="flex-1 relative w-full h-full checkerboard bg-neutral-950">
        <style dangerouslySetInnerHTML={{
          __html: `
                    .checkerboard {
                        background-image: linear-gradient(45deg, #1a1a1a 25%, transparent 25%), linear-gradient(-45deg, #1a1a1a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a1a1a 75%), linear-gradient(-45deg, transparent 75%, #1a1a1a 75%);
                        background-size: 20px 20px;
                        background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
                    }
                `}} />
        {children}
      </div>
    </div>
  );
}

function DownloadButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="absolute bottom-4 right-4 bg-neutral-800/80 hover:bg-indigo-600 text-white p-2.5 rounded-lg border border-neutral-700/50 hover:border-indigo-500 transition-all shadow-lg backdrop-blur opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0"
      title="Download Map"
    >
      <Download className="w-4 h-4" />
    </button>
  );
}

function ThreePreview({ sourceCanvasRef, canvasRefs, updateTick, settings }) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [shape, setShape] = useState('sphere');

  useEffect(() => {
    let reqId;

    const loadScript = (id, src) => new Promise((resolve, reject) => {
      if (document.getElementById(id)) return resolve();
      const s = document.createElement('script');
      s.id = id;
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });

    const initScene = async () => {
      if (!window.THREE) {
        await loadScript('three-js', 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
      }
      if (!window.THREE.OrbitControls) {
        await loadScript('three-orbit', 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js');
      }

      const THREE = window.THREE;
      const container = containerRef.current;
      if (!container) return;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#0a0a0a');

      const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
      camera.position.z = 3;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(window.devicePixelRatio);
      container.innerHTML = '';
      container.appendChild(renderer.domElement);

      const controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 1.0;

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
      scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
      dirLight.position.set(5, 5, 5);
      scene.add(dirLight);

      const pointLight = new THREE.PointLight(0xffffff, 0.5);
      pointLight.position.set(-5, -5, 5);
      scene.add(pointLight);

      const geometries = {
        sphere: new THREE.SphereGeometry(1, 256, 256),
        box: new THREE.BoxGeometry(1.5, 1.5, 1.5, 128, 128, 128),
        plane: new THREE.PlaneGeometry(2, 2, 256, 256)
      };

      Object.values(geometries).forEach(geo => {
        geo.setAttribute('uv2', new THREE.BufferAttribute(geo.attributes.uv.array, 2));
      });

      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.5,
        displacementScale: 0.1
      });

      const mesh = new THREE.Mesh(geometries.sphere, material);
      scene.add(mesh);

      sceneRef.current = { scene, camera, renderer, controls, material, mesh, geometries, dirLight };
      setIsLoaded(true);

      const animate = () => {
        reqId = requestAnimationFrame(animate);
        controls.update();

        const time = Date.now() * 0.0005;
        dirLight.position.x = Math.sin(time) * 5;
        dirLight.position.z = Math.cos(time) * 5;

        renderer.render(scene, camera);
      };
      animate();

      const onResize = () => {
        if (!container) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      };
      window.addEventListener('resize', onResize);

      return () => {
        window.removeEventListener('resize', onResize);
        cancelAnimationFrame(reqId);
        if (renderer) renderer.dispose();
      };
    };

    const cleanupPromise = initScene();
    return () => {
      cleanupPromise.then(cleanupFn => cleanupFn && cleanupFn());
    };
  }, []);

  useEffect(() => {
    if (!isLoaded || !sceneRef.current) return;
    const THREE = window.THREE;
    const { material } = sceneRef.current;

    const updateTex = (canvasRef, mapName) => {
      if (canvasRef.current && canvasRef.current.width > 0) {
        if (material[mapName]) {
          material[mapName].needsUpdate = true;
        } else {
          const tex = new THREE.CanvasTexture(canvasRef.current);
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.RepeatWrapping;
          material[mapName] = tex;
        }
      }
    };

    updateTex(sourceCanvasRef, 'map');
    updateTex(canvasRefs.normal, 'normalMap');
    updateTex(canvasRefs.height, 'displacementMap');
    updateTex(canvasRefs.ao, 'aoMap');
    updateTex(canvasRefs.roughness, 'roughnessMap');

    material.needsUpdate = true;
  }, [updateTick, isLoaded, sourceCanvasRef, canvasRefs]);

  useEffect(() => {
    if (!isLoaded || !sceneRef.current) return;
    sceneRef.current.material.displacementScale = settings.displacementScale;
  }, [settings.displacementScale, isLoaded]);

  useEffect(() => {
    if (!isLoaded || !sceneRef.current) return;
    sceneRef.current.mesh.geometry = sceneRef.current.geometries[shape];
  }, [shape, isLoaded]);

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden flex flex-col aspect-square relative group shadow-lg">
      <div className="p-3 bg-neutral-800/80 border-b border-neutral-800 flex justify-between items-center z-10 backdrop-blur-sm absolute top-0 left-0 right-0">
        <span className="font-medium text-sm text-neutral-200 flex items-center">
          <Box className="w-4 h-4 mr-2 text-indigo-400" />
          3D Preview
        </span>
        <div className="flex space-x-1 bg-neutral-950 p-1 rounded-lg border border-neutral-800">
          {['sphere', 'box', 'plane'].map(s => (
            <button
              key={s}
              onClick={() => setShape(s)}
              className={`px-2 py-0.5 text-xs font-medium rounded capitalize transition-colors ${shape === s ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div ref={containerRef} className="flex-1 w-full h-full cursor-grab active:cursor-grabbing bg-[#0a0a0a]" />
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/80 backdrop-blur-sm z-0">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  );
}