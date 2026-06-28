import json
import os
import asyncio
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import shutil
import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime
import httpx
import base64

import db

app = FastAPI(title="Holy Grail AI API")

# Mount uploads directory for frontend viewing
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

@app.on_event("startup")
async def startup_event():
    # Initialize database and migrate old data safely on app startup
    db.init_db()
    db.migrate_json_to_db()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename)[1]
    filename = f"{uuid.uuid4()}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    file_type = "document"
    if ext.lower() in [".jpg", ".jpeg", ".png", ".gif", ".webp"]:
        file_type = "image"
    elif ext.lower() in [".mp4", ".mov", ".avi"]:
        file_type = "video"
    elif ext.lower() in [".mp3", ".wav", ".m4a"]:
        file_type = "audio"
        
    return {"status": "success", "filepath": filepath, "type": file_type, "original_name": file.filename}

# Enable CORS for React frontend (defaulting to allow any localhost or standard dev port)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

REGISTRY_FILE = "models_registry.json"

# Initialize local registry file with a default Ollama model for fallback/testing
if not os.path.exists(REGISTRY_FILE):
    with open(REGISTRY_FILE, "w") as f:
        json.dump({
            "Riga-Pro": {
                "command": "llama3",
                "type": "ollama" # Types: 'ollama' or 'native'
            }
        }, f, indent=4)

class ModelRegistration(BaseModel):
    name: str
    command: str  # e.g., "llama3" or "./path/to/binary" or "http://localhost:8080"
    type: str     # "ollama", "native", "openai", or "llama-serve"

active_servers: Dict[str, asyncio.subprocess.Process] = {}

class ChatRequest(BaseModel):
    model_name: str
    prompt: str
    conv_id: Optional[str] = None
    attached_files: Optional[List[Dict[str, Any]]] = []

# Helper to load image as base64
def get_base64_image(filepath: str) -> str:
    if os.path.exists(filepath):
        with open(filepath, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode('utf-8')
    return ""

# Universal Vision Pre-processor variables
vision_pipeline = None
ocr_reader = None

def get_image_context(filepath: str) -> str:
    global vision_pipeline, ocr_reader
    
    if not os.path.exists(filepath):
        return ""
        
    context_parts = []
    
    try:
        from PIL import Image
        image = Image.open(filepath).convert("RGB")
        
        # Lazy load captioning model
        if vision_pipeline is None:
            print("Loading vision captioning model...")
            from transformers import pipeline
            vision_pipeline = pipeline("image-to-text", model="nlpconnect/vit-gpt2-image-captioning")
            
        caption = vision_pipeline(image)[0]['generated_text']
        context_parts.append(f"Image Description: {caption}")
    except Exception as e:
        print(f"Captioning error: {e}")
        
    try:
        # Lazy load OCR
        if ocr_reader is None:
            print("Loading OCR model...")
            import easyocr
            ocr_reader = easyocr.Reader(['en'], gpu=False)
            
        result = ocr_reader.readtext(filepath, detail=0, paragraph=True)
        if result:
            text = " ".join(result)
            context_parts.append(f"Extracted Text: {text}")
    except Exception as e:
        print(f"OCR error: {e}")
        
    return " | ".join(context_parts)

def load_registry():
    if not os.path.exists(REGISTRY_FILE):
        return {}
    with open(REGISTRY_FILE, "r") as f:
        return json.load(f)

def save_registry(data):
    with open(REGISTRY_FILE, "w") as f:
        json.dump(data, f, indent=4)

@app.get("/api/models")
async def get_models():
    """Retrieve all dynamically registered models."""
    registry = load_registry()
    for name, info in registry.items():
        if info.get("type") == "llama-serve":
            info["status"] = "running" if name in active_servers and active_servers[name].returncode is None else "stopped"
    return registry

@app.post("/api/models")
async def register_model(model: ModelRegistration):
    """Register a new LLM interface (Ollama, Native CLI, or OpenAI Compatible)."""
    if model.type not in ["ollama", "native", "openai", "llama-serve"]:
        raise HTTPException(status_code=400, detail="Type must be 'ollama', 'native', 'openai', or 'llama-serve'")
        
    registry = load_registry()
    registry[model.name] = {
        "command": model.command,
        "type": model.type
    }
    save_registry(registry)
    return {"status": "success", "message": f"Model '{model.name}' registered successfully."}

@app.delete("/api/models/{model_name}")
async def delete_model(model_name: str):
    """Delete a registered model."""
    registry = load_registry()
    if model_name in registry:
        # Stop process if running
        if model_name in active_servers:
            process = active_servers[model_name]
            if process.returncode is None:
                process.terminate()
            del active_servers[model_name]
            
        del registry[model_name]
        save_registry(registry)
        return {"status": "success", "message": f"Model '{model_name}' deleted."}
    raise HTTPException(status_code=404, detail="Model not found")

@app.post("/api/models/{model_name}/start")
async def start_managed_model(model_name: str):
    registry = load_registry()
    if model_name not in registry:
        raise HTTPException(status_code=404, detail="Model not found")
    
    info = registry[model_name]
    if info.get("type") != "llama-serve":
        raise HTTPException(status_code=400, detail="Only llama-serve models can be started")
    
    if model_name in active_servers:
        process = active_servers[model_name]
        if process.returncode is None:
            raise HTTPException(status_code=400, detail="Server is already running")
            
    command = info["command"]
    
    try:
        process = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL
        )
        active_servers[model_name] = process
        
        await asyncio.sleep(0.5)
        if process.returncode is not None:
             raise Exception(f"Server exited immediately with code {process.returncode}")
             
        return {"status": "success", "message": "Server started"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/models/{model_name}/stop")
async def stop_managed_model(model_name: str):
    if model_name in active_servers:
        process = active_servers[model_name]
        if process.returncode is None:
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                process.kill()
        del active_servers[model_name]
        return {"status": "success", "message": "Server stopped"}
    
    return {"status": "success", "message": "Server was not running"}

# --- CONVERSATIONS API ---

class ConversationMessage(BaseModel):
    text: str
    isAi: bool

class Conversation(BaseModel):
    id: str
    title: str
    messages: List[ConversationMessage]
    updated_at: str
    summary: str = ""

@app.get("/api/conversations")
async def get_conversations():
    """Retrieve all conversations metadata."""
    return db.get_all_conversations()

@app.get("/api/conversations/{conv_id}")
async def get_conversation(conv_id: str):
    """Retrieve a specific conversation."""
    conv = db.get_conversation(conv_id)
    if conv:
        return conv
    raise HTTPException(status_code=404, detail="Conversation not found")

@app.post("/api/conversations")
async def save_conversation(conv: Conversation):
    """Create or update a conversation."""
    db.save_conversation_data(conv.dict())
    return {"status": "success", "id": conv.id}

class TitleUpdate(BaseModel):
    title: str

@app.put("/api/conversations/{conv_id}/title")
async def update_conversation_title(conv_id: str, payload: TitleUpdate):
    """Update conversation title."""
    success = db.update_conversation_title(conv_id, payload.title)
    if success:
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Conversation not found")

@app.delete("/api/conversations/{conv_id}")
async def delete_conversation(conv_id: str):
    """Delete a conversation."""
    success = db.delete_conversation_data(conv_id)
    if success:
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Conversation not found")

async def get_ai_response(prompt: str, model_type: str, command: str) -> str:
    """Helper to get a single, non-streaming response from the AI."""
    if model_type == "ollama":
        ollama_url = "http://localhost:11434/api/generate"
        json_payload = {
            "model": command,
            "prompt": prompt,
            "stream": False
        }
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(ollama_url, json=json_payload)
                if response.status_code == 200:
                    return response.json().get("response", "").strip()
        except Exception as e:
            print(f"Ollama summarization error: {e}")
        return ""
    elif model_type in ["openai", "llama-serve"]:
        base_url = command if model_type == "openai" else "http://127.0.0.1:8080"
        openai_url = f"{base_url.rstrip('/')}/v1/chat/completions"
        json_payload = {
            "messages": [{"role": "user", "content": prompt}],
            "stream": False
        }
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(openai_url, json=json_payload)
                if response.status_code == 200:
                    data = response.json()
                    if "choices" in data and len(data["choices"]) > 0:
                        return data["choices"][0]["message"].get("content", "").strip()
        except Exception as e:
            print(f"OpenAI summarization error: {e}")
        return ""
    else:
        safe_prompt = prompt.replace('"', '\\"')
        full_command = f'{command} "{safe_prompt}"'
        try:
            process = await asyncio.create_subprocess_shell(
                full_command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await process.communicate()
            return stdout.decode('utf-8', errors='replace').strip()
        except Exception as e:
            print(f"Native summarization error: {e}")
            return ""

class SummarizeRequest(BaseModel):
    model_name: str
    messages: List[ConversationMessage]

@app.post("/api/conversations/{conv_id}/summarize")
async def summarize_conversation(conv_id: str, payload: SummarizeRequest):
    conv = db.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    old_summary = conv.get("summary", "")
    
    registry = load_registry()
    if payload.model_name not in registry:
        raise HTTPException(status_code=404, detail="Model not registered")
    
    model_info = registry[payload.model_name]
    model_type = model_info.get("type", "ollama")
    command = model_info["command"]

    # Get last few messages to summarize
    messages_text = "\n".join([f"{'AI' if m.isAi else 'User'}: {m.text}" for m in payload.messages[-4:]])
    
    summarize_prompt = f"""You are a conversation summarizer. Update the global summary of this chat.
Old summary: {old_summary}
Recent messages:
{messages_text}

Provide ONLY the updated summary. Keep it concise, remove unnecessary details. If there is no old summary, just summarize the recent messages."""

    new_summary = await get_ai_response(summarize_prompt, model_type, command)
    
    if not new_summary:
        new_summary = old_summary
        
    title_prompt = f"""Based on this conversation summary:
{new_summary}
Provide a short, 3-5 word title for this chat. Provide ONLY the title, no quotes or extra text."""
    
    new_title = await get_ai_response(title_prompt, model_type, command)
    final_title = new_title.strip(' "') if new_title else None

    db.update_conversation_summary(conv_id, new_summary, final_title)
    
    # Refresh to return updated values
    updated_conv = db.get_conversation(conv_id)

    return {"status": "success", "summary": updated_conv["summary"], "title": updated_conv["title"]}

@app.post("/api/chat/stream")
async def stream_chat(payload: ChatRequest):
    """Stream AI response back to client using Server-Sent Events."""
    registry = load_registry()
    if payload.model_name not in registry:
        raise HTTPException(status_code=404, detail="Model not registered in Holy Grail registry")
    
    model_info = registry[payload.model_name]
    model_type = model_info.get("type", "ollama")
    command = model_info["command"]

    # --- Build Conversation History ---
    messages_history = []
    if payload.conv_id:
        conv = db.get_conversation(payload.conv_id)
        if conv and conv.get("messages"):
            # Get last 10 messages for context window
            db_msgs = conv["messages"][-10:]
            # The frontend might have just saved the current prompt asynchronously
            if db_msgs and not db_msgs[-1]["isAi"] and db_msgs[-1]["text"] == payload.prompt:
                db_msgs = db_msgs[:-1]
            
            for m in db_msgs:
                role = "assistant" if m["isAi"] else "user"
                messages_history.append({"role": role, "content": m["text"]})

    async def stream_ollama():
        """Handles streaming from local Ollama instance using Chat API."""
        ollama_url = "http://localhost:11434/api/chat"
        
        ollama_images = []
        img_contexts = []
        for f in payload.attached_files:
            if f.get("type") == "image":
                b64 = get_base64_image(f["filepath"])
                if b64:
                    ollama_images.append(b64)
                ctx = get_image_context(f["filepath"])
                if ctx:
                    img_contexts.append(ctx)
                    
        ollama_messages = messages_history.copy()
        
        # Build prompt with fallback text context
        final_prompt = payload.prompt
        if img_contexts:
            final_prompt = f"{payload.prompt}\n\n[Universal Image Context for Text Models: {' | '.join(img_contexts)}]"
            
        current_msg = {"role": "user", "content": final_prompt}
        if ollama_images:
            current_msg["images"] = ollama_images
        ollama_messages.append(current_msg)

        json_payload = {
            "model": command,
            "messages": ollama_messages,
            "stream": True
        }
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream("POST", ollama_url, json=json_payload) as response:
                    if response.status_code != 200:
                        yield f"data: {json.dumps({'error': 'Local Ollama engine failed or model not found'})}\n\n"
                        return
                    
                    async for chunk in response.aiter_text():
                        if not chunk.strip():
                            continue
                        try:
                            # Ollama streams line-delimited JSON
                            for line in chunk.splitlines():
                                if line.strip():
                                    parsed = json.loads(line)
                                    # Ollama /api/chat returns message.content
                                    msg = parsed.get("message", {})
                                    response_text = msg.get("content", "")
                                    if response_text:
                                        # Standard SSE format
                                        yield f"data: {json.dumps({'text': response_text})}\n\n"
                        except Exception as e:
                            print(f"Ollama parse error: {e}")
        except httpx.RequestError as e:
             yield f"data: {json.dumps({'error': 'Cannot connect to Ollama. Is it running?'})}\n\n"

    async def stream_native():
        """Handles streaming from an arbitrary native CLI binary."""
        # Note: This executes raw shell. In a secure environment, parameters must be sanitized.
        # This implementation feeds the prompt via stdin or as an argument depending on the binary.
        # We assume the binary accepts prompt via standard argument. 
        # e.g., `./llama-cli -m model.gguf -p "User prompt"`
        
        # Build the command string securely using quotes
        safe_prompt = full_prompt.replace('"', '\\"')
        full_command = f'{command} "{safe_prompt}"'
        
        try:
            process = await asyncio.create_subprocess_shell(
                full_command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            # Read stdout chunk by chunk
            while True:
                # Read a small chunk (e.g. 100 bytes) to stream as smoothly as possible
                chunk = await process.stdout.read(100)
                if not chunk:
                    break
                
                text = chunk.decode('utf-8', errors='replace')
                yield f"data: {json.dumps({'text': text})}\n\n"
            
            await process.wait()
            
        except Exception as e:
            yield f"data: {json.dumps({'error': f'Subprocess error: {str(e)}'})}\n\n"

    async def stream_openai():
        """Handles streaming from an OpenAI-compatible endpoint."""
        base_url = command if model_type == "openai" else "http://127.0.0.1:8080"
        openai_url = f"{base_url.rstrip('/')}/v1/chat/completions"
        
        openai_messages = messages_history.copy()
        
        has_images = any(f.get("type") == "image" for f in payload.attached_files)
        if has_images:
            content_arr = [{"type": "text", "text": payload.prompt}]
            for f in payload.attached_files:
                if f.get("type") == "image":
                    ctx = get_image_context(f["filepath"])
                    if ctx:
                        content_arr.append({"type": "text", "text": f"\n\n[Universal Image Context for Text Models: {ctx}]"})
                        
                    b64 = get_base64_image(f["filepath"])
                    if b64:
                        content_arr.append({
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{b64}"}
                        })
            openai_messages.append({"role": "user", "content": content_arr})
        else:
            openai_messages.append({"role": "user", "content": payload.prompt})

        json_payload = {
            "messages": openai_messages,
            "stream": True
        }
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream("POST", openai_url, json=json_payload) as response:
                    if response.status_code != 200:
                        error_msg = await response.aread()
                        yield f"data: {json.dumps({'error': f'OpenAI endpoint failed: {error_msg.decode()}'})}\n\n"
                        return
                    
                    async for chunk in response.aiter_text():
                        if not chunk.strip():
                            continue
                        try:
                            for line in chunk.splitlines():
                                line = line.strip()
                                if not line or line == "data: [DONE]":
                                    continue
                                if line.startswith("data: "):
                                    json_str = line[6:]
                                    parsed = json.loads(json_str)
                                    if "choices" in parsed and len(parsed["choices"]) > 0:
                                        delta = parsed["choices"][0].get("delta", {})
                                        response_text = delta.get("content", "")
                                        if response_text:
                                            yield f"data: {json.dumps({'text': response_text})}\n\n"
                        except Exception as e:
                            print(f"OpenAI parse error: {e}")
        except httpx.RequestError as e:
             yield f"data: {json.dumps({'error': 'Cannot connect to OpenAI endpoint. Is the server running?'})}\n\n"

    # Select the streaming engine based on dynamic registry
    if model_type == "ollama":
        generator = stream_ollama()
    elif model_type in ["openai", "llama-serve"]:
        generator = stream_openai()
    else:
        generator = stream_native()
    return StreamingResponse(generator, media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    # Start on 8000 by default for standard integration
    uvicorn.run(app, host="127.0.0.1", port=8000)