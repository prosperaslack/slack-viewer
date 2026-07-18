export default function MobileBottomNav({ activeTab, onSelect }) {
  const tabs = [
    { id: 'home', label: 'Home', icon: '⌂' },
    { id: 'channels', label: 'Channels', icon: '#' },
    { id: 'search', label: 'Search', icon: '⌕' },
    { id: 'profile', label: 'Profile', icon: '◎' },
  ]

  return (
    <nav className="mobile-bottom-nav" aria-label="Primary">
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          className={`mobile-nav-item ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onSelect(tab.id)}
        >
          <span className="mobile-nav-icon" aria-hidden="true">{tab.icon}</span>
          <span className="mobile-nav-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}
