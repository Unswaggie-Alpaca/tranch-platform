import React from 'react';
import { StatusBadge } from '../../components/common/StatusBadge';
import { formatTime } from '../../utils/formatters';

const ConversationList = ({ conversations, selectedConversation, onSelectConversation, userRole }) => {
  if (conversations.length === 0) {
    return (
      <div className="no-conversations">
        <div className="empty-message-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <h3>No conversations yet</h3>
        <p>Messages from {userRole === 'borrower' ? 'funders' : 'developers'} will appear here</p>
      </div>
    );
  }

  return (
    <div className="conversations-list">
      {conversations.map((conversation) => (
        <div
          key={conversation.id}
          className={`conversation-item ${selectedConversation?.id === conversation.id ? 'active' : ''}`}
          onClick={() => onSelectConversation(conversation)}
        >
          <div className="conversation-avatar">
            {userRole === 'borrower' 
              ? conversation.funder_name.charAt(0).toUpperCase()
              : conversation.project_title.charAt(0).toUpperCase()
            }
          </div>
          
          <div className="conversation-info">
            <div className="conversation-header">
              <div className="conversation-name">
                {userRole === 'borrower' 
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
      ))}
    </div>
  );
};

export default ConversationList;