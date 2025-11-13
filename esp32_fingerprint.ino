#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// Configuration WiFi
const char* ssid = "VOTRE_SSID";
const char* password = "VOTRE_MOT_DE_PASSE";

// Configuration du backend
const char* serverURL = "https://votre-backend.onrender.com"; // Remplacez par votre URL Render
const char* apiKey = "VOTRE_CLE_API_SECRETE"; // À définir dans les variables d'environnement Render

// Broches pour le capteur d'empreinte DY50
#define FINGERPRINT_RX 16
#define FINGERPRINT_TX 17

// LED de statut
#define LED_PIN 2
#define BUZZER_PIN 4

// Variables globales
bool wifiConnected = false;
unsigned long lastAttempt = 0;
const unsigned long attemptInterval = 30000; // 30 secondes

void setup() {
  Serial.begin(115200);
  Serial1.begin(57600, SERIAL_8N1, FINGERPRINT_RX, FINGERPRINT_TX);
  
  // Initialisation des broches
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  
  // Éteindre la LED et le buzzer au démarrage
  digitalWrite(LED_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);
  
  // Connexion WiFi
  connectToWiFi();
  
  // Initialisation du capteur d'empreinte
  initFingerprintSensor();
  
  Serial.println("Système de contrôle de présence ESP32 initialisé");
}

void loop() {
  // Vérifier la connexion WiFi
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastAttempt > attemptInterval) {
      connectToWiFi();
      lastAttempt = millis();
    }
    return;
  }
  
  // Lire les données du capteur d'empreinte
  if (Serial1.available()) {
    String fingerprintData = Serial1.readString();
    processFingerprintData(fingerprintData);
  }
  
  // Simulation d'une empreinte digitale (à remplacer par la vraie lecture)
  if (Serial.available()) {
    String input = Serial.readString();
    input.trim();
    
    if (input.length() > 0) {
      int fingerprintId = input.toInt();
      if (fingerprintId > 0) {
        sendAttendanceToServer(fingerprintId);
      }
    }
  }
  
  delay(100);
}

void connectToWiFi() {
  Serial.print("Connexion au WiFi");
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    digitalWrite(LED_PIN, !digitalRead(LED_PIN)); // Clignoter la LED
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println("\nConnecté au WiFi!");
    Serial.print("Adresse IP: ");
    Serial.println(WiFi.localIP());
    digitalWrite(LED_PIN, HIGH); // LED allumée = connecté
    beep(1); // Bip de confirmation
  } else {
    wifiConnected = false;
    Serial.println("\nÉchec de connexion WiFi!");
    digitalWrite(LED_PIN, LOW);
    beep(3); // Bips d'erreur
  }
}

void initFingerprintSensor() {
  Serial.println("Initialisation du capteur d'empreinte...");
  
  // Envoyer la commande de test au capteur
  byte testCommand[] = {0xEF, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0x01, 0x00, 0x03, 0x01, 0x00, 0x05};
  Serial1.write(testCommand, sizeof(testCommand));
  
  delay(1000);
  
  // Lire la réponse
  if (Serial1.available()) {
    String response = Serial1.readString();
    Serial.print("Réponse du capteur: ");
    Serial.println(response);
    
    if (response.length() > 0) {
      Serial.println("Capteur d'empreinte initialisé avec succès");
      beep(2); // Deux bips de succès
    } else {
      Serial.println("Erreur d'initialisation du capteur");
      beep(4); // Quatre bips d'erreur
    }
  }
}

void processFingerprintData(String data) {
  Serial.print("Données empreinte reçues: ");
  Serial.println(data);
  
  // Analyser les données du capteur (format spécifique au DY50)
  // Cette partie dépend du protocole de communication de votre capteur
  
  // Exemple: extraire l'ID de l'empreinte
  int fingerprintId = extractFingerprintId(data);
  
  if (fingerprintId > 0) {
    Serial.print("Empreinte détectée - ID: ");
    Serial.println(fingerprintId);
    sendAttendanceToServer(fingerprintId);
  }
}

int extractFingerprintId(String data) {
  // Implémentez la logique pour extraire l'ID de l'empreinte
  // du format de données de votre capteur DY50
  
  // Pour l'instant, nous simulons un ID
  if (data.length() >= 2) {
    return random(1, 100); // Simulation
  }
  return -1;
}

void sendAttendanceToServer(int fingerprintId) {
  if (!wifiConnected) {
    Serial.println("Erreur: WiFi non connecté");
    beep(3); // Bips d'erreur
    return;
  }
  
  HTTPClient http;
  
  String url = String(serverURL) + "/api/device/attendance";
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", apiKey);
  
  // Créer le JSON de requête
  DynamicJsonDocument doc(1024);
  doc["fingerprint_id"] = fingerprintId;
  doc["device_id"] = "ESP32_" + String(WiFi.macAddress());
  doc["timestamp"] = millis();
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.print("Envoi de la présence pour l'empreinte ID: ");
  Serial.println(fingerprintId);
  Serial.print("URL: ");
  Serial.println(url);
  Serial.print("Données: ");
  Serial.println(jsonString);
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.print("Réponse du serveur: ");
    Serial.println(response);
    
    // Analyser la réponse
    DynamicJsonDocument responseDoc(1024);
    deserializeJson(responseDoc, response);
    
    bool success = responseDoc["success"];
    String message = responseDoc["message"] | "Erreur inconnue";
    
    if (success) {
      Serial.println("Présence enregistrée avec succès!");
      beep(1); // Bip de succès
      blinkLED(3, 200); // Clignotement de succès
    } else {
      Serial.print("Erreur: ");
      Serial.println(message);
      beep(2); // Bips d'erreur
    }
  } else {
    Serial.print("Erreur HTTP: ");
    Serial.println(httpResponseCode);
    beep(3); // Bips d'erreur réseau
  }
  
  http.end();
}

void beep(int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(100);
    digitalWrite(BUZZER_PIN, LOW);
    if (i < times - 1) delay(100);
  }
}

void blinkLED(int times, int delayTime) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(delayTime);
    digitalWrite(LED_PIN, LOW);
    if (i < times - 1) delay(delayTime);
  }
  digitalWrite(LED_PIN, wifiConnected ? HIGH : LOW);
}

// Fonction pour envoyer des commandes au capteur d'empreinte
void sendFingerprintCommand(byte command[], int length) {
  Serial1.write(command, length);
  delay(100);
  
  // Lire la réponse
  if (Serial1.available()) {
    String response = Serial1.readString();
    Serial.print("Réponse du capteur: ");
    Serial.println(response);
  }
}