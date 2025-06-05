// components/common/ConfirmationDialog.jsx
import React, { useState } from 'react';
import Modal from './Modal';

const ConfirmationDialog = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = 'Confirm', 
  cancelText = 'Cancel', 
  danger = false 
}) => {
  const [inputValue, setInputValue] = useState('');
  const requiresInput = message.includes('type "DELETE"');
  
  const handleConfirm = () => {
    if (requiresInput && inputValue !== 'DELETE') {
      return;
    }
    onConfirm();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="small">
      <div className="confirmation-dialog">
        <p>{message}</p>
        {requiresInput && (
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type DELETE to confirm"
            className="form-input"
          />
        )}
        <div className="dialog-actions">
          <button onClick={onClose} className="btn btn-outline">
            {cancelText}
          </button>
          <button 
            onClick={handleConfirm} 
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            disabled={requiresInput && inputValue !== 'DELETE'}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmationDialog;