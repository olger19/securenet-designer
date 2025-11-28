import React, { useEffect, useState, useCallback } from 'react'
// Importar iconos para los tipos de nodo
import routerIcon from './assets/icons/router.png'
import firewallIcon from './assets/icons/firewall.png'
import serverIcon from './assets/icons/server.png'
import switchIcon from './assets/icons/switch.png'
import hostIcon from './assets/icons/host.png'
import defaultIcon from './assets/icons/default.png'
import gearIcon from './assets/icons/gear.png'
import deleteIcon from './assets/icons/delete.png';

import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
} from 'reactflow'
import 'reactflow/dist/style.css'

// Nodo personalizado que muestra una imagen según el tipo
const IconNode = ({ data }) => {
  const iconSrc = nodeIconMap[data.tipo] || defaultIcon

  return (
    <div
      style={{
        position: 'relative',
        padding: '12px 10px 10px 10px',
        borderRadius: '16px',
        background: '#111827',
        border: '1px solid #374151',
        boxShadow: '0 4px 10px rgba(0,0,0,0.45)',
        color: '#f9fafb',
        minWidth: 140,
        textAlign: 'center',
        fontSize: '11px',
      }}
    >
      {/* Handle de entrada */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#10b981',
        }}
      />

      {/* Botón de configuración (icono de tuerca) */}
      <button
        onClick={data.onConfigClick}
        title="Configurar nodo"
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          width: 24,
          height: 24,
          borderRadius: '999px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <img
          src={gearIcon}
          alt="config"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
          }}
        />
      </button>
      {/* Botón de eliminar nodo */}
      {data.onDeleteClick && (
        <button
          onClick={data.onDeleteClick}
          title="Eliminar nodo"
          style={{
            position: 'absolute',
            top: 6,
            left: 6,
            width: 24,
            height: 24,
            borderRadius: '999px',
            border: 'none',
            background: 'rgba(185,28,28,0.15)', // un fondo leve para que se vea
            cursor: 'pointer',
            padding: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img
            src={deleteIcon}
            alt="delete"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />
        </button>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          marginTop: 4,
        }}
      >
        <img
          src={iconSrc}
          alt={data.tipo || 'nodo'}
          style={{ width: 40, height: 40, objectFit: 'contain' }}
        />
        <div style={{ fontWeight: 600 }}>{data.label}</div>

        {data.zona && (
          <div style={{ fontSize: '10px', opacity: 0.8 }}>
            Zona: {data.zona.toUpperCase()}
          </div>
        )}

        {(data.subred || data.vlan) && (
          <div
            style={{
              fontSize: '10px',
              marginTop: 4,
              lineHeight: 1.3,
              opacity: 0.95,
            }}
          >
            {data.subred && <div>Subred: {data.subred}</div>}
            {data.vlan && <div>VLAN: {data.vlan}</div>}
          </div>
        )}
      </div>

      {/* Handle de salida */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#3b82f6',
        }}
      />
    </div>
  )
}



const initialNodes = [
  {
    id: '1',
    position: { x: 200, y: 100 },
    data: { label: 'R1 (Router - Interna)', tipo: 'router', zona: 'interna' },
    type: 'icon',
  },
  {
    id: '2',
    position: { x: 200, y: 250 },
    data: { label: 'FW1 (Firewall - DMZ)', tipo: 'firewall', zona: 'dmz' },
    type: 'icon',
  },
  {
    id: '3',
    position: { x: 200, y: 400 },
    data: { label: 'SRV_WEB (Servidor - DMZ)', tipo: 'servidor', zona: 'dmz' },
    type: 'icon',
  },
]

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e2-3', source: '2', target: '3' },
]

const nodeIconMap = {
  router: routerIcon,
  firewall: firewallIcon,
  servidor: serverIcon,
  switch: switchIcon,
  host: hostIcon,
}

// React Flow por ahora sin nodos ni edges personalizados
const nodeTypes = {
  icon: IconNode,
}
const edgeTypes = {}

function App() {
  // hooks recomendados por React Flow para manejar nodos y edges
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges) // ReactFlow maneja edges internamente, no los modificamos directamente

  const [backendStatus, setBackendStatus] = useState('Desconocido')
  const [topologias, setTopologias] = useState([])
  const [selectedTopologyId, setSelectedTopologyId] = useState(null)

  const [selectedNodeId, setSelectedNodeId] = useState(null)

  const [politicas, setPoliticas] = useState([])
  const [escenarios, setEscenarios] = useState([])
  const [simResultados, setSimResultados] = useState([])
  const [vulnSegmentacion, setVulnSegmentacion] = useState([])

  const [nuevaPolitica, setNuevaPolitica] = useState({
    tipo_origen: 'zona',
    origen: 'interna',
    tipo_destino: 'zona',
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

  const [configNodeId, setConfigNodeId] = useState(null)
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false)
  const [configForm, setConfigForm] = useState({
    subred: '',
    vlan: '',
  })

  const [deleteNodeId, setDeleteNodeId] = useState(null)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)

  const [isDeleteTopologyModalOpen, setIsDeleteTopologyModalOpen] = useState(false)

  // Modal de confirmación al guardar topología
  const [isSaveTopologyModalOpen, setIsSaveTopologyModalOpen] = useState(false)
  const [lastSavedTopologyId, setLastSavedTopologyId] = useState(null)

  const abrirModalParaNodo = (nodeId) => {
    const nodo = nodes.find((n) => n.id === nodeId)
    if (!nodo) return

    setConfigNodeId(nodeId)
    setConfigForm({
      subred: nodo.data.subred || '',
      vlan: nodo.data.vlan || '',
    })
    setIsConfigModalOpen(true)
  }

  const handleConfigInputChange = (e) => {
    const { name, value } = e.target
    setConfigForm((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleGuardarConfigNodo = () => {
    if (!configNodeId) return

    setNodes((nds) =>
      nds.map((n) =>
        n.id === configNodeId
          ? {
              ...n,
              data: {
                ...n.data,
                subred: configForm.subred,
                vlan: configForm.vlan,
              },
            }
          : n,
      ),
    )

    setIsConfigModalOpen(false)
    setConfigNodeId(null)
  }

  const handleCerrarConfigNodo = () => {
    setIsConfigModalOpen(false)
    setConfigNodeId(null)
  }

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
  // Crear aristas nuevas
  const onConnect = useCallback(
    (params) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: 'default', // puedes cambiar el tipo si luego usas edgeTypes personalizados
          },
          eds,
        ),
      )
    },
    [setEdges],
  )

  // Eliminar aristas con doble click
  const onEdgeDoubleClick = useCallback(
    (event, edge) => {
      // Evita que el doble click haga zoom raro
      event.stopPropagation()
      // Eliminamos sólo el edge que se doble–clicó
      setEdges((eds) => eds.filter((e) => e.id !== edge.id))
    },
    [setEdges],
  )

  const handleEliminarNodo = useCallback(
    (nodeId) => {
      // 1) Eliminar el nodo
      setNodes((nds) => nds.filter((n) => n.id !== nodeId))

      // 2) Eliminar todos los edges relacionados
      setEdges((eds) =>
        eds.filter((e) => e.source !== nodeId && e.target !== nodeId),
      )

      // 3) Si estaba seleccionado, limpiar selección
      setSelectedNodeId((prev) => (prev === nodeId ? null : prev))
    },
    [setNodes, setEdges],
  )

  const handleOpenDeleteModal = (nodeId) => {
    setDeleteNodeId(nodeId)
    setIsDeleteModalOpen(true)
  }

  const handleCancelarEliminarNodo = () => {
    setIsDeleteModalOpen(false)
    setDeleteNodeId(null)
  }

  const handleConfirmEliminarNodo = () => {
    if (!deleteNodeId) return
    handleEliminarNodo(deleteNodeId)
    setIsDeleteModalOpen(false)
    setDeleteNodeId(null)
  }

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

  const handleOpenDeleteTopologyModal = () => {
  if (!selectedTopologyId) {
    alert('Primero selecciona una topología en la lista.')
    return
  }
  setIsDeleteTopologyModalOpen(true)
}

const handleCancelarEliminarTopologia = () => {
  setIsDeleteTopologyModalOpen(false)
}

const handleConfirmEliminarTopologia = async () => {
  if (!selectedTopologyId) return

  const id = selectedTopologyId

  try {
    const res = await fetch(`http://127.0.0.1:5000/topologias/${id}`, {
      method: 'DELETE',
    })

    if (!res.ok) {
      throw new Error('Error al eliminar la topología en el servidor')
    }

    // Recargar lista de topologías
    await cargarTopologias()

    // Limpiar selección y editor
    setSelectedTopologyId(null)
    setNodes([])
    setEdges([])
    setPoliticas([])
    setEscenarios([])
    setSimResultados([])
    setVulnSegmentacion([])

    alert('Topología eliminada correctamente')
  } catch (err) {
    console.error(err)
    alert('Ocurrió un error al eliminar la topología')
  } finally {
    setIsDeleteTopologyModalOpen(false)
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

  const cargarTopologiaEnEditor = async (idTopologia) => {
    try {
      const res = await fetch(`http://127.0.0.1:5000/topologias/${idTopologia}`)
      const data = await res.json()

      const nuevosNodos = (data.nodos || []).map((n) => ({
        id: String(n.id_nodo),
        position: {
          x: n.posicion_x ?? 0,
          y: n.posicion_y ?? 0,
        },
        data: {
          label: n.nombre,
          tipo: n.tipo,
          zona: n.zona_seguridad,
          subred: n.subred || '',
          vlan: n.vlan ?? '',
        },
        type: 'icon',
      }))

      const nuevosEdges = (data.enlaces || []).map((e) => ({
        id: `e-${e.id_enlace}`,
        source: String(e.id_nodo_origen),
        target: String(e.id_nodo_destino),
      }))

      setNodes(nuevosNodos)
      setEdges(nuevosEdges)
      setSelectedNodeId(null)
    } catch (err) {
      console.error(err)
      alert('Error al cargar la topología en el editor')
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
        tipo: n.data.tipo || 'desconocido', // luego mapeamos tipos reales
        zona_seguridad: n.data.zona || 'interna', // placeholder
        posicion_x: n.position.x,
        posicion_y: n.position.y,
        subred: n.data.subred || null,
        vlan: n.data.vlan === '' ? null : n.data.vlan ?? null,
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const data = await res.json()

    // Guardar el ID para mostrarlo en el modal
    setLastSavedTopologyId(data.id_topologia)

    // Abrir el modal personalizado
    setIsSaveTopologyModalOpen(true)

    // Recargar lista de topologías
    await cargarTopologias()
    setSelectedTopologyId(data.id_topologia)
    await cargarTopologiaEnEditor(data.id_topologia)

  } catch (err) {
    console.error(err)
    alert('Error al guardar topología')
  }
  }

  const handleSeleccionarTopologia = (idTopologia) => {
    setSelectedTopologyId(idTopologia)
    cargarTopologiaEnEditor(idTopologia)
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
      type: 'icon',
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

  // -----------ANALIZAR SEGMENTACION-------------

  const handleAnalizarSegmentacion = async () => {
    if (!selectedTopologyId) {
      alert('Selecciona una topología primero')
      return
    }

    try {
      const res = await fetch(
        `http://127.0.0.1:5000/topologias/${selectedTopologyId}/vulnerabilidades_segmentacion`,
      )
      const data = await res.json()
      setVulnSegmentacion(data)
    } catch (err) {
      console.error(err)
      alert('Error al analizar segmentación')
    }
  }


  // ----- Descargar Reporte -----

  const handleDescargarReporte = () => {
    if (!selectedTopologyId) {
      alert('Selecciona una topología primero')
      return
    }
    const url = `http://127.0.0.1:5000/topologias/${selectedTopologyId}/reporte`
    // opción simple: abrir en otra pestaña / descarga directa
    window.open(url, '_blank')
  }

  const nodesWithHandlers = nodes.map((n) => ({
    ...n,
    data: {
      ...n.data,
      onConfigClick: () => abrirModalParaNodo(n.id),
      onDeleteClick: () => handleOpenDeleteModal(n.id),
    },
  }))

  // Obtener la topología seleccionada para mostrar su nombre en el modal
  const selectedTopologyObj = topologias.find(
    (t) => t.id_topologia === selectedTopologyId
  )

  const selectedTopologyName =
    selectedTopologyObj?.nombre || (selectedTopologyId ? `ID ${selectedTopologyId}` : '')


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
        <button onClick={handleOpenDeleteTopologyModal} style={{ display: 'block', marginBottom: '8px', background: '#b91c1c', color: '#fff', }}>
          Eliminar topología seleccionada
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
            nodes={nodesWithHandlers}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onConnect={onConnect}
            onEdgeDoubleClick={onEdgeDoubleClick}
            fitView
            nodeTypes={nodeTypes}   // añadido
            edgeTypes={edgeTypes}   // añadido
            style={{ width: '100%', height: '100%' }}
          >

            <Background />
            <Controls />
            <MiniMap
              style={{
                width: 180,
                height: 140,
                background: '#020617',
                borderRadius: 8,
              }}
              nodeColor={(node) => {
                const zona = node.data?.zona
                if (zona === 'interna') return '#22c55e'   // verde
                if (zona === 'dmz') return '#eab308'       // amarillo
                if (zona === 'externa') return '#ef4444'   // rojo
                return '#64748b'                           // gris por defecto
              }}
              nodeStrokeColor="#0f172a"
              nodeBorderRadius={3}
            />
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
              Tipo origen
              <select
                value={nuevaPolitica.tipo_origen}
                onChange={(e) =>
                  handleChangeNuevaPolitica('tipo_origen', e.target.value)
                }
                style={{ width: '100%', marginBottom: '4px' }}
              >
                <option value="zona">Zona</option>
                <option value="nodo">Nodo</option>
              </select>
            </label>
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
              Tipo destino
              <select
                value={nuevaPolitica.tipo_destino}
                onChange={(e) =>
                  handleChangeNuevaPolitica('tipo_destino', e.target.value)
                }
                style={{ width: '100%', marginBottom: '4px' }}
              >
                <option value="zona">Zona</option>
                <option value="nodo">Nodo</option>
              </select>
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
                {politicas.map((p, index) => (
                  <li key={p.id_politica}>
                    #{index + 1}{' '}
                    {p.tipo_origen} {p.origen} → {p.tipo_destino} {p.destino} [{p.servicio}] - {p.accion}
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

          <button onClick={handleDescargarReporte} style={{ marginBottom: '8px' }}>
            Descargar reporte PDF
          </button>

          {simResultados.length > 0 && (
            <>
              <p>
                <strong>Resultados:</strong>
              </p>
              <ul>
                {simResultados.map((r) => (
                  <li key={r.id_escenario}>
                    Escenario #{r.id_escenario}: {r.resultado} - {r.detalle}
                  </li>
                ))}
              </ul>
            </>
          )}

                    <hr style={{ borderColor: '#444' }} />

          <h3>Análisis de segmentación (VLAN/Subred)</h3>
          <button
            onClick={handleAnalizarSegmentacion}
            style={{ marginBottom: '8px' }}
          >
            Analizar VLAN/Subred
          </button>

          {vulnSegmentacion.length > 0 ? (
            <>
              <p>
                <strong>Vulnerabilidades detectadas:</strong>
              </p>
              <ul>
                {vulnSegmentacion.map((v, idx) => (
                  <li key={idx}>
                    [{v.nivel?.toUpperCase() || 'INFO'}] {v.mensaje}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p style={{ fontSize: '12px', opacity: 0.8 }}>
              Aún no se ha ejecutado el análisis o no se detectaron problemas.
            </p>
          )}

        </div>
      </div>

    {/* Modal de configuración de nodo */}
      {isConfigModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: '#111827',
              padding: '20px',
              borderRadius: '10px',
              width: '320px',
              color: '#f9fafb',
              boxShadow: '0 10px 25px rgba(0,0,0,0.6)',
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: '12px' }}>
              Configuración de nodo
            </h3>

            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', marginBottom: '4px' }}>
                Subred (CIDR)
              </label>
              <input
                type="text"
                name="subred"
                value={configForm.subred}
                onChange={handleConfigInputChange}
                placeholder="Ej: 192.168.10.0/24"
                style={{ width: '100%', padding: '6px' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px' }}>
                VLAN
              </label>
              <input
                type="number"
                name="vlan"
                value={configForm.vlan}
                onChange={handleConfigInputChange}
                placeholder="Ej: 10"
                style={{ width: '100%', padding: '6px' }}
              />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
              }}
            >
              <button
                onClick={handleCerrarConfigNodo}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid #4b5563',
                  background: 'transparent',
                  color: '#e5e7eb',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>

              <button
                onClick={handleGuardarConfigNodo}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#2563eb',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    {/* Modal de eliminación de nodo */}
    {isDeleteModalOpen && (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}
      >
        <div
          style={{
            background: '#111827',
            padding: '20px',
            borderRadius: '10px',
            width: '320px',
            color: '#f9fafb',
            boxShadow: '0 10px 25px rgba(0,0,0,0.6)',
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: '12px', color: '#fecaca' }}>
            Eliminar nodo
          </h3>

          <p style={{ fontSize: '13px', marginBottom: '16px' }}>
            ¿Desea eliminar este nodo? Esta acción no se puede deshacer.
          </p>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '8px',
            }}
          >
            <button
              onClick={handleCancelarEliminarNodo}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #4b5563',
                background: 'transparent',
                color: '#e5e7eb',
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>

            <button
              onClick={handleConfirmEliminarNodo}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: 'none',
                background: '#b91c1c',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Eliminar
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Modal de eliminación de topología */}
    {isDeleteTopologyModalOpen && (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1200,
        }}
      >
        <div
          style={{
            background: '#111827',
            padding: '20px',
            borderRadius: '10px',
            width: '340px',
            color: '#f9fafb',
            boxShadow: '0 10px 25px rgba(0,0,0,0.6)',
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: '12px', color: '#fecaca' }}>
            Eliminar topología
          </h3>

          <p style={{ fontSize: '13px', marginBottom: '16px' }}>
            ¿Desea eliminar la topología {' '}
            <span style={{ fontWeight: 'bold', color: '#fca5a5' }}>
              {selectedTopologyName}
            </span>
            ?
            Esta acción eliminará también sus nodos, enlaces, políticas y escenarios
            y no se puede deshacer.
          </p>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '8px',
            }}
          >
            <button
              onClick={handleCancelarEliminarTopologia}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #4b5563',
                background: 'transparent',
                color: '#e5e7eb',
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>

            <button
              onClick={handleConfirmEliminarTopologia}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: 'none',
                background: '#b91c1c',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Eliminar
            </button>
          </div>
        </div>
      </div>
    )}

    {isSaveTopologyModalOpen && (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0,0,0,0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
        }}
      >
        <div
          style={{
            background: '#1f2937',
            padding: '20px',
            borderRadius: '8px',
            width: '360px',
            color: '#fff',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            textAlign: 'center',
          }}
        >
          <h2 style={{ marginBottom: '12px' }}>Topología guardada</h2>

          <p style={{ marginBottom: '16px' }}>
            La topología fue guardada exitosamente con ID:<br />
            <strong style={{ fontSize: '18px' }}>#{lastSavedTopologyId}</strong>
          </p>

          <button
            onClick={() => setIsSaveTopologyModalOpen(false)}
            style={{
              width: '100%',
              padding: '8px',
              marginBottom: '10px',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Continuar con esta topología
          </button>

          <button
            onClick={() => {
              setNodes([])
              setEdges([])
              setSelectedNodeId(null)
              setPoliticas([])
              setEscenarios([])
              setSimResultados([])
              setVulnSegmentacion([])
              setSelectedTopologyId(null)
              setIsSaveTopologyModalOpen(false)
            }}
            style={{
              width: '100%',
              padding: '8px',
              background: '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Crear nuevo lienzo
          </button>
        </div>
      </div>
    )}


    </div>
  )
}

export default App
