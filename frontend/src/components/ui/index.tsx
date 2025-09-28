import React from 'react';

// Badge Component
interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'error' | 'gray' | 'primary';
  size?: 'sm' | 'md' | 'lg';
}

export const Badge: React.FC<BadgeProps> = ({ 
  children, 
  variant = 'gray',
  size = 'md' 
}) => {
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-2 text-base'
  };

  return (
    <span className={`badge badge-${variant} ${sizeClasses[size]}`}>
      {children}
    </span>
  );
};

// Progress Bar Component
interface ProgressProps {
  value: number; // 0-100
  variant?: 'primary' | 'success' | 'warning' | 'error';
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  showValue?: boolean;
}

export const Progress: React.FC<ProgressProps> = ({ 
  value, 
  variant = 'primary',
  size = 'md',
  label,
  showValue = false
}) => {
  const clampedValue = Math.max(0, Math.min(100, value));
  
  const sizeClasses = {
    sm: 'h-2',
    md: 'h-3',
    lg: 'h-4'
  };

  return (
    <div className="progress-container">
      {(label || showValue) && (
        <div className="flex justify-between items-center mb-2">
          {label && <span className="text-sm text-gray-700 font-medium">{label}</span>}
          {showValue && <span className="text-sm text-gray-600">{Math.round(clampedValue)}%</span>}
        </div>
      )}
      <div className={`progress ${sizeClasses[size]}`}>
        <div 
          className={`progress-bar ${variant}`}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
    </div>
  );
};

// Gauge Component
interface GaugeProps {
  value: number; // 0-10
  label: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Gauge: React.FC<GaugeProps> = ({ value, label, size = 'md' }) => {
  const clampedValue = Math.max(0, Math.min(10, value));
  const percentage = (clampedValue / 10) * 100;
  
  const getVariant = (score: number) => {
    if (score >= 7) return 'success';
    if (score >= 4) return 'warning';
    return 'error';
  };

  const variant = getVariant(clampedValue);
  
  const sizes = {
    sm: { circle: 60, stroke: 6, text: '0.875rem' },
    md: { circle: 80, stroke: 8, text: '1rem' },
    lg: { circle: 100, stroke: 10, text: '1.25rem' }
  };

  const { circle, stroke, text } = sizes[size];

  return (
    <div className="gauge-container">
      <div className="relative" style={{ width: circle, height: circle }}>
        <svg width={circle} height={circle} className="transform -rotate-90">
          <circle
            cx={circle / 2}
            cy={circle / 2}
            r={(circle - stroke) / 2}
            stroke="var(--gray-200)"
            strokeWidth={stroke}
            fill="none"
          />
          <circle
            cx={circle / 2}
            cy={circle / 2}
            r={(circle - stroke) / 2}
            stroke={`var(--${variant}-500)`}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${percentage * 2.51} 251`}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
        <div 
          className="absolute inset-0 flex items-center justify-center font-bold"
          style={{ fontSize: text }}
        >
          {clampedValue}/10
        </div>
      </div>
      <div className="gauge-label">{label}</div>
    </div>
  );
};

// Card Component
interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className = '', hover = false }) => {
  return (
    <div className={`card ${hover ? 'hover:shadow-xl hover:-translate-y-1' : ''} ${className}`}>
      {children}
    </div>
  );
};

// Card Header
interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export const CardHeader: React.FC<CardHeaderProps> = ({ title, subtitle, action }) => {
  return (
    <div className="card-header">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="card-title">{title}</h3>
          {subtitle && <p className="card-subtitle">{subtitle}</p>}
        </div>
        {action && <div>{action}</div>}
      </div>
    </div>
  );
};

// Card Content
interface CardContentProps {
  children: React.ReactNode;
  className?: string;
}

export const CardContent: React.FC<CardContentProps> = ({ children, className = '' }) => {
  return (
    <div className={`card-content ${className}`}>
      {children}
    </div>
  );
};

// Button Component
interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'success' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary',
  size = 'md',
  onClick,
  disabled = false,
  icon,
  className = ''
}) => {
  const sizeClasses = {
    sm: 'btn-sm',
    md: '',
    lg: 'btn-lg'
  };

  return (
    <button 
      className={`btn btn-${variant} ${sizeClasses[size]} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon && <span>{icon}</span>}
      {children}
    </button>
  );
};

// Stats Card Component
interface StatCardProps {
  label: string;
  value: string | number;
  change?: {
    value: string;
    positive: boolean;
  };
  icon?: React.ReactNode;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, change, icon }) => {
  return (
    <div className="stat-card">
      {icon && (
        <div className="flex justify-center mb-3 text-2xl">
          {icon}
        </div>
      )}
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {change && (
        <div className={`stat-change ${change.positive ? 'positive' : 'negative'}`}>
          {change.positive ? '↗️' : '↘️'} {change.value}
        </div>
      )}
    </div>
  );
};

// Search Input Component
interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({ 
  value, 
  onChange, 
  placeholder = "Search...",
  className = '' 
}) => {
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`search-input pl-10 ${className}`}
      />
      <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
        🔍
      </div>
    </div>
  );
};

// Select Component
interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
}

export const Select: React.FC<SelectProps> = ({ 
  value, 
  onChange, 
  options, 
  placeholder = "Select...",
  className = '' 
}) => {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`filter-select ${className}`}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
};

// Tab Navigation Component
interface TabNavProps {
  tabs: { key: string; label: string; icon?: React.ReactNode }[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const TabNav: React.FC<TabNavProps> = ({ tabs, activeTab, onTabChange }) => {
  return (
    <div className="tab-nav">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          className={`tab-button ${activeTab === tab.key ? 'active' : ''}`}
          onClick={() => onTabChange(tab.key)}
        >
          {tab.icon && <span className="mr-2">{tab.icon}</span>}
          {tab.label}
        </button>
      ))}
    </div>
  );
};

// Tooltip Component (Simple implementation)
interface TooltipProps {
  children: React.ReactNode;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const Tooltip: React.FC<TooltipProps> = ({ 
  children, 
  content, 
  position = 'top' 
}) => {
  return (
    <div className="relative group">
      {children}
      <div className={`
        absolute z-10 px-3 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg shadow-sm 
        opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none
        ${position === 'top' ? 'bottom-full left-1/2 transform -translate-x-1/2 mb-2' : ''}
        ${position === 'bottom' ? 'top-full left-1/2 transform -translate-x-1/2 mt-2' : ''}
        ${position === 'left' ? 'right-full top-1/2 transform -translate-y-1/2 mr-2' : ''}
        ${position === 'right' ? 'left-full top-1/2 transform -translate-y-1/2 ml-2' : ''}
      `}>
        {content}
        <div className={`
          absolute w-0 h-0 border-4 border-transparent
          ${position === 'top' ? 'top-full left-1/2 transform -translate-x-1/2 border-t-gray-900' : ''}
          ${position === 'bottom' ? 'bottom-full left-1/2 transform -translate-x-1/2 border-b-gray-900' : ''}
          ${position === 'left' ? 'left-full top-1/2 transform -translate-y-1/2 border-l-gray-900' : ''}
          ${position === 'right' ? 'right-full top-1/2 transform -translate-y-1/2 border-r-gray-900' : ''}
        `} />
      </div>
    </div>
  );
};

// Loading Spinner Component
interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'md', 
  color = 'var(--primary-500)' 
}) => {
  const sizes = {
    sm: 16,
    md: 24,
    lg: 32
  };

  const spinnerSize = sizes[size];

  return (
    <div 
      className="animate-spin rounded-full border-2 border-gray-300"
      style={{
        width: spinnerSize,
        height: spinnerSize,
        borderTopColor: color
      }}
    />
  );
};