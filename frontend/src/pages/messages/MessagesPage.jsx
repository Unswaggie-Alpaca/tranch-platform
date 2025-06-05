import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../contexts';
import { useApi } from '../../hooks';
import { useNotifications } from '../../contexts';
import { LoadingSpinner, StatusBadge } from '../../components/common';
import { formatTime, formatCurrency } from '../../utils/formatters';
import ConversationList from './ConversationList';
import ChatArea from './ChatArea';

const MessagesPage = () => {
  const api = useApi();
  const { user } = useApp();
  const { addNotification } = useNotifications();
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id);
    }
  }, [selectedConversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchConversations = async () => {
    try {
      const data = await api.getAccessRequests();
      setConversations(data);
      if (data.length > 0 && !selectedConversation) {
        setSelectedConversation(data[0]);
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (requestId) => {
    try {
      const conversation = conversations.find(c => c.id === requestId);
      const data = await api.getMessages(requestId);
      
      // If there's an initial message and no other messages, add it
      if (conversation?.initial_message && data.length === 0) {
        const initialMsg = {
          id: 'initial-' + requestId,
          sender_role: 'funder',
          sender_name: conversation.funder_name,
          message: conversation.initial_message,
          sent_at: conversation.requested_at
        };
        setMessages([initialMsg]);
      } else {
        setMessages(data);
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return;
    
    setSending(true);
    try {
      await api.sendMessage(selectedConversation.id, newMessage.trim());
      setNewMessage('');
      // Refresh messages
      fetchMessages(selectedConversation.id);
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Send Failed',
        message: 'Failed to send message'
      });
    } finally {
      setSending(false);
    }
  };

  const handleApproveAccess = async (requestId) => {
    try {
      await api.approveAccessRequest(requestId);
      addNotification({
        type: 'success',
        title: 'Access Approved',
        message: 'Funder now has access to full project details'
      });
      fetchConversations();
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Approval Failed',
        message: err.message
      });
    }
  };

  const handleDeclineAccess = async (requestId) => {
    try {
      await api.declineAccessRequest(requestId);
      addNotification({
        type: 'info',
        title: 'Access Declined',
        message: 'Access request has been declined'
      });
      fetchConversations();
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Decline Failed',
        message: err.message
      });
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="messages-page">
      <div className="messages-container">
        {/* Conversations Sidebar */}
        <div className="conversations-sidebar">
          <div className="sidebar-header">
            <h3>Conversations</h3>
            <span className="conversation-count">{conversations.length}</span>
          </div>
          
          <div className="conversations-list">
            {conversations.length === 0 ? (
              <div className="no-conversations">
                <div className="empty-message-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <h3>No conversations yet</h3>
                <p>Messages from {user.role === 'borrower' ? 'funders' : 'developers'} will appear here</p>
              </div>
            ) : (
              conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`conversation-item ${selectedConversation?.id === conversation.id ? 'active' : ''}`}
                  onClick={() => setSelectedConversation(conversation)}
                >
                  <div className="conversation-avatar">
                    {user.role === 'borrower' 
                      ? conversation.funder_name.charAt(0).toUpperCase()
                      : conversation.project_title.charAt(0).toUpperCase()
                    }
                  </div>
                  
                  <div className="conversation-info">
                    <div className="conversation-header">
                      <div className="conversation-name">
                        {user.role === 'borrower' 
                          ? conversation.funder_name 
                          : conversation.project_title
                        }
                      </div>
                      <div className="conversation-time">
                        {formatTime(conversation.requested_at)}
                      </div>
                    </div>
                    
                    <div className="conversation-preview">
                      {conversation.initial_message || 'Access request'}
                    </div>
                    
                    <div className="conversation-meta">
                      <StatusBadge status={conversation.status} />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="chat-area">
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="chat-header">
                <div className="chat-participant">
                  <div className="participant-info">
                    <div className="participant-name">
                      {user.role === 'borrower' 
                        ? selectedConversation.funder_name 
                        : selectedConversation.project_title
                      }
                    </div>
                    <div className="participant-details">
                      {user.role === 'borrower' && selectedConversation.company_name && (
                        <span>{selectedConversation.company_name} • {selectedConversation.company_type}</span>
                      )}
                      {user.role === 'funder' && (
                        <span>Loan Amount: {formatCurrency(selectedConversation.loan_amount)}</span>
                      )}
                    </div>
                  </div>
                </div>

                {user.role === 'borrower' && selectedConversation.status === 'pending' && (
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
                    <p>Send a message to begin discussing this {user.role === 'borrower' ? 'investment opportunity' : 'project'}.</p>
                  </div>
                ) : (
                  <div className="messages-list">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`message-bubble ${message.sender_role === user.role ? 'own' : 'other'}`}
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
          ) : (
            <div className="no-conversation-selected">
              <div className="empty-chat-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 12h8M12 8v8M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                </svg>
              </div>
              <h3>Select a conversation</h3>
              <p>Choose a conversation from the sidebar to start messaging</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessagesPage;