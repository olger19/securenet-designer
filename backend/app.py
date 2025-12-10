from datetime import datetime

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
## PDF
from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib import colors
import os

# gns3
import requests
import time
import re

# Config GNS3 
GNS3_SERVER_URL = os.environ.get("GNS3_SERVER_URL", "http://localhost:3080")
GNS3_COMPUTE_ID = os.environ.get("GNS3_COMPUTE_ID", "vm")  # normalmente "local" en GNS3

db = SQLAlchemy()

# MODELOS

class Topologia(db.Model):
    __tablename__ = "topologia"

    id_topologia = db.Column(db.Integer, primary_key=True, autoincrement=True)
    nombre = db.Column(db.String(200), nullable=False)
    descripcion = db.Column(db.Text, nullable=True)
    autor = db.Column(db.String(100), nullable=True)
    fecha_creacion = db.Column(db.DateTime, default=datetime.utcnow)

    nodos = db.relationship("Nodo", backref="topologia", cascade="all, delete-orphan")
    enlaces = db.relationship("Enlace", backref="topologia", cascade="all, delete-orphan")

class Nodo(db.Model):
    __tablename__ = "nodo"

    id_nodo = db.Column(db.Integer, primary_key=True, autoincrement=True)
    id_topologia = db.Column(db.Integer, db.ForeignKey("topologia.id_topologia"), nullable=False)

    nombre = db.Column(db.String(200), nullable=False)
    tipo = db.Column(db.String(50), nullable=False)          # router, firewall, servidor, etc.
    zona_seguridad = db.Column(db.String(50), nullable=False)  # interna, dmz, externa
    posicion_x = db.Column(db.Float, nullable=False)
    posicion_y = db.Column(db.Float, nullable=False)
    subred = db.Column(db.String(50), nullable=True)
    vlan = db.Column(db.Integer, nullable=True)

    politicas = db.relationship(
        "PoliticaSeguridad",
        backref="firewall",
        lazy=True,
        cascade="all, delete-orphan"
    )


class Enlace(db.Model):
    __tablename__ = "enlace"

    id_enlace = db.Column(db.Integer, primary_key=True, autoincrement=True)
    id_topologia = db.Column(db.Integer, db.ForeignKey("topologia.id_topologia"), nullable=False)

    id_nodo_origen = db.Column(db.Integer, db.ForeignKey("nodo.id_nodo"), nullable=False)
    id_nodo_destino = db.Column(db.Integer, db.ForeignKey("nodo.id_nodo"), nullable=False)

class PoliticaSeguridad(db.Model):
    __tablename__ = "politica_seguridad"

    id_politica = db.Column(db.Integer, primary_key=True, autoincrement=True)
    id_topologia = db.Column(db.Integer, db.ForeignKey("topologia.id_topologia"), nullable=False)
    # Soportar varios firewalls
    id_firewall = db.Column(db.Integer, db.ForeignKey("nodo.id_nodo"), nullable=True)

    # zona o nodo
    tipo_origen = db.Column(db.String(20), nullable=False, default="zona")
    origen = db.Column(db.String(100), nullable=False)       

    # zona o nodo
    tipo_destino = db.Column(db.String(20), nullable=False, default="zona")
    destino = db.Column(db.String(100), nullable=False) 

    servicio = db.Column(db.String(50), nullable=False)      # http, https, icmp, etc.
    protocolo = db.Column(db.String(10), nullable=True)      # tcp, udp, icmp
    puerto = db.Column(db.Integer, nullable=True)            # 80, 443, etc.
    accion = db.Column(db.String(20), nullable=False)        # permitir / denegar
    descripcion = db.Column(db.Text, nullable=True)

class EscenarioFlujo(db.Model):
    __tablename__ = "escenario_flujo"

    id_escenario = db.Column(db.Integer, primary_key=True, autoincrement=True)
    id_topologia = db.Column(db.Integer, db.ForeignKey("topologia.id_topologia"), nullable=False)

    tipo_origen = db.Column(db.String(20), nullable=False)   # zona / nodo
    origen = db.Column(db.String(100), nullable=False)       # nombre de zona o nodo
    tipo_destino = db.Column(db.String(20), nullable=False)  # zona / nodo
    destino = db.Column(db.String(100), nullable=False)
    servicio = db.Column(db.String(50), nullable=False)
    protocolo = db.Column(db.String(10), nullable=True)
    puerto = db.Column(db.Integer, nullable=True)

    resultado = db.Column(db.String(20), nullable=True)      # pendiente / permitido / bloqueado
    detalle = db.Column(db.Text, nullable=True)

# ---------- FACTORY ----------

def create_app():
    app = Flask(__name__)

    # Credenciales de Postgres
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///securenet.db"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    CORS(app)
    db.init_app(app)

    with app.app_context():
        db.create_all()


    def docker_safe_name(name: str) -> str:
        """
        Devuelve un nombre válido para GNS3/Docker:
        - Solo [a-zA-Z0-9_.-]
        - Sustituye espacios y caracteres raros por '_'
        - Asegura que el primer carácter sea alfanumérico
        """
        if not name:
            return "node"

        # Reemplazar espacios por guiones bajos
        name = name.replace(" ", "_")

        # Reemplazar cualquier cosa que no sea [a-zA-Z0-9_.-] por '_'
        name = re.sub(r"[^a-zA-Z0-9_.-]", "_", name)

        # Asegurar que empiece por letra o número
        if not re.match(r"[a-zA-Z0-9]", name[0]):
            name = f"n_{name}"

        return name

    # --------- HELPERS GNS3 ---------

    def _gns3_post(path, payload):
        """
        Helper simple para hacer POST a la API de GNS3.
        Lanza RuntimeError si algo sale mal.
        """
        url = f"{GNS3_SERVER_URL}{path}"
        try:
            resp = requests.post(url, json=payload)
            resp.raise_for_status()
        except requests.RequestException as e:
            # Incluimos el texto de respuesta si existe para depurar
            text = ""
            if e.response is not None:
                try:
                    text = e.response.text
                except Exception:
                    text = ""
            raise RuntimeError(f"Error llamando a GNS3 API {url}: {e} {text}")

        # Si GNS3 responde 201/200 con JSON
        if resp.content:
            return resp.json()
        return {}

    def _mapear_nodo_a_gns3(nodo):
        """
        Dado un Nodo de tu BD, devuelve:
        (node_type, properties) para GNS3.

        Aquí sólo definimos una primera versión simple.
        Luego puedes afinarla (usar plantillas, imágenes concretas, etc.).
        """
        tipo = (nodo.tipo or "").lower()
        nombre_original = nodo.nombre or f"nodo_{nodo.id_nodo or ''}"

        # Nombre seguro para GNS3/Docker
        nombre_seguro = docker_safe_name(nombre_original)

        # Router de tu editor -> VPCS con varios adapters
        if tipo == "router":
            return {
                "node_type": "docker",
                "name": nombre_seguro, # Saneado
                "properties": {
                    "image": "alpine",
                    "adapters": 2, # o 4 si quiero mas interfaces
                }
            }

        # Firewall -> contenedor Docker
        if tipo == "firewall":
            return {
                "node_type": "docker",
                "name": nombre_seguro,
                "properties": {
                    "image": "alpine",
                    "adapters": 4,
                },
            }

        # Servidor -> otro contenedor Docker
        if tipo == "servidor":
            return {
                "node_type": "docker",
                "name": nombre_seguro,
                    "properties": {
                    "image": "alpine",
                    "adapters": 2,
                },
            }

        # Cualquier otro tipo: por defecto lo trato como VPCS
        # Por defecto, cualquier otra cosa -> VPCS
        return {
            "node_type": "vpcs",
            "name": nombre_seguro,
                "properties": {
                "adapters": 2,
            },
        }


    # ---------- ENDPOINTS ----------

    @app.get("/health")
    def health():
        return jsonify({"status": "ok", "message": "SecureNet Designer backend alive"})

    # Crear topología (desde React)
    @app.post("/topologias")
    def crear_topologia():
        data = request.get_json()

        nombre = data.get("nombre")
        if not nombre:
            return jsonify({"error": "El campo 'nombre' es obligatorio"}), 400

        descripcion = data.get("descripcion")
        autor = data.get("autor")

        nodos_payload = data.get("nodos", [])
        enlaces_payload = data.get("enlaces", [])

        # 1) Crear la topología
        topologia = Topologia(
            nombre=nombre,
            descripcion=descripcion,
            autor=autor,
        )
        db.session.add(topologia)
        db.session.flush()  # para obtener id_topologia sin hacer commit aún

        # 2) Crear nodos y mapear id_cliente -> id_nodo DB
        mapa_cliente_a_id_db = {}

        for nodo_data in nodos_payload:
            id_cliente = nodo_data.get("id_cliente")
            nombre_nodo = nodo_data.get("nombre") or "Nodo sin nombre"

            tipo = nodo_data.get("tipo") or "desconocido"
            zona = nodo_data.get("zona_seguridad") or "interna"
            pos_x = float(nodo_data.get("posicion_x") or 0)
            pos_y = float(nodo_data.get("posicion_y") or 0)
            subred = nodo_data.get("subred")
            vlan = nodo_data.get("vlan")

            nodo = Nodo(
                id_topologia=topologia.id_topologia,
                nombre=nombre_nodo,
                tipo=tipo,
                zona_seguridad=zona,
                posicion_x=pos_x,
                posicion_y=pos_y,
                subred=subred,
                vlan=vlan,
            )
            db.session.add(nodo)
            db.session.flush()  # obtiene id_nodo

            if id_cliente is not None:
                mapa_cliente_a_id_db[str(id_cliente)] = nodo.id_nodo

        # 3) Crear enlaces usando el mapa de IDs
        for enlace_data in enlaces_payload:
            id_origen_cliente = str(enlace_data.get("id_nodo_origen"))
            id_destino_cliente = str(enlace_data.get("id_nodo_destino"))

            if id_origen_cliente not in mapa_cliente_a_id_db or id_destino_cliente not in mapa_cliente_a_id_db:
                # Si por alguna razón no encontramos el nodo, lo saltamos
                continue

            enlace = Enlace(
                id_topologia=topologia.id_topologia,
                id_nodo_origen=mapa_cliente_a_id_db[id_origen_cliente],
                id_nodo_destino=mapa_cliente_a_id_db[id_destino_cliente],
            )
            db.session.add(enlace)

        db.session.commit()

        return jsonify(
            {
                "id_topologia": topologia.id_topologia,
                "mensaje": "Topología creada correctamente",
            }
        ), 201

    # Listar topologías (solo resumen)
    @app.get("/topologias")
    def listar_topologias():
        topologias = Topologia.query.order_by(Topologia.id_topologia.desc()).all()
        resultado = []
        for t in topologias:
            resultado.append(
                {
                    "id_topologia": t.id_topologia,
                    "nombre": t.nombre,
                    "descripcion": t.descripcion,
                    "fecha_creacion": t.fecha_creacion.isoformat(),
                }
            )
        return jsonify(resultado)

    # Obtener topología completa (con nodos y enlaces) – para más adelante si quieres usarlo
    @app.get("/topologias/<int:id_topologia>")
    def obtener_topologia(id_topologia):
        t = Topologia.query.get_or_404(id_topologia)

        nodos = [
            {
                "id_nodo": n.id_nodo,
                "nombre": n.nombre,
                "tipo": n.tipo,
                "zona_seguridad": n.zona_seguridad,
                "posicion_x": n.posicion_x,
                "posicion_y": n.posicion_y,
                "subred": n.subred,
                "vlan": n.vlan,
            }
            for n in t.nodos
        ]

        enlaces = [
            {
                "id_enlace": e.id_enlace,
                "id_nodo_origen": e.id_nodo_origen,
                "id_nodo_destino": e.id_nodo_destino,
            }
            for e in t.enlaces
        ]

        return jsonify(
            {
                "id_topologia": t.id_topologia,
                "nombre": t.nombre,
                "descripcion": t.descripcion,
                "autor": t.autor,
                "fecha_creacion": t.fecha_creacion.isoformat(),
                "nodos": nodos,
                "enlaces": enlaces,
            }
        )
    

    # -------- POLITICAS DE SEGURIDAD --------


    @app.get("/topologias/<int:id_topologia>/politicas")
    def listar_politicas(id_topologia):
        
        id_firewall = request.args.get("id_firewall", type=int)
        query = PoliticaSeguridad.query.filter_by(id_topologia=id_topologia)

        if id_firewall is not None:
            query = query.filter_by(id_firewall=id_firewall)

        politicas = query.all()

        resultado = []
        for p in politicas:
            resultado.append(
                {
                    "id_politica": p.id_politica,
                    "id_firewall": p.id_firewall,
                    "tipo_origen": p.tipo_origen,
                    "origen": p.origen,
                    "tipo_destino": p.tipo_destino,
                    "destino": p.destino,
                    "servicio": p.servicio,
                    "protocolo": p.protocolo,
                    "puerto": p.puerto,
                    "accion": p.accion,
                    "descripcion": p.descripcion,
                }
            )
        return jsonify(resultado)

    @app.post("/topologias/<int:id_topologia>/politicas")
    def crear_politica(id_topologia):
        data = request.get_json()

        id_firewall = data.get("id_firewall")  # viene del frontend

        politica = PoliticaSeguridad(
            id_topologia=id_topologia,
            id_firewall=id_firewall,  # la ligamos al firewall
            tipo_origen=data.get("tipo_origen", "zona"),
            origen=data.get("origen"),
            tipo_destino=data.get("tipo_destino", "zona"),
            destino=data.get("destino"),
            servicio=data.get("servicio"),
            protocolo=data.get("protocolo"),
            puerto=data.get("puerto"),
            accion=data.get("accion"),
            descripcion=data.get("descripcion"),
        )
        db.session.add(politica)
        db.session.commit()

        return jsonify(
            {
                "id_politica": politica.id_politica,
                "mensaje": "Política creada correctamente",
            }
        ), 201
    
    # -------- ESCENARIOS DE FLUJO --------

    @app.get("/topologias/<int:id_topologia>/escenarios")
    def listar_escenarios(id_topologia):
        escenarios = EscenarioFlujo.query.filter_by(id_topologia=id_topologia).all()
        resultado = []
        for e in escenarios:
            resultado.append(
                {
                    "id_escenario": e.id_escenario,
                    "tipo_origen": e.tipo_origen,
                    "origen": e.origen,
                    "tipo_destino": e.tipo_destino,
                    "destino": e.destino,
                    "servicio": e.servicio,
                    "protocolo": e.protocolo,
                    "puerto": e.puerto,
                    "resultado": e.resultado,
                    "detalle": e.detalle,
                }
            )
        return jsonify(resultado)

    @app.post("/topologias/<int:id_topologia>/escenarios")
    def crear_escenario(id_topologia):
        data = request.get_json()

        escenario = EscenarioFlujo(
            id_topologia=id_topologia,
            tipo_origen=data.get("tipo_origen"),
            origen=data.get("origen"),
            tipo_destino=data.get("tipo_destino"),
            destino=data.get("destino"),
            servicio=data.get("servicio"),
            protocolo=data.get("protocolo"),
            puerto=data.get("puerto"),
            resultado="pendiente",
        )
        db.session.add(escenario)
        db.session.commit()

        return jsonify(
            {
                "id_escenario": escenario.id_escenario,
                "mensaje": "Escenario creado correctamente",
            }
        ), 201
    
    def _resolver_zona_de_nodo(nombre_nodo, nodos):
        """Busca un nodo por nombre y devuelve su zona_seguridad (o None)."""
        for n in nodos:
            if n.nombre == nombre_nodo:
                return n.zona_seguridad
        return None

    # -------- SIMULACION BASICA --------

    @app.post("/topologias/<int:id_topologia>/simular")
    def simular_flujo(id_topologia):

        """
        Simula el comportamiento del firewall de la topología:
        - PoliticaSeguridad representa las reglas del firewall (ACLs).
        - EscenarioFlujo representa los posibles flujos de tráfico.
        - Para cada flujo se determina si es permitido o bloqueado según las reglas.
        """
        politicas = PoliticaSeguridad.query.filter_by(id_topologia=id_topologia).all()
        escenarios = EscenarioFlujo.query.filter_by(id_topologia=id_topologia).all()
        nodos = Nodo.query.filter_by(id_topologia=id_topologia).all()

        # Mapear de firewall por su id, para mostrar su nombre en los detalles
        firewalls_por_id = {
            n.id_nodo: n
            for n in nodos
            if (n.tipo or "").lower() == "firewall"
        }

        resultados = []

        for esc in escenarios:
            # Construimos "claves" de origen/destino que pueden matchear políticas
            origen_claves = [(esc.tipo_origen, esc.origen)]
            destino_claves = [(esc.tipo_destino, esc.destino)]

            # Si el escenario es por nodo, también agregamos su zona como posible match
            if esc.tipo_origen == "nodo":
                zona_o = _resolver_zona_de_nodo(esc.origen, nodos)
                if zona_o:
                    origen_claves.append(("zona", zona_o))

            if esc.tipo_destino == "nodo":
                zona_d = _resolver_zona_de_nodo(esc.destino, nodos)
                if zona_d:
                    destino_claves.append(("zona", zona_d))

            mejor_politica = None
            mejor_score = -1

            for pol in politicas:
                # servicio debe coincidir
                if pol.servicio != esc.servicio:
                    continue

                # Protocolo y puerto: si la política los define, deben coincidir
                if pol.protocolo and esc.protocolo and pol.protocolo != esc.protocolo:
                    continue
                if pol.puerto and esc.puerto and pol.puerto != esc.puerto:
                    continue

                if (pol.tipo_origen, pol.origen) not in origen_claves:
                    continue
                if (pol.tipo_destino, pol.destino) not in destino_claves:
                    continue

                # Calculamos un "score" de especificidad
                score = 0
                if pol.tipo_origen == "nodo":
                    score += 1
                if pol.tipo_destino == "nodo":
                    score += 1

                if score > mejor_score:
                    mejor_score = score
                    mejor_politica = pol

            if mejor_politica:
                fw = firewalls_por_id.get(mejor_politica.id_firewall)
                fw_label = f" en el firewall {fw.nombre}" if fw else " en el firewall lógico de la topología"

                if mejor_politica.accion.lower() == "denegar":
                    esc.resultado = "bloqueado"
                    esc.detalle = (
                        f"Bloqueado por política #{mejor_politica.id_politica}{fw_label} "
                        f"({mejor_politica.tipo_origen} {mejor_politica.origen} -> "
                        f"{mejor_politica.tipo_destino} {mejor_politica.destino})"
                    )
                else:
                    esc.resultado = "permitido"
                    esc.detalle = (
                        f"Permitido por política #{mejor_politica.id_politica}{fw_label} "
                        f"({mejor_politica.tipo_origen} {mejor_politica.origen} -> "
                        f"{mejor_politica.tipo_destino} {mejor_politica.destino})"
                    )
            else:
                # Política por defecto: permitido
                esc.resultado = "permitido"
                esc.detalle = "No se encontró política aplicable: permitido por defecto"

            resultados.append(
                {
                    "id_escenario": esc.id_escenario,
                    "resultado": esc.resultado,
                    "detalle": esc.detalle,
                }
            )

        db.session.commit()
        return jsonify(resultados)
    
    @app.get("/topologias/<int:id_topologia>/vulnerabilidades_segmentacion")
    def vulnerabilidades_segmentacion(id_topologia):
        nodos = Nodo.query.filter_by(id_topologia=id_topologia).all()

        issues = []

        # Mapas para agrupar por subred y VLAN
        subred_map = {}
        vlan_map = {}

        for n in nodos:
            # Nodos sin subred definida
            if not n.subred:
                issues.append({
                    "tipo": "subred_no_definida",
                    "nivel": "medio",
                    "mensaje": f"Nodo '{n.nombre}' (zona {n.zona_seguridad}) no tiene subred definida.",
                })

            # Nodos sin VLAN definida
            if n.vlan is None:
                issues.append({
                    "tipo": "vlan_no_definida",
                    "nivel": "medio",
                    "mensaje": f"Nodo '{n.nombre}' (zona {n.zona_seguridad}) no tiene VLAN definida.",
                })

            # Agrupar por subred
            if n.subred:
                key = n.subred.strip()
                subred_map.setdefault(key, []).append(n)

            # Agrupar por VLAN
            if n.vlan is not None:
                vlan_map.setdefault(n.vlan, []).append(n)

        # Subred compartida entre zonas distintas
        for subred, nodes_list in subred_map.items():
            zonas = {n.zona_seguridad for n in nodes_list}
            if len(zonas) > 1:
                nombres = ", ".join(
                    f"{n.nombre}({n.zona_seguridad})" for n in nodes_list
                )
                issues.append({
                    "tipo": "subred_compartida_multizona",
                    "nivel": "alto",
                    "mensaje": (
                        f"La subred {subred} se usa en múltiples zonas de seguridad "
                        f"({', '.join(zonas)}): {nombres}. "
                        "Esto reduce el aislamiento entre segmentos."
                    ),
                })

        # VLAN compartida entre zonas distintas
        for vlan, nodes_list in vlan_map.items():
            zonas = {n.zona_seguridad for n in nodes_list}
            if len(zonas) > 1:
                nombres = ", ".join(
                    f"{n.nombre}({n.zona_seguridad})" for n in nodes_list
                )
                issues.append({
                    "tipo": "vlan_compartida_multizona",
                    "nivel": "alto",
                    "mensaje": (
                        f"La VLAN {vlan} se utiliza en múltiples zonas de seguridad "
                        f"({', '.join(zonas)}): {nombres}. "
                        "Una misma VLAN en zonas distintas puede implicar puentes no deseados."
                    ),
                })

        return jsonify(issues)

    ICON_MAP = {
        "router": os.path.join("static", "icons", "router.png"),
        "firewall": os.path.join("static", "icons", "firewall.png"),
        "servidor": os.path.join("static", "icons", "server.png"),
        "host": os.path.join("static", "icons", "host.png"),
        "switch": os.path.join("static", "icons", "switch.png"),
        "default": os.path.join("static", "icons", "default.png"),
    }

    def get_icon_path(tipo):
        rel = ICON_MAP.get(tipo)
        if not rel:
            return None
        base_dir = os.path.dirname(__file__)
        full_path = os.path.join(base_dir, rel)
        return full_path if os.path.exists(full_path) else None

    @app.get("/topologias/<int:id_topologia>/reporte")
    def generar_reporte(id_topologia):
        # 1. Obtener datos desde la BD
        topologia = Topologia.query.get_or_404(id_topologia)
        nodos = Nodo.query.filter_by(id_topologia=id_topologia).all()
        enlaces = Enlace.query.filter_by(id_topologia=id_topologia).all()
        politicas = PoliticaSeguridad.query.filter_by(id_topologia=id_topologia).all()
        escenarios = EscenarioFlujo.query.filter_by(id_topologia=id_topologia).all()

        # 2. Crear PDF en memoria
        buffer = BytesIO()
        p = canvas.Canvas(buffer, pagesize=A4)
        width, height = A4

        y = height - 50

        # Título
        p.setFont("Helvetica-Bold", 16)
        p.drawString(50, y, "SecureNet Designer - Reporte de Evaluación de Seguridad")
        y -= 30

        # Datos generales de la topología
        p.setFont("Helvetica-Bold", 12)
        p.drawString(50, y, f"Topología ID: {topologia.id_topologia}")
        y -= 15
        p.setFont("Helvetica", 11)
        p.drawString(50, y, f"Nombre: {topologia.nombre}")
        y -= 15
        if topologia.descripcion:
            p.drawString(50, y, f"Descripción: {topologia.descripcion[:80]}")
            y -= 15
        if topologia.autor:
            p.drawString(50, y, f"Autor: {topologia.autor}")
            y -= 15
        p.drawString(50, y, f"Fecha creación: {topologia.fecha_creacion}")
        y -= 25

        # Vista general de la topología (diagrama)
        p.setFont("Helvetica-Bold", 12)
        p.drawString(50, y, "Vista general de la topología:")
        y -= 20  # un poco más de espacio debajo del título

        # Reservamos un área para el diagrama, dejando márgenes
        area_altura = 180          # alto "útil" del diagrama
        margen_superior = 40       # espacio entre el título y la parte superior del diagrama
        margen_inferior = 35       # espacio entre la parte inferior del diagrama y el siguiente título

        # y = línea actual de texto; area_y será la base del área del diagrama
        area_y = y - margen_superior - area_altura

        dibujar_topologia_canvas(
            p,
            nodos,
            enlaces,
            x=60,
            y=area_y,
            width=width - 120,
            height=area_altura,
        )

        # Colocamos 'y' por debajo de todo el bloque del diagrama + margen inferior,
        # así el título "Nodos de la topología" ya no se solapa.
        margen_inferior_diagrama = 70  # si lo ves muy separado luego, puedes bajarlo a 70 u 80
        y = area_y - margen_inferior_diagrama

        # Nodos
        p.setFont("Helvetica-Bold", 12)
        p.drawString(50, y, "Nodos de la topología:")
        y -= 18
        p.setFont("Helvetica", 10)
        for n in nodos:
            texto = (
                f"- {n.id_nodo}: {n.nombre} "
                f"(tipo={n.tipo}, zona={n.zona_seguridad}, "
                f"pos=({n.posicion_x}, {n.posicion_y}), "
                f"subred={n.subred or 'N/D'}, "
                f"vlan={n.vlan if n.vlan is not None else 'N/D'})"
            )
            p.drawString(50, y, texto[:110])
            y -= 12
            if y < 80:
                p.showPage()
                y = height - 50
                p.setFont("Helvetica", 10)

        y -= 10


        # Enlaces
        p.setFont("Helvetica-Bold", 12)
        p.drawString(50, y, "Enlaces:")
        y -= 18
        p.setFont("Helvetica", 10)
        for e in enlaces:
            texto = f"- enlace {e.id_enlace}: {e.id_nodo_origen} -> {e.id_nodo_destino}"
            p.drawString(50, y, texto[:110])
            y -= 12
            if y < 80:
                p.showPage()
                y = height - 50
                p.setFont("Helvetica", 10)

        y -= 10

        # Politicas (asociadas al firewall si existe)
        # Buscar un nodo de tipo firewall en la topologia
        firewall_nodo = next(
            (n for n in nodos if (n.tipo or "").lower() == "firewall"),
            None
        )

        p.setFont("Helvetica-Bold", 12)
        if firewall_nodo:
            p.drawString(
                50,
                y,
                f"Políticas aplicadas por el Fortigate {firewall_nodo.nombre}:"
            )
        else:
            p.drawString(50, y, "Políticas de seguridad de la topología:")
        y -= 18
        p.setFont("Helvetica", 10)
        if not politicas:
            p.drawString(50, y, "- No hay políticas definidas.")
            y -= 12
        else:
            for pol in politicas:
                texto = (
                    f"- #{pol.id_politica}: {pol.origen} -> {pol.destino} "
                    f"[servicio={pol.servicio}, proto={pol.protocolo}, puerto={pol.puerto}, "
                    f"accion={pol.accion}]"
                )
                p.drawString(50, y, texto[:110])
                y -= 12
                if pol.descripcion:
                    p.drawString(60, y, f"  desc: {pol.descripcion[:100]}")
                    y -= 12
                if y < 80:
                    p.showPage()
                    y = height - 50
                    p.setFont("Helvetica", 10)

        y -= 10

        # Escenarios y resultados
        p.setFont("Helvetica-Bold", 12)
        p.drawString(50, y, "Escenarios de flujo y resultados:")
        y -= 18
        p.setFont("Helvetica", 10)
        if not escenarios:
            p.drawString(50, y, "- No hay escenarios definidos.")
            y -= 12
        else:
            for esc in escenarios:
                texto = (
                    f"- Escenario #{esc.id_escenario}: {esc.origen} -> {esc.destino} "
                    f"[servicio={esc.servicio}, proto={esc.protocolo}, puerto={esc.puerto}] "
                    f"resultado={esc.resultado or 'pendiente'}"
                )
                p.drawString(50, y, texto[:110])
                y -= 12
                if esc.detalle:
                    p.drawString(60, y, f"  detalle: {esc.detalle[:100]}")
                    y -= 12
                if y < 80:
                    p.showPage()
                    y = height - 50
                    p.setFont("Helvetica", 10)

        # Análisis de segmentación (VLAN/Subred) en el reporte
        issues = []

        # Mapas para agrupar por subred y VLAN
        subred_map = {}
        vlan_map = {}

        for n in nodos:
            # Sin subred definida
            if not n.subred:
                issues.append({
                    "nivel": "medio",
                    "mensaje": f"Nodo '{n.nombre}' (zona {n.zona_seguridad}) no tiene subred definida.",
                })

            # Sin VLAN definida
            if n.vlan is None:
                issues.append({
                    "nivel": "medio",
                    "mensaje": f"Nodo '{n.nombre}' (zona {n.zona_seguridad}) no tiene VLAN definida.",
                })

            if n.subred:
                key = n.subred.strip()
                subred_map.setdefault(key, []).append(n)

            if n.vlan is not None:
                vlan_map.setdefault(n.vlan, []).append(n)

        # Subred compartida entre zonas distintas
        for subred, nodes_list in subred_map.items():
            zonas = {n.zona_seguridad for n in nodes_list}
            if len(zonas) > 1:
                nombres = ", ".join(
                    f"{n.nombre}({n.zona_seguridad})" for n in nodes_list
                )
                issues.append({
                    "nivel": "alto",
                    "mensaje": (
                        f"La subred {subred} se usa en múltiples zonas de seguridad "
                        f"({', '.join(zonas)}): {nombres}. Esto reduce el aislamiento entre segmentos."
                    ),
                })

        # VLAN compartida entre zonas distintas
        for vlan, nodes_list in vlan_map.items():
            zonas = {n.zona_seguridad for n in nodes_list}
            if len(zonas) > 1:
                nombres = ", ".join(
                    f"{n.nombre}({n.zona_seguridad})" for n in nodes_list
                )
                issues.append({
                    "nivel": "alto",
                    "mensaje": (
                        f"La VLAN {vlan} se utiliza en múltiples zonas de seguridad "
                        f"({', '.join(zonas)}): {nombres}. Una misma VLAN en zonas distintas "
                        "puede implicar puentes no deseados."
                    ),
                })

        if y < 100:
            p.showPage()
            y = height - 50
            p.setFont("Helvetica", 10)

        p.setFont("Helvetica-Bold", 12)
        p.drawString(50, y, "Análisis de segmentación (VLAN/Subred):")
        y -= 18
        p.setFont("Helvetica", 10)

        if not issues:
            p.drawString(50, y, "No se detectaron problemas de segmentación.")
            y -= 12
        else:
            for issue in issues:
                linea = f"[{issue['nivel'].upper()}] {issue['mensaje']}"
                p.drawString(50, y, linea[:110])
                y -= 12
                if y < 80:
                    p.showPage()
                    y = height - 50
                    p.setFont("Helvetica", 10)


        p.showPage()
        p.save()

        buffer.seek(0)

        from flask import send_file

        filename = f"reporte_topologia_{topologia.id_topologia}.pdf"
        return send_file(
            buffer,
            as_attachment=True,
            download_name=filename,
            mimetype="application/pdf",
        )

    @app.delete("/topologias/<int:id_topologia>")
    def eliminar_topologia(id_topologia):
        # Verificar que exista la topología
        topologia = Topologia.query.get_or_404(id_topologia)

        # Eliminar políticas y escenarios asociados (por si no hay cascada en el modelo)
        PoliticaSeguridad.query.filter_by(id_topologia=id_topologia).delete(synchronize_session=False)
        EscenarioFlujo.query.filter_by(id_topologia=id_topologia).delete(synchronize_session=False)

        # Eliminar la topología (Nodos y Enlaces se borran por la relación cascade)
        db.session.delete(topologia)
        db.session.commit()

        return jsonify({"mensaje": "Topología eliminada correctamente"}), 200

    def dibujar_topologia_canvas(p, nodos, enlaces, x, y, width, height):
        """
        Dibuja un esquema de la topología usando las posiciones
        de los nodos guardadas en la BD dentro del área (x, y, width, height).
        """
        if not nodos:
            p.setFont("Helvetica", 10)
            p.drawString(x, y + height / 2, "No hay nodos para dibujar la topología.")
            return

        # Rango de coordenadas originales (React Flow)
        min_x = min(n.posicion_x for n in nodos)
        max_x = max(n.posicion_x for n in nodos)
        min_y = min(n.posicion_y for n in nodos)
        max_y = max(n.posicion_y for n in nodos)

        span_x = max(max_x - min_x, 1)
        span_y = max(max_y - min_y, 1)

        # Escala y tamaño realmente usado
        scale = min(width / span_x, height / span_y)
        used_w = span_x * scale
        used_h = span_y * scale

        # Offset para centrar el dibujo en el área
        offset_x = x + (width - used_w) / 2
        offset_y = y + (height - used_h) / 2

        # Mapa id_nodo -> nodo
        nodos_map = {n.id_nodo: n for n in nodos}

        # 1) Dibujar enlaces como líneas
        p.setStrokeColor(colors.darkgray)
        for e in enlaces:
            origen = nodos_map.get(e.id_nodo_origen)
            destino = nodos_map.get(e.id_nodo_destino)
            if not origen or not destino:
                continue

            # React Flow tiene Y hacia abajo; aquí lo invertimos
            x1 = offset_x + (origen.posicion_x - min_x) * scale
            y1 = offset_y + (max_y - origen.posicion_y) * scale
            x2 = offset_x + (destino.posicion_x - min_x) * scale
            y2 = offset_y + (max_y - destino.posicion_y) * scale

            p.line(x1, y1, x2, y2)

        # 2) Colores por zona (fondo muy claro, borde de color)
        zona_fill_colors = {
            "interna": colors.Color(0.88, 1.0, 0.88),   # verde muy claro
            "dmz":     colors.Color(1.0, 0.96, 0.86),   # naranja muy claro
            "externa": colors.Color(1.0, 0.88, 0.88),   # rojo muy claro
        }
        zona_border_colors = {
            "interna": colors.green,
            "dmz":     colors.orange,
            "externa": colors.red,
        }

        # Tamaño del rectángulo del nodo e icono
        node_w = 90
        node_h = 70
        icon_size = 28  # icono más grande

        # 3) Dibujar cada nodo
        for n in nodos:
            cx = offset_x + (n.posicion_x - min_x) * scale
            cy = offset_y + (max_y - n.posicion_y) * scale  # invertimos Y

            zona_key = (n.zona_seguridad or "").lower()
            fill_color = zona_fill_colors.get(zona_key, colors.whitesmoke)
            border_color = zona_border_colors.get(zona_key, colors.gray)

            # Rectángulo del nodo (fondo claro, borde según zona)
            p.setFillColor(fill_color)
            p.setStrokeColor(border_color)
            p.roundRect(
                cx - node_w / 2,
                cy - node_h / 2,
                node_w,
                node_h,
                6,
                stroke=1,
                fill=1,
            )

            # Coordenadas "base" del rectángulo
            bottom_y = cy - node_h / 2
            top_y = cy + node_h / 2

            # Icono del tipo de nodo (centrado en la parte superior del rectángulo)
            icon_path = get_icon_path(n.tipo)
            if icon_path:
                icon_x = cx - icon_size / 2
                # Un poco por debajo del borde superior
                icon_y = top_y - 6 - icon_size
                p.drawImage(
                    icon_path,
                    icon_x,
                    icon_y,
                    width=icon_size,
                    height=icon_size,
                    preserveAspectRatio=True,
                    mask="auto",
                )

            # Texto: nombre + subred + VLAN, alineados debajo del icono
            p.setFillColor(colors.black)
            font_size = 7
            line_height = font_size + 1
            p.setFont("Helvetica", font_size)

            nombre_corto = (n.nombre or "")[:22]
            subred_txt = f"Subred: {n.subred}" if n.subred else "Subred: N/D"
            vlan_txt = f"VLAN: {n.vlan}" if n.vlan is not None else "VLAN: N/D"

            # Y del texto: empezamos un poco por debajo de la base del icono
            # Si no hubo icono, usamos el centro como referencia
            if icon_path:
                base_text_y = (top_y - 6 - icon_size) - 4  # debajo del icono
            else:
                base_text_y = cy - 4

            y_nombre = base_text_y
            y_subred = y_nombre - line_height
            y_vlan = y_subred - line_height

            # En caso extremo, aseguramos que el texto no se salga del rectángulo
            if y_vlan < bottom_y + 4:
                delta = (bottom_y + 4) - y_vlan
                y_nombre += delta
                y_subred += delta
                y_vlan += delta

            p.drawCentredString(cx, y_nombre, nombre_corto)
            p.drawCentredString(cx, y_subred, subred_txt[:26])
            p.drawCentredString(cx, y_vlan, vlan_txt[:26])

    # --------- EXPORTAR TOPOLÓGIA A GNS3 ---------

    @app.post("/topologias/<int:id_topologia>/exportar_gns3")
    def exportar_topologia_a_gns3(id_topologia):
        """
        Toma la topología de la BD (nodos + enlaces) y la replica en GNS3:
        - Crea un proyecto en GNS3
        - Crea un nodo GNS3 por cada Nodo
        - Crea un enlace GNS3 por cada Enlace
        Devuelve el project_id de GNS3.
        """
        topologia = Topologia.query.get_or_404(id_topologia)
        nodos = Nodo.query.filter_by(id_topologia=id_topologia).all()
        enlaces = Enlace.query.filter_by(id_topologia=id_topologia).all()

        if not nodos:
            return jsonify({"error": "La topología no tiene nodos para exportar"}), 400

        # 1) Crear proyecto en GNS3
        base_name = f"SecureNet_{topologia.id_topologia}_{topologia.nombre}"
        # añadimos un sufijo con timestamp para evitar 409 (conflict)
        nombre_proyecto = f"{base_name}_{int(time.time())}"

        proyecto_payload = {
            "name": nombre_proyecto[:64]  # GNS3 suele limitar longitud
        }

        try:
            proyecto = _gns3_post("/v2/projects", proyecto_payload)
        except RuntimeError as e:
            return jsonify({"error": str(e)}), 502

        # Obtener project_id de la respuesta
        project_id = proyecto.get("project_id")
        if not project_id:
            return jsonify({"error": "La respuesta de GNS3 no contiene project_id"}), 502

        # 2) Crear nodos en GNS3 y mapear id_nodo BD -> node_id GNS3
        bd_to_gns3_node_id = {}
        # Contador de puertos por nodo GNS3 (para conectar enlaces)
        port_counters = {}

        for n in nodos:
            mapping = _mapear_nodo_a_gns3(n)

            # Coordenadas: usamos las mismas que tienes en React Flow,
            # pero GNS3 tiene origen distinto. Para empezar esto suele funcionar;
            # si quedan “boca abajo” puedes invertir Y.
            node_payload = {
                "name": mapping["name"],
                "node_type": mapping["node_type"],
                "compute_id": GNS3_COMPUTE_ID,
                "x": int(n.posicion_x),
                "y": int(-n.posicion_y),
                "properties": mapping.get("properties", {}),
            }

            # Docker necesita console_type explícito
            if mapping["node_type"] == "docker":
                node_payload["properties"].setdefault("console_type", "telnet")

            try:
                node_resp = _gns3_post(f"/v2/projects/{project_id}/nodes", node_payload)
            except RuntimeError as e:
                return jsonify({"error": f"Error creando nodo '{n.nombre}' en GNS3: {e}"}), 502

            gns3_node_id = node_resp.get("node_id")
            if not gns3_node_id:
                return jsonify({"error": f"GNS3 no devolvió node_id para el nodo '{n.nombre}'"}), 502

            bd_to_gns3_node_id[n.id_nodo] = gns3_node_id
            port_counters[gns3_node_id] = 0

        # 3) Crear enlaces en GNS3
        for e in enlaces:
            origen_gns3 = bd_to_gns3_node_id.get(e.id_nodo_origen)
            destino_gns3 = bd_to_gns3_node_id.get(e.id_nodo_destino)
            if not origen_gns3 or not destino_gns3:
                # Si por alguna razón falta algún nodo, saltamos ese enlace
                continue

            # Usamos un adapter distinto por enlace, y port_number siempre 0
            adapter_o = port_counters[origen_gns3]
            adapter_d = port_counters[destino_gns3]
            port_counters[origen_gns3] += 1
            port_counters[destino_gns3] += 1

            link_payload = {
                "nodes": [
                    {
                        "node_id": origen_gns3,
                        "adapter_number": adapter_o,
                        "port_number": 0,
                    },
                    {
                        "node_id": destino_gns3,
                        "adapter_number": adapter_d,
                        "port_number": 0,
                    },
                ]
            }

            try:
                _gns3_post(f"/v2/projects/{project_id}/links", link_payload)
            except RuntimeError as ex:
                # No detenemos todo si un enlace falla; solo lo registramos.
                # Si prefieres, puedes hacer return con error aquí.
                print(f"[WARN] Error creando enlace en GNS3: {ex}")
                
        return jsonify(
            {
                "mensaje": "Topología exportada a GNS3 correctamente",
                "gns3_project_id": project_id,
                "gns3_server_url": GNS3_SERVER_URL,
            }
        ), 201


    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host="127.0.0.1", port=5000, debug=True)
