import { useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { Canvas } from "@react-three/fiber"
import { Environment, Box } from "@react-three/drei"
import Ocean from "./Ocean"

import "./index.css"

export default function App() {
  //Box rotate 90 degrees on the x axis
  const boxRef = useRef()

  return (
    <Canvas camera={{ position: [0, 20, 25], fov: 75 }}>
      <Ocean />
    </Canvas>
  )
}
