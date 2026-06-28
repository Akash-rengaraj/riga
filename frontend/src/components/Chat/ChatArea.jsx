import React, { useRef, useEffect, useState } from 'react';
import MessageBubble from './MessageBubble';
import { ChevronDown, Check } from 'lucide-react';
import './ChatArea.css';

const ChatArea = ({ messages, isTyping, selectedModel, onModelSelect, models }) => {
  const scrollRef = useRef(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  return (
    <div className="chat-area">
      <div className="chat-header">
        <div className="model-selector-container">
          <button className="model-selector" onClick={() => setIsDropdownOpen(!isDropdownOpen)}>
            <span className="model-name">{selectedModel || 'Select a Model'}</span>
            <ChevronDown size={16} className={`model-icon ${isDropdownOpen ? 'rotated' : ''}`} />
          </button>
          
          {isDropdownOpen && (
            <>
              <div className="dropdown-overlay" onClick={() => setIsDropdownOpen(false)} />
              <div className="model-dropdown">
                {Object.keys(models || {}).map(modelName => (
                  <button 
                    key={modelName}
                    className={`dropdown-item ${selectedModel === modelName ? 'active' : ''}`}
                    onClick={() => {
                      onModelSelect(modelName);
                      setIsDropdownOpen(false);
                    }}
                  >
                    <span className="dropdown-item-name">{modelName}</span>
                    {selectedModel === modelName && <Check size={14} className="dropdown-item-check" />}
                  </button>
                ))}
                {(!models || Object.keys(models).length === 0) && (
                  <div className="dropdown-empty">No models available. Add in Settings.</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="chat-messages-container" ref={scrollRef}>
        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="empty-chat">
              <div className="empty-logo">
                <div className="logo-pulse"></div>
              </div>
              <h1>How can I help you today?</h1>
            </div>
          ) : (
            <>
              {messages.map((msg, index) => (
                <MessageBubble 
                  key={index} 
                  message={msg.text} 
                  isAi={msg.isAi} 
                  isGenerating={msg.isGenerating}
                  attachedFiles={msg.attached_files}
                />
              ))}
              {isTyping && (
                <MessageBubble 
                  message="" 
                  isAi={true} 
                  isTyping={true} 
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatArea;
