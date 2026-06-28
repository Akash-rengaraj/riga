import React, { useState, useEffect } from 'react';
import { Database, Plus, Check, X, Server } from 'lucide-react';
import './ModelRegistry.css';

const ModelRegistry = ({ onModelSelect, selectedModel }) => {
  const [models, setModels] = useState({});
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCommand, setNewCommand] = useState('');
  const [newType, setNewType] = useState('ollama');
  const [error, setError] = useState('');

  const fetchModels = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/models');
      const data = await res.json();
      setModels(data);
      // Auto-select first model if none is selected
      if (!selectedModel && Object.keys(data).length > 0) {
        onModelSelect(Object.keys(data)[0]);
      }
    } catch (err) {
      console.error('Failed to fetch models:', err);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const handleRegister = async () => {
    if (!newName || !newCommand) {
      setError('Name and command are required.');
      return;
    }

    try {
      const res = await fetch('http://127.0.0.1:8000/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          command: newCommand,
          type: newType
        })
      });

      if (res.ok) {
        await fetchModels();
        setIsAdding(false);
        setNewName('');
        setNewCommand('');
        setError('');
        onModelSelect(newName);
      } else {
        const errData = await res.json();
        setError(errData.detail || 'Registration failed');
      }
    } catch (err) {
      setError('Connection failed. Is the FastAPI backend running?');
    }
  };

  return (
    <div className="model-registry">
      <div className="registry-header">
        <div className="registry-title">
          <Database size={16} />
          <span>Model Registry</span>
        </div>
        {!isAdding && (
          <button className="add-model-btn" onClick={() => setIsAdding(true)} title="Register new local model">
            <Plus size={16} />
          </button>
        )}
      </div>

      {isAdding && (
        <div className="add-model-form">
          <input 
            type="text" 
            placeholder="Display Name (e.g. Riga-Llama3)" 
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input 
            type="text" 
            placeholder={newType === 'openai' ? "Base URL (e.g. http://localhost:8080)" : (newType === 'llama-serve' ? "e.g. llama serve -hf empero-ai/..." : "Command/Tag (e.g. llama3)")} 
            value={newCommand}
            onChange={(e) => setNewCommand(e.target.value)}
          />
          <select value={newType} onChange={(e) => setNewType(e.target.value)}>
            <option value="ollama">Ollama</option>
            <option value="openai">OpenAI Compatible</option>
            <option value="llama-serve">Managed Server (llama serve)</option>
            <option value="native">Native Binary (CLI)</option>
          </select>
          {error && <div className="registry-error">{error}</div>}
          <div className="form-actions">
            <button className="cancel-btn" onClick={() => setIsAdding(false)}>
              <X size={14} /> Cancel
            </button>
            <button className="save-btn" onClick={handleRegister}>
              <Check size={14} /> Register
            </button>
          </div>
        </div>
      )}

      <div className="model-list">
        {Object.keys(models).map((modelName) => (
          <button 
            key={modelName}
            className={`model-item ${selectedModel === modelName ? 'active' : ''}`}
            onClick={() => onModelSelect(modelName)}
          >
            <Server size={14} className="model-icon" />
            <div className="model-info">
              <span className="model-name">{modelName}</span>
              <span className="model-type">{models[modelName].type}</span>
            </div>
            {selectedModel === modelName && <Check size={14} className="check-icon" />}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ModelRegistry;
