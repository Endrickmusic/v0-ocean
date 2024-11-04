import React, { useRef, useMemo } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"

// Simulation material for generating the heightmap
const simMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uPrevState: { value: null },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform sampler2D uPrevState;
    varying vec2 vUv;

    //
    // GLSL textureless classic 2D noise "cnoise"
    // Author:  Stefan Gustavson
    //

    vec2 mod289(vec2 x) {
      return x - floor(x * (1.0 / 289.0)) * 289.0;
    }

    vec3 mod289(vec3 x) {
      return x - floor(x * (1.0 / 289.0)) * 289.0;
    }

    vec2 permute(vec2 x) {
      return mod289(((x*34.0)+1.0)*x);
    }

    vec3 permute(vec3 x) {
      return mod289(((x*34.0)+1.0)*x);
    }

    float snoise(vec2 v) {
      const vec4 C = vec4(0.211324865405187,  
                         0.366025403784439,  
                         -0.577350269189626,  
                         0.024390243902439); 
      vec2 i  = floor(v + dot(v, C.yy) );
      vec2 x0 = v -   i + dot(i, C.xx);
      vec2 i1;
      i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod289(i);
      vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
        + i.x + vec3(0.0, i1.x, 1.0 ));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m*m ;
      m = m*m ;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
      vec3 g;
      g.x  = a0.x  * x0.x  + h.x  * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }

    void main() {
      vec2 scale1 = vec2(2.6);
      vec2 scale2 = vec2(2.9);
      
      float noise1 = snoise(vUv * scale1 + uTime * 0.1);
      float noise2 = snoise(vUv * scale2 - uTime * 0.15);
      
      float height = (noise1 + noise2) * 0.5;
      
      gl_FragColor = vec4(height, 0.0, 0.0, 1.0);
    }
  `,
})

// Ocean material that uses the heightmap for displacement
const oceanMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uHeightmap: { value: null },
    uDepthColor: { value: new THREE.Color("#1e4d40") },
    uSurfaceColor: { value: new THREE.Color("#4c8d7d") },
    uColorOffset: { value: 0.8 },
    uColorMultiplier: { value: 4 },
  },
  vertexShader: `
    uniform sampler2D uHeightmap;
    varying float vElevation;
    
    void main() {
      vec4 modelPosition = modelMatrix * vec4(position, 1.0);
      
      vec2 texCoord = uv;
      vec4 heightData = texture2D(uHeightmap, texCoord);
      
      // Use the red channel for height
      float elevation = heightData.r;
      modelPosition.y = elevation * 4.0; // Scale the displacement
      
      vec4 viewPosition = viewMatrix * modelPosition;
      vec4 projectedPosition = projectionMatrix * viewPosition;
      
      gl_Position = projectedPosition;
      
      vElevation = elevation;
    }
  `,
  fragmentShader: `
    uniform vec3 uDepthColor;
    uniform vec3 uSurfaceColor;
    uniform float uColorOffset;
    uniform float uColorMultiplier;
    
    varying float vElevation;
    
    void main() {
      float mixStrength = (vElevation + uColorOffset) * uColorMultiplier;
      vec3 color = mix(uDepthColor, uSurfaceColor, mixStrength);
      
      gl_FragColor = vec4(color, 1.0);
    }
  `,
})

// Add debug material to visualize the heightmap
const debugMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uHeightmap: { value: null },
  },
  vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
  fragmentShader: `
      uniform sampler2D uHeightmap;
      varying vec2 vUv;
      
      void main() {
        vec4 heightData = texture2D(uHeightmap, vUv);
        // Visualize the height data in grayscale
        gl_FragColor = vec4(vec3(heightData.r), 1.0);
      }
    `,
})

// Debug plane component
const DebugPlane = ({ heightmapTexture }) => {
  const debugRef = useRef()

  useFrame(() => {
    if (debugRef.current) {
      debugRef.current.material.uniforms.uHeightmap.value = heightmapTexture
    }
  })

  return (
    <mesh
      ref={debugRef}
      material={debugMaterial}
      position={[30, 15, 0]} // Position to the right of the ocean
      rotation={[-Math.PI * 2.2, 0, 0]}
    >
      <planeGeometry args={[10, 10]} />
    </mesh>
  )
}

const Ocean = () => {
  const meshRef = useRef()
  const { gl } = useThree()

  // Create FBOs for ping-pong
  const [heightmapFBO1, heightmapFBO2] = useMemo(() => {
    const format = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
    }
    return [
      new THREE.WebGLRenderTarget(256, 256, format),
      new THREE.WebGLRenderTarget(256, 256, format),
    ]
  }, [])

  // Scene setup for GPGPU
  const scene = useMemo(() => new THREE.Scene(), [])
  const camera = useMemo(
    () => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    []
  )
  const simPlane = useMemo(() => new THREE.PlaneGeometry(2, 2), [])
  const simMesh = useMemo(() => new THREE.Mesh(simPlane, simMaterial), [])

  useMemo(() => {
    scene.add(simMesh)
  }, [scene, simMesh])

  const fbos = useRef({ read: heightmapFBO1, write: heightmapFBO2 })

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime()

    // Update simulation
    simMaterial.uniforms.uTime.value = time
    simMaterial.uniforms.uPrevState.value = fbos.current.read.texture

    gl.setRenderTarget(fbos.current.write)
    gl.render(scene, camera)
    gl.setRenderTarget(null)

    // Swap buffers
    const temp = fbos.current.read
    fbos.current.read = fbos.current.write
    fbos.current.write = temp

    // Update ocean material
    if (meshRef.current) {
      meshRef.current.material.uniforms.uTime.value = time
      meshRef.current.material.uniforms.uHeightmap.value =
        fbos.current.read.texture
    }
  })

  return (
    <>
      <mesh ref={meshRef} rotation-x={-Math.PI * 0.5} material={oceanMaterial}>
        <planeGeometry args={[50, 50, 128, 128]} />
      </mesh>
      <DebugPlane heightmapTexture={fbos.current.read.texture} />
    </>
  )
}

export default Ocean
