import React from 'react';
import ReactMarkdown from 'react-markdown';
import { formatTime } from '../../utils/formatters';

const AIMessage = ({ message, sender, timestamp }) => {
  return (
    <div className={`ai-message ${sender}`}>
      <div className="message-avatar">
        {sender === 'user' ? '👤' : '🤖'}
      </div>
      <div className="message-content">
        <div className="message-text">
          {sender === 'ai' ? (
            <ReactMarkdown
              components={{
                p: ({ children }) => <p style={{ marginBottom: '0.75rem' }}>{children}</p>,
                ul: ({ children }) => <ul style={{ marginLeft: '1.5rem', marginBottom: '0.75rem' }}>{children}</ul>,
                li: ({ children }) => <li style={{ marginBottom: '0.25rem' }}>{children}</li>,
                strong: ({ children }) => <strong style={{ color: '#667eea', fontWeight: '600' }}>{children}</strong>,
                code: ({ children }) => <code style={{ backgroundColor: '#f3f4f6', padding: '0.125rem 0.25rem', borderRadius: '0.25rem' }}>{children}</code>,
                pre: ({ children }) => <pre style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem', overflowX: 'auto' }}>{children}</pre>,
              }}
            >
              {message}
            </ReactMarkdown>
          ) : (
            <p>{message}</p>
          )}
        </div>
        <div className="message-time">{formatTime(timestamp)}</div>
      </div>
    </div>
  );
};

export default AIMessage;