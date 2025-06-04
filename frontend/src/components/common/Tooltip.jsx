import React from 'react';

const Tooltip = ({ children, content, position = 'top' }) => (
  <div className="tooltip-wrapper">
    {children}
    <div className={`tooltip tooltip-${position}`}>{content}</div>
  </div>
);

export default Tooltip;
