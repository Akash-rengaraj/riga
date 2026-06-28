import sqlite3
import json
import os

DB_FILE = "riga.db"
CONVERSATIONS_FILE = "conversations.json"

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT,
            updated_at TEXT,
            summary TEXT
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conv_id TEXT,
            text TEXT,
            isAi BOOLEAN,
            attached_files TEXT,
            FOREIGN KEY(conv_id) REFERENCES conversations(id) ON DELETE CASCADE
        )
    ''')
    
    # Try to add attached_files column if it doesn't exist (migration)
    try:
        cursor.execute('ALTER TABLE messages ADD COLUMN attached_files TEXT')
    except sqlite3.OperationalError:
        pass # Column already exists
    
    conn.commit()
    conn.close()

def migrate_json_to_db():
    if not os.path.exists(CONVERSATIONS_FILE):
        return
        
    try:
        with open(CONVERSATIONS_FILE, "r") as f:
            data = json.load(f)
    except Exception:
        return
        
    if not data:
        return

    conn = get_db()
    cursor = conn.cursor()
    
    for conv_id, conv in data.items():
        # Check if exists
        cursor.execute("SELECT id FROM conversations WHERE id = ?", (conv_id,))
        if cursor.fetchone():
            continue
            
        cursor.execute(
            "INSERT INTO conversations (id, title, updated_at, summary) VALUES (?, ?, ?, ?)",
            (conv_id, conv.get("title", ""), conv.get("updated_at", ""), conv.get("summary", ""))
        )
        
        for msg in conv.get("messages", []):
            cursor.execute(
                "INSERT INTO messages (conv_id, text, isAi) VALUES (?, ?, ?)",
                (conv_id, msg.get("text", ""), 1 if msg.get("isAi") else 0)
            )
            
    conn.commit()
    conn.close()

def get_all_conversations():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, title, updated_at, summary FROM conversations ORDER BY updated_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [{"id": r["id"], "title": r["title"], "updated_at": r["updated_at"], "summary": r["summary"]} for r in rows]

def get_conversation(conv_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM conversations WHERE id = ?", (conv_id,))
    conv_row = cursor.fetchone()
    
    if not conv_row:
        conn.close()
        return None
        
    cursor.execute("SELECT text, isAi, attached_files FROM messages WHERE conv_id = ? ORDER BY id ASC", (conv_id,))
    msg_rows = cursor.fetchall()
    
    conn.close()
    
    def parse_files(f_str):
        if not f_str:
            return []
        try:
            return json.loads(f_str)
        except Exception:
            return []
            
    return {
        "id": conv_row["id"],
        "title": conv_row["title"],
        "updated_at": conv_row["updated_at"],
        "summary": conv_row["summary"],
        "messages": [{"text": m["text"], "isAi": bool(m["isAi"]), "attached_files": parse_files(m["attached_files"])} for m in msg_rows]
    }

def save_conversation_data(conv_dict):
    conn = get_db()
    cursor = conn.cursor()
    
    conv_id = conv_dict["id"]
    cursor.execute("SELECT id FROM conversations WHERE id = ?", (conv_id,))
    exists = cursor.fetchone()
    
    if exists:
        cursor.execute(
            "UPDATE conversations SET title = ?, updated_at = ?, summary = ? WHERE id = ?",
            (conv_dict.get("title", ""), conv_dict.get("updated_at", ""), conv_dict.get("summary", ""), conv_id)
        )
        cursor.execute("DELETE FROM messages WHERE conv_id = ?", (conv_id,))
    else:
        cursor.execute(
            "INSERT INTO conversations (id, title, updated_at, summary) VALUES (?, ?, ?, ?)",
            (conv_dict["id"], conv_dict.get("title", ""), conv_dict.get("updated_at", ""), conv_dict.get("summary", ""))
        )
        
    for msg in conv_dict.get("messages", []):
        attached_str = json.dumps(msg.get("attached_files", []))
        cursor.execute(
            "INSERT INTO messages (conv_id, text, isAi, attached_files) VALUES (?, ?, ?, ?)",
            (conv_id, msg.get("text", ""), 1 if msg.get("isAi") else 0, attached_str)
        )
        
    conn.commit()
    conn.close()

def update_conversation_title(conv_id, title):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE conversations SET title = ? WHERE id = ?", (title, conv_id))
    conn.commit()
    rows_affected = cursor.rowcount
    conn.close()
    return rows_affected > 0

def update_conversation_summary(conv_id, summary, title=None):
    conn = get_db()
    cursor = conn.cursor()
    if title:
        cursor.execute("UPDATE conversations SET summary = ?, title = ? WHERE id = ?", (summary, title, conv_id))
    else:
        cursor.execute("UPDATE conversations SET summary = ? WHERE id = ?", (summary, conv_id))
    conn.commit()
    rows_affected = cursor.rowcount
    conn.close()
    return rows_affected > 0

def delete_conversation_data(conv_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM messages WHERE conv_id = ?", (conv_id,))
    cursor.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
    conn.commit()
    rows_affected = cursor.rowcount
    conn.close()
    return rows_affected > 0
