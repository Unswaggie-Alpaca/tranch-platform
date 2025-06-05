import React, { useRef, useEffect } from 'react';
import { formatTime, formatCurrency } from '../../utils/formatters';

const ChatArea = ({ 
  selectedConversation, 
  messages, 
  newMessage, 
  setNewMessage, 
  handleSendMessage, 
  handleApproveAccess,
  handleDeclineAccess,
  sending, 
  userRole 
}) => {
  const messagesEndRef = useRef(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  if (!selectedConversation) {
    return (
      <div className="no-conversation-selected">
        <div className="empty-chat-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 12h8M12 8v8M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
          </svg>
        </div>
        <h3>Select a conversation</h3>
        <p>Choose a conversation from the sidebar to start messaging</p>
      </div>
    );
  }

  return (
    <>
      {/* Chat Header */}
      <div className="chat-header">
        <div className="chat-participant">
          <div className="participant-info">
            <div className="participant-name">
              {userRole === 'borrower' 
                ? selectedConversation.funder_name 
                : selectedConversation.project_title
              }
            </div>
            <div className="participant-details">
              {userRole === 'borrower' && selectedConversation.company_name && (
                <span>{selectedConversation.company_name} • {selectedConversation.company_type}</span>
              )}
              {userRole === 'funder' && (
                <span>Loan Amount: {formatCurrency(selectedConversation.loan_amount)}</span>
              )}
            </div>
          </div>
        </div>

        {userRole === 'borrower' && selectedConversation.status === 'pending' && (
          <div className="chat-actions">
            <button 
              onClick={() => handleApproveAccess(selectedConversation.id)}
              className="btn btn-sm btn-primary"
            >
              Approve Access
            </button>
            <button 
              onClick={() => handleDeclineAccess(selectedConversation.id)}
              className="btn btn-sm btn-outline"
            >
              Decline
            </button>
          </div>
        )}
      </div>

      {/* Messages Area */}
      <div className="messages-area">
        {messages.length === 0 ? (
          <div className="no-messages">
            <div className="no-messages-icon">💬</div>
            <h3>Start the conversation</h3>
            <p>Send a message to begin discussing this {userRole === 'borrower' ? 'investment opportunity' : 'project'}.</p>
          </div>
        ) : (
          <div className="messages-list">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`message-bubble ${message.sender_role === userRole ? 'own' : 'other'}`}
              >
                <div className="message-header">
                  <span className="sender-name">{message.sender_name}</span>
                  <span className="message-time">{formatTime(message.sent_at)}</span>
                </div>
                <div className="message-content">
                  {message.message}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Message Input */}
      <div className="message-input-area">
        <div className="input-container">
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your message..."
            className="message-input"
            rows="3"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
          />
          <div className="input-actions">
            <span className="char-count">{newMessage.length}/1000</span>
            <button
              onClick={handleSendMessage}
              disabled={sending || !newMessage.trim()}
              className="btn btn-primary btn-sm"
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default ChatArea;