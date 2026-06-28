import React, { useState, useEffect } from 'react';
import { Settings, X, Database, Plus, Check, Server, Trash2, Edit2, Play, Square } from 'lucide-react';
import './SettingsModal.css';

const SettingsModal = ({ isOpen, onClose, models, fetchModels, onModelSelect, selectedModel }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingModel, setEditingModel] = useState(null);
  const [newName, setNewName] = useState('');
  const [newCommand, setNewCommand] = useState('');
  const [newType, setNewType] = useState('ollama');
  const [error, setError] = useState('');

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setIsAdding(false);
      setEditingModel(null);
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleEdit = (modelName, modelData) => {
    setEditingModel(modelName);
    setNewName(modelName);
    setNewCommand(modelData.command);
    setNewType(modelData.type);
    setIsAdding(true);
    setError('');
  };

  const handleAddNew = () => {
    setEditingModel(null);
    setNewName('');
    setNewCommand('');
    setNewType('ollama');
    setIsAdding(true);
    setError('');
  };

  const handleRegister = async () => {
    if (!newName || !newCommand) {
      setError('Name and command are required.');
      return;
    }

    let finalCommand = newCommand.trim();
    if (newType === 'ollama' && finalCommand.startsWith('ollama run ')) {
      finalCommand = finalCommand.replace('ollama run ', '').trim();
    }

    try {
      const res = await fetch('http://127.0.0.1:8000/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          command: finalCommand,
          type: newType
        })
      });

      if (res.ok) {
        // If we renamed a model, delete the old one
        if (editingModel && editingModel !== newName) {
           await fetch(`http://127.0.0.1:8000/api/models/${editingModel}`, {
             method: 'DELETE'
           });
        }
        await fetchModels();
        setIsAdding(false);
        setEditingModel(null);
        setNewName('');
        setNewCommand('');
        setError('');
        
        // Auto-select if it's the model we were already using or it's a new edit
        if (selectedModel === editingModel) {
            onModelSelect(newName);
        }
      } else {
        const errData = await res.json();
        setError(errData.detail || 'Registration failed');
      }
    } catch (err) {
      setError('Connection failed. Is the FastAPI backend running?');
    }
  };

  const handleDelete = async (modelName) => {
        try {
            const res = await fetch(`http://127.0.0.1:8000/api/models/${modelName}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                await fetchModels();
                // If deleted model was selected, clear selection
                if (selectedModel === modelName) {
                    onModelSelect('');
                }
            } else {
                const errData = await res.json();
                setError(errData.detail || 'Deletion failed');
            }
        } catch (err) {
            setError('Connection failed. Is the FastAPI backend running?');
        }
  };

  const handleStartServer = async (modelName) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/models/${modelName}/start`, { method: 'POST' });
      if (res.ok) {
        await fetchModels();
        setError('');
      } else {
        const data = await res.json();
        setError(data.detail || 'Failed to start');
      }
    } catch (err) { setError('Failed to connect to backend.'); }
  };

  const handleStopServer = async (modelName) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/models/${modelName}/stop`, { method: 'POST' });
      if (res.ok) {
        await fetchModels();
        setError('');
      } else {
        const data = await res.json();
        setError(data.detail || 'Failed to stop');
      }
    } catch (err) { setError('Failed to connect to backend.'); }
  };

  return (
    <div className="settings-overlay">
      <div className="settings-modal glass-panel">
        <div className="settings-header">
          <div className="settings-title">
            <Settings size={20} />
            <span>Settings</span>
          </div>
          <button className="close-btn" onClick={onClose} title="Close Settings">
            <X size={20} />
          </button>
        </div>

        <div className="settings-content">
          <div className="settings-section">
            <div className="section-header">
              <div className="section-title">
                <Database size={16} />
                <span>Model Registry</span>
              </div>
              {!isAdding && (
                <button className="add-model-btn" onClick={handleAddNew} title="Register new local model">
                  <Plus size={16} /> Add Model
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
                    <Check size={14} /> {editingModel ? 'Update' : 'Register'}
                  </button>
                </div>
              </div>
            )}

            <div className="model-list">
              {Object.keys(models).length === 0 && !isAdding && (
                  <div className="no-models">No models registered. Add one to start chatting!</div>
              )}
              {Object.keys(models).map((modelName) => (
                <div key={modelName} className="model-item">
                  <div className="model-info">
                    <Server size={14} className="model-icon" />
                    <span className="model-name">{modelName}</span>
                    <span className="model-type-badge">{models[modelName].type}</span>
                  </div>
                  <div className="model-actions">
                    {models[modelName].type === 'llama-serve' && (
                       models[modelName].status === 'running' ? (
                         <button 
                           className="icon-btn stop-btn" 
                           onClick={() => handleStopServer(modelName)}
                           title="Stop Server"
                         >
                           <Square size={14} />
                         </button>
                       ) : (
                         <button 
                           className="icon-btn start-btn" 
                           onClick={() => handleStartServer(modelName)}
                           title="Start Server"
                         >
                           <Play size={14} />
                         </button>
                       )
                    )}
                    <button 
                        className="icon-btn edit-btn" 
                        onClick={() => handleEdit(modelName, models[modelName])}
                        title="Edit Model"
                    >
                        <Edit2 size={14} />
                    </button>
                    <button 
                        className="icon-btn delete-btn" 
                        onClick={() => handleDelete(modelName)}
                        title="Delete Model"
                    >
                        <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
