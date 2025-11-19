from datetime import datetime


from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
## PDF
from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

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

            nodo = Nodo(
                id_topologia=topologia.id_topologia,
                nombre=nombre_nodo,
                tipo=tipo,
                zona_seguridad=zona,
                posicion_x=pos_x,
                posicion_y=pos_y,
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
        politicas = PoliticaSeguridad.query.filter_by(id_topologia=id_topologia).all()
        resultado = []
        for p in politicas:
            resultado.append(
                {
                    "id_politica": p.id_politica,
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

        politica = PoliticaSeguridad(
            id_topologia=id_topologia,
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
        politicas = PoliticaSeguridad.query.filter_by(id_topologia=id_topologia).all()
        escenarios = EscenarioFlujo.query.filter_by(id_topologia=id_topologia).all()
        nodos = Nodo.query.filter_by(id_topologia=id_topologia).all()

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
                if mejor_politica.accion.lower() == "denegar":
                    esc.resultado = "bloqueado"
                    esc.detalle = (
                        f"Bloqueado por política #{mejor_politica.id_politica} "
                        f"({mejor_politica.tipo_origen} {mejor_politica.origen} -> "
                        f"{mejor_politica.tipo_destino} {mejor_politica.destino})"
                    )
                else:
                    esc.resultado = "permitido"
                    esc.detalle = (
                        f"Permitido por política #{mejor_politica.id_politica} "
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

        # Nodos
        p.setFont("Helvetica-Bold", 12)
        p.drawString(50, y, "Nodos de la topología:")
        y -= 18
        p.setFont("Helvetica", 10)
        for n in nodos:
            texto = f"- {n.id_nodo}: {n.nombre} (tipo={n.tipo}, zona={n.zona_seguridad}, pos=({n.posicion_x}, {n.posicion_y}))"
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

        # Políticas
        p.setFont("Helvetica-Bold", 12)
        p.drawString(50, y, "Políticas de seguridad:")
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

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host="127.0.0.1", port=5000, debug=True)
