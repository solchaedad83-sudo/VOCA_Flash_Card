#!/usr/bin/env python3
import os
import csv
import io
import json
import sys
import shutil
import socket
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from datetime import datetime

PORT = 8000
CSV_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "voca.csv")
BACKUP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backup")
CSV_ENCODING = "utf-8-sig"
CSV_HEADER = [
    "word",
    "meaning",
    "example_sentence",
    "example_translation",
    "interval",
    "ease_factor",
    "repetitions",
    "due_date",
    "created_at"
]

def get_lan_ip():
    """Returns the best local network IP address for phone access."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return "localhost"

SAMPLE_WORDS = [
    {
        "word": "ephemeral",
        "meaning": "일시적인, 수명이 짧은",
        "example_sentence": "Fame in the age of the internet is ephemeral.",
        "example_translation": "인터넷 시대의 명성은 일시적이다.",
        "interval": "0",
        "ease_factor": "2.5",
        "repetitions": "0",
        "due_date": "",
        "created_at": "2026-05-21 12:00:00"
    },
    {
        "word": "serendipity",
        "meaning": "뜻밖의 발견, 우연한 행운",
        "example_sentence": "We found the charming little bookstore by pure serendipity.",
        "example_translation": "우리는 순전히 뜻밖의 행운으로 그 매력적이고 작은 서점을 발견했다.",
        "interval": "0",
        "ease_factor": "2.5",
        "repetitions": "0",
        "due_date": "",
        "created_at": "2026-05-21 12:00:00"
    },
    {
        "word": "persistence",
        "meaning": "끈기, 고집, 지속성",
        "example_sentence": "Her persistence paid off when she finally got the dream job.",
        "example_translation": "그녀가 마침내 꿈꾸던 일자리를 얻었을 때 그녀의 끈기는 결실을 맺었다.",
        "interval": "0",
        "ease_factor": "2.5",
        "repetitions": "0",
        "due_date": "",
        "created_at": "2026-05-21 12:00:00"
    },
    {
        "word": "vivid",
        "meaning": "생생한, 선명한",
        "example_sentence": "He gave a vivid description of his travel adventures.",
        "example_translation": "그는 자신의 여행 모험에 대해 생생하게 묘사했다.",
        "interval": "0",
        "ease_factor": "2.5",
        "repetitions": "0",
        "due_date": "",
        "created_at": "2026-05-21 12:00:00"
    },
    {
        "word": "meticulous",
        "meaning": "꼼꼼한, 세심한",
        "example_sentence": "The researcher kept meticulous records of the experiments.",
        "example_translation": "그 연구원은 실험에 대한 꼼꼼한 기록을 남겼다.",
        "interval": "0",
        "ease_factor": "2.5",
        "repetitions": "0",
        "due_date": "",
        "created_at": "2026-05-21 12:00:00"
    }
]

def initialize_csv():
    """Initializes the voca.csv file with headers and sample data if it doesn't exist."""
    if not os.path.exists(CSV_FILE):
        try:
            with open(CSV_FILE, mode="w", encoding=CSV_ENCODING, newline="") as f:
                writer = csv.DictWriter(f, fieldnames=CSV_HEADER)
                writer.writeheader()
                for word in SAMPLE_WORDS:
                    writer.writerow(word)
            print(f"Initialized CSV file at {CSV_FILE} with starter cards.")
        except Exception as e:
            print(f"Error initializing CSV: {e}", file=sys.stderr)

def read_words():
    """Reads all words from the CSV file and returns them as a list of dicts."""
    initialize_csv()
    words = []
    try:
        with open(CSV_FILE, mode="r", encoding=CSV_ENCODING, newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Ensure all columns exist, fill with default values if they are missing
                word_entry = {}
                for key in CSV_HEADER:
                    word_entry[key] = row.get(key, "")
                
                # Convert numbers to appropriate types for frontend convenience
                try:
                    word_entry["interval"] = int(word_entry["interval"])
                except (ValueError, TypeError):
                    word_entry["interval"] = 0
                
                try:
                    word_entry["ease_factor"] = float(word_entry["ease_factor"])
                except (ValueError, TypeError):
                    word_entry["ease_factor"] = 2.5
                
                try:
                    word_entry["repetitions"] = int(word_entry["repetitions"])
                except (ValueError, TypeError):
                    word_entry["repetitions"] = 0

                words.append(word_entry)
    except Exception as e:
        print(f"Error reading CSV: {e}", file=sys.stderr)
    return words

def write_all_words(words):
    """Overwrites the CSV file with the list of words provided."""
    try:
        with open(CSV_FILE, mode="w", encoding=CSV_ENCODING, newline="") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_HEADER)
            writer.writeheader()
            for w in words:
                # Sanitize writing representation
                row = {
                    "word": str(w.get("word", "")).strip(),
                    "meaning": str(w.get("meaning", "")).strip(),
                    "example_sentence": str(w.get("example_sentence", "")).strip(),
                    "example_translation": str(w.get("example_translation", "")).strip(),
                    "interval": int(w.get("interval", 0)),
                    "ease_factor": float(w.get("ease_factor", 2.5)),
                    "repetitions": int(w.get("repetitions", 0)),
                    "due_date": str(w.get("due_date", "")).strip(),
                    "created_at": str(w.get("created_at", datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
                }
                writer.writerow(row)
        return True
    except Exception as e:
        print(f"Error writing to CSV: {e}", file=sys.stderr)
        return False

def create_csv_backup():
    """Creates a timestamped backup of the current voca.csv before bulk changes."""
    initialize_csv()
    os.makedirs(BACKUP_DIR, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = f"voca_{timestamp}.csv"
    backup_path = os.path.join(BACKUP_DIR, backup_name)
    shutil.copy2(CSV_FILE, backup_path)
    return backup_name

def build_template_csv():
    """Builds a UTF-8 BOM CSV template that opens cleanly in Excel."""
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=CSV_HEADER)
    writer.writeheader()
    writer.writerow({
        "word": "meticulous",
        "meaning": "꼼꼼한, 세심한",
        "example_sentence": "The researcher kept meticulous records of the experiments.",
        "example_translation": "그 연구원은 실험에 대한 꼼꼼한 기록을 남겼다.",
        "interval": 0,
        "ease_factor": 2.5,
        "repetitions": 0,
        "due_date": "",
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    })
    return output.getvalue()

def parse_imported_csv(csv_text):
    """Parses an uploaded voca.csv payload and returns normalized word rows."""
    reader = csv.DictReader(io.StringIO(csv_text.lstrip("\ufeff")))
    if not reader.fieldnames:
        raise ValueError("CSV header row is missing.")

    missing_columns = [column for column in CSV_HEADER if column not in reader.fieldnames]
    if missing_columns:
        raise ValueError(f"Missing required columns: {', '.join(missing_columns)}")

    imported_words = []
    seen_words = set()
    for line_number, row in enumerate(reader, start=2):
        word = str(row.get("word", "")).strip()
        meaning = str(row.get("meaning", "")).strip()
        if not word or not meaning:
            raise ValueError(f"Line {line_number}: word and meaning are required.")

        word_key = word.lower()
        if word_key in seen_words:
            raise ValueError(f"Line {line_number}: duplicate word '{word}'.")
        seen_words.add(word_key)

        try:
            interval = int(row.get("interval") or 0)
            ease_factor = float(row.get("ease_factor") or 2.5)
            repetitions = int(row.get("repetitions") or 0)
        except ValueError:
            raise ValueError(f"Line {line_number}: interval, ease_factor, and repetitions must be numbers.")

        imported_words.append({
            "word": word,
            "meaning": meaning,
            "example_sentence": str(row.get("example_sentence", "")).strip(),
            "example_translation": str(row.get("example_translation", "")).strip(),
            "interval": max(0, interval),
            "ease_factor": max(1.3, ease_factor),
            "repetitions": max(0, repetitions),
            "due_date": str(row.get("due_date", "")).strip(),
            "created_at": str(row.get("created_at", "")).strip() or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        })

    if not imported_words:
        raise ValueError("CSV has no word rows.")

    return imported_words

class FlashcardRequestHandler(BaseHTTPRequestHandler):
    def send_json(self, data, status_code=200):
        """Helper to send JSON response."""
        try:
            response_bytes = json.dumps(data, ensure_ascii=False).encode("utf-8")
            self.send_response(status_code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(response_bytes)))
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
            self.end_headers()
            self.wfile.write(response_bytes)
        except Exception as e:
            print(f"Error sending JSON response: {e}", file=sys.stderr)

    def do_GET(self):
        parsed_path = urlparse(self.path)
        path = parsed_path.path

        # API: Get all words
        if path == "/api/words":
            words = read_words()
            self.send_json(words)
            return

        if path == "/api/network-info":
            lan_ip = get_lan_ip()
            self.send_json({
                "host": lan_ip,
                "port": PORT,
                "app_url": f"http://{lan_ip}:{PORT}/",
                "mobile_url": f"http://{lan_ip}:{PORT}/mobile.html"
            })
            return

        if path == "/api/template-csv":
            template_bytes = build_template_csv().encode(CSV_ENCODING)
            self.send_response(200)
            self.send_header("Content-Type", f"text/csv; charset={CSV_ENCODING}")
            self.send_header("Content-Disposition", 'attachment; filename="voca_template.csv"')
            self.send_header("Content-Length", str(len(template_bytes)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(template_bytes)
            return

        # Serve static files
        if path == "/":
            path = "/index.html"
        
        # Prevent Directory Traversal
        safe_path = os.path.abspath(os.path.join(os.path.dirname(__file__), path.lstrip("/")))
        current_dir = os.path.abspath(os.path.dirname(__file__))

        if not safe_path.startswith(current_dir):
            self.send_error(403, "Access Denied")
            return

        if os.path.exists(safe_path) and os.path.isfile(safe_path):
            # Determine Content-Type
            content_type = "text/plain"
            if safe_path.endswith(".html"):
                content_type = "text/html; charset=utf-8"
            elif safe_path.endswith(".css"):
                content_type = "text/css; charset=utf-8"
            elif safe_path.endswith(".js"):
                content_type = "application/javascript; charset=utf-8"
            elif safe_path.endswith(".json"):
                content_type = "application/json; charset=utf-8"
            elif safe_path.endswith(".png"):
                content_type = "image/png"
            elif safe_path.endswith(".jpg") or safe_path.endswith(".jpeg"):
                content_type = "image/jpeg"
            elif safe_path.endswith(".svg"):
                content_type = "image/svg+xml"
            elif safe_path.endswith(".ico"):
                content_type = "image/x-icon"

            try:
                with open(safe_path, "rb") as f:
                    content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
            except Exception as e:
                self.send_error(500, f"Internal Server Error: {e}")
        else:
            self.send_error(404, "File Not Found")

    def do_POST(self):
        parsed_path = urlparse(self.path)
        path = parsed_path.path

        # Read JSON body
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length > 0:
                body = self.rfile.read(content_length).decode("utf-8")
                data = json.loads(body)
            else:
                self.send_json({"error": "Empty body"}, 400)
                return
        except Exception as e:
            self.send_json({"error": f"Invalid JSON payload: {e}"}, 400)
            return

        words = read_words()

        # API: Add a new word
        if path == "/api/words":
            word_text = str(data.get("word", "")).strip()
            meaning_text = str(data.get("meaning", "")).strip()
            
            if not word_text or not meaning_text:
                self.send_json({"error": "Word and Meaning are required fields"}, 400)
                return

            # Check for duplication
            for w in words:
                if w["word"].lower() == word_text.lower():
                    self.send_json({"error": f"The word '{word_text}' already exists in your library."}, 409)
                    return

            new_word = {
                "word": word_text,
                "meaning": meaning_text,
                "example_sentence": str(data.get("example_sentence", "")).strip(),
                "example_translation": str(data.get("example_translation", "")).strip(),
                "interval": 0,
                "ease_factor": 2.5,
                "repetitions": 0,
                "due_date": "",
                "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
            words.append(new_word)
            if write_all_words(words):
                self.send_json({"success": True, "word": new_word})
            else:
                self.send_json({"error": "Failed to save the word to CSV file"}, 500)

        # API: Update a word's study stats (spaced repetition)
        elif path == "/api/words/update":
            word_text = str(data.get("word", "")).strip()
            if not word_text:
                self.send_json({"error": "Word identifier is required"}, 400)
                return

            found = False
            for w in words:
                if w["word"].lower() == word_text.lower():
                    # Update statistical attributes
                    w["interval"] = int(data.get("interval", w["interval"]))
                    w["ease_factor"] = float(data.get("ease_factor", w["ease_factor"]))
                    w["repetitions"] = int(data.get("repetitions", w["repetitions"]))
                    w["due_date"] = str(data.get("due_date", w["due_date"])).strip()
                    found = True
                    break
            
            if not found:
                self.send_json({"error": f"Word '{word_text}' not found in library"}, 404)
                return

            if write_all_words(words):
                self.send_json({"success": True})
            else:
                self.send_json({"error": "Failed to update the word stats in CSV file"}, 500)

        # API: Edit a word's content and optional study metadata
        elif path == "/api/words/edit":
            original_word = str(data.get("original_word", "")).strip()
            new_word = str(data.get("word", "")).strip()
            new_meaning = str(data.get("meaning", "")).strip()
            if not original_word or not new_word or not new_meaning:
                self.send_json({"error": "Original word, word, and meaning are required"}, 400)
                return

            duplicate = any(
                w["word"].lower() == new_word.lower() and w["word"].lower() != original_word.lower()
                for w in words
            )
            if duplicate:
                self.send_json({"error": f"The word '{new_word}' already exists in your library."}, 409)
                return

            found = False
            for w in words:
                if w["word"].lower() == original_word.lower():
                    try:
                        w["interval"] = max(0, int(data.get("interval", w["interval"])))
                        w["ease_factor"] = max(1.3, float(data.get("ease_factor", w["ease_factor"])))
                        w["repetitions"] = max(0, int(data.get("repetitions", w["repetitions"])))
                    except ValueError:
                        self.send_json({"error": "interval, ease_factor, and repetitions must be numbers."}, 400)
                        return

                    w["word"] = new_word
                    w["meaning"] = new_meaning
                    w["example_sentence"] = str(data.get("example_sentence", w["example_sentence"])).strip()
                    w["example_translation"] = str(data.get("example_translation", w["example_translation"])).strip()
                    w["due_date"] = str(data.get("due_date", w["due_date"])).strip()
                    found = True
                    break

            if not found:
                self.send_json({"error": f"Word '{original_word}' not found in library"}, 404)
                return

            if write_all_words(words):
                self.send_json({"success": True})
            else:
                self.send_json({"error": "Failed to edit the word"}, 500)

        # API: Reset a word's study history
        elif path == "/api/words/reset":
            word_text = str(data.get("word", "")).strip()
            if not word_text:
                self.send_json({"error": "Word identifier is required"}, 400)
                return

            found = False
            for w in words:
                if w["word"].lower() == word_text.lower():
                    w["interval"] = 0
                    w["ease_factor"] = 2.5
                    w["repetitions"] = 0
                    w["due_date"] = ""
                    found = True
                    break

            if not found:
                self.send_json({"error": f"Word '{word_text}' not found in library"}, 404)
                return

            if write_all_words(words):
                self.send_json({"success": True})
            else:
                self.send_json({"error": "Failed to reset the word"}, 500)

        # API: Delete a word
        elif path == "/api/words/delete":
            word_text = str(data.get("word", "")).strip()
            if not word_text:
                self.send_json({"error": "Word identifier is required"}, 400)
                return

            original_length = len(words)
            words = [w for w in words if w["word"].lower() != word_text.lower()]

            if len(words) == original_length:
                self.send_json({"error": f"Word '{word_text}' not found in library"}, 404)
                return

            if write_all_words(words):
                self.send_json({"success": True})
            else:
                self.send_json({"error": "Failed to delete the word from CSV file"}, 500)

        # API: Replace the full voca.csv with an uploaded CSV payload
        elif path == "/api/import-csv":
            csv_text = str(data.get("csv", ""))
            if not csv_text.strip():
                self.send_json({"error": "CSV content is required"}, 400)
                return

            try:
                imported_words = parse_imported_csv(csv_text)
            except ValueError as e:
                self.send_json({"error": str(e)}, 400)
                return

            try:
                backup_name = create_csv_backup()
            except Exception as e:
                self.send_json({"error": f"Failed to create backup before import: {e}"}, 500)
                return

            if write_all_words(imported_words):
                self.send_json({"success": True, "count": len(imported_words), "backup": backup_name})
            else:
                self.send_json({"error": "Failed to import CSV file"}, 500)

        else:
            self.send_error(404, "Endpoint Not Found")

def run_server():
    initialize_csv()
    server_address = ("", PORT)
    httpd = HTTPServer(server_address, FlashcardRequestHandler)
    print(f"\n=============================================")
    print(f" Anki VOCA Flashcard Server is now running!  ")
    print(f" URL: http://localhost:{PORT}                 ")
    print(f" CSV Storage: {CSV_FILE}                      ")
    print(f" Press Ctrl+C in terminal to stop.           ")
    print(f"=============================================\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()
        print("Server stopped.")

if __name__ == "__main__":
    run_server()
