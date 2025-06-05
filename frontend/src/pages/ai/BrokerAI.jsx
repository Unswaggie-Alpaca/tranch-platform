// pages/ai/BrokerAI.jsx

import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { useApi } from '../../hooks';
import { useApp } from '../../contexts';
import { LoadingSpinner } from '../../components/common';
import { formatDate, formatTime } from '../../utils/formatters';

const BrokerAI = () => {
  const api = useApi();
  const { user } = useApp();
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [thinking, setThinking] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    if (activeSession) {
      fetchMessages(activeSession.id);
    }
  }, [activeSession]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchSessions = async () => {
    try {
      const data = await api.getAIChatSessions();
      setSessions(data);
      if (data.length > 0 && !activeSession) {
        setActiveSession(data[0]);
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    }
  };

  const fetchMessages = async (sessionId) => {
    try {
      const data = await api.getAIChatMessages(sessionId);
      setMessages(data);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  };

  const createNewSession = async () => {
    try {
      const response = await api.createAIChatSession(null, `Chat ${new Date().toLocaleDateString()}`);
      await fetchSessions();
      setActiveSession({ id: response.session_id, session_title: `Chat ${new Date().toLocaleDateString()}` });
      setMessages([]);
    } catch (err) {
      console.error('Failed to create session:', err);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !activeSession) return;

    const userMessage = input.trim();
    setInput('');
    setThinking(true);

    // Add user message to UI immediately
    const tempUserMessage = {
      id: Date.now(),
      sender: 'user',
      message: userMessage,
      timestamp: new Date().toISOString()
    };
    setMessages([...messages, tempUserMessage]);

    try {
      const response = await api.sendAIChatMessage(activeSession.id, userMessage);
      
      // Add AI response
      const aiMessage = {
        id: response.ai_message_id,
        sender: 'ai',
        message: response.ai_response,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, aiMessage]);
    } catch (err) {
      console.error('Failed to send message:', err);
      // Add error message
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'ai',
        message: 'I apologize, but I encountered an error. Please try again.',
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setThinking(false);
    }
  };

  const suggestedQuestions = user.role === 'borrower' ? [
    "What's the typical LVR for a residential development in Brisbane?",
    "How do I calculate if my project is financially viable?",
    "What documents do lenders typically require?",
    "Can you explain mezzanine finance in simple terms?"
  ] : [
    "What should I look for in a development feasibility study?",
    "How do I assess construction risk for a project?",
    "What are typical returns for development finance?",
    "Can you explain the key metrics I should focus on?"
  ];

  return (
    <div className="broker-ai-page">
      <div className="ai-container">
        {/* Sessions Sidebar */}
        <div className="ai-sidebar">
          <div className="sidebar-header">
            <h3>Chat History</h3>
            <button onClick={createNewSession} className="btn btn-sm btn-primary">
              <span>+</span> New Chat
            </button>
          </div>
          
          <div className="sessions-list">
            {sessions.length === 0 ? (
              <div className="no-sessions">
                <p>No chat history</p>
              </div>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  className={`session-item ${activeSession?.id === session.id ? 'active' : ''}`}
                  onClick={() => setActiveSession(session)}
                >
                  <div className="session-title">{session.session_title}</div>
                  <div className="session-date">{formatDate(session.created_at)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="ai-chat-area">
          <div className="chat-header">
            <div className="header-content">
              <h2>BrokerAI Assistant</h2>
              <p>Your intelligent property finance advisor</p>
            </div>
            <div className="ai-status">
              <span className="status-indicator active"></span>
              <span>Online</span>
            </div>
          </div>

          <div className="ai-messages-area">
            {!activeSession ? (
              <div className="welcome-message">
                <div className="welcome-icon">🤖</div>
                <h3>Welcome to BrokerAI</h3>
                <p>I'm here to help you with property development finance questions.</p>
                <button onClick={createNewSession} className="btn btn-primary">
                  Start New Chat
                </button>
              </div>
            ) : messages.length === 0 ? (
              <div className="starter-message">
                <div className="ai-avatar">🤖</div>
                <div className="starter-content">
                  <p>Hello! I'm BrokerAI, your property finance assistant. How can I help you today?</p>
                  <div className="suggested-questions">
                    <p>You might want to ask about:</p>
                    <div className="questions-grid">
                      {suggestedQuestions.map((question, index) => (
                        <button
                          key={index}
                          onClick={() => {
                            setInput(question);
                            handleSendMessage();
                          }}
                          className="suggested-question"
                        >
                          {question}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="messages-list">
                {messages.map((message) => (
                  <div key={message.id} className={`ai-message ${message.sender}`}>
                    <div className="message-avatar">
                      {message.sender === 'user' ? '👤' : '🤖'}
                    </div>
                    <div className="message-content">
                      <div className="message-text">
                        {message.sender === 'ai' ? (
                          <ReactMarkdown
                            components={{
                              p: ({ children }) => <p style={{ marginBottom: '0.75rem' }}>{children}</p>,
                              ul: ({ children }) => <ul style={{ marginLeft: '1.5rem', marginBottom: '0.75rem' }}>{children}</ul>,
                              li: ({ children }) => <li style={{ marginBottom: '0.25rem' }}>{children}</li>,
                              strong: ({ children }) => <strong style={{ color: '#667eea', fontWeight: '600' }}>{children}</strong>,
                            }}
                          >
                            {message.message}
                          </ReactMarkdown>
                        ) : (
                          message.message
                        )}
                      </div>
                      <div className="message-time">{formatTime(message.timestamp)}</div>
                    </div>
                  </div>
                ))}
                {thinking && (
                  <div className="ai-message ai">
                    <div className="message-avatar">🤖</div>
                    <div className="message-content">
                      <div className="thinking-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {activeSession && (
            <div className="ai-input-area">
              <div className="input-container">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask me about property development finance..."
                  className="ai-input"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSendMessage();
                    }
                  }}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!input.trim() || thinking}
                  className="btn btn-primary"
                >
                  Send
                </button>
              </div>
              <div className="input-disclaimer">
                BrokerAI provides general information only. Always consult professionals for specific advice.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BrokerAI;