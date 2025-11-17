import React, { useEffect, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
} from 'reactflow'
import 'reactflow/dist/style.css'

const initialNodes = [
  {
    id: '1',
    position: { x: 100, y: 100 },
    data: { label: 'R1 (Router - Interna)', tipo: 'router', zona: 'interna' },
    type: 'default',
  },
  {
    id: '2',
    position: { x: 100, y: 250 },
    data: { label: 'FW1 (Firewall - DMZ)', tipo: 'firewall', zona: 'dmz' },
    type: 'default',
  },
  {
    id: '3',
    position: { x: 100, y: 400 },
    data: { label: 'SRV_WEB (Servidor - DMZ)', tipo: 'servidor', zona: 'dmz' },
    type: 'default',
  },
]

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e2-3', source: '2', target: '3' },
]

const nodeTypes = {}    // por ahora no usamos nodos personalizados
const edgeTypes = {}    // ni edges personalizados

function App() {
  // hooks recomendados por React Flow para manejar nodos y edges
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, _setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const [backendStatus, setBackendStatus] = useState('Desconocido')
  const [topologias, setTopologias] = useState([])
  const [selectedNodeId, setSelectedNodeId] = useState(null)

  // Probar conexión con backend 
  useEffect(() => {
    fetch('http://127.0.0.1:5000/health')
      .then((res) => res.json())
      .then((data) => {
        setBackendStatus(`${data.status} - ${data.message}`)
      })
      .catch(() => {
        setBackendStatus('Error al conectar con backend')
      })
  }, [])

  const cargarTopologias = async () => {
    try {
      const res = await fetch('http://127.0.0.1:5000/topologias')
      const data = await res.json()
      setTopologias(data)
    } catch (err) {
      console.error(err)
      alert('Error al cargar topologías')
    }
  }

  useEffect(() => {
    cargarTopologias()
  }, [])

  // Crear una topología de prueba en el backend
  const handleGuardarTopologia = async () => {
    const payload = {
      nombre: 'Topologia de prueba',
      descripcion: 'Creada desde el frontend',
      autor: 'Olger',
      nodos: nodes.map((n) => ({
        id_cliente: n.id,
        nombre: n.data.label,
        tipo: 'desconocido', // luego mapeamos tipos reales
        zona_seguridad: 'interna', // placeholder
        posicion_x: n.position.x,
        posicion_y: n.position.y,
      })),
      enlaces: edges.map((e) => ({
        id_cliente: e.id,
        id_nodo_origen: e.source,
        id_nodo_destino: e.target,
      })),
      vlans: [],
    }

    try {
      const res = await fetch('http://127.0.0.1:5000/topologias', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      alert(`Topología guardada con ID ${data.id_topologia}`)
      cargarTopologias()
    } catch (err) {
      console.error(err)
      alert('Error al guardar topología')
    }
  }

  // ----- Editor: anadir nodos ----
  const addNode = (tipo, zona) => {
    const newId = String(Date.now())
    const count = nodes.length
    const baseY = 100
    const offsetY = 120

    const labelMap = {
      router: 'Router',
      firewall: 'Firewall',
      servidor: 'Servidor',
      switch: 'Switch',
      host: 'Host',
    }

    const zoneLabelMap = {
      interna: 'Interna',
      dmz: 'DMZ',
      externa: 'Externa',
    }

    const newNode = {
      id: newId,
      position: { x: 400, y: baseY + count * offsetY },
      data: {
        label: `${labelMap[tipo] || 'Nodo'} (${zoneLabelMap[zona] || zona})`,
        tipo,
        zona,
      },
      type: 'default',
    }

    setNodes((nds) => [...nds, newNode])
  }

  // ---- Editor: selección de nodo ----
  const onNodeClick = (_, node) => {
    setSelectedNodeId(node.id)
  }

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null

  const updateSelectedNodeData = (field, value) => {
    if (!selectedNodeId) return
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedNodeId
          ? {
            ...n,
            data: {
              ...n.data,
              [field]: value,
              label:
                field === 'label'
                  ? value
                  : field === 'tipo' || field === 'zona'
                    ? buildLabel({
                      ...n.data,
                      [field]: value,
                    })
                    : n.data.label,
            },
          }
          : n
      )
    )
  }

  const buildLabel = (data) => {
    const labelMap = {
      router: 'Router',
      firewall: 'Firewall',
      servidor: 'Servidor',
      switch: 'Switch',
      host: 'Host',
    }
    const zoneLabelMap = {
      interna: 'Interna',
      dmz: 'DMZ',
      externa: 'Externa',
    }

    const tipoText = labelMap[data.tipo] || 'Nodo'
    const zonaText = zoneLabelMap[data.zona] || data.zona || 'Sin zona'
    return `${tipoText} (${zonaText})`
  }


  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      {/* Panel lateral izquierdo */}
      <div
        style={{
          width: '260px',
          padding: '12px',
          borderRight: '1px solid #333',
          fontSize: '14px',
          background: '#111',
          color: '#f5f5f5',
        }}
      >
        <h2>SecureNet Designer</h2>
        <p>
          <strong>Backend:</strong> {backendStatus}
        </p>

        <hr style={{ borderColor: '#444' }} />

        <h3>Acciones</h3>
        <button onClick={handleGuardarTopologia} style={{ display: 'block', marginBottom: '8px' }}>
          Guardar topología
        </button>

        <button onClick={cargarTopologias} style={{ display: 'block', marginBottom: '8px' }}>
          Recargar lista
        </button>

        {/* Panel de propiedades del nodo seleccionado */}
        <h3>Paleta de nodos</h3>
        <button
          onClick={() => addNode('router', 'interna')}
          style={{ display: 'block', marginBottom: '4px' }}
        >
          Añadir Router (Interna)
        </button>
        <button
          onClick={() => addNode('firewall', 'dmz')}
          style={{ display: 'block', marginBottom: '4px' }}
        >
          Añadir Firewall (DMZ)
        </button>
        <button
          onClick={() => addNode('servidor', 'dmz')}
          style={{ display: 'block', marginBottom: '4px' }}
        >
          Añadir Servidor (DMZ)
        </button>

        <hr style={{ borderColor: '#444' }} />

        <h3>Topologías guardadas</h3>
        <ul>
          {topologias.map((t) => (
            <li key={t.id_topologia}>
              #{t.id_topologia} - {t.nombre}
            </li>
          ))}
        </ul>
      </div>

      {/* Lienzo central con React Flow + panel derecho*/}
      <div style={{ flexGrow: 1, display: 'flex' }}>
        <div style={{ width: '100%', height: '100%' }}>

          {/* Lienzo React Flow */}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            fitView
            nodeTypes={nodeTypes}   // añadido
            edgeTypes={edgeTypes}   // añadido
            style={{ width: '100%', height: '100%' }}
          >

            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>
        {/* Panel derecho: propiedades del nodo */}
        <div
          style={{
            width: '260px',
            borderLeft: '1px solid #333',
            background: '#181818',
            color: '#f5f5f5',
            padding: '12px',
            fontSize: '14px',
          }}
        >
          <h3>Propiedades del nodo</h3>
          {selectedNode ? (
            <>
              <p>
                <strong>ID:</strong> {selectedNode.id}
              </p>
              <label>
                Nombre/Label
                <input
                  type="text"
                  value={selectedNode.data.label}
                  onChange={(e) => updateSelectedNodeData('label', e.target.value)}
                  style={{ width: '100%', marginTop: '4px', marginBottom: '8px' }}
                />
              </label>

              <label>
                Tipo
                <select
                  value={selectedNode.data.tipo || 'router'}
                  onChange={(e) => updateSelectedNodeData('tipo', e.target.value)}
                  style={{ width: '100%', marginTop: '4px', marginBottom: '8px' }}
                >
                  <option value="router">Router</option>
                  <option value="firewall">Firewall</option>
                  <option value="servidor">Servidor</option>
                  <option value="switch">Switch</option>
                  <option value="host">Host</option>
                </select>
              </label>

              <label>
                Zona de seguridad
                <select
                  value={selectedNode.data.zona || 'interna'}
                  onChange={(e) => updateSelectedNodeData('zona', e.target.value)}
                  style={{ width: '100%', marginTop: '4px', marginBottom: '8px' }}
                >
                  <option value="interna">Interna</option>
                  <option value="dmz">DMZ</option>
                  <option value="externa">Externa</option>
                </select>
              </label>
            </>
          ) : (
            <p>Selecciona un nodo en el diagrama para ver sus propiedades.</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
