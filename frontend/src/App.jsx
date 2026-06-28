import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar/Sidebar';
import ChatArea from './components/Chat/ChatArea';
import InputArea from './components/Input/InputArea';
import ArtifactPanel from './components/Artifacts/ArtifactPanel';
import SettingsModal from './components/Settings/SettingsModal';
import { Menu } from 'lucide-react';
import './App.css';

function App() {
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isArtifactOpen, setIsArtifactOpen] = useState(false);
  const [artifactContent, setArtifactContent] = useState('');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  
  // Model state
  const [models, setModels] = useState({});
  const [selectedModel, setSelectedModel] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Conversation state
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const currentTitleRef = useRef(''); // To keep track of title without re-rendering
  const abortControllerRef = useRef(null);

  const handleModelSelect = (modelName) => {
    // If we are switching models, abort any ongoing generation to free up memory
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
        setIsTyping(false);
        setIsGenerating(false);
    }
    setSelectedModel(modelName);
  };

  const fetchModels = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/models');
      const data = await res.json();
      setModels(data);
      // Auto-select first model if none is selected
      if (!selectedModel && Object.keys(data).length > 0) {
        setSelectedModel(Object.keys(data)[0]);
      } else if (selectedModel && !data[selectedModel]) {
          // If previously selected model was deleted
          setSelectedModel(Object.keys(data).length > 0 ? Object.keys(data)[0] : '');
      }
    } catch (err) {
      console.error('Failed to fetch models:', err);
    }
  };

  const fetchConversations = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/conversations');
      const data = await res.json();
      setConversations(data);
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    }
  };

  useEffect(() => {
    fetchModels();
    fetchConversations();
  }, []);

  const saveConversation = async (id, title, messagesToSave) => {
    try {
      await fetch('http://127.0.0.1:8000/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          title,
          messages: messagesToSave,
          updated_at: new Date().toISOString()
        })
      });
      fetchConversations();
    } catch (err) {
      console.error('Failed to save conversation:', err);
    }
  };

  const loadConversation = async (id) => {
    try {
      console.log('Loading conversation:', id);
      const res = await fetch(`http://127.0.0.1:8000/api/conversations/${id}`);
      if (res.ok) {
        const data = await res.json();
        console.log('Conversation loaded:', data);
        setCurrentConversationId(data.id);
        setMessages(data.messages || []);
        currentTitleRef.current = data.title || '';
        setMobileSidebarOpen(false);
      } else {
        console.error('Failed to load conversation. Status:', res.status);
      }
    } catch (err) {
      console.error('Failed to load conversation:', err);
    }
  };

  const deleteConversation = async (id) => {
    try {
      console.log('Deleting conversation:', id);
      const res = await fetch(`http://127.0.0.1:8000/api/conversations/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        console.log('Conversation deleted successfully.');
        await fetchConversations();
        if (currentConversationId === id) {
          startNewChat();
        }
      } else {
        console.error('Failed to delete conversation. Status:', res.status);
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  const renameConversation = async (id, newTitle) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/conversations/${id}/title`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle })
      });
      if (res.ok) {
        await fetchConversations();
        if (currentConversationId === id) {
          currentTitleRef.current = newTitle;
        }
      }
    } catch (err) {
      console.error('Failed to rename conversation:', err);
    }
  };

  const startNewChat = () => {
    setCurrentConversationId(null);
    setMessages([]);
    currentTitleRef.current = '';
    setMobileSidebarOpen(false);
  };

  const handleSendMessage = useCallback(async (text, attachedFiles = []) => {
    if (!selectedModel) {
      alert("Please select or register a model first.");
      return;
    }

    let convId = currentConversationId;
    let title = currentTitleRef.current;

    // Generate ID and Title for new chat
    if (!convId) {
      convId = crypto.randomUUID();
      title = text ? text.slice(0, 30) + (text.length > 30 ? '...' : '') : 'New Chat';
      setCurrentConversationId(convId);
      currentTitleRef.current = title;
    }

    const userMessage = { text, isAi: false, attached_files: attachedFiles };
    
    // We need the updated array for saving
    let updatedMessagesForSave = [];

    setMessages((prev) => {
      updatedMessagesForSave = [...prev, userMessage];
      // Save immediately with user message
      saveConversation(convId, title, updatedMessagesForSave);
      return updatedMessagesForSave;
    });

    setIsTyping(true);
    setIsGenerating(true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('http://127.0.0.1:8000/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          model_name: selectedModel,
          prompt: text,
          conv_id: convId,
          attached_files: attachedFiles
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      setIsTyping(false); // First byte received, stop TTFB typing indicator

      // Create a new AI message placeholder
      let aiText = '';
      setMessages((prev) => [...prev, { text: '', isAi: true, isGenerating: true }]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        
        // SSE lines start with "data: "
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (!dataStr) continue;
            
            try {
              const data = JSON.parse(dataStr);
              if (data.error) {
                aiText += `\n**Error:** ${data.error}`;
              } else if (data.text) {
                aiText += data.text;
                
                // Real-time Artifact Generation detection (Simulated logic based on text content)
                if (!isArtifactOpen && aiText.includes('```')) {
                   // This is a naive hook for phase 2. When code blocks appear, we could open the artifact panel.
                   // For now, we will leave it simple.
                }
              }
              
              // Update the last message (the AI message) with accumulated text
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { text: aiText, isAi: true, isGenerating: true };
                updatedMessagesForSave = updated; // Keep track for final save
                return updated;
              });

            } catch (err) {
              console.error("Failed to parse SSE data chunk:", dataStr, err);
            }
          }
        }
      }
      
      // Stream complete
      setIsGenerating(false);
      setMessages((prev) => {
        const updated = [...prev];
        if (updated.length > 0) {
            updated[updated.length - 1] = { ...updated[updated.length - 1], isGenerating: false };
            updatedMessagesForSave = updated;
        }
        return updated;
      });

      // Save final conversation state after stream finishes
      saveConversation(convId, title, updatedMessagesForSave);

      // Trigger background summarization and titling
      fetch(`http://127.0.0.1:8000/api/conversations/${convId}/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_name: selectedModel,
          messages: updatedMessagesForSave
        })
      })
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success') {
           console.log("Summarization complete:", data.title);
           currentTitleRef.current = data.title;
           fetchConversations(); // refresh sidebar titles
        }
      })
      .catch(err => console.error("Summarization background task failed:", err));

    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Stream aborted by user or model switch.');
        setIsGenerating(false);
        setMessages((prev) => {
            const updated = [...prev];
            if (updated.length > 0) {
                updated[updated.length - 1] = { ...updated[updated.length - 1], isGenerating: false };
                updatedMessagesForSave = updated;
            }
            return updated;
        });
        saveConversation(convId, title, updatedMessagesForSave);
        return;
      }
      console.error("Stream error:", error);
      setIsTyping(false);
      setIsGenerating(false);
      setMessages((prev) => {
        const errMessages = [...prev, { text: `**Error communicating with backend:** ${error.message}`, isAi: true, isGenerating: false }];
        saveConversation(convId, title, errMessages);
        return errMessages;
      });
    }
  }, [selectedModel, currentConversationId, isArtifactOpen]);

  const handleStopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        setIsTyping(false);
        setIsGenerating(false);
    }
  }, []);

  return (
    <div className="app-container">
      {/* Mobile Header */}
      <div className="mobile-header">
        <button className="menu-btn" onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}>
          <Menu size={24} />
        </button>
        <span className="mobile-title">Riga AI</span>
      </div>

      <Sidebar 
        isArtifactOpen={isArtifactOpen} 
        toggleArtifacts={() => setIsArtifactOpen(!isArtifactOpen)}
        className={mobileSidebarOpen ? 'mobile-open' : ''}
        onSettingsClick={() => setIsSettingsOpen(true)}
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={loadConversation}
        onNewChat={startNewChat}
        onDeleteConversation={deleteConversation}
        onRenameConversation={renameConversation}
      />
      
      <div className="main-content">
        <ChatArea 
            messages={messages} 
            isTyping={isTyping} 
            selectedModel={selectedModel}
            onModelSelect={handleModelSelect}
            models={models}
        />
        <div className="input-section">
          <InputArea 
            onSendMessage={handleSendMessage} 
            isChatEmpty={messages.length === 0}
            isGenerating={isGenerating}
            onStopGeneration={handleStopGeneration}
          />
        </div>
      </div>

      <ArtifactPanel 
        isOpen={isArtifactOpen} 
        onClose={() => setIsArtifactOpen(false)} 
        content={artifactContent}
      />

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        models={models}
        fetchModels={fetchModels}
        selectedModel={selectedModel}
        onModelSelect={handleModelSelect}
      />

      {/* Mobile Overlay */}
      {mobileSidebarOpen && (
        <div 
          className="mobile-overlay" 
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
    </div>
  );
}

export default App;