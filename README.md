<div align="center">
<h1>🎨 TexGen Pro</h1>
<p><strong>A lightning-fast, 100% client-side material map generator for 3D artists and game developers.</strong></p>

</div>

<br />

TexGen Pro allows you to instantly generate physically accurate PBR texture maps directly in your browser. Because it runs entirely via Web Workers and HTML5 Canvas, your files never leave your computer—ensuring zero latency and complete privacy.

✨ Features

⚡ Real-Time Generation: Adjust sliders (intensity, contrast, displacement) and see your texture maps update instantly.

🎮 Engine Profiles: 1-click presets for Unity, Unreal Engine, and Blender. Automatically handles OpenGL (Y+) vs. DirectX (Y-) normal map flipping and naming conventions.

🧊 Live 3D Preview: Inspect your generated maps mapped onto 3D geometry (Sphere, Box, Plane) using a dynamic WebGL viewport powered by Three.js.

🧱 Procedural Defaults: Loads an initial noise pattern automatically so you can test the application without needing to upload an image first.

🔒 Privacy First: Absolutely zero backend. Everything executes entirely in your local browser memory.

🗺️ Maps Generated

Depending on your selected Engine Profile, the tool intelligently outputs:

Albedo / Base Color (Passthrough)

Normal Map (Sobel operator edge-detection)

Height Map (Luminance mapping)

Displacement Map (For vertex displacement)

Ambient Occlusion (Crevice shadowing)

Roughness Map

Smoothness Map (Inverted roughness for Unity)

🚀 Quick Start (Live)

No installation required! Simply visit the live web app hosted on GitHub Pages:

👉 Launch TexGen Pro

Click Upload Base Texture (PNG, JPG, WEBP).

Select your target engine profile in the top right.

Tweak the generation sliders to your liking.

Hover over any generated map and click the Download icon to save the individual .png.

💻 Local Development

If you want to clone this repository and run it locally, follow these steps:

Prerequisites

Make sure you have Node.js and npm installed, as well as Git.

Installation

Clone the repository:

git clone [https://github.com/darealtoga/Texture-Generator.git](https://github.com/darealtoga/Texture-Generator.git)
cd Texture-Generator


Install dependencies:

npm install


Start the development server:

npm run dev


The app will be available at http://localhost:5173 (or the port Vite provides).

Building for Production

To create a production-ready build:

npm run build


This generates an optimized build in the dist folder.

🛠️ Technology Stack

React - UI Architecture and state management.

Vite - Next-generation frontend tooling and bundling.

Tailwind CSS v4 - Responsive, modern, utility-first styling.

Three.js - Real-time WebGL 3D preview.

Lucide Icons - Crisp, beautiful SVG icons.

📄 License

This project is open-source and available under the MIT License.
