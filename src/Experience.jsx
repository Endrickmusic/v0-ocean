import { OrbitControls, useTexture } from "@react-three/drei"
import { } from "@react-three/fiber"

export default function Experience(){

  const normalMap = useTexture('./textures/waternormals.jpeg')

  return (
    <>
      <OrbitControls />       
        <mesh
        rotation={[Math.PI/4, Math.PI/4, Math.PI/2]}
        position={[0, 0, 0]}
        >
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshStandardMaterial 
            metalness={1}
            roughness={0.12}
            normalMap={ normalMap }
            normalScale={[0.2, 0.2]}
          />
       </mesh>
    </>
  )}