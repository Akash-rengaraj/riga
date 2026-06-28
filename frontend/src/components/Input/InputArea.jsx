import React, { useState, useRef, useEffect } from 'react';
import { Paperclip, Mic, ArrowUp, Image as ImageIcon, Code, FileText, X, Square } from 'lucide-react';
import './InputArea.css';

const InputArea = ({ onSendMessage, isChatEmpty, isGenerating, onStopGeneration }) => {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

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
    if (input.trim() || attachedFiles.length > 0) {
      let finalMessage = input.trim();
      onSendMessage(finalMessage, attachedFiles);
      setInput('');
      setAttachedFiles([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('http://127.0.0.1:8000/api/upload', {
          method: 'POST',
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          setAttachedFiles(prev => [...prev, data]);
        }
      } catch (err) {
        console.error('File upload failed', err);
      }
    }
    // reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (indexToRemove) => {
      setAttachedFiles(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const suggestions = [];

  return (
    <div className="input-area-wrapper">
      {/* Suggestions removed as per request */}

      <div 
        className={`input-container glass-panel ${isFocused ? 'focused' : ''}`}
        onClick={(e) => {
           // Don't focus textarea if clicking on a file chip or attach button
           if (!e.target.closest('.attachment-btn') && !e.target.closest('.file-chip')) {
               textareaRef.current?.focus();
           }
        }}
      >
        <button 
          className="icon-btn attachment-btn" 
          title="Attach files"
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip size={20} />
        </button>
        <input 
            type="file" 
            multiple
            hidden
            ref={fileInputRef}
            onChange={handleFileUpload}
        />
        
        <div className="input-content-wrapper">
            {attachedFiles.length > 0 && (
                <div className="attached-files-list">
                    {attachedFiles.map((file, idx) => (
                        <div key={idx} className="file-chip">
                            <span className="file-name">{file.original_name}</span>
                            <button className="remove-file-btn" onClick={() => removeFile(idx)}>
                                <X size={12} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
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
        </div>

        <div className="input-actions">
          {isGenerating ? (
            <button 
              className="icon-btn stop-btn active" 
              onClick={onStopGeneration}
              title="Stop generating"
            >
              <Square size={16} fill="currentColor" />
            </button>
          ) : (input.trim() || attachedFiles.length > 0) ? (
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
