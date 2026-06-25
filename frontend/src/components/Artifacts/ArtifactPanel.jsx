import React from 'react';
import { X, Code, Layout, Maximize2, Download } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import './ArtifactPanel.css';

const ArtifactPanel = ({ isOpen, onClose, content }) => {
  if (!isOpen) return null;

  return (
    <div className="artifact-panel">
      <div className="artifact-header">
        <div className="artifact-tabs">
          <button className="tab active">
            <Layout size={16} />
            Preview
          </button>
          <button className="tab">
            <Code size={16} />
            Code
          </button>
        </div>
        <div className="artifact-actions">
          <button className="action-btn" title="Download">
            <Download size={16} />
          </button>
          <button className="action-btn" title="Expand">
            <Maximize2 size={16} />
          </button>
          <button className="action-btn close-btn" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>
      </div>
      
      <div className="artifact-content">
        {content ? (
          <SyntaxHighlighter
            style={vscDarkPlus}
            language="javascript"
            PreTag="div"
            className="artifact-code"
          >
            {content}
          </SyntaxHighlighter>
        ) : (
          <div className="artifact-empty">
            <Code size={48} className="empty-icon" />
            <p>No artifact generated yet.</p>
            <span>Ask Riga AI to generate code, HTML, or SVG to see it here.</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ArtifactPanel;
