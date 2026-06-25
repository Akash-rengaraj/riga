import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Plus, Settings, User, Trash2, Zap, Edit2, Check, X } from 'lucide-react';
import './Sidebar.css';

const Sidebar = ({ 
  isArtifactOpen, 
  toggleArtifacts, 
  className,
  onSettingsClick,
  conversations = [],
  currentConversationId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onRenameConversation
}) => {

  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingId]);

  const groupConversations = (convs) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const groups = {
      'Today': [],
      'Yesterday': [],
      'Previous 7 Days': [],
      'Older': []
    };

    convs.forEach(conv => {
      if (!conv.updated_at) return;
      const updatedDate = new Date(conv.updated_at);
      updatedDate.setHours(0, 0, 0, 0);

      if (updatedDate.getTime() === today.getTime()) {
        groups['Today'].push(conv);
      } else if (updatedDate.getTime() === yesterday.getTime()) {
        groups['Yesterday'].push(conv);
      } else if (updatedDate >= sevenDaysAgo) {
        groups['Previous 7 Days'].push(conv);
      } else {
        groups['Older'].push(conv);
      }
    });

    return groups;
  };

  const grouped = groupConversations(conversations);

  const startEditing = (e, item) => {
    e.stopPropagation();
    setEditingId(item.id);
    setEditValue(item.title);
  };

  const saveEdit = (e) => {
    e.stopPropagation();
    if (editValue.trim() && onRenameConversation) {
      onRenameConversation(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  const cancelEdit = (e) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      saveEdit(e);
    } else if (e.key === 'Escape') {
      cancelEdit(e);
    }
  };

  return (
    <div className={`sidebar ${className || ''}`}>
      <div className="sidebar-header">
        <button className="new-chat-btn" onClick={onNewChat}>
          <div className="new-chat-content">
            <div className="riga-logo">
              <Zap size={18} className="logo-icon" />
            </div>
            <span>New Chat</span>
          </div>
          <Plus size={20} />
        </button>
      </div>

      <div className="sidebar-scrollable">
        {Object.keys(grouped).map(label => {
          if (grouped[label].length === 0) return null;
          
          return (
            <div key={label} className="history-group">
              <div className="history-label">{label}</div>
              {grouped[label].map((item) => (
                <div 
                  key={item.id} 
                  className={`history-item-container ${currentConversationId === item.id ? 'active' : ''}`}
                >
                  <button 
                    className="history-item"
                    onClick={() => {
                       if (editingId !== item.id) onSelectConversation(item.id);
                    }}
                  >
                    <MessageSquare size={16} className="history-icon" />
                    
                    {editingId === item.id ? (
                      <div className="history-edit-mode" onClick={(e) => e.stopPropagation()}>
                        <input 
                          ref={inputRef}
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={handleKeyDown}
                          onBlur={saveEdit}
                          className="history-edit-input"
                        />
                      </div>
                    ) : (
                      <span className="history-title">{item.title}</span>
                    )}
                  </button>
                  
                  {editingId !== item.id && (
                    <div className="history-actions">
                      <button 
                        className="history-action-btn"
                        onClick={(e) => startEditing(e, item)}
                        title="Rename Chat"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button 
                        className="history-action-btn delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteConversation(item.id);
                        }}
                        title="Delete Chat"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div className="sidebar-footer">
        <button className="nav-item" onClick={onSettingsClick}>
          <Settings size={20} />
          <span>Settings</span>
        </button>
        <button className="user-profile">
          <div className="avatar">
            <User size={20} />
          </div>
          <div className="user-info">
            <span className="user-name">Johan</span>
            <span className="user-plan">Riga Pro</span>
          </div>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
