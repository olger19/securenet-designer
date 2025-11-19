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
    position: { x: 200, y: 100 },
    data: { label: 'R1 (Router - Interna)', tipo: 'router', zona: 'interna' },
    type: 'default',
  },
  {
    id: '2',
    position: { x: 200, y: 250 },
    data: { label: 'FW1 (Firewall - DMZ)', tipo: 'firewall', zona: 'dmz' },
    type: 'default',
  },
  {
    id: '3',
    position: { x: 200, y: 400 },
    data: { label: 'SRV_WEB (Servidor - DMZ)', tipo: 'servidor', zona: 'dmz' },
    type: 'default',
  },
]

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e2-3', source: '2', target: '3' },
]

// React Flow por ahora sin nodos ni edges personalizados
const nodeTypes = {}
const edgeTypes = {}

function App() {
  // hooks recomendados por React Flow para manejar nodos y edges
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, _setEdges, onEdgesChange] = useEdgesState(initialEdges) // ReactFlow maneja edges internamente, no los modificamos directamente

  const [backendStatus, setBackendStatus] = useState('Desconocido')
  const [topologias, setTopologias] = useState([])
  const [selectedTopologyId, setSelectedTopologyId] = useState(null)

  const [selectedNodeId, setSelectedNodeId] = useState(null)

  const [politicas, setPoliticas] = useState([])
  const [escenarios, setEscenarios] = useState([])
  const [simResultados, setSimResultados] = useState([])

  const [nuevaPolitica, setNuevaPolitica] = useState({
    origen: 'interna',
    destino: 'externa',
    servicio: 'http',
    protocolo: 'tcp',
    puerto: 80,
    accion: 'denegar',
    descripcion: '',
  })

  const [nuevoEscenario, setNuevoEscenario] = useState({
    tipo_origen: 'zona',
    origen: 'interna',
    tipo_destino: 'zona',
    destino: 'externa',
    servicio: 'http',
    protocolo: 'tcp',
    puerto: 80,
  })

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

  const cargarPoliticas = async (idTopologia) => {
    try {
      const res = await fetch(
        `http://127.0.0.1:5000/topologias/${idTopologia}/politicas`,
      )
      const data = await res.json()
      setPoliticas(data)
    } catch (err) {
      console.error(err)
      setPoliticas([])
    }
  }

  const cargarEscenarios = async (idTopologia) => {
    try {
      const res = await fetch(
        `http://127.0.0.1:5000/topologias/${idTopologia}/escenarios`,
      )
      const data = await res.json()
      setEscenarios(data)
    } catch (err) {
      console.error(err)
      setEscenarios([])
    }
  }

  useEffect(() => {
    if (selectedTopologyId) {
      cargarPoliticas(selectedTopologyId)
      cargarEscenarios(selectedTopologyId)
      setSimResultados([])
    }
  }, [selectedTopologyId])

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
      await cargarTopologias()
      setSelectedTopologyId(data.id_topologia)
    } catch (err) {
      console.error(err)
      alert('Error al guardar topología')
    }
  }

  const handleSeleccionarTopologia = (idTopologia) => {
    setSelectedTopologyId(idTopologia)
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

  // ---------- SELECCION Y PROPIEDADES DEL NODO ----------
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

  const handleChangeNuevaPolitica = (field, value) => {
    setNuevaPolitica((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleCrearPolitica = async (e) => {
    e.preventDefault()
    if (!selectedTopologyId) {
      alert('Selecciona una topología primero')
      return
    }

    try {
      const res = await fetch(
        `http://127.0.0.1:5000/topologias/${selectedTopologyId}/politicas`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...nuevaPolitica,
            puerto:
              nuevaPolitica.puerto === '' ? null : Number(nuevaPolitica.puerto),
          }),
        },
      )
      const data = await res.json()
      console.log('Política creada:', data)
      await cargarPoliticas(selectedTopologyId)
    } catch (err) {
      console.error(err)
      alert('Error al crear política')
    }
  }

  // ---------- FORMULARIO ESCENARIOS ----------

  const handleChangeNuevoEscenario = (field, value) => {
    setNuevoEscenario((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleCrearEscenario = async (e) => {
    e.preventDefault()
    if (!selectedTopologyId) {
      alert('Selecciona una topología primero')
      return
    }

    try {
      const res = await fetch(
        `http://127.0.0.1:5000/topologias/${selectedTopologyId}/escenarios`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...nuevoEscenario,
            puerto:
              nuevoEscenario.puerto === ''
                ? null
                : Number(nuevoEscenario.puerto),
          }),
        },
      )
      const data = await res.json()
      console.log('Escenario creado:', data)
      await cargarEscenarios(selectedTopologyId)
    } catch (err) {
      console.error(err)
      alert('Error al crear escenario')
    }
  }

  // ---------- SIMULACIÓN ----------

  const handleSimular = async () => {
    if (!selectedTopologyId) {
      alert('Selecciona una topología primero')
      return
    }

    try {
      const res = await fetch(
        `http://127.0.0.1:5000/topologias/${selectedTopologyId}/simular`,
        {
          method: 'POST',
        },
      )
      const data = await res.json()
      setSimResultados(data)
      await cargarEscenarios(selectedTopologyId)
    } catch (err) {
      console.error(err)
      alert('Error al simular')
    }
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
        {topologias.length === 0 && <p>No hay topologías aún.</p>}
        <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
          {topologias.map((t) => {
            const isSelected = t.id_topologia === selectedTopologyId
            return (
              <li key={t.id_topologia} style={{ marginBottom: '4px' }}>
                <button
                  onClick={() => handleSeleccionarTopologia(t.id_topologia)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '4px 6px',
                    borderRadius: '4px',
                    border: isSelected ? '1px solid #0af' : '1px solid #444',
                    background: isSelected ? '#0b2533' : '#222',
                    color: '#f5f5f5',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  #{t.id_topologia} - {t.nombre}
                </button>
              </li>
            )
          })}
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
            width: '320px',
            borderLeft: '1px solid #333',
            background: '#181818',
            color: '#f5f5f5',
            padding: '12px',
            fontSize: '13px',
            overflow: 'auto',
          }}
        >
          <h3>Topología seleccionada</h3>
          {selectedTopologyId ? (
            <p>ID: {selectedTopologyId}</p>
          ) : (
            <p>Ninguna topología seleccionada.</p>
          )}

          <hr style={{ borderColor: '#444' }} />

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

          <hr style={{ borderColor: '#444' }} />

          <h3>Nueva política de seguridad</h3>
          <form onSubmit={handleCrearPolitica}>
            <label>
              Origen (zona/nodo)
              <input
                type="text"
                value={nuevaPolitica.origen}
                onChange={(e) =>
                  handleChangeNuevaPolitica('origen', e.target.value)
                }
                style={{ width: '100%', marginBottom: '4px' }}
              />
            </label>
            <label>
              Destino (zona/nodo)
              <input
                type="text"
                value={nuevaPolitica.destino}
                onChange={(e) =>
                  handleChangeNuevaPolitica('destino', e.target.value)
                }
                style={{ width: '100%', marginBottom: '4px' }}
              />
            </label>
            <label>
              Servicio
              <input
                type="text"
                value={nuevaPolitica.servicio}
                onChange={(e) =>
                  handleChangeNuevaPolitica('servicio', e.target.value)
                }
                style={{ width: '100%', marginBottom: '4px' }}
              />
            </label>
            <label>
              Protocolo
              <input
                type="text"
                value={nuevaPolitica.protocolo}
                onChange={(e) =>
                  handleChangeNuevaPolitica('protocolo', e.target.value)
                }
                style={{ width: '100%', marginBottom: '4px' }}
              />
            </label>
            <label>
              Puerto
              <input
                type="number"
                value={nuevaPolitica.puerto}
                onChange={(e) =>
                  handleChangeNuevaPolitica('puerto', e.target.value)
                }
                style={{ width: '100%', marginBottom: '4px' }}
              />
            </label>
            <label>
              Acción
              <select
                value={nuevaPolitica.accion}
                onChange={(e) =>
                  handleChangeNuevaPolitica('accion', e.target.value)
                }
                style={{ width: '100%', marginBottom: '4px' }}
              >
                <option value="permitir">Permitir</option>
                <option value="denegar">Denegar</option>
              </select>
            </label>
            <label>
              Descripción
              <textarea
                value={nuevaPolitica.descripcion}
                onChange={(e) =>
                  handleChangeNuevaPolitica('descripcion', e.target.value)
                }
                style={{ width: '100%', marginBottom: '4px' }}
              />
            </label>
            <button type="submit" style={{ marginBottom: '8px' }}>
              Guardar política
            </button>
          </form>

          {politicas.length > 0 && (
            <>
              <p>
                <strong>Políticas definidas:</strong>
              </p>
              <ul>
                {politicas.map((p) => (
                  <li key={p.id_politica}>
                    #{p.id_politica} {p.origen} → {p.destino} [{p.servicio}] -{' '}
                    {p.accion}
                  </li>
                ))}
              </ul>
            </>
          )}

          <hr style={{ borderColor: '#444' }} />

          <h3>Nuevo escenario de flujo</h3>
          <form onSubmit={handleCrearEscenario}>
            <label>
              Tipo origen
              <select
                value={nuevoEscenario.tipo_origen}
                onChange={(e) =>
                  handleChangeNuevoEscenario('tipo_origen', e.target.value)
                }
                style={{ width: '100%', marginBottom: '4px' }}
              >
                <option value="zona">Zona</option>
                <option value="nodo">Nodo</option>
              </select>
            </label>
            <label>
              Origen
              <input
                type="text"
                value={nuevoEscenario.origen}
                onChange={(e) =>
                  handleChangeNuevoEscenario('origen', e.target.value)
                }
                style={{ width: '100%', marginBottom: '4px' }}
              />
            </label>

            <label>
              Tipo destino
              <select
                value={nuevoEscenario.tipo_destino}
                onChange={(e) =>
                  handleChangeNuevoEscenario('tipo_destino', e.target.value)
                }
                style={{ width: '100%', marginBottom: '4px' }}
              >
                <option value="zona">Zona</option>
                <option value="nodo">Nodo</option>
              </select>
            </label>
            <label>
              Destino
              <input
                type="text"
                value={nuevoEscenario.destino}
                onChange={(e) =>
                  handleChangeNuevoEscenario('destino', e.target.value)
                }
                style={{ width: '100%', marginBottom: '4px' }}
              />
            </label>

            <label>
              Servicio
              <input
                type="text"
                value={nuevoEscenario.servicio}
                onChange={(e) =>
                  handleChangeNuevoEscenario('servicio', e.target.value)
                }
                style={{ width: '100%', marginBottom: '4px' }}
              />
            </label>
            <label>
              Protocolo
              <input
                type="text"
                value={nuevoEscenario.protocolo}
                onChange={(e) =>
                  handleChangeNuevoEscenario('protocolo', e.target.value)
                }
                style={{ width: '100%', marginBottom: '4px' }}
              />
            </label>
            <label>
              Puerto
              <input
                type="number"
                value={nuevoEscenario.puerto}
                onChange={(e) =>
                  handleChangeNuevoEscenario('puerto', e.target.value)
                }
                style={{ width: '100%', marginBottom: '4px' }}
              />
            </label>

            <button type="submit" style={{ marginBottom: '8px' }}>
              Guardar escenario
            </button>
          </form>

          {escenarios.length > 0 && (
            <>
              <p>
                <strong>Escenarios definidos:</strong>
              </p>
                {escenarios.map((e) => (
                  <div key={e.id_escenario}>
                    #{e.id_escenario} {e.origen} → {e.destino} [{e.servicio}] –{' '}
                    {e.resultado || 'pendiente'}
                  </div>
                ))}
            </>
          )}

          <hr style={{ borderColor: '#444' }} />

          <h3>Simulación</h3>
          <button onClick={handleSimular} style={{ marginBottom: '8px' }}>
            Ejecutar simulación
          </button>

          {simResultados.length > 0 && (
            <>
              <p>
                <strong>Resultados:</strong>
              </p>
              <ul>
                {simResultados.map((r) => (
                  <li key={r.id_escenario}>
                    Escenario #{r.id_escenario}: {r.resultado} – {r.detalle}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
