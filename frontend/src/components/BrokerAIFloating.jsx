import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { useApi } from "../hooks";
import { useApp } from "../contexts";
const BrokerAIFloating = () => {
  const api = useApi();
  const { user } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (isOpen && !sessionId) {
      createSession();
    }
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const createSession = async () => {
    try {
      const response = await api.createAIChatSession(null, 'Quick Chat');
      setSessionId(response.session_id);
    } catch (err) {
      console.error('Failed to create chat session:', err);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !sessionId || loading) return;

    const userMessage = input.trim();
    setInput('');
    setLoading(true);

    // Add user message
    setMessages(prev => [...prev, {
      id: Date.now(),
      sender: 'user',
      message: userMessage
    }]);

    try {
      const response = await api.sendAIChatMessage(sessionId, userMessage);
      
      // Add AI response
      setMessages(prev => [...prev, {
        id: response.ai_message_id,
        sender: 'ai',
        message: response.ai_response
      }]);
    } catch (err) {
      console.error('Failed to send message:', err);
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'ai',
        message: 'I apologize, but I encountered an error. Please try again.'
      }]);
    } finally {
      setLoading(false);
    }
  };

  if (!user || isMinimized) {
    return (
      <button 
        className="broker-ai-floating-button"
        onClick={() => {
          setIsMinimized(false);
          setIsOpen(true);
        }}
      >
        <span className="ai-icon">💬</span>
      </button>
    );
  }

  return (
    <div className={`broker-ai-floating ${isOpen ? 'open' : ''}`}>
      <div className="broker-ai-header">
        <h3>BrokerAI Assistant</h3>
        <div className="broker-ai-controls">
          <button onClick={() => setIsOpen(false)}>_</button>
          <button onClick={() => setIsMinimized(true)}>×</button>
        </div>
      </div>
      
      <div className="broker-ai-messages">
        {messages.length === 0 ? (
          <div className="ai-welcome">
            <p>Hi! I'm your property finance assistant. How can I help you today?</p>
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`ai-message ${msg.sender}`}>
              {msg.sender === 'ai' ? (
                <ReactMarkdown>{msg.message}</ReactMarkdown>
              ) : (
                <p>{msg.message}</p>
              )}
            </div>
          ))
        )}
        {loading && (
          <div className="ai-message ai">
            <div className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="broker-ai-input">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask me anything..."
          disabled={loading}
        />
        <button onClick={handleSend} disabled={loading || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
};

// ===========================
export default BrokerAIFloating;
