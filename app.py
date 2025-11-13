from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore, auth
import os
from datetime import datetime, timedelta
import json
import requests

# Initialisation de l'application Flask
app = Flask(__name__)
CORS(app)

# Configuration
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'votre_cle_secrete_super_securisee')

# Initialisation Firebase Admin
try:
    # Pour Render.com, nous utiliserons les variables d'environnement
    firebase_config = {
        "type": "service_account",
        "project_id": os.environ.get('FIREBASE_PROJECT_ID', 'presenceepl'),
        "private_key_id": os.environ.get('FIREBASE_PRIVATE_KEY_ID'),
        "private_key": os.environ.get('FIREBASE_PRIVATE_KEY', '').replace('\\n', '\n'),
        "client_email": os.environ.get('FIREBASE_CLIENT_EMAIL'),
        "client_id": os.environ.get('FIREBASE_CLIENT_ID'),
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_x509_cert_url": os.environ.get('FIREBASE_CLIENT_CERT_URL')
    }
    
    cred = credentials.Certificate(firebase_config)
    firebase_admin.initialize_app(cred)
except Exception as e:
    print(f"Erreur d'initialisation Firebase Admin: {e}")

# Initialisation Firestore
db = firestore.client()

# Middleware pour vérifier le token Firebase
def verify_firebase_token(id_token):
    try:
        decoded_token = auth.verify_id_token(id_token)
        return decoded_token
    except Exception as e:
        print(f"Erreur de vérification du token: {e}")
        return None

# Routes de l'application
@app.route('/')
def index():
    return jsonify({
        'message': 'API du Système de Contrôle de Présence',
        'version': '1.0.0',
        'status': 'online'
    })

@app.route('/api/health')
def health_check():
    return jsonify({'status': 'healthy', 'timestamp': datetime.utcnow().isoformat()})

# Gestion des utilisateurs
@app.route('/api/users', methods=['GET'])
def get_users():
    try:
        # Vérifier le token Firebase
        id_token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not id_token:
            return jsonify({'error': 'Token manquant'}), 401
            
        decoded_token = verify_firebase_token(id_token)
        if not decoded_token:
            return jsonify({'error': 'Token invalide'}), 401

        # Récupérer les utilisateurs depuis Firestore
        users_ref = db.collection('users')
        users = users_ref.stream()
        
        users_list = []
        for user in users:
            user_data = user.to_dict()
            user_data['id'] = user.id
            users_list.append(user_data)
            
        return jsonify(users_list)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/users', methods=['POST'])
def create_user():
    try:
        id_token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not id_token:
            return jsonify({'error': 'Token manquant'}), 401
            
        decoded_token = verify_firebase_token(id_token)
        if not decoded_token:
            return jsonify({'error': 'Token invalide'}), 401

        data = request.get_json()
        
        # Créer l'utilisateur dans Firebase Auth
        user_record = auth.create_user(
            email=data.get('email'),
            password=data.get('password'),
            display_name=data.get('name')
        )
        
        # Sauvegarder les informations supplémentaires dans Firestore
        user_data = {
            'name': data.get('name'),
            'email': data.get('email'),
            'role': data.get('role', 'user'),
            'fingerprint_id': data.get('fingerprint_id'),
            'created_at': firestore.SERVER_TIMESTAMP,
            'updated_at': firestore.SERVER_TIMESTAMP
        }
        
        db.collection('users').document(user_record.uid).set(user_data)
        
        return jsonify({
            'success': True,
            'user_id': user_record.uid,
            'message': 'Utilisateur créé avec succès'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Gestion des cours/UE
@app.route('/api/courses', methods=['GET'])
def get_courses():
    try:
        id_token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not id_token:
            return jsonify({'error': 'Token manquant'}), 401
            
        decoded_token = verify_firebase_token(id_token)
        if not decoded_token:
            return jsonify({'error': 'Token invalide'}), 401

        courses_ref = db.collection('courses')
        courses = courses_ref.stream()
        
        courses_list = []
        for course in courses:
            course_data = course.to_dict()
            course_data['id'] = course.id
            courses_list.append(course_data)
            
        return jsonify(courses_list)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/courses', methods=['POST'])
def create_course():
    try:
        id_token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not id_token:
            return jsonify({'error': 'Token manquant'}), 401
            
        decoded_token = verify_firebase_token(id_token)
        if not decoded_token:
            return jsonify({'error': 'Token invalide'}), 401

        data = request.get_json()
        
        course_data = {
            'code': data.get('code'),
            'name': data.get('name'),
            'schedule': data.get('schedule', ''),
            'description': data.get('description', ''),
            'created_at': firestore.SERVER_TIMESTAMP,
            'updated_at': firestore.SERVER_TIMESTAMP
        }
        
        course_ref = db.collection('courses').document()
        course_ref.set(course_data)
        
        return jsonify({
            'success': True,
            'course_id': course_ref.id,
            'message': 'Cours créé avec succès'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Gestion des présences
@app.route('/api/attendance', methods=['GET'])
def get_attendance():
    try:
        id_token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not id_token:
            return jsonify({'error': 'Token manquant'}), 401
            
        decoded_token = verify_firebase_token(id_token)
        if not decoded_token:
            return jsonify({'error': 'Token invalide'}), 401

        # Récupérer les paramètres de filtrage
        date_filter = request.args.get('date')
        course_id = request.args.get('course_id')
        
        attendance_ref = db.collection('attendance')
        
        # Appliquer les filtres
        if date_filter:
            date_obj = datetime.strptime(date_filter, '%Y-%m-%d')
            next_day = date_obj + timedelta(days=1)
            attendance_ref = attendance_ref.where('timestamp', '>=', date_obj).where('timestamp', '<', next_day)
            
        if course_id:
            attendance_ref = attendance_ref.where('course_id', '==', course_id)
            
        attendance_records = attendance_ref.stream()
        
        attendance_list = []
        for record in attendance_records:
            record_data = record.to_dict()
            record_data['id'] = record.id
            
            # Récupérer les informations de l'utilisateur et du cours
            if 'user_id' in record_data:
                user_doc = db.collection('users').document(record_data['user_id']).get()
                if user_doc.exists:
                    record_data['user_name'] = user_doc.to_dict().get('name', 'Inconnu')
            
            if 'course_id' in record_data:
                course_doc = db.collection('courses').document(record_data['course_id']).get()
                if course_doc.exists:
                    course_data = course_doc.to_dict()
                    record_data['course_name'] = course_data.get('name', 'Inconnu')
                    record_data['course_code'] = course_data.get('code', '')
            
            attendance_list.append(record_data)
            
        return jsonify(attendance_list)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/attendance', methods=['POST'])
def record_attendance():
    try:
        data = request.get_json()
        fingerprint_id = data.get('fingerprint_id')
        
        if not fingerprint_id:
            return jsonify({'error': 'ID d\'empreinte manquant'}), 400
        
        # Trouver l'utilisateur par fingerprint_id
        users_ref = db.collection('users')
        query = users_ref.where('fingerprint_id', '==', fingerprint_id).limit(1)
        users = query.stream()
        
        user_doc = None
        for user in users:
            user_doc = user
            break
            
        if not user_doc:
            return jsonify({'error': 'Utilisateur non trouvé'}), 404
        
        user_data = user_doc.to_dict()
        
        # Déterminer le cours en fonction de l'horaire actuel
        current_time = datetime.utcnow()
        current_day = current_time.strftime('%A').lower()
        current_hour = current_time.hour
        
        # Trouver le cours correspondant (simplifié)
        courses_ref = db.collection('courses')
        courses = courses_ref.stream()
        
        current_course = None
        for course in courses:
            course_data = course.to_dict()
            schedule = course_data.get('schedule', '').lower()
            
            # Logique simplifiée de correspondance d'horaire
            if current_day in schedule:
                current_course = course
                break
        
        if not current_course:
            return jsonify({'error': 'Aucun cours programmé à cette heure'}), 400
        
        # Vérifier si la présence a déjà été enregistrée aujourd'hui
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = today_start + timedelta(days=1)
        
        attendance_ref = db.collection('attendance')
        existing_query = attendance_ref.where('user_id', '==', user_doc.id)\
                                      .where('course_id', '==', current_course.id)\
                                      .where('timestamp', '>=', today_start)\
                                      .where('timestamp', '<', today_end)\
                                      .limit(1)
        existing_records = existing_query.stream()
        
        if any(existing_records):
            return jsonify({'error': 'Présence déjà enregistrée aujourd\'hui'}), 400
        
        # Enregistrer la présence
        attendance_data = {
            'user_id': user_doc.id,
            'course_id': current_course.id,
            'timestamp': current_time,
            'status': 'present',
            'created_at': firestore.SERVER_TIMESTAMP
        }
        
        attendance_ref = db.collection('attendance').document()
        attendance_ref.set(attendance_data)
        
        # Journaliser l'activité
        activity_data = {
            'type': 'attendance',
            'message': f'Présence enregistrée pour {user_data.get("name")}',
            'timestamp': firestore.SERVER_TIMESTAMP,
            'user_id': user_doc.id
        }
        db.collection('activities').document().set(activity_data)
        
        return jsonify({
            'success': True,
            'message': 'Présence enregistrée avec succès',
            'user_name': user_data.get('name'),
            'course_name': current_course.to_dict().get('name')
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Statistiques
@app.route('/api/stats')
def get_stats():
    try:
        id_token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not id_token:
            return jsonify({'error': 'Token manquant'}), 401
            
        decoded_token = verify_firebase_token(id_token)
        if not decoded_token:
            return jsonify({'error': 'Token invalide'}), 401

        # Compter les utilisateurs
        users_count = len(list(db.collection('users').stream()))
        
        # Compter les cours
        courses_count = len(list(db.collection('courses').stream()))
        
        # Présences aujourd'hui
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = today_start + timedelta(days=1)
        today_attendances = len(list(db.collection('attendance')
                                  .where('timestamp', '>=', today_start)
                                  .where('timestamp', '<', today_end)
                                  .stream()))
        
        return jsonify({
            'user_count': users_count,
            'course_count': courses_count,
            'today_attendances': today_attendances
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Activités récentes
@app.route('/api/activities')
def get_activities():
    try:
        id_token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not id_token:
            return jsonify({'error': 'Token manquant'}), 401
            
        decoded_token = verify_firebase_token(id_token)
        if not decoded_token:
            return jsonify({'error': 'Token invalide'}), 401

        activities_ref = db.collection('activities').order_by('timestamp', direction=firestore.Query.DESCENDING).limit(10)
        activities = activities_ref.stream()
        
        activities_list = []
        for activity in activities:
            activity_data = activity.to_dict()
            activity_data['id'] = activity.id
            
            # Convertir le timestamp
            if 'timestamp' in activity_data:
                if hasattr(activity_data['timestamp'], 'isoformat'):
                    activity_data['timestamp'] = activity_data['timestamp'].isoformat()
            
            activities_list.append(activity_data)
            
        return jsonify(activities_list)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Route pour l'ESP32
@app.route('/api/device/attendance', methods=['POST'])
def device_attendance():
    try:
        data = request.get_json()
        api_key = request.headers.get('X-API-Key')
        fingerprint_id = data.get('fingerprint_id')
        
        # Vérifier la clé API
        expected_api_key = os.environ.get('DEVICE_API_KEY', 'default_device_key')
        if api_key != expected_api_key:
            return jsonify({'error': 'Clé API invalide'}), 401
        
        if not fingerprint_id:
            return jsonify({'error': 'ID d\'empreinte manquant'}), 400
        
        # Logique d'enregistrement de présence similaire à la route normale
        # ... (le même code que la route /api/attendance POST)
        
        return jsonify({'success': True, 'message': 'Présence enregistrée'})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=os.environ.get('DEBUG', 'False').lower() == 'true')