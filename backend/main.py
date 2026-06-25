import json
import os
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any
from datetime import datetime
import httpx

app = FastAPI(title="Holy Grail AI API")

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
    command: str  # e.g., "llama3" or "./path/to/binary"
    type: str     # "ollama" or "native"

class ChatRequest(BaseModel):
    model_name: str
    prompt: str
    conv_id: str = None

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
    return load_registry()

@app.post("/api/models")
async def register_model(model: ModelRegistration):
    """Register a new LLM interface (Ollama or Native CLI)."""
    if model.type not in ["ollama", "native"]:
        raise HTTPException(status_code=400, detail="Type must be 'ollama' or 'native'")
        
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
        del registry[model_name]
        save_registry(registry)
        return {"status": "success", "message": f"Model '{model_name}' deleted."}
    raise HTTPException(status_code=404, detail="Model not found")

# --- CONVERSATIONS API ---

CONVERSATIONS_FILE = "conversations.json"

if not os.path.exists(CONVERSATIONS_FILE):
    with open(CONVERSATIONS_FILE, "w") as f:
        json.dump({}, f, indent=4)

class ConversationMessage(BaseModel):
    text: str
    isAi: bool

class Conversation(BaseModel):
    id: str
    title: str
    messages: List[ConversationMessage]
    updated_at: str
    summary: str = ""

def load_conversations():
    if not os.path.exists(CONVERSATIONS_FILE):
        return {}
    with open(CONVERSATIONS_FILE, "r") as f:
        return json.load(f)

def save_conversations(data):
    with open(CONVERSATIONS_FILE, "w") as f:
        json.dump(data, f, indent=4)

@app.get("/api/conversations")
async def get_conversations():
    """Retrieve all conversations metadata."""
    conversations = load_conversations()
    # Sort by updated_at descending (newest first)
    sorted_convs = sorted(conversations.values(), key=lambda x: x.get('updated_at', ''), reverse=True)
    # Return without full messages for the list view
    return [{"id": c["id"], "title": c["title"], "updated_at": c.get("updated_at", "")} for c in sorted_convs]

@app.get("/api/conversations/{conv_id}")
async def get_conversation(conv_id: str):
    """Retrieve a specific conversation."""
    conversations = load_conversations()
    if conv_id in conversations:
        return conversations[conv_id]
    raise HTTPException(status_code=404, detail="Conversation not found")

@app.post("/api/conversations")
async def save_conversation(conv: Conversation):
    """Create or update a conversation."""
    conversations = load_conversations()
    conversations[conv.id] = conv.dict()
    save_conversations(conversations)
    return {"status": "success", "id": conv.id}

class TitleUpdate(BaseModel):
    title: str

@app.put("/api/conversations/{conv_id}/title")
async def update_conversation_title(conv_id: str, payload: TitleUpdate):
    """Update conversation title."""
    conversations = load_conversations()
    if conv_id in conversations:
        conversations[conv_id]["title"] = payload.title
        save_conversations(conversations)
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Conversation not found")

@app.delete("/api/conversations/{conv_id}")
async def delete_conversation(conv_id: str):
    """Delete a conversation."""
    conversations = load_conversations()
    if conv_id in conversations:
        del conversations[conv_id]
        save_conversations(conversations)
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
    conversations = load_conversations()
    if conv_id not in conversations:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    conv = conversations[conv_id]
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
        
    conv["summary"] = new_summary

    title_prompt = f"""Based on this conversation summary:
{new_summary}
Provide a short, 3-5 word title for this chat. Provide ONLY the title, no quotes or extra text."""
    
    new_title = await get_ai_response(title_prompt, model_type, command)
    if new_title:
        conv["title"] = new_title.strip(' "')

    save_conversations(conversations)
    return {"status": "success", "summary": new_summary, "title": conv["title"]}

@app.post("/api/chat/stream")
async def stream_chat(payload: ChatRequest):
    """Stream AI response back to client using Server-Sent Events."""
    registry = load_registry()
    if payload.model_name not in registry:
        raise HTTPException(status_code=404, detail="Model not registered in Holy Grail registry")
    
    model_info = registry[payload.model_name]
    model_type = model_info.get("type", "ollama")
    command = model_info["command"]

    full_prompt = payload.prompt
    if payload.conv_id:
        conversations = load_conversations()
        conv = conversations.get(payload.conv_id, {})
        summary = conv.get("summary", "")
        if summary:
            full_prompt = f"System Context: The following is a summary of the conversation so far:\n{summary}\n\nUser Input: {payload.prompt}"

    async def stream_ollama():
        """Handles streaming from local Ollama instance."""
        ollama_url = "http://localhost:11434/api/generate"
        json_payload = {
            "model": command,
            "prompt": full_prompt,
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
                                    response_text = parsed.get("response", "")
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

    # Select the streaming engine based on dynamic registry
    generator = stream_ollama() if model_type == "ollama" else stream_native()
    return StreamingResponse(generator, media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    # Start on 8000 by default for standard integration
    uvicorn.run(app, host="127.0.0.1", port=8000)