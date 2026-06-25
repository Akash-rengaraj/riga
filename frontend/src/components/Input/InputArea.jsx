import React, { useState, useRef, useEffect } from 'react';
import { Paperclip, Mic, ArrowUp, Image as ImageIcon, Code, FileText } from 'lucide-react';
import './InputArea.css';

const InputArea = ({ onSendMessage, isChatEmpty }) => {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef(null);

  const handleInput = (e) => {
    setInput(e.target.value);
    
    // Auto-expand textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (input.trim()) {
      onSendMessage(input.trim());
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const suggestions = [];

  return (
    <div className="input-area-wrapper">
      {/* Suggestions removed as per request */}

      <div 
        className={`input-container glass-panel ${isFocused ? 'focused' : ''}`}
        onClick={() => textareaRef.current?.focus()}
      >
        <button className="icon-btn attachment-btn" title="Attach files">
          <Paperclip size={20} />
        </button>
        
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="Message Riga AI..."
          className="chat-input"
          rows={1}
        />

        <div className="input-actions">
          {input.trim() ? (
            <button 
              className="icon-btn submit-btn active" 
              onClick={handleSubmit}
              title="Send message"
            >
              <ArrowUp size={20} />
            </button>
          ) : (
            <button className="icon-btn voice-btn" title="Use voice input">
              <Mic size={20} />
            </button>
          )}
        </div>
      </div>
      <div className="input-footer">
        Riga AI can make mistakes. Consider verifying important information.
      </div>
    </div>
  );
};

export default React.memo(InputArea);
