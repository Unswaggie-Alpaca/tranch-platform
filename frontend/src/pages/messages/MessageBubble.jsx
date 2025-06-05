import React from 'react';
import { formatTime } from '../../utils/formatters';

const MessageBubble = ({ message, isOwn }) => {
  return (
    <div className={`message-bubble ${isOwn ? 'own' : 'other'}`}>
      <div className="message-header">
        <span className="sender-name">{message.sender_name}</span>
        <span className="message-time">{formatTime(message.sent_at)}</span>
      </div>
      <div className="message-content">
        {message.message}
      </div>
    </div>
  );
};

export default MessageBubble;