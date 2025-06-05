// components/common/NumberInput.jsx
import React, { useRef, useState, useEffect } from 'react';
import { formatNumber } from '../../utils/formatters';

const NumberInput = ({ 
  value, 
  onChange, 
  placeholder, 
  prefix = '', 
  suffix = '', 
  min, 
  max, 
  step = 1, 
  disabled = false,
  className = ''
}) => {
  const inputRef = useRef(null);
  const [displayValue, setDisplayValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused && value) {
      setDisplayValue(formatNumber(value));
    } else if (!isFocused) {
      setDisplayValue('');
    }
  }, [value, isFocused]);

  const handleFocus = () => {
    setIsFocused(true);
    setDisplayValue(value || '');
    // Prevent scroll
    if (inputRef.current) {
      inputRef.current.addEventListener('wheel', preventDefault, { passive: false });
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (inputRef.current) {
      inputRef.current.removeEventListener('wheel', preventDefault);
    }
  };

  const preventDefault = (e) => {
    e.preventDefault();
  };

  const handleChange = (e) => {
    const rawValue = e.target.value.replace(/[^0-9.-]/g, '');
    setDisplayValue(rawValue);
    
    const numValue = parseFloat(rawValue) || 0;
    if (onChange) {
      onChange(numValue);
    }
  };

  return (
    <div className="number-input-wrapper">
      {prefix && <span className="input-prefix">{prefix}</span>}
      <input
        ref={inputRef}
        type="text"
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={`form-input number-input ${className}`}
        disabled={disabled}
      />
      {suffix && <span className="input-suffix">{suffix}</span>}
    </div>
  );
};

export default NumberInput;