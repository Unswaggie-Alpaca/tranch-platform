// components/common/InfoMessage.jsx
import React from 'react';

const InfoMessage = ({ message, onClose }) => (
  <div className="info-message">
    <span>{message}</span>
    {onClose && <button onClick={onClose} className="close-btn">×</button>}
  </div>
);

export default InfoMessage;