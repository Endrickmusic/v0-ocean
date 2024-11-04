import React, { useRef, useMemo, useState } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"

// Constants
const RESOLUTION = 256
const WIND_SPEED = 10.0
const WIND_DIRECTION = new THREE.Vector2(1, 1).normalize()
const GRAVITY = 9.81

// Step 1: Phillips Spectrum Generation
const phillipsSpectrumShader = {
  uniforms: {
    uWindSpeed: { value: WIND_SPEED },
    uWindDirection: { value: WIND_DIRECTION },
    uGravity: { value: GRAVITY },
    uAlpha: { value: 0.0081 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uWindSpeed;
    uniform vec2 uWindDirection;
    uniform float uGravity;
    uniform float uAlpha;
    varying vec2 vUv;

    float phillips(vec2 k) {
      float kLength = length(k);
      if (kLength < 0.0001) return 0.0;
      float L = (uWindSpeed * uWindSpeed) / uGravity;
      float kDotW = dot(normalize(k), uWindDirection);
      float damping = exp(-kLength * kLength * pow(L/1000.0, 2.0));
      return uAlpha * exp(-1.0/(kLength * kLength * L * L)) 
             * pow(kDotW * kDotW, 1.0) 
             * damping 
             / (kLength * kLength * kLength * kLength);
    }

    void main() {
      vec2 k = vec2(2.0 * PI * (vUv.x - 0.5), 2.0 * PI * (vUv.y - 0.5)) * float(${RESOLUTION});
      float P = phillips(k);
      gl_FragColor = vec4(P, 0.0, 0.0, 1.0);
    }
  `,
}

// Step 2: Initial Spectrum Generation with Complex Noise
const initialSpectrumShader = {
  uniforms: {
    uPhillips: { value: null },
    uNoise: { value: null },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D uPhillips;
    uniform sampler2D uNoise;
    varying vec2 vUv;

    void main() {
      vec4 noise = texture2D(uNoise, vUv);
      float phillips = texture2D(uPhillips, vUv).r;
      
      // Generate initial spectrum h0(k) using noise and phillips spectrum
      vec2 h0k = sqrt(phillips/2.0) * noise.xy;
      
      gl_FragColor = vec4(h0k, 0.0, 1.0);
    }
  `,
}

// Step 3: FFT Computation Shaders
const butterflyTextureShader = {
  // Will contain butterfly computation texture generation
  // This is used for the FFT calculation
  vertexShader: ``,
  fragmentShader: ``,
}

const horizontalFFTShader = {
  // Will contain horizontal FFT pass
  vertexShader: ``,
  fragmentShader: ``,
}

const verticalFFTShader = {
  // Will contain vertical FFT pass
  vertexShader: ``,
  fragmentShader: ``,
}

// Step 4: Time Evolution
const timeEvolutionShader = {
  uniforms: {
    uInitialSpectrum: { value: null },
    uTime: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D uInitialSpectrum;
    uniform float uTime;
    varying vec2 vUv;

    void main() {
      vec2 h0k = texture2D(uInitialSpectrum, vUv).xy;
      vec2 k = vec2(2.0 * PI * (vUv.x - 0.5), 2.0 * PI * (vUv.y - 0.5)) * float(${RESOLUTION});
      
      float w = sqrt(${GRAVITY} * length(k));
      vec2 ht = h0k * cos(w * uTime);
      
      gl_FragColor = vec4(ht, 0.0, 1.0);
    }
  `,
}

// Debug material to visualize intermediate steps
const debugMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTexture: { value: null },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D uTexture;
    varying vec2 vUv;
    
    void main() {
      vec4 color = texture2D(uTexture, vUv);
      // Visualize the data - map to visible range
      gl_FragColor = vec4(color.xyz * 0.5 + 0.5, 1.0);
    }
  `,
})

// Modified ocean material with proper uniforms
const oceanMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uDisplacement: { value: null },
    uNormalMap: { value: null },
  },
  vertexShader: `
    uniform sampler2D uDisplacement;
    uniform float uTime;
    varying vec3 vNormal;
    varying vec2 vUv;
    
    void main() {
      vUv = uv;
      vec4 displacement = texture2D(uDisplacement, uv);
      vec3 newPosition = position + normal * displacement.x;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D uNormalMap;
    varying vec3 vNormal;
    varying vec2 vUv;
    
    void main() {
      vec3 normal = texture2D(uNormalMap, vUv).xyz;
      vec3 light = normalize(vec3(1.0));
      float diffuse = max(0.0, dot(normal, light));
      vec3 color = mix(vec3(0.1, 0.1, 0.3), vec3(0.3, 0.3, 0.5), diffuse);
      gl_FragColor = vec4(color, 1.0);
    }
  `,
})

// Debug view component
const DebugView = ({ texture, position }) => {
  const meshRef = useRef()

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.material.uniforms.uTexture.value = texture
    }
  })

  return (
    <mesh ref={meshRef} position={position} material={debugMaterial}>
      <planeGeometry args={[10, 10]} />
    </mesh>
  )
}

const Ocean = () => {
  const meshRef = useRef()
  const { gl } = useThree()
  const [debugPhillips, setDebugPhillips] = useState(true)

  // Create all necessary FBOs
  const fbos = useMemo(() => {
    const format = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
    }
    return {
      phillips: new THREE.WebGLRenderTarget(RESOLUTION, RESOLUTION, format),
      initialSpectrum: new THREE.WebGLRenderTarget(
        RESOLUTION,
        RESOLUTION,
        format
      ),
      spectrum: new THREE.WebGLRenderTarget(RESOLUTION, RESOLUTION, format),
      displacement: new THREE.WebGLRenderTarget(RESOLUTION, RESOLUTION, format),
      normals: new THREE.WebGLRenderTarget(RESOLUTION, RESOLUTION, format),
      pingPong: [
        new THREE.WebGLRenderTarget(RESOLUTION, RESOLUTION, format),
        new THREE.WebGLRenderTarget(RESOLUTION, RESOLUTION, format),
      ],
    }
  }, [])

  // Create materials with proper cleanup
  const materials = useMemo(() => {
    const mats = {
      phillips: new THREE.ShaderMaterial(phillipsSpectrumShader),
      initialSpectrum: new THREE.ShaderMaterial(initialSpectrumShader),
      timeEvolution: new THREE.ShaderMaterial(timeEvolutionShader),
    }

    // Ensure proper cleanup
    return {
      ...mats,
      cleanup: () => {
        Object.values(mats).forEach((mat) => mat.dispose())
      },
    }
  }, [])

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      materials.cleanup()
      Object.values(fbos).forEach((fbo) => {
        if (Array.isArray(fbo)) {
          fbo.forEach((f) => f.dispose())
        } else {
          fbo.dispose()
        }
      })
    }
  }, [materials, fbos])

  // Scene setup for computations
  const computeScene = useMemo(() => new THREE.Scene(), [])
  const computeCamera = useMemo(
    () => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    []
  )
  const computeQuad = useMemo(() => {
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
    computeScene.add(quad)
    return quad
  }, [computeScene])

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime()

    // Step 1: Generate Phillips spectrum
    computeQuad.material = materials.phillips
    gl.setRenderTarget(fbos.phillips)
    gl.render(computeScene, computeCamera)

    // Step 2-5 will go here as we implement them

    gl.setRenderTarget(null)

    // Update ocean material
    if (meshRef.current) {
      meshRef.current.material.uniforms.uTime.value = time
      // For now, just use Phillips spectrum as displacement
      meshRef.current.material.uniforms.uDisplacement.value =
        fbos.phillips.texture
    }
  })

  return (
    <>
      <mesh ref={meshRef} rotation-x={-Math.PI * 0.5} material={oceanMaterial}>
        <planeGeometry args={[50, 50, 128, 128]} />
      </mesh>

      {/* Debug views */}
      {debugPhillips && (
        <>
          <DebugView texture={fbos.phillips.texture} position={[30, 15, 0]} />
          {/* Add more debug views as we implement more steps */}
        </>
      )}
    </>
  )
}

export default Ocean
