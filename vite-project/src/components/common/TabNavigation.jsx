export default function TabNavigation({ tabs, activeTab, onChange }) {
  return (
    <div className="bg-white border-b border-[#d7dcd9] sticky top-16 z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex space-x-2 sm:space-x-8 overflow-x-auto no-scrollbar py-1">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChange(tab.id)}
                className={`flex items-center gap-2 py-3 px-2 sm:px-1 border-b-2 text-xs sm:text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  isActive
                    ? 'border-[#2f6f4e] text-[#1f4d36] font-semibold'
                    : 'border-transparent text-[#5b6660] hover:text-[#1c2321] hover:border-gray-300'
                }`}
              >
                {Icon && (
                  <Icon
                    size={16}
                    className={isActive ? 'text-[#2f6f4e]' : 'text-gray-400'}
                  />
                )}
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span
                    className={`ml-1 px-1.5 py-0.2 rounded-full text-xs font-semibold ${
                      isActive
                        ? 'bg-[#2f6f4e] text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

