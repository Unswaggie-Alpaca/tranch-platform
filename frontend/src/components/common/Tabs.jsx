import React from 'react';

const Tabs = ({ tabs, activeTab, onChange }) => (
  <div className="tabs">
    {tabs.map(tab => (
      <button
        key={tab.id}
        className={`tab ${activeTab === tab.id ? 'active' : ''}`}
        onClick={() => onChange(tab.id)}
        disabled={tab.disabled}
      >
        {tab.label}
        {tab.badge && <span className="tab-badge">{tab.badge}</span>}
      </button>
    ))}
  </div>
);

export default Tabs;
