import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Bot, User, Copy, Check, FileText, Image as ImageIcon, Video, Music } from 'lucide-react';
import './MessageBubble.css';

const MessageBubble = ({ message, isAi, isTyping, isGenerating, attachedFiles }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`message-wrapper ${isAi ? 'ai' : 'user'}`}>
      <div className="message-avatar">
        {isAi ? (
          <div className="avatar-bot">
            <Bot size={20} />
          </div>
        ) : (
          <div className="avatar-user">
            <User size={20} />
          </div>
        )}
      </div>
            <div className="message-content-wrapper">
        <div className="message-header">
          <span className="sender-name">{isAi ? 'Riga AI' : 'You'}</span>
        </div>
        <div className={`message-bubble ${isAi ? 'glass-panel' : ''}`}>
          
          {/* Render attached files if present */}
          {attachedFiles && attachedFiles.length > 0 && (
            <div className="message-attachments">
                {attachedFiles.map((file, idx) => {
                    if (file.type === 'image') {
                        return (
                            <div key={idx} className="attachment-image-wrapper">
                                <img 
                                    src={`http://127.0.0.1:8000/${file.filepath}`} 
                                    alt={file.original_name} 
                                    className="attachment-image" 
                                />
                            </div>
                        );
                    }
                    
                    let Icon = FileText;
                    if (file.type === 'video') Icon = Video;
                    if (file.type === 'audio') Icon = Music;

                    return (
                        <div key={idx} className="attachment-chip">
                            <Icon size={14} />
                            <span className="attachment-name">{file.original_name}</span>
                        </div>
                    );
                })}
            </div>
          )}

          {isTyping ? (
            <div className="typing-indicator">
              <span></span><span></span><span></span>
            </div>
          ) : isAi ? (
            <div className="markdown-body">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                code(props) {
                  const {children, className, node, ref, ...rest} = props;
                  const match = /language-(\w+)/.exec(className || '');
                  const codeText = String(children).replace(/\n$/, '');
                  
                  if (match) {
                    return (
                      <div className="code-block-wrapper">
                        <div className="code-block-header">
                          <span className="code-language">{match[1]}</span>
                          <button 
                            className="copy-btn" 
                            onClick={() => handleCopy(codeText)}
                            title="Copy Code"
                          >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                            {copied ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                        <SyntaxHighlighter
                          {...rest}
                          style={vscDarkPlus}
                          language={match[1]}
                          PreTag="div"
                          className="syntax-highlighter-custom"
                        >
                          {codeText}
                        </SyntaxHighlighter>
                      </div>
                    );
                  }
                  
                  return (
                    <code {...rest} className={className}>
                      {children}
                    </code>
                  );
                }
              }}
            >
              {message || ''}
              </ReactMarkdown>
              {isGenerating && <span className="blinking-cursor"></span>}
            </div>
          ) : (
            <p>{message}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
